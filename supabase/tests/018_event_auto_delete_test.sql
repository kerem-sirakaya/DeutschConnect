-- =============================================================================
-- Automatisches Löschen von Events (Migration 018) – speichert NICHTS dauerhaft
-- =============================================================================
-- Prüft beide Regeln exakt an der 24-Stunden-Grenze (±1 Sekunde):
--   Regel 1: abgesagt  -> gelöscht ab cancelled_at + 24 h (Termin egal)
--   Regel 2: geplant / bestätigt / abgeschlossen -> gelöscht ab start_at + 24 h
-- dazu: Absagen über admin_set_event_status, Zeitzonen der Sitzung, Entwürfe, Anmeldungen,
-- Chat-Gruppe bleibt erhalten (falls 014), Fehler bei EINEM Event, mehrfaches Ausführen.
--
-- WO? Nur auf einer KOPIE (lokale Test-Datenbank oder Staging), NACH Migration 018.
--     delete_expired_events() läuft über die ganze Tabelle – alles wird am Ende zurückgerollt.
-- WIE? EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B, EMAIL_KONTO_C (normale Konten) eintragen
--      -> ganze Datei -> Run. "ERROR: TESTERGEBNIS ..." ist NORMAL. OK = wie erwartet, FEHL = Problem.
-- Hinweis: now() ist innerhalb des Tests EIN fester Zeitpunkt – deshalb sind die Grenzen exakt prüfbar.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (Admin)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  email_c constant text := 'EMAIL_KONTO_C';   -- <- eintragen (normal)
  a uuid; b uuid; c uuid; s text;
  p23 uuid; p24m uuid; p24 uuid; p25 uuid;    -- planned: Start vor 23 h / 24 h − 1 s / genau 24 h / 25 h
  conf uuid; done uuid; multi uuid; nodur uuid;
  c24m uuid; c24 uuid; c_future uuid; c_past uuid;
  draft_old uuid; future uuid;
  via_admin uuid; reg_event uuid; chat_event uuid; blocked uuid;
  room uuid;
  n integer; n2 integer;
  tz text;
  ok boolean;
  r record;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  select id into c from auth.users where email = email_c;
  if a is null or b is null or c is null then
    raise exception 'Bitte EMAIL_KONTO_A (Admin), EMAIL_KONTO_B und EMAIL_KONTO_C eintragen.';
  end if;
  insert into public.admins (user_id, note) values (a, 'Test 018') on conflict do nothing;
  select id into s from public.schools order by id limit 1;

  -- ---------- Regel 2: nicht abgesagt -> Start + 24 h ----------
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] planned vor 23 h"}', now() - interval '23 hours', 60, s, array[s], 'planned') returning id into p23;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] planned vor 24 h - 1 s"}', now() - interval '24 hours' + interval '1 second', 60, s, array[s], 'planned') returning id into p24m;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] planned genau vor 24 h"}', now() - interval '24 hours', 60, s, array[s], 'planned') returning id into p24;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] planned vor 25 h"}', now() - interval '25 hours', 60, s, array[s], 'planned') returning id into p25;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] confirmed vor 24 h"}', now() - interval '24 hours', 90, s, array[s], 'confirmed') returning id into conf;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] completed vor 24 h"}', now() - interval '24 hours', 90, s, array[s], 'completed') returning id into done;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] 3-tägig, Start vor 24 h"}', now() - interval '24 hours', 3 * 24 * 60, s, array[s], 'confirmed') returning id into multi;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] ohne Dauer, Start vor 24 h - 1 s"}', now() - interval '24 hours' + interval '1 second', null, s, array[s], 'planned') returning id into nodur;

  -- ---------- Regel 1: abgesagt -> Absage + 24 h, Termin egal ----------
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[T018] abgesagt vor 24 h - 1 s, Termin vor 30 Tagen"}', now() - interval '30 days', 60, s, array[s], 'cancelled',
          now() - interval '24 hours' + interval '1 second') returning id into c24m;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[T018] abgesagt genau vor 24 h, Termin in 30 Tagen"}', now() + interval '30 days', 60, s, array[s], 'cancelled',
          now() - interval '24 hours') returning id into c24;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[T018] abgesagt vor 1 h, Termin in 2 h"}', now() + interval '2 hours', 60, s, array[s], 'cancelled',
          now() - interval '1 hour') returning id into c_future;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[T018] abgesagt vor 2 Tagen, Termin vor 3 Tagen"}', now() - interval '3 days', 60, s, array[s], 'cancelled',
          now() - interval '2 days') returning id into c_past;

  -- ---------- nie / noch nicht ----------
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] Entwurf vor 10 Tagen"}', now() - interval '10 days', 60, s, array[s], 'draft') returning id into draft_old;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] Zukunft"}', now() + interval '3 days', 60, s, array[s], 'planned') returning id into future;

  -- Absage über die Admin-Funktion (Termin war vor 2 Tagen -> trotzdem 24 h ab JETZT)
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] per Admin abgesagt"}', now() + interval '1 hour', 60, s, array[s], 'planned') returning id into via_admin;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.admin_set_event_status(via_admin, 'cancelled');
  perform set_config('request.jwt.claims', '', true);
  update public.events set start_at = now() - interval '2 days' where id = via_admin;   -- Termin "vorbei" (als Eigentümer)

  -- Anmeldungen (angemeldet + interessiert) an einem Event, das gleich fällig wird
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] mit Anmeldungen"}', now() + interval '2 days', 60, s, array[s], 'confirmed') returning id into reg_event;
  insert into public.event_registrations (event_id, user_id, status) values (reg_event, b, 'registered'), (reg_event, c, 'interested');
  update public.events set start_at = now() - interval '25 hours' where id = reg_event;

  -- Event mit Chat-Gruppe (nur falls 014): B angemeldet + schreibt, C nur interessiert
  if to_regclass('public.chat_rooms') is not null then
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[T018] mit Chat","tr":"[T018] sohbetli"}', now() + interval '2 days', 60, s, array[s], 'confirmed') returning id into chat_event;
    insert into public.event_registrations (event_id, user_id, status) values (chat_event, b, 'registered'), (chat_event, c, 'interested');
    insert into public.chat_rooms (kind, event_id) values ('event', chat_event) returning id into room;
    insert into public.chat_messages (room_id, sender_id, body) values (room, b, 'Nachricht 1'), (room, b, 'Nachricht 2');
    update public.events set start_at = now() - interval '24 hours' where id = chat_event;
  end if;

  -- Ein fälliges Event, das NICHT gelöscht werden kann (fremder Verweis mit RESTRICT)
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T018] blockiert"}', now() - interval '30 hours', 60, s, array[s], 'planned') returning id into blocked;
  create table public._t018_blocker (event_id uuid references public.events (id) on delete restrict);  -- wird mit zurückgerollt
  insert into public._t018_blocker values (blocked);

  -- ---------- Zeitzonen-Unabhängigkeit der Berechnung (vor dem Lauf) ----------
  ok := true;
  foreach tz in array array['UTC', 'Europe/Istanbul', 'Europe/Berlin', 'America/Los_Angeles', 'Pacific/Kiritimati'] loop
    perform set_config('timezone', tz, true);
    -- Beispiele aus der Aufgabe: Montag 16:00 (Ankara) -> Dienstag 16:00 (Ankara)
    ok := ok
      and public.event_deletion_due_at('planned', timestamp '2026-11-16 16:00' at time zone 'Europe/Istanbul', null)
          = timestamp '2026-11-17 16:00' at time zone 'Europe/Istanbul'
      and public.event_deletion_due_at('cancelled', timestamp '2026-12-01 10:00' at time zone 'Europe/Istanbul',
                                       timestamp '2026-11-16 16:00' at time zone 'Europe/Istanbul')
          = timestamp '2026-11-17 16:00' at time zone 'Europe/Istanbul'
      -- über die Sommerzeit-Umstellung in Berlin (25.10.2026): trotzdem genau 24 h
      and public.event_deletion_due_at('planned', '2026-10-24 12:00+02', null) = '2026-10-25 11:00+01'::timestamptz;
  end loop;
  log := log || case when ok then 'OK   Z1 Fälligkeit identisch in 5 Sitzungs-Zeitzonen; Beispiele Mo 16:00 -> Di 16:00; genau 24 h über Sommerzeitwechsel'
                     else 'FEHL Z1 Zeitzonen' end || E'\n';

  -- ---------- LAUF in einer "exotischen" Sitzungs-Zeitzone ----------
  perform set_config('timezone', 'Pacific/Kiritimati', true);   -- UTC+14
  n := public.delete_expired_events();
  perform set_config('timezone', 'America/Los_Angeles', true);  -- UTC-8
  n2 := public.delete_expired_events();
  perform set_config('timezone', 'UTC', true);

  -- ---------- Ergebnisse ----------
  for r in select * from (values
      ('A1 planned, Start vor 23 h -> bleibt',                    p23,       true),
      ('A2 planned, Start vor 24 h - 1 s -> bleibt (nicht zu früh)', p24m,   true),
      ('A3 planned, Start genau vor 24 h -> gelöscht',           p24,       false),
      ('A4 planned, Start vor 25 h -> gelöscht',                 p25,       false),
      ('A5 confirmed, Start vor 24 h -> gelöscht',               conf,      false),
      ('A6 completed, Start vor 24 h -> gelöscht',               done,      false),
      ('A7 mehrtägig, Start vor 24 h -> gelöscht (Dauer egal)',  multi,     false),
      ('A8 ohne Dauer, Start vor 24 h - 1 s -> bleibt',          nodur,     true),
      ('B1 abgesagt vor 24 h - 1 s, Termin längst vorbei -> bleibt', c24m,  true),
      ('B2 abgesagt genau vor 24 h, Termin in 30 Tagen -> gelöscht', c24,   false),
      ('B3 abgesagt vor 1 h, Termin vorbei/bald -> bleibt',     c_future,  true),
      ('B4 abgesagt vor 2 Tagen -> gelöscht',                    c_past,    false),
      ('B5 per admin_set_event_status abgesagt, Termin vorbei -> bleibt (24 h ab Absage)', via_admin, true),
      ('C1 Entwurf, Termin vor 10 Tagen -> bleibt',              draft_old, true),
      ('C2 künftiges Event -> bleibt',                           future,    true),
      ('D1 Event mit Anmeldungen, Start vor 25 h -> gelöscht',   reg_event, false),
      ('F1 fälliges Event mit blockierendem Verweis -> bleibt (nur dieses)', blocked, true)
    ) as t(label, id, should_exist) loop
    ok := exists (select 1 from public.events e where e.id = r.id) = r.should_exist;
    log := log || case when ok then 'OK   ' else 'FEHL ' end || r.label || E'\n';
  end loop;

  log := log || case when (select cancelled_at from public.events where id = via_admin) = now()
                      and public.event_deletion_due_at('cancelled', null, (select cancelled_at from public.events where id = via_admin))
                          = now() + interval '24 hours'
                     then 'OK   B6 admin_set_event_status: cancelled_at = Absagezeitpunkt, fällig genau 24 h später'
                     else 'FEHL B6 cancelled_at' end || E'\n';

  -- Anmeldungen: mitgelöscht, Anzahl im Protokoll (ohne Namen)
  log := log || case when not exists (select 1 from public.event_registrations where event_id = reg_event)
                      and exists (select 1 from public.event_deletion_log l where l.event_id = reg_event
                                    and l.registered_count = 1 and l.interested_count = 1 and l.status = 'confirmed')
                     then 'OK   D2 Anmeldungen mitgelöscht, Anzahl (1 angemeldet / 1 interessiert) im Protokoll'
                     else 'FEHL D2 Anmeldungen/Protokoll' end || E'\n';
  -- Protokoll: nie vor der Fälligkeit, Fälligkeit = Regel
  log := log || case when not exists (select 1 from public.event_deletion_log l
                                       where l.title ->> 'de' like '[T018]%'
                                         and (l.due_at > l.deleted_at
                                              or l.due_at is distinct from public.event_deletion_due_at(l.status, l.start_at, l.cancelled_at)))
                      and (select count(*) from public.event_deletion_log l where l.title ->> 'de' like '[T018]%')
                          = 8 + case when chat_event is null then 0 else 1 end
                     then 'OK   E1 Protokoll vollständig; kein Eintrag vor seiner Fälligkeit gelöscht'
                     else 'FEHL E1 Protokoll' end || E'\n';
  log := log || case when n2 = 0 then 'OK   E2 zweiter Lauf löscht nichts mehr (idempotent)'
                     else 'FEHL E2 zweiter Lauf löschte ' || n2 end || E'\n';
  log := log || case when exists (select 1 from public._t018_blocker) and n >= 8
                     then 'OK   F2 Fehler bei einem Event stoppt die anderen Löschungen nicht (' || n || ' gelöscht)'
                     else 'FEHL F2 (gelöscht: ' || n || ')' end || E'\n';

  -- Chat-Gruppe bleibt erhalten
  if chat_event is not null then
    select * into r from public.chat_rooms where id = room;
    log := log || case when r.id is not null and r.event_id is null and r.archived_at is not null
                         and r.event_title ->> 'de' = '[T018] mit Chat'
                         and (select count(*) from public.chat_messages m where m.room_id = room) = 2
                         and not exists (select 1 from public.events where id = chat_event)
                       then 'OK   G1 Event gelöscht – Chat-Gruppe bleibt (archiviert, Titel kopiert, 2 Nachrichten erhalten)'
                       else 'FEHL G1 Chat-Gruppe' end || E'\n';
    log := log || case when public.chat_is_room_member(room, b) and public.chat_can_read_room(room, b)
                         and not public.chat_is_room_member(room, c)
                       then 'OK   G2 Angemeldete (B) lesen weiter mit; nur Interessierte (C) nicht'
                       else 'FEHL G2 Mitgliedschaft' end || E'\n';
    log := log || case when (select l.chat_room_id from public.event_deletion_log l where l.event_id = chat_event) = room
                         and exists (select 1 from public.chat_audit_log x where x.action = 'detach_event_room' and x.target_id = room::text)
                       then 'OK   G3 Lösch- und Chat-Protokoll verweisen auf die erhaltene Gruppe'
                       else 'FEHL G3 Protokolle' end || E'\n';
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    begin
      perform public.chat_mod_set_room_archived(room, false, 'Test: wieder öffnen');
      log := log || 'FEHL G4 Gruppe eines gelöschten Events ließ sich wieder öffnen' || E'\n';
    exception when sqlstate 'DC051' then
      log := log || 'OK   G4 Gruppe eines gelöschten Events bleibt archiviert (DC051)' || E'\n';
    end;
    perform set_config('request.jwt.claims', '', true);
    -- Manuelles Löschen eines Events MIT Gruppe bleibt blockiert (nur der Automat löst die Gruppe vorher)
    insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
    values ('{"de":"[T018] manuell"}', now() + interval '2 days', 60, s, array[s], 'confirmed') returning id into chat_event;
    insert into public.chat_rooms (kind, event_id) values ('event', chat_event);
    begin
      delete from public.events where id = chat_event;
      log := log || 'FEHL G5 Event mit Chat-Gruppe manuell löschbar' || E'\n';
    exception when foreign_key_violation or restrict_violation then
      log := log || 'OK   G5 manuelles DELETE eines Events mit Gruppe weiterhin blockiert (RESTRICT)' || E'\n';
    end;
  else
    log := log || 'INFO G1–G5 übersprungen (Migration 014 nicht ausgeführt)' || E'\n';
  end if;

  -- Rechte: App-Rollen dürfen nicht löschen und das Protokoll nicht lesen
  log := log || case when not has_function_privilege('authenticated', 'public.delete_expired_events()', 'execute')
                      and not has_function_privilege('anon', 'public.delete_expired_events()', 'execute')
                      and not has_function_privilege('service_role', 'public.delete_expired_events()', 'execute')
                      and not has_table_privilege('authenticated', 'public.event_deletion_log', 'select')
                     then 'OK   R1 nur der Datenbank-Eigentümer darf löschen / das Protokoll lesen'
                     else 'FEHL R1 Rechte' end || E'\n';

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
