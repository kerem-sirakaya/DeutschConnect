-- =============================================================================
-- Staging-Prüfung nach 001–007 + 011 + 012 + 013 – NUR LESEN, ändert NICHTS
-- =============================================================================
-- Wo ausführen? NUR im SQL Editor des Projekts "DeutschConnect-Staging".
-- Was passiert? Nur SELECT-Abfragen auf Systemkatalogen. Keine Daten, keine Rechte,
-- keine Policies werden verändert. Ergebnis: EINE Tabelle mit Prüfpunkten.
--   ok = true  → wie erwartet
--   ok = false → bitte Ergebnis an Claude geben (Spalte "pruefpunkt" + "ist")
-- =============================================================================

with checks(pruefpunkt, ok, ist) as (
  -- Tabellen vorhanden + RLS aktiv
  select 'RLS aktiv: ' || t,
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t)), false),
         coalesce((select case when c.relrowsecurity then 'RLS an' else 'RLS AUS' end
                     from pg_class c where c.oid = to_regclass('public.' || t)), 'Tabelle fehlt')
    from unnest(array['schools', 'profiles', 'events', 'event_registrations', 'ideas', 'idea_supports',
                      'admins', 'tutoring_entries', 'tutoring_requests', 'tutoring_saves',
                      'profile_sharing', 'idea_members']) as t

  union all
  -- Funktionen vorhanden, SECURITY DEFINER, fester search_path, NICHT für anon
  select 'Funktion sicher: ' || f,
         coalesce((select p.prosecdef and p.proconfig = array['search_path=""']
                          and not has_function_privilege('anon', p.oid, 'execute')
                          and has_function_privilege('authenticated', p.oid, 'execute')
                     from pg_proc p where p.oid = to_regprocedure(f)), false),
         coalesce((select 'definer=' || p.prosecdef || ' path=' || coalesce(array_to_string(p.proconfig, ','), '-')
                          || ' anon=' || has_function_privilege('anon', p.oid, 'execute')
                          || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
                     from pg_proc p where p.oid = to_regprocedure(f)), 'Funktion fehlt')
    from unnest(array[
      'public.tutoring_list_entries()', 'public.tutoring_send_request(uuid,text)',
      'public.tutoring_respond_request(uuid,boolean,text)', 'public.tutoring_withdraw_request(uuid)',
      'public.tutoring_list_requests()',
      'public.get_my_activity_stats()', 'public.list_public_profiles()', 'public.get_public_profile(uuid)',
      'public.save_profile_sharing(boolean,boolean,boolean,boolean,boolean)',
      'public.project_request_join(uuid)', 'public.project_cancel_request(uuid)', 'public.project_leave(uuid)',
      'public.project_review_request(uuid,uuid,boolean)', 'public.project_get_overview(uuid)',
      'public.project_get_team(uuid)', 'public.project_my_memberships()', 'public.list_public_memberships(uuid)'
    ]) as f

  union all
  -- Kein direkter Zugriff für Besucher:innen ohne Konto
  select 'anon ohne Tabellenrechte: ' || t,
         to_regclass('public.' || t) is not null
           and not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'),
         case when to_regclass('public.' || t) is null then 'Tabelle fehlt'
              when has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete') then 'anon HAT Rechte'
              else 'keine Rechte' end
    from unnest(array['profiles', 'tutoring_entries', 'tutoring_requests', 'tutoring_saves',
                      'profile_sharing', 'idea_members']) as t

  union all
  -- Nur über Funktionen: angemeldete Nutzer:innen haben auf diese Tabellen keine Schreibrechte
  select 'nur über Funktionen: ' || t,
         to_regclass('public.' || t) is not null
           and not has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete'),
         case when to_regclass('public.' || t) is null then 'Tabelle fehlt'
              when has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete') then 'Schreibrecht vorhanden'
              else 'kein Schreibrecht' end
    from unnest(array['tutoring_requests', 'profile_sharing', 'idea_members']) as t

  union all
  -- Profile bleiben privat (nur Policy aus 001 zum Lesen)
  select 'profiles: nur eigene Zeile lesbar',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                       and cmd in ('SELECT', 'ALL') and policyname <> 'profiles: eigenes Profil lesen'),
         (select string_agg(policyname || ' (' || cmd || ')', '; ') from pg_policies
           where schemaname = 'public' and tablename = 'profiles')

  union all
  -- 004 v3 (Erlaubnisliste) – Voraussetzung dafür, dass 006 durchlief
  select 'ideas: Lese-Policy v3 (Erlaubnisliste)',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ideas'
                   and policyname = 'ideas: lesen (freigegeben oder eigene)'
                   and qual like '%collecting%review%planned%' and qual not like '%<>%'),
         (select qual from pg_policies where schemaname = 'public' and tablename = 'ideas'
           and policyname = 'ideas: lesen (freigegeben oder eigene)')

  union all
  -- 008–010 sollen auf Staging NICHT ausgeführt sein (wie live)
  select '008 nicht ausgeführt (wie live)',
         not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'events' and column_name = 'archived_at'),
         case when exists (select 1 from information_schema.columns where table_schema = 'public'
                             and table_name = 'events' and column_name = 'archived_at')
              then 'archived_at vorhanden (008 ausgeführt)' else 'nicht ausgeführt' end

  union all
  -- Mindestens ein Admin (für die Freigabe von Test-Ideen)
  select 'mindestens 1 Admin auf Staging',
         (select count(*) from public.admins) > 0,
         (select count(*)::text || ' Admin(s)' from public.admins)

  union all
  -- Beide Pilotschulen vorhanden (aus 001)
  select 'Schulen ers + anka',
         (select count(*) from public.schools where id in ('ers', 'anka')) = 2,
         (select string_agg(id, ', ') from public.schools)
)
select pruefpunkt, ok, ist from checks order by ok, pruefpunkt;
