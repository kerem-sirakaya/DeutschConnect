-- =============================================================================
-- 008 – Events automatisch archivieren (24 Stunden nach Absage bzw. Ende)
-- =============================================================================
-- Ausführen NACH 006 (007 ist unabhängig davon) – Supabase Dashboard -> SQL Editor -> Run.
-- IMMER die ganze Datei ausführen (nichts markieren), als Datenbank-Eigentümer (postgres).
-- Läuft als EINE Transaktion; Teil 9 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
-- Den stündlichen Zeitplan richtet danach 009_event_archiving_cron.sql ein.
--
-- Grundidee: ARCHIVIEREN statt LÖSCHEN.
--   * Neue Spalte events.archived_at: gesetzt = für Schüler:innen ausgeblendet.
--     Der Status (cancelled / completed / planned / confirmed) bleibt UNVERÄNDERT –
--     "archiviert" ist ein eigener Zustand, kein neuer Status.
--   * Neue Spalte events.cancelled_at: WANN abgesagt wurde (setzt admin_set_event_status).
--   * Es wird NICHTS gelöscht: keine Events, keine Anmeldungen, keine Profile.
--
-- Wann wird archiviert? (Funktion archive_finished_events, Teil 4)
--   * cancelled:                       24 h nach cancelled_at
--   * planned / confirmed / completed: 24 h nach dem ENDE des Events
--       Ende = start_at + duration_minutes
--       ohne Dauer: Mitternacht nach dem Starttag in Ankara-Zeit (Europe/Istanbul)
--   * draft: nie (Entwürfe sieht ohnehin niemand außer Admins)
--   Künftige und laufende Events werden dadurch NIE archiviert (ihr Ende liegt nicht
--   24 h in der Vergangenheit). Alle Vergleiche laufen mit timestamptz -> zeitzonensicher.
--   Dieselben Regeln nutzt das Frontend (src/lib/eventArchive.js).
--
-- Wer sieht was?
--   * Schüler:innen: Lese-Policy wird VERSCHÄRFT – zusätzlich "archived_at is null".
--     (Gleiche Status-Erlaubnisliste wie 006, nur strenger. Keine neuen Rechte.)
--   * Admins: admin_list_events liefert weiterhin ALLE Events, jetzt mit cancelled_at
--     und archived_at.
--   * Archivieren darf NUR der Datenbank-Eigentümer (Zeitplan / SQL Editor) – die
--     Funktion ist für PUBLIC, anon, authenticated und service_role NICHT aufrufbar.
--
-- Was ändert sich sonst?
--   * admin_set_event_status: setzt beim Absagen cancelled_at = now() (sonst identisch zu 006).
--   * admin_update_event (sonst identisch zu 006): Ändern sich Datum ODER Dauer eines
--     planned/confirmed/completed-Events, wird archived_at SOFORT neu berechnet:
--       neues Ende + 24 h vorbei -> bleibt/wird archiviert (alter Zeitpunkt bleibt erhalten)
--       sonst                    -> wieder sichtbar (archived_at = null)
--     Abgesagte Events: archived_at bleibt unverändert – die 24 h zählen ab cancelled_at,
--     nicht ab dem Bearbeiten. (Das Datum abgesagter/abgeschlossener Events ist ohnehin
--     fest, DC006.) Entwürfe werden nie archiviert.
--   * Bereits abgesagte Events bekommen cancelled_at = Zeitpunkt dieser Migration
--     (der echte Zeitpunkt ist unbekannt) – sie bleiben also noch 24 h sichtbar.
--
-- Hinweis: Die Selbstprüfung von 006 vergleicht die Spalten von events mit 001.
-- Nach 008 würde ein ERNEUTES Ausführen von 006 deshalb sicher abbrechen (ohne Änderung).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.admin_list_events()') is null
     or to_regprocedure('public.admin_set_event_status(uuid, text)') is null
     or to_regprocedure('public.admin_assert_event_input(jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz, integer, integer, text, text[], text[], text)') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 005 und 006 ausführen.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                 and policyname in ('events: lesen (veröffentlicht)', 'events: lesen (veröffentlicht, nicht archiviert)')) then
    raise exception 'ABBRUCH: Die Lese-Policy für events aus 006 fehlt.';
  end if;
  -- Migration als Tabellen-Eigentümer ausführen (sonst gehörten die neuen Funktionen einer anderen Rolle)
  if current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass) then
    raise exception 'ABBRUCH: Bitte als Eigentümer von public.events ausführen (aktuell: %).', current_user;
  end if;
  -- K7: Hängt etwas an admin_list_events()? Dann NICHT löschen (Teil 7), sondern abbrechen.
  if exists (select 1 from pg_depend d
             where d.refclassid = 'pg_proc'::regclass
               and d.refobjid = 'public.admin_list_events()'::regprocedure
               and d.deptype in ('n', 'a')) then
    raise exception 'ABBRUCH: Andere Datenbank-Objekte hängen von admin_list_events() ab – bitte zuerst prüfen.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Neue Spalten (nur hinzufügen – nichts wird gelöscht oder umgebaut)
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events add column if not exists archived_at  timestamptz;

