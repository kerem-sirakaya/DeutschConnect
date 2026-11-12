-- =============================================================================
-- Test für die automatische Archivierung (Migration 008) – speichert NICHTS dauerhaft
-- =============================================================================
-- WO? Auf einer KOPIE (lokal "supabase start" oder Staging-Projekt).
--   Ab Migration 008 (inkl. Korrekturen K1–K7 und Dauer-Neuberechnung).
--   Achtung: archive_finished_events() läuft über die GANZE Tabelle. Der Test rollt
--   am Ende zwar alles zurück, sollte aber trotzdem nicht in der Live-Datenbank laufen.
--
-- Wie ausführen?
--   1. Migration 008 muss ausgeführt sein.
--   2. EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B (normale:r Schüler:in) eintragen.
--   3. SQL Editor -> ganze Datei -> Run. Ergebnis "ERROR: TESTERGEBNIS ..." ist NORMAL
--      (= alles zurückgerollt). OK = wie erwartet, FEHL = Problem.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (Admin)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  a uuid;
  b uuid;
  s text;
  e_cancel_new uuid;  -- abgesagt vor 1 h            -> sichtbar
  e_cancel_old uuid;  -- abgesagt vor 25 h, Termin in 5 Tagen -> sichtbar (bis Termin + 24 h)
  e_cancel_past uuid; -- abgesagt vor 25 h, Ende vor 71 h      -> archiviert
  e_cancel_late uuid; -- abgesagt vor 1 h, Ende vor 29 h       -> sichtbar (Absage < 24 h)
  e_done_new uuid;    -- Ende vor 2 h                -> sichtbar
  e_done_old uuid;    -- Ende vor 29 h (mit Anmeldung) -> archiviert
  e_plan_old uuid;    -- planned, Ende vor 29 h (nie abgeschlossen) -> archiviert
  e_future uuid;      -- in 2 Tagen                  -> sichtbar
  e_running uuid;     -- begann vor 30 h, dauert 3 Tage -> sichtbar
  e_draft uuid;       -- alter Entwurf               -> nie
  n integer;
  ev record;
  old_arch timestamptz;
  log text := E'\n';
