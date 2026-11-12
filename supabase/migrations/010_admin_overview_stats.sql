-- =============================================================================
-- 010 – Admin-Übersicht: Kennzahlen (nur Zahlen, keine Personendaten)
-- =============================================================================
-- Ausführen NACH 005 und 006 (Supabase Dashboard -> SQL Editor -> Run), als
-- Datenbank-Eigentümer (postgres). IMMER die ganze Datei ausführen.
-- Läuft als EINE Transaktion; Teil 3 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Unabhängig von 008: Die Funktion prüft zur Laufzeit, ob events.archived_at existiert.
--   * ohne 008: archived_events = NULL ("noch nicht verfügbar" – KEINE erfundene 0),
--               upcoming_events ohne Archiv-Bedingung (künftige Events werden ohnehin nie archiviert)
--   * mit 008:  archived_events = Anzahl mit archived_at IS NOT NULL
--
-- Neue Funktion public.admin_get_overview_stats() – genau EINE Zeile:
--   total_students       Profile OHNE Eintrag in public.admins (Admins zählen nicht als Schüler:innen)
--   upcoming_events      Status planned/confirmed, Beginn in der Zukunft, nicht archiviert
--   total_registrations  Anmeldungen mit status = 'registered' (Interessierte zählen NICHT),
--                        über ALLE Events – auch abgesagte und archivierte (Historie bleibt)
--   ideas_pending_review Ideen mit status = 'submitted'
--   archived_events      Events mit archived_at IS NOT NULL (oder NULL, wenn 008 fehlt)
--
-- Sicherheit (gleiches Muster wie die admin_*-Funktionen aus 006):
--   * prüft zuerst public.is_admin(), sonst Fehler 42501
--   * SECURITY DEFINER (nötig: zählt über Tabellen, die RLS für Schüler:innen sperrt),
--     search_path = '', nur voll qualifizierte Namen
--   * gibt ausschließlich Zahlen zurück – keine IDs, Namen, E-Mails oder Profile
--   * EXECUTE: Eigentümer, authenticated (muss is_admin() bestehen), service_role
--     (Supabase-Standard, wie 005/007) – NICHT PUBLIC, NICHT anon
--   * keine neuen Tabellenrechte, keine Policies, keine Änderung an bestehenden Daten
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.admins') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 005 ausführen.';
  end if;
  if to_regprocedure('public.admin_list_events()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 006 ausführen.';
  end if;
  if current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass) then
    raise exception 'ABBRUCH: Bitte als Eigentümer von public.events ausführen (aktuell: %).', current_user;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Funktion: Kennzahlen für die Admin-Übersicht
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_overview_stats()
returns table (
  total_students       bigint,
  upcoming_events      bigint,
  total_registrations  bigint,
  ideas_pending_review bigint,
  archived_events      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_archive boolean;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;

  -- Gibt es events.archived_at (Migration 008)?
  has_archive := exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.events'::regclass and a.attname = 'archived_at' and not a.attisdropped
  );

  -- Schüler:innen = Profile ohne Admin-Eintrag
  select count(*) into total_students
  from public.profiles p
  where not exists (select 1 from public.admins a where a.user_id = p.id);

  -- Verbindliche Anmeldungen (keine Interessierten), über alle Events
  select count(*) into total_registrations
  from public.event_registrations r
  where r.status = 'registered';

  -- Eingereichte, noch nicht moderierte Ideen
  select count(*) into ideas_pending_review
  from public.ideas i
  where i.status = 'submitted';

  if has_archive then
    -- Feste Abfragen ohne Benutzereingaben (dynamisch nur, weil die Spalte erst ab 008 existiert)
    execute 'select count(*) from public.events e
             where e.status in (''planned'', ''confirmed'') and e.start_at > now() and e.archived_at is null'
      into upcoming_events;
    execute 'select count(*) from public.events e where e.archived_at is not null'
      into archived_events;
  else
    select count(*) into upcoming_events
    from public.events e
    where e.status in ('planned', 'confirmed') and e.start_at > now();
    archived_events := null;   -- unbekannt, NICHT 0
  end if;

  return next;
end;
$$;

revoke all on function public.admin_get_overview_stats() from public, anon;
grant execute on function public.admin_get_overview_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) SELBSTPRÜFUNG – bricht ab (= alles oben wird rückgängig gemacht)
-- -----------------------------------------------------------------------------
do $$
declare
  fn_oid     oid := 'public.admin_get_overview_stats()'::regprocedure;
  owner_name name := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass);
  app_roles  text[] := array['anon', 'authenticated', 'service_role', 'authenticator'];
  tables     text[] := array['public.profiles', 'public.admins', 'public.events', 'public.event_registrations', 'public.ideas'];
  t text;
  r text;
  extra text;
