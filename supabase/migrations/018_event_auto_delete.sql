-- =============================================================================
-- 018 – Events automatisch LÖSCHEN (24 Stunden nach Absage bzw. nach Start)
-- =============================================================================
-- Ausführen NACH 008 (und – falls der Chat genutzt wird – NACH 014).
-- Supabase Dashboard -> SQL Editor -> Run, als Datenbank-Eigentümer (postgres).
-- IMMER die ganze Datei ausführen. Läuft als EINE Transaktion; Teil 6 prüft am Ende
-- selbst, ob alles sicher ist – sonst wird ALLES zurückgerollt. Mehrfach ausführbar.
-- Den Zeitplan (jede Minute) richtet danach 019_event_auto_delete_cron.sql ein.
--
-- STATUS: NUR IM REPOSITORY (lokal getestet). Weder Staging noch Live ausgeführt.
--
-- Die zwei Regeln (Funktion event_deletion_due_at, Teil 2):
--   1. cancelled:                       gelöscht ab cancelled_at + 24 h
--                                       (der ursprüngliche Termin ist egal)
--   2. planned / confirmed / completed: gelöscht ab start_at + 24 h
--                                       (Dauer/Ende sind egal; gilt auch, wenn das Event
--                                        noch "planned" ist)
--   draft: nie automatisch (Entwürfe sieht nur der Admin; sie können umgeplant werden).
--   Zeitzonen: start_at und cancelled_at sind timestamptz (absolute Zeitpunkte), now()
--   ebenso -> Ergebnis unabhängig von der Zeitzone der Sitzung. "+ interval '24 hours'"
--   ist immer genau 24 Stunden (anders als '1 day' bei Sommerzeitwechseln).
--   Verschiebt ein Admin ein geplantes Event (admin_update_event), zählt das NEUE start_at.
--
-- Niemals zu früh: gelöscht wird nur, wenn due_at <= now() (Zeitpunkt des Laufs).
-- Spätestens ~1 Minute danach (Zeitplan jede Minute, 019). Die App blendet das Event
-- schon pünktlich aus (src/lib/eventArchive.js, gleiche Regel).
--
-- Was passiert mit verknüpften Daten?
--   * Anmeldungen (event_registrations): werden mitgelöscht (001: on delete cascade).
--     Ihre ANZAHL bleibt im Lösch-Protokoll (ohne Namen).
--   * Eventgruppe im Chat (014): bleibt ERHALTEN. Vor dem Löschen löst
--     chat_detach_event_room die Gruppe vom Event: Nachrichten bleiben, verbindlich
--     Angemeldete bleiben Mitglieder (lesen weiter), Gruppe wird archiviert (nur lesen),
--     Titel wird kopiert. Ohne diesen Schritt würde das Löschen am RESTRICT scheitern.
--   * Meldungen/Beweis-Kopien im Chat: unberührt.
--   * Schlägt das Löschen EINES Events fehl, bleibt genau dieses Event erhalten (WARNING),
--     die anderen werden trotzdem gelöscht; beim nächsten Lauf wird es erneut versucht.
--
-- Lösch-Protokoll public.event_deletion_log: was wann gelöscht wurde (Titel, Status,
-- Start, Absage, fälliger Zeitpunkt, Anzahl Anmeldungen, Chat-Gruppe) – KEINE Personendaten.
-- Nur für den Datenbank-Eigentümer lesbar (SQL Editor).
--
-- Migration 009 (stündliches Archivieren) wird damit überflüssig: Löschen kommt immer
-- vor dem Archivieren (Start <= Ende). 019 entfernt den Job dc_archive_finished_events.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.events') is null or to_regclass('public.event_registrations') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.events'::regclass
                   and attname = 'cancelled_at' and not attisdropped)
     or to_regprocedure('public.admin_set_event_status(uuid, text)') is null
     or (select prosrc from pg_proc where oid = 'public.admin_set_event_status(uuid, text)'::regprocedure)
          not like '%cancelled_at%' then
    raise exception 'ABBRUCH: Bitte zuerst Migration 008 ausführen (events.cancelled_at).';
  end if;
  if current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass) then
    raise exception 'ABBRUCH: Bitte als Eigentümer von public.events ausführen (aktuell: %).', current_user;
  end if;
  -- Chat vorhanden? Dann muss es die Fassung mit chat_detach_event_room sein (sonst Chatverlust/Abbruch)
  if to_regclass('public.chat_rooms') is not null
     and to_regprocedure('public.chat_detach_event_room(uuid)') is null then
    raise exception 'ABBRUCH: Chat (014) ist eine ältere Fassung ohne chat_detach_event_room – bitte zuerst 014 erneut ausführen.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Wann ist ein Event zum Löschen fällig? (null = nie)