-- Bestehende Absagen: Zeitpunkt unbekannt -> "jetzt" (bleiben noch 24 h sichtbar)
update public.events set cancelled_at = now() where status = 'cancelled' and cancelled_at is null;

-- Regel: cancelled_at ist genau dann gesetzt, wenn das Event abgesagt ist
-- (cancelled ist endgültig, kann also nie wieder verlassen werden – siehe 006)
alter table public.events drop constraint if exists events_cancelled_at_matches_status;
alter table public.events add constraint events_cancelled_at_matches_status
  check ((status = 'cancelled') = (cancelled_at is not null));

-- Archiviert werden nur veröffentlichte Events, nie Entwürfe
alter table public.events drop constraint if exists events_archived_only_published;
alter table public.events add constraint events_archived_only_published
  check (archived_at is null or status in ('planned', 'confirmed', 'completed', 'cancelled'));

create index if not exists events_archived_at_idx on public.events (archived_at);

-- -----------------------------------------------------------------------------
-- 3) Ende eines Events (intern)
-- -----------------------------------------------------------------------------
create or replace function public.event_ends_at(p_start_at timestamptz, p_duration_minutes integer)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_duration_minutes is not null then p_start_at + make_interval(mins => p_duration_minutes)
    -- ohne Dauer: Mitternacht nach dem Starttag in Ankara
    else ((p_start_at at time zone 'Europe/Istanbul')::date + 1)::timestamp at time zone 'Europe/Istanbul'
  end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Archivieren (nur für den Datenbank-Eigentümer – Zeitplan / SQL Editor)