begin
  if to_regprocedure('public.archive_finished_events()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 008 ausführen.';
  end if;
  if email_a = 'EMAIL_KONTO_A' or email_b = 'EMAIL_KONTO_B' then
    raise exception 'ABBRUCH: Bitte EMAIL_KONTO_A und EMAIL_KONTO_B eintragen.';
  end if;
  select id into a from auth.users where lower(email) = lower(email_a);
  select id into b from auth.users where lower(email) = lower(email_b);
  if a is null or b is null or a = b then raise exception 'ABBRUCH: Konten A/B nicht eindeutig gefunden.'; end if;
  select school_id into s from public.profiles where id = b;
  if s is null then raise exception 'ABBRUCH: Profil von B fehlt.'; end if;

  insert into public.admins (user_id, note) values (a, 'nur Test') on conflict (user_id) do nothing;
  delete from public.admins where user_id = b;

  -- Test-Events (direkt als SQL-Editor-Rolle). Anmeldung zuerst bei künftigem Datum,
  -- danach Datum in die Vergangenheit legen (der Anmelde-Trigger erlaubt nur künftige Events).
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] Ende vor 29 h"}', now() + interval '1 day', 60, s, array[s], 'planned')
  returning id into e_done_old;
  insert into public.event_registrations (event_id, user_id, status) values (e_done_old, b, 'registered');
  update public.events set start_at = now() - interval '30 hours', status = 'completed' where id = e_done_old;

  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[Rollback] abgesagt vor 1 h"}', now() + interval '5 days', 60, s, array[s], 'cancelled', now() - interval '1 hour')
  returning id into e_cancel_new;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[Rollback] abgesagt vor 25 h"}', now() + interval '5 days', 60, s, array[s], 'cancelled', now() - interval '25 hours')
  returning id into e_cancel_old;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[Rollback] abgesagt vor 25 h, vorbei"}', now() - interval '3 days', 60, s, array[s], 'cancelled', now() - interval '25 hours')
  returning id into e_cancel_past;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[Rollback] spät abgesagt"}', now() - interval '30 hours', 60, s, array[s], 'cancelled', now() - interval '1 hour')
  returning id into e_cancel_late;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] Ende vor 2 h"}', now() - interval '3 hours', 60, s, array[s], 'completed')
  returning id into e_done_new;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] planned vorbei"}', now() - interval '30 hours', 60, s, array[s], 'planned')
  returning id into e_plan_old;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] Zukunft"}', now() + interval '2 days', null, s, array[s], 'planned')
  returning id into e_future;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] läuft"}', now() - interval '30 hours', 3 * 24 * 60, s, array[s], 'confirmed')
  returning id into e_running;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Rollback] alter Entwurf"}', now() - interval '10 days', 60, s, array[s], 'draft')
  returning id into e_draft;

  -- ===========================================================================
  -- Archivieren (zweimal – darf nichts doppelt tun)
  -- ===========================================================================
  perform public.archive_finished_events();
  n := public.archive_finished_events();
  log := log || case when n = 0 then 'OK   T9  zweiter Lauf archiviert nichts (idempotent)'
                     else 'FEHL T9  zweiter Lauf archivierte ' || n end || E'\n';

  log := log || case when (select archived_at is null from public.events where id = e_cancel_new)
                     then 'OK   T1  abgesagt vor 1 h: noch sichtbar' else 'FEHL T1' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_cancel_old)
                     then 'OK   T2  abgesagt vor 25 h, Termin in 5 Tagen: bleibt sichtbar' else 'FEHL T2' end || E'\n';
  log := log || case when (select archived_at is not null from public.events where id = e_cancel_past)
                     then 'OK   T2b abgesagt vor 25 h, Termin vorbei: archiviert' else 'FEHL T2b' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_cancel_late)
                     then 'OK   T2c abgesagt vor 1 h, Termin vorbei: noch sichtbar (mind. 24 h ab Absage)' else 'FEHL T2c' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_done_new)
                     then 'OK   T3  Ende vor 2 h: noch sichtbar' else 'FEHL T3' end || E'\n';
  log := log || case when (select archived_at is not null from public.events where id = e_done_old)
                     then 'OK   T4  Ende vor 29 h: archiviert' else 'FEHL T4' end || E'\n';
  log := log || case when (select archived_at is not null from public.events where id = e_plan_old)
                     then 'OK   T4b planned, vorbei: archiviert (Status bleibt planned)' else 'FEHL T4b' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_future)
                     then 'OK   T5  künftiges Event: nicht archiviert' else 'FEHL T5' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_running)
                     then 'OK   T6  laufendes Event: nicht archiviert' else 'FEHL T6' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_draft)
                     then 'OK   T6b Entwurf: nie archiviert' else 'FEHL T6b' end || E'\n';
  log := log || case when (select status from public.events where id = e_done_old) = 'completed'
                          and (select status from public.events where id = e_plan_old) = 'planned'
                     then 'OK   T10 Status bleibt unverändert' else 'FEHL T10 Status wurde geändert' end || E'\n';
  log := log || case when exists (select 1 from public.event_registrations where event_id = e_done_old and user_id = b and status = 'registered')
                     then 'OK   T8  Anmeldung zum archivierten Event bleibt erhalten' else 'FEHL T8' end || E'\n';

  -- ===========================================================================
  -- Sicht von Schüler:in B und Admin A
  -- ===========================================================================
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id in (e_cancel_past, e_done_old, e_plan_old);
  log := log || case when n = 0 then 'OK   T11 B sieht archivierte Events nicht (RLS)'
                     else 'FEHL T11 B sieht ' || n || ' archivierte Events' end || E'\n';
  select count(*) into n from public.events where id in (e_cancel_new, e_cancel_old, e_cancel_late, e_done_new, e_future, e_running);
  log := log || case when n = 6 then 'OK   T12 B sieht die nicht archivierten Events'
                     else 'FEHL T12 B sieht nur ' || n || ' von 6' end || E'\n';
  select count(*) into n from public.event_registrations where event_id = e_done_old;
  log := log || case when n = 1 then 'OK   T13 B sieht die eigene Anmeldung weiterhin'
                     else 'FEHL T13' end || E'\n';
  begin
    perform public.archive_finished_events();
    log := log || 'FEHL T14 B darf archive_finished_events aufrufen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T14 B: archive_finished_events verweigert (42501)' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_list_events() l
  where l.id in (e_cancel_past, e_done_old, e_plan_old) and l.archived_at is not null;
  log := log || case when n = 3 then 'OK   T7  Admin sieht archivierte Events (mit archived_at)'
                     else 'FEHL T7  Admin sieht nur ' || n || ' von 3' end || E'\n';

  -- ===========================================================================
  -- Dauer ändern (als A): Archiv-Zustand wird mit dem neuen Ende neu berechnet
  -- ===========================================================================
  -- Datensätze als SQL-Editor-Rolle lesen (die Policy versteckt archivierte Events auch vor
  -- Admins in der normalen Sicht), Änderungen dann als A über admin_update_event.
  -- Höchstdauer laut admin_assert_event_input: 1440 Minuten.

  -- T16: abgeschlossen + archiviert (Start vor 30 h), Dauer 60 -> 1440 -> Ende vor 6 h -> wieder sichtbar
  reset role;
  select * into ev from public.events where id = e_done_old;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_update_event(ev.id, ev.title, ev.start_at, ev.host_school_id, ev.school_ids,
    ev.summary, ev.description, ev.location, ev.audience, 1440, ev.capacity, ev.online, ev.topics, ev.format);

  -- T17: planned + archiviert, Dauer 60 -> 120 (Ende vor 28 h) -> bleibt archiviert, Zeitpunkt unverändert
  reset role;
  select * into ev from public.events where id = e_plan_old;
  old_arch := ev.archived_at;
  set local role authenticated;
  perform public.admin_update_event(ev.id, ev.title, ev.start_at, ev.host_school_id, ev.school_ids,
    ev.summary, ev.description, ev.location, ev.audience, 120, ev.capacity, ev.online, ev.topics, ev.format);

  -- T18: abgesagt + archiviert, Dauer 60 -> 240 (Ende weiter > 24 h vorbei) -> bleibt archiviert
  reset role;
  select * into ev from public.events where id = e_cancel_past;
  set local role authenticated;
  perform public.admin_update_event(ev.id, ev.title, ev.start_at, ev.host_school_id, ev.school_ids,
    ev.summary, ev.description, ev.location, ev.audience, 240, ev.capacity, ev.online, ev.topics, ev.format);

  -- T19: abgesagt vor 1 h (nicht archiviert), Dauer geändert -> bleibt sichtbar, Countdown unverändert
  reset role;
  select * into ev from public.events where id = e_cancel_new;
  set local role authenticated;
  perform public.admin_update_event(ev.id, ev.title, ev.start_at, ev.host_school_id, ev.school_ids,
    ev.summary, ev.description, ev.location, ev.audience, 240, ev.capacity, ev.online, ev.topics, ev.format);

  -- T20: abgeschlossen, Ende vor 2 h (nicht archiviert), Dauer 60 -> 1 -> Ende vor ~3 h -> bleibt sichtbar
  reset role;
  select * into ev from public.events where id = e_done_new;
  set local role authenticated;
  perform public.admin_update_event(ev.id, ev.title, ev.start_at, ev.host_school_id, ev.school_ids,
    ev.summary, ev.description, ev.location, ev.audience, 1, ev.capacity, ev.online, ev.topics, ev.format);

  reset role;
  log := log || case when (select archived_at is null and duration_minutes = 1440 from public.events where id = e_done_old)
                     then 'OK   T16 Dauer verlängert: archiviertes Event wieder sichtbar' else 'FEHL T16' end || E'\n';
  log := log || case when (select archived_at = old_arch from public.events where id = e_plan_old)
                     then 'OK   T17 Dauer geändert, Ende weiter > 24 h vorbei: bleibt archiviert (gleicher Zeitpunkt)' else 'FEHL T17' end || E'\n';
  log := log || case when (select archived_at is not null and cancelled_at <= now() - interval '24 hours' from public.events where id = e_cancel_past)
                     then 'OK   T18 abgesagt: Dauer ändern hebt Archivierung nicht auf' else 'FEHL T18' end || E'\n';
  log := log || case when (select archived_at is null and cancelled_at > now() - interval '2 hours' from public.events where id = e_cancel_new)
                     then 'OK   T19 abgesagt: Countdown bleibt an cancelled_at' else 'FEHL T19' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = e_done_new)
                     then 'OK   T20 Dauer verkürzt, Ende < 24 h vorbei: bleibt sichtbar' else 'FEHL T20' end || E'\n';
  log := log || case when exists (select 1 from public.event_registrations where event_id = e_done_old and user_id = b)
                     then 'OK   T21 Anmeldung bleibt beim Bearbeiten erhalten' else 'FEHL T21' end || E'\n';

  -- Absagen setzt cancelled_at
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_event_status(e_future, 'cancelled');
  reset role;
  log := log || case when (select cancelled_at is not null from public.events where id = e_future)
                     then 'OK   T15 Absagen setzt cancelled_at' else 'FEHL T15' end || E'\n';

  -- ===========================================================================
  -- Ende: ALLES rückgängig machen (diese Zeile niemals entfernen)
  -- ===========================================================================
  raise exception 'TESTERGEBNIS (alles wurde zurückgerollt):%', log;
end $$;