-- -----------------------------------------------------------------------------
create or replace function public.event_deletion_due_at(p_status text, p_start_at timestamptz, p_cancelled_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then p_cancelled_at + interval '24 hours'
    when p_status in ('planned', 'confirmed', 'completed') then p_start_at + interval '24 hours'
    else null
  end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Lösch-Protokoll (keine Personendaten; nur Eigentümer)
-- -----------------------------------------------------------------------------
create table if not exists public.event_deletion_log (
  id               bigint generated always as identity primary key,
  event_id         uuid not null,
  title            jsonb,
  status           text not null,
  start_at         timestamptz not null,
  cancelled_at     timestamptz,
  due_at           timestamptz not null,
  deleted_at       timestamptz not null default now(),
  registered_count integer not null default 0,
  interested_count integer not null default 0,
  chat_room_id     uuid      -- erhaltene, archivierte Eventgruppe (falls vorhanden)
);
alter table public.event_deletion_log enable row level security;   -- keine Policies = für App-Rollen unsichtbar
revoke all on public.event_deletion_log from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Löschen (nur Datenbank-Eigentümer – Zeitplan 019 / SQL Editor)
-- -----------------------------------------------------------------------------
-- Gibt die Zahl der gelöschten Events zurück. Mehrfach ausführen ist sicher.
create or replace function public.delete_expired_events()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ev      record;
  room    uuid;
  n_reg   integer;
  n_int   integer;
  n       integer := 0;
  has_chat boolean := to_regprocedure('public.chat_detach_event_room(uuid)') is not null;
begin
  -- SKIP LOCKED: Ein Event, das gerade ein Admin bearbeitet, wird beim nächsten Lauf geprüft
  -- (dann mit dem neuen Datum). Die Bedingung wird für jede Zeile NACH dem Sperren gelesen.
  for ev in
    select e.id, e.title, e.status, e.start_at, e.cancelled_at,
           public.event_deletion_due_at(e.status, e.start_at, e.cancelled_at) as due_at
      from public.events e
     where public.event_deletion_due_at(e.status, e.start_at, e.cancelled_at) <= now()
     order by 6
       for update of e skip locked
  loop
    begin
      room := null;
      if has_chat then
        room := public.chat_detach_event_room(ev.id);   -- Chatverlauf sichern (014)
      end if;
      select count(*) filter (where r.status = 'registered'), count(*) filter (where r.status = 'interested')
        into n_reg, n_int
        from public.event_registrations r where r.event_id = ev.id;
      insert into public.event_deletion_log
        (event_id, title, status, start_at, cancelled_at, due_at, registered_count, interested_count, chat_room_id)
      values (ev.id, ev.title, ev.status, ev.start_at, ev.cancelled_at, ev.due_at, n_reg, n_int, room);
      delete from public.events e where e.id = ev.id;   -- Anmeldungen: on delete cascade (001)
      n := n + 1;
    exception when others then
      -- Nur DIESES Event bleibt (inkl. Chat-Änderung zurückgerollt); nächster Lauf versucht es erneut
      raise warning 'delete_expired_events: Event % nicht gelöscht: % (%)', ev.id, sqlerrm, sqlstate;
    end;
  end loop;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Rechte: über die API für NIEMANDEN aufrufbar (auch nicht service_role)
-- -----------------------------------------------------------------------------
revoke all on function public.event_deletion_due_at(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.delete_expired_events() from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) SELBSTPRÜFUNG – bricht ab (= alles oben wird rückgängig gemacht)
-- -----------------------------------------------------------------------------
do $$
declare
  owner_name name := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass);
  fns text[] := array['public.delete_expired_events()', 'public.event_deletion_due_at(text, timestamptz, timestamptz)'];
  fn text;
  r text;
  extra text;
  sch text;
  p_plan_due uuid; p_plan_early uuid; p_conf uuid; p_done uuid; p_long uuid;
  p_cancel_due uuid; p_cancel_early uuid; p_draft uuid; p_future uuid;
  first_run integer;
  second_run integer;
  probe_fail text;