-- -----------------------------------------------------------------------------
-- Gibt die Zahl der neu archivierten Events zurück. Mehrfach ausführen ist sicher:
-- bereits archivierte Events werden nicht angefasst (archived_at is null).
create or replace function public.archive_finished_events()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.events e
     set archived_at = now()
   where e.archived_at is null
     and (
       (e.status = 'cancelled'
        and e.cancelled_at is not null
        and e.cancelled_at <= now() - interval '24 hours')
       or
       (e.status in ('planned', 'confirmed', 'completed')
        and public.event_ends_at(e.start_at, e.duration_minutes) <= now() - interval '24 hours')
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) admin_set_event_status: wie 006 + cancelled_at beim Absagen
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_event_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
  old_start  timestamptz;
  allowed    boolean;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Admin-Änderungen an Events sind nur mit READ COMMITTED möglich.' using errcode = 'DC009';
  end if;
  if p_status is null or p_status not in ('draft', 'planned', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Ungültiger Status.' using errcode = '22023';
  end if;

  select e.status, e.start_at into old_status, old_start
  from public.events e where e.id = p_id
  for update;
  if not found then
    raise exception 'Event nicht gefunden.' using errcode = 'P0002';
  end if;
  if old_status = p_status then
    return;
  end if;

  allowed := case old_status
    when 'draft'     then p_status in ('planned', 'confirmed')
    when 'planned'   then p_status in ('confirmed', 'cancelled', 'completed')
    when 'confirmed' then p_status in ('cancelled', 'completed')
    else false   -- cancelled, completed: endgültig
  end;
  if not allowed then
    raise exception 'Statuswechsel von "%" nach "%" ist nicht erlaubt.', old_status, p_status using errcode = 'DC004';
  end if;

  if old_status = 'draft' and old_start <= now() then
    raise exception 'Das Datum liegt in der Vergangenheit – bitte zuerst das Datum ändern.' using errcode = 'DC002';
  end if;
  if p_status = 'completed' and old_start > now() then
    raise exception 'Ein Event, das noch nicht begonnen hat, kann nicht abgeschlossen werden.' using errcode = 'DC007';
  end if;

  update public.events
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) admin_update_event: wie 006 + archived_at bei geändertem Datum/Dauer neu berechnen
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_event(
  p_id uuid, p_title jsonb, p_start_at timestamptz, p_host_school_id text, p_school_ids text[],
  p_summary jsonb, p_description jsonb, p_location jsonb, p_audience jsonb,
  p_duration_minutes integer, p_capacity integer, p_online boolean, p_topics text[], p_format text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status   text;
  old_start    timestamptz;
  old_duration integer;
  old_archived timestamptz;
  new_archived timestamptz;
  registered   bigint;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Admin-Änderungen an Events sind nur mit READ COMMITTED möglich.' using errcode = 'DC009';
  end if;
  perform public.admin_assert_event_input(p_title, p_summary, p_description, p_location, p_audience,
    p_start_at, p_duration_minutes, p_capacity, p_host_school_id, p_school_ids, p_topics, p_format);

  -- Sperre ZUERST setzen (kollidiert mit dem Anmelde-Trigger) – danach sind Status,
  -- Datum und Anmeldezahl verlässlich
  select e.status, e.start_at, e.duration_minutes, e.archived_at
    into old_status, old_start, old_duration, old_archived
  from public.events e where e.id = p_id
  for update;
  if not found then
    raise exception 'Event nicht gefunden.' using errcode = 'P0002';
  end if;

  if old_status in ('cancelled', 'completed') and p_start_at is distinct from old_start then
    raise exception 'Das Datum eines abgesagten oder abgeschlossenen Events kann nicht geändert werden.' using errcode = 'DC006';
  end if;
  if old_status in ('planned', 'confirmed') and p_start_at is distinct from old_start and p_start_at <= now() then
    raise exception 'Ein veröffentlichtes Event kann nicht in die Vergangenheit verschoben werden.' using errcode = 'DC002';
  end if;

  if p_capacity is not null then
    select count(*) into registered
    from public.event_registrations r where r.event_id = p_id and r.status = 'registered';
    if p_capacity < registered then
      raise exception 'Es gibt bereits % verbindliche Anmeldungen – die Plätze können nicht auf % reduziert werden.',
        registered, p_capacity using errcode = 'DC005';
    end if;
  end if;

  -- Archiv-Zustand: nur bei geändertem Ende (Datum oder Dauer) neu berechnen – gleiche
  -- Regel wie archive_finished_events. Abgesagt: unverändert (24 h ab cancelled_at).
  -- Entwurf: nie archiviert.
  new_archived := old_archived;
  if old_status in ('planned', 'confirmed', 'completed')
     and (p_start_at is distinct from old_start or p_duration_minutes is distinct from old_duration) then
    new_archived := case
      when public.event_ends_at(p_start_at, p_duration_minutes) <= now() - interval '24 hours'
        then coalesce(old_archived, now())
      else null
    end;
  end if;

  update public.events set
    title = public.admin_trim_text_json(p_title), summary = public.admin_trim_text_json(p_summary),
    description = public.admin_trim_text_json(p_description), location = public.admin_trim_text_json(p_location),
    audience = public.admin_trim_text_json(p_audience), start_at = p_start_at,
    duration_minutes = p_duration_minutes, capacity = p_capacity, online = coalesce(p_online, false),
    topics = coalesce(p_topics, '{}'), format = coalesce(p_format, 'meetup'),
    host_school_id = p_host_school_id, school_ids = p_school_ids,
    archived_at = new_archived
  where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) admin_list_events: zusätzlich cancelled_at und archived_at