begin
  -- 3a) Funktion: security definer, leerer search_path, prüft is_admin() mit 42501
  if not exists (select 1 from pg_proc
                 where oid = fn_oid and prosecdef and proconfig = array['search_path=""']
                   and prosrc like '%public.is_admin()%' and prosrc like '%42501%') then
    raise exception 'ABBRUCH: admin_get_overview_stats ist nicht wie erwartet konfiguriert.';
  end if;
  -- Rückgabe: genau die fünf Zahlen-Spalten (keine IDs, Namen, E-Mails)
  if pg_get_function_result(fn_oid) is distinct from
     'TABLE(total_students bigint, upcoming_events bigint, total_registrations bigint, ideas_pending_review bigint, archived_events bigint)' then
    raise exception 'ABBRUCH: Unerwartete Rückgabe von admin_get_overview_stats: %', pg_get_function_result(fn_oid);
  end if;

  -- 3b) Eigentümer: derselbe wie bei allen gezählten Tabellen; keine App-Rolle; nicht erreichbar
  if (select pg_get_userbyid(proowner) from pg_proc where oid = fn_oid) is distinct from owner_name then
    raise exception 'ABBRUCH: admin_get_overview_stats gehört nicht dem Eigentümer von public.events.';
  end if;
  if owner_name in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'ABBRUCH: Die Tabellen gehören der App-Rolle %.', owner_name;
  end if;
  foreach r in array app_roles loop
    if exists (select 1 from pg_roles where rolname = r) and pg_has_role(r, owner_name, 'member') then
      raise exception 'ABBRUCH: Rolle % ist Mitglied der Eigentümer-Rolle %.', r, owner_name;
    end if;
  end loop;

  -- 3c) Der Eigentümer darf alle gezählten Tabellen lesen; RLS aktiv, aber nicht erzwungen
  foreach t in array tables loop
    if (select pg_get_userbyid(relowner) from pg_class where oid = t::regclass) is distinct from owner_name then
      raise exception 'ABBRUCH: % hat einen anderen Eigentümer als public.events.', t;
    end if;
    if not has_table_privilege(owner_name, t, 'select') then
      raise exception 'ABBRUCH: Eigentümer % darf % nicht lesen.', owner_name, t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'ABBRUCH: RLS ist auf % nicht aktiv.', t;
    end if;
    if (select relforcerowsecurity from pg_class where oid = t::regclass) then
      raise exception 'ABBRUCH: FORCE ROW LEVEL SECURITY ist auf % aktiv (Zählung sähe nichts).', t;
    end if;
  end loop;

  -- 3d) Ausführungsrechte gegen Erlaubnisliste: Eigentümer, authenticated, service_role
  select string_agg(coalesce(g.rolname, 'PUBLIC'), ', ') into extra
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  left join pg_roles g on g.oid = acl.grantee
  where p.oid = fn_oid and acl.privilege_type = 'EXECUTE'
    and (acl.grantee = 0 or g.rolname not in (owner_name, 'authenticated', 'service_role'));
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Ausführungsrechte auf admin_get_overview_stats für: %', extra;
  end if;
  if has_function_privilege('anon', fn_oid, 'EXECUTE') then
    raise exception 'ABBRUCH: anon darf admin_get_overview_stats ausführen.';
  end if;
  if not has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
    raise exception 'ABBRUCH: authenticated darf admin_get_overview_stats nicht aufrufen.';
  end if;

  -- 3e) Laufzeit-Probe: ohne Admin-Sitzung (SQL Editor, kein auth.uid()) MUSS 42501 kommen
  begin
    perform public.admin_get_overview_stats();
    raise exception 'ABBRUCH: admin_get_overview_stats ist ohne Admin-Rechte aufrufbar.';
  exception when insufficient_privilege then
    null;  -- erwartet
  end;

  -- 3f) Keine neuen Rechte auf den Tabellen für Besucher (anon)
  foreach t in array tables loop
    if has_table_privilege('anon', t, 'insert, update, delete, truncate') then
      raise exception 'ABBRUCH: anon hat Schreibrechte auf %.', t;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.admins', 'select') or has_table_privilege('authenticated', 'public.admins', 'select') then
    raise exception 'ABBRUCH: public.admins ist für App-Rollen lesbar.';
  end if;
end $$;

commit;