begin
  -- 6a) Eigentümer, leerer search_path, keine Ausführung für App-Rollen
  foreach fn in array fns loop
    if (select pg_get_userbyid(proowner) from pg_proc where oid = fn::regprocedure) is distinct from owner_name then
      raise exception 'ABBRUCH: % gehört nicht dem Eigentümer von public.events.', fn;
    end if;
    if not exists (select 1 from pg_proc where oid = fn::regprocedure and proconfig = array['search_path=""']) then
      raise exception 'ABBRUCH: % hat keinen leeren search_path.', fn;
    end if;
    select string_agg(coalesce(g.rolname, 'PUBLIC'), ', ') into extra
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      left join pg_roles g on g.oid = acl.grantee
     where p.oid = fn::regprocedure and acl.privilege_type = 'EXECUTE'
       and (acl.grantee = 0 or g.rolname is distinct from owner_name);
    if extra is not null then
      raise exception 'ABBRUCH: % ist ausführbar für: %.', fn, extra;
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
      if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, fn::regprocedure, 'EXECUTE') then
        raise exception 'ABBRUCH: Rolle % darf % ausführen.', r, fn;
      end if;
    end loop;
  end loop;
  if not (select prosecdef from pg_proc where oid = 'public.delete_expired_events()'::regprocedure) then
    raise exception 'ABBRUCH: delete_expired_events ist nicht security definer.';
  end if;

  -- 6b) Protokoll: RLS an, keine Policies, keine Rechte für App-Rollen
  if not (select relrowsecurity from pg_class where oid = 'public.event_deletion_log'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_deletion_log') then
    raise exception 'ABBRUCH: event_deletion_log ist nicht abgeschottet.';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r)
       and has_table_privilege(r, 'public.event_deletion_log', 'select, insert, update, delete, truncate') then
      raise exception 'ABBRUCH: Rolle % hat Rechte auf event_deletion_log.', r;
    end if;
  end loop;

  -- 6c) Regel-Stichprobe (Zeitzonen-Schreibweise egal: +03 und Z sind derselbe Zeitpunkt)
  if public.event_deletion_due_at('planned', '2026-11-16 16:00+03', null) <> '2026-11-17 13:00Z'::timestamptz
     or public.event_deletion_due_at('cancelled', '2026-12-24 10:00+03', '2026-11-16 16:00+03') <> '2026-11-17 16:00+03'::timestamptz
     or public.event_deletion_due_at('draft', '2020-01-01 10:00+03', null) is not null then
    raise exception 'ABBRUCH: event_deletion_due_at rechnet nicht wie erwartet.';
  end if;

  -- 6d) LAUFZEIT-PROBE: Test-Events anlegen, löschen lassen, prüfen – danach wird ALLES im
  --     Block zurückgerollt (auch eventuell dabei gelöschte echte Events).
  select id into sch from public.schools order by id limit 1;
  if sch is null then
    raise exception 'ABBRUCH: Keine Schule für die Laufzeit-Probe gefunden.';
  end if;
  begin
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] planned, Start genau vor 24 h"}', now() - interval '24 hours', 60, sch, array[sch], 'planned')
    returning id into p_plan_due;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] planned, Start vor 24 h minus 1 s"}', now() - interval '24 hours' + interval '1 second', 60, sch, array[sch], 'planned')
    returning id into p_plan_early;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] confirmed vor 25 h"}', now() - interval '25 hours', null, sch, array[sch], 'confirmed')
    returning id into p_conf;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] completed vor 3 Tagen"}', now() - interval '3 days', 60, sch, array[sch], 'completed')
    returning id into p_done;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] mehrtägig, Start vor 25 h, läuft noch"}', now() - interval '25 hours', 3 * 24 * 60, sch, array[sch], 'confirmed')
    returning id into p_long;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
    values ('{"de":"[018-Probe] abgesagt genau vor 24 h, Termin in 5 Tagen"}', now() + interval '5 days', 60, sch, array[sch], 'cancelled', now() - interval '24 hours')
    returning id into p_cancel_due;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
    values ('{"de":"[018-Probe] abgesagt vor 23:59:59, Termin vor 10 Tagen"}', now() - interval '10 days', 60, sch, array[sch], 'cancelled', now() - interval '24 hours' + interval '1 second')
    returning id into p_cancel_early;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] alter Entwurf"}', now() - interval '10 days', 60, sch, array[sch], 'draft')
    returning id into p_draft;
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[018-Probe] Zukunft"}', now() + interval '2 days', 60, sch, array[sch], 'planned')
    returning id into p_future;

    first_run := public.delete_expired_events();
    second_run := public.delete_expired_events();

    probe_fail := concat_ws('; ',
      case when exists (select 1 from public.events where id = p_plan_due) then 'planned nach genau 24 h nicht gelöscht' end,
      case when exists (select 1 from public.events where id = p_conf) then 'confirmed nach 25 h nicht gelöscht' end,
      case when exists (select 1 from public.events where id = p_done) then 'completed nicht gelöscht' end,
      case when exists (select 1 from public.events where id = p_long) then 'mehrtägiges Event 25 h nach Start nicht gelöscht' end,
      case when exists (select 1 from public.events where id = p_cancel_due) then 'Absage vor genau 24 h nicht gelöscht' end,
      case when not exists (select 1 from public.events where id = p_plan_early) then 'planned 1 s ZU FRÜH gelöscht' end,
      case when not exists (select 1 from public.events where id = p_cancel_early) then 'abgesagtes Event 1 s ZU FRÜH gelöscht' end,
      case when not exists (select 1 from public.events where id = p_draft) then 'Entwurf gelöscht' end,
      case when not exists (select 1 from public.events where id = p_future) then 'künftiges Event gelöscht' end,
      case when (select count(*) from public.event_deletion_log
                  where event_id in (p_plan_due, p_conf, p_done, p_long, p_cancel_due)) <> 5 then 'Protokoll unvollständig' end,
      case when first_run < 5 then 'erster Lauf löschte nur ' || first_run end,
      case when second_run <> 0 then 'zweiter Lauf löschte ' || second_run || ' Events (nicht idempotent)' end
    );
    if probe_fail = '' then probe_fail := null; end if;
    raise exception using errcode = 'DC8PR', message = '018-Probe beendet';
  exception when sqlstate 'DC8PR' then
    null;
  end;
  if probe_fail is not null then
    raise exception 'ABBRUCH: Laufzeit-Probe von delete_expired_events fehlgeschlagen: %', probe_fail;
  end if;
  if exists (select 1 from public.events where title ->> 'de' like '[018-Probe]%')
     or exists (select 1 from public.event_deletion_log where title ->> 'de' like '[018-Probe]%') then
    raise exception 'ABBRUCH: Probe-Daten wurden nicht zurückgerollt.';
  end if;
end $$;

commit;