--    (Rückgabe-Spalten ändern sich -> Funktion neu anlegen; gleiche Signatur und Rechte.
--     Abhängigkeiten wurden in Teil 1 geprüft.)
-- -----------------------------------------------------------------------------
drop function if exists public.admin_list_events();
create function public.admin_list_events()
returns table (
  id uuid, title jsonb, summary jsonb, description jsonb, location jsonb, audience jsonb,
  start_at timestamptz, duration_minutes integer, capacity integer, online boolean,
  topics text[], format text, host_school_id text, school_ids text[], status text,
  created_at timestamptz, registered_count bigint, interested_count bigint,
  cancelled_at timestamptz, archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.summary, e.description, e.location, e.audience,
           e.start_at, e.duration_minutes, e.capacity, e.online,
           e.topics, e.format, e.host_school_id, e.school_ids, e.status, e.created_at,
           count(r.event_id) filter (where r.status = 'registered'),
           count(r.event_id) filter (where r.status = 'interested'),
           e.cancelled_at, e.archived_at
    from public.events e
    left join public.event_registrations r on r.event_id = e.id
    group by e.id
    order by e.start_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Lese-Policy für Schüler:innen VERSCHÄRFEN: zusätzlich nicht archiviert
-- -----------------------------------------------------------------------------
drop policy if exists "events: lesen (veröffentlicht)" on public.events;
drop policy if exists "events: lesen (veröffentlicht, nicht archiviert)" on public.events;
create policy "events: lesen (veröffentlicht, nicht archiviert)"
  on public.events for select to authenticated
  using (status in ('planned', 'confirmed', 'completed', 'cancelled') and archived_at is null);

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
-- Intern / nur für den Datenbank-Eigentümer: über die API für NIEMANDEN aufrufbar
-- (Supabase vergibt für neue Funktionen automatisch Rechte an anon, authenticated
--  UND service_role – alle drei werden hier entzogen.)
revoke all on function public.event_ends_at(timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.archive_finished_events() from public, anon, authenticated, service_role;
-- Admin-Funktionen: wie in 006
revoke all on function public.admin_list_events() from public, anon;
grant execute on function public.admin_list_events() to authenticated;
revoke all on function public.admin_set_event_status(uuid, text) from public, anon;
grant execute on function public.admin_set_event_status(uuid, text) to authenticated;
revoke all on function public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) from public, anon;
grant execute on function public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) to authenticated;

-- Vergleichs-Policy für 9c (temporär, verschwindet mit dem Ende der Transaktion):
-- So wird der Ausdruck exakt so verglichen, wie PostgreSQL ihn selbst ausgibt.
create temp table _008_ref_events (status text, archived_at timestamptz) on commit drop;
alter table _008_ref_events enable row level security;
create policy ref_events_select on _008_ref_events for select to authenticated
  using (status in ('planned', 'confirmed', 'completed', 'cancelled') and archived_at is null);

-- -----------------------------------------------------------------------------
-- 9) SELBSTPRÜFUNG – bricht ab (= alles oben wird rückgängig gemacht)
-- -----------------------------------------------------------------------------
do $$
declare
  owner_name name := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass);
  app_roles  text[] := array['anon', 'authenticated', 'service_role', 'authenticator'];
  internal_fns text[] := array['public.archive_finished_events()', 'public.event_ends_at(timestamptz, integer)'];
  admin_fns text[] := array[
    'public.admin_list_events()',
    'public.admin_set_event_status(uuid, text)',
    'public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text)'
  ];
  fn text;
  fn_oid oid;
  r text;
  extra text;
  pol record;
  ref_qual text;
  n integer;
  -- Laufzeit-Probe (9h)
  sch text;
  p_done_old uuid; p_done_new uuid; p_plan_old uuid; p_future uuid; p_running uuid;
  p_cancel_old uuid; p_cancel_new uuid; p_draft uuid; p_nodur uuid;
  second_run integer;
  probe_fail text;
begin
  -- 9a) Eigentümer: Tabellen und Funktionen gehören derselben Rolle; diese ist keine
  --     App-Rolle und für App-Rollen nicht erreichbar (K1)
  if owner_name in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'ABBRUCH: public.events gehört der App-Rolle %.', owner_name;
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = 'public.event_registrations'::regclass) is distinct from owner_name then
    raise exception 'ABBRUCH: public.event_registrations hat einen anderen Eigentümer als public.events.';
  end if;
  foreach r in array app_roles loop
    if exists (select 1 from pg_roles where rolname = r) and pg_has_role(r, owner_name, 'member') then
      raise exception 'ABBRUCH: Rolle % ist Mitglied der Eigentümer-Rolle %.', r, owner_name;
    end if;
  end loop;
  if not has_table_privilege(owner_name, 'public.events', 'select')
     or not has_table_privilege(owner_name, 'public.events', 'update')
     or not has_table_privilege(owner_name, 'public.event_registrations', 'select') then
    raise exception 'ABBRUCH: Eigentümer % hat nicht die nötigen Tabellenrechte (events: SELECT/UPDATE, event_registrations: SELECT).', owner_name;
  end if;
  foreach fn in array internal_fns || admin_fns loop
    if (select pg_get_userbyid(proowner) from pg_proc where oid = fn::regprocedure) is distinct from owner_name then
      raise exception 'ABBRUCH: % gehört nicht dem Eigentümer von public.events (%).', fn, owner_name;
    end if;
    if not exists (select 1 from pg_proc where oid = fn::regprocedure and proconfig = array['search_path=""']) then
      raise exception 'ABBRUCH: % hat keinen leeren search_path.', fn;
    end if;
  end loop;

  -- 9b) RLS: aktiv, aber NICHT erzwungen (sonst sähe/änderte die Archiv-Funktion nichts)
  if not (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
     or (select relforcerowsecurity from pg_class where oid = 'public.events'::regclass) then
    raise exception 'ABBRUCH: RLS auf public.events ist nicht aktiv oder FORCE ROW LEVEL SECURITY ist an.';
  end if;

  -- 9c) Ausführungsrechte gegen Erlaubnislisten (K2)
  --     Interne Funktionen: NUR der Eigentümer – kein Eintrag für eine andere Rolle oder PUBLIC
  foreach fn in array internal_fns loop
    fn_oid := fn::regprocedure;
    select string_agg(coalesce(g.rolname, 'PUBLIC'), ', ') into extra
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    left join pg_roles g on g.oid = acl.grantee
    where p.oid = fn_oid and acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or g.rolname is distinct from owner_name);
    if extra is not null then
      raise exception 'ABBRUCH: % ist ausführbar für: % (erlaubt: nur %).', fn, extra, owner_name;
    end if;
    foreach r in array app_roles loop
      if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, fn_oid, 'EXECUTE') then
        raise exception 'ABBRUCH: Rolle % darf % ausführen.', r, fn;
      end if;
    end loop;
  end loop;
  if not (select prosecdef from pg_proc where oid = 'public.archive_finished_events()'::regprocedure) then
    raise exception 'ABBRUCH: archive_finished_events ist nicht security definer.';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.event_ends_at(timestamptz, integer)'::regprocedure) then
    raise exception 'ABBRUCH: event_ends_at darf kein security definer sein.';
  end if;

  --     Admin-Funktionen: Eigentümer, authenticated, service_role (wie 005/007) – sonst niemand
  foreach fn in array admin_fns loop
    fn_oid := fn::regprocedure;
    if not exists (select 1 from pg_proc where oid = fn_oid and prosecdef and prosrc like '%public.is_admin()%') then
      raise exception 'ABBRUCH: % ist nicht security definer oder prüft is_admin() nicht.', fn;
    end if;
    select string_agg(coalesce(g.rolname, 'PUBLIC'), ', ') into extra
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    left join pg_roles g on g.oid = acl.grantee
    where p.oid = fn_oid and acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or g.rolname not in (owner_name, 'authenticated', 'service_role'));
    if extra is not null then
      raise exception 'ABBRUCH: unerwartete Ausführungsrechte auf % für: %', fn, extra;
    end if;
    if has_function_privilege('anon', fn_oid, 'EXECUTE')
       or not has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: Ausführungsrechte von % sind nicht wie in 006.', fn;
    end if;
  end loop;
  -- Die Regeln aus 006 sind in den neuen Fassungen noch enthalten
  if (select prosrc from pg_proc where oid = 'public.admin_set_event_status(uuid, text)'::regprocedure)
       not like '%DC004%DC002%DC007%' then
    raise exception 'ABBRUCH: admin_set_event_status enthält nicht mehr alle Regeln aus 006.';
  end if;
  if (select prosrc from pg_proc where oid = admin_fns[3]::regprocedure)
       not like '%admin_assert_event_input%DC006%DC002%DC005%' then
    raise exception 'ABBRUCH: admin_update_event enthält nicht mehr alle Regeln aus 006.';
  end if;

  -- 9d) admin_list_events liefert cancelled_at UND archived_at (K6)
  if pg_get_function_result('public.admin_list_events()'::regprocedure) not like '%cancelled_at timestamp with time zone%'
     or pg_get_function_result('public.admin_list_events()'::regprocedure) not like '%archived_at timestamp with time zone%' then
    raise exception 'ABBRUCH: admin_list_events liefert cancelled_at/archived_at nicht: %',
      pg_get_function_result('public.admin_list_events()'::regprocedure);
  end if;

  -- 9e) Lese-Policy vollständig vergleichen (K3): genau EINE Policy auf events,
  --     Name, PERMISSIVE, nur SELECT, nur authenticated, kein WITH CHECK, Ausdruck exakt
  select count(*) into n from pg_policy where polrelid = 'public.events'::regclass;
  if n <> 1 then
    raise exception 'ABBRUCH: Auf public.events gibt es % Policies (erwartet: genau 1).', n;
  end if;
  select polname, polpermissive, polcmd, polroles,
         pg_get_expr(polqual, polrelid) as qual, polwithcheck
    into pol
  from pg_policy where polrelid = 'public.events'::regclass;
  select pg_get_expr(polqual, polrelid) into ref_qual
  from pg_policy where polrelid = '_008_ref_events'::regclass and polname = 'ref_events_select';
  if pol.polname <> 'events: lesen (veröffentlicht, nicht archiviert)'
     or not pol.polpermissive
     or pol.polcmd <> 'r'
     or pol.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
     or pol.polwithcheck is not null
     or ref_qual is null
     or pol.qual is distinct from ref_qual then
    raise exception 'ABBRUCH: Lese-Policy auf events ist nicht wie erwartet: % / % (erwartet: %)', pol.polname, pol.qual, ref_qual;
  end if;

  -- 9f) Keine neuen Rechte für Schüler:innen/Besucher auf events
  if has_table_privilege('anon', 'public.events', 'select, insert, update, delete, truncate, references, trigger')
     or has_table_privilege('authenticated', 'public.events', 'insert, update, delete, truncate, references, trigger')
     or has_column_privilege('authenticated', 'public.events', 'archived_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.events', 'cancelled_at', 'UPDATE') then
    raise exception 'ABBRUCH: Unerwartete Rechte auf public.events.';
  end if;
  -- Anmeldungen hängen weiter an events (nichts gelöscht, kein Umbau)
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.event_registrations'::regclass and contype = 'f'
                   and confrelid = 'public.events'::regclass) then
    raise exception 'ABBRUCH: Fremdschlüssel event_registrations -> events fehlt.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
                 and conname = 'events_cancelled_at_matches_status')
     or not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
                 and conname = 'events_archived_only_published') then
    raise exception 'ABBRUCH: Prüfregeln für cancelled_at / archived_at fehlen.';
  end if;

  -- 9g) Ende-Berechnung: Stichprobe (90 Minuten / ohne Dauer = Mitternacht Ankara)
  if public.event_ends_at('2026-12-01 14:00+03', 90) <> '2026-12-01 15:30+03'::timestamptz
     or public.event_ends_at('2026-12-01 14:00+03', null) <> '2026-12-02 00:00+03'::timestamptz
     or public.event_ends_at('2026-12-01 23:30+03', null) <> '2026-12-02 00:00+03'::timestamptz
     or public.event_ends_at('2026-11-30 22:00+00', null) <> '2026-12-02 00:00+03'::timestamptz then
    raise exception 'ABBRUCH: event_ends_at rechnet nicht wie erwartet.';
  end if;

  -- 9h) LAUFZEIT-PROBE der Archiv-Funktion (K4): echte Test-Events anlegen, archivieren,
  --     Ergebnis prüfen – danach wird ALLES innerhalb des Blocks zurückgerollt
  --     (auch eventuell dabei archivierte echte Events). Gelöscht wird nichts.
  select id into sch from public.schools order by id limit 1;
  if sch is null then
    raise exception 'ABBRUCH: Keine Schule für die Laufzeit-Probe gefunden.';
  end if;
  begin
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] Ende vor 29 h"}', now() - interval '30 hours', 60, sch, array[sch], 'completed')
    returning id into p_done_old;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] Ende vor 2 h"}', now() - interval '3 hours', 60, sch, array[sch], 'completed')
    returning id into p_done_new;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] planned vorbei"}', now() - interval '30 hours', 60, sch, array[sch], 'planned')
    returning id into p_plan_old;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] Zukunft"}', now() + interval '2 days', null, sch, array[sch], 'confirmed')
    returning id into p_future;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] läuft"}', now() - interval '30 hours', 3 * 24 * 60, sch, array[sch], 'confirmed')
    returning id into p_running;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] ohne Dauer, heute"}', now() - interval '1 hour', null, sch, array[sch], 'planned')
    returning id into p_nodur;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
    values ('{"de":"[008-Probe] abgesagt vor 25 h"}', now() + interval '5 days', 60, sch, array[sch], 'cancelled', now() - interval '25 hours')
    returning id into p_cancel_old;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
    values ('{"de":"[008-Probe] abgesagt vor 1 h"}', now() + interval '5 days', 60, sch, array[sch], 'cancelled', now() - interval '1 hour')
    returning id into p_cancel_new;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[008-Probe] alter Entwurf"}', now() - interval '10 days', 60, sch, array[sch], 'draft')
    returning id into p_draft;

    perform public.archive_finished_events();
    second_run := public.archive_finished_events();

    probe_fail := concat_ws('; ',
      case when (select archived_at is null from public.events where id = p_done_old) then 'Ende vor 29 h nicht archiviert' end,
      case when (select archived_at is null from public.events where id = p_plan_old) then 'planned vorbei nicht archiviert' end,
      case when (select archived_at is null from public.events where id = p_cancel_old) then 'Absage vor 25 h nicht archiviert' end,
      case when (select archived_at is not null from public.events where id = p_done_new) then 'Ende vor 2 h archiviert' end,
      case when (select archived_at is not null from public.events where id = p_future) then 'künftiges Event archiviert' end,
      case when (select archived_at is not null from public.events where id = p_running) then 'laufendes Event archiviert' end,
      case when (select archived_at is not null from public.events where id = p_nodur) then 'Event ohne Dauer zu früh archiviert' end,
      case when (select archived_at is not null from public.events where id = p_cancel_new) then 'Absage vor 1 h archiviert' end,
      case when (select archived_at is not null from public.events where id = p_draft) then 'Entwurf archiviert' end,
      case when (select status from public.events where id = p_done_old) <> 'completed'
             or (select status from public.events where id = p_plan_old) <> 'planned'
             or (select status from public.events where id = p_cancel_old) <> 'cancelled' then 'Status verändert' end,
      case when second_run <> 0 then 'zweiter Lauf archivierte ' || second_run || ' Events (nicht idempotent)' end
    );
    if probe_fail = '' then probe_fail := null; end if;

    -- Alles in diesem Block zurückrollen (Test-Events UND mitarchivierte echte Events)
    raise exception using errcode = 'DC8PR', message = '008-Probe beendet';
  exception when sqlstate 'DC8PR' then
    null;
  end;
  if probe_fail is not null then
    raise exception 'ABBRUCH: Laufzeit-Probe von archive_finished_events fehlgeschlagen: %', probe_fail;
  end if;
  if exists (select 1 from public.events where title ->> 'de' like '[008-Probe]%') then
    raise exception 'ABBRUCH: Probe-Events wurden nicht zurückgerollt.';
  end if;
end $$;

commit;
