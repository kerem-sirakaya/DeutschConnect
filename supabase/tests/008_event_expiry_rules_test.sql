-- =============================================================================
-- Ablauf-Regeln für Events (Migration 008) – gezielte Grenzfälle – speichert NICHTS dauerhaft
-- =============================================================================
-- Ergänzt supabase/tests/event_archiving_test.sql um:
--   * Event lange VOR dem Start angelegt (created_at spielt keine Rolle)
--   * 23 / 24 / 25 Stunden nach dem Start (mit und ohne Dauer)
--   * Event ohne Dauer (ohne festes Ende): Regel „Mitternacht nach dem Starttag in Ankara-Zeit“
--   * Terminverschiebung über admin_update_event (archiviert → wieder sichtbar; Zukunft bleibt Zukunft)
--   * Mehrfaches Ausführen (idempotent), Anmeldungen bleiben, Chat-Gruppe bleibt (falls 014 vorhanden)
--   * Garantie: KEIN Probe-Event wird vor Start + 24 h archiviert
--
-- WO? Nur auf einer KOPIE (lokale Test-Datenbank oder Staging), NACH Migration 008.
--     archive_finished_events() läuft über die ganze Tabelle – alles wird am Ende zurückgerollt.
-- WIE? EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B (Schüler:in) eintragen → ganze Datei → Run.
--      "ERROR: TESTERGEBNIS ..." ist NORMAL. OK = wie erwartet, FEHL = Problem.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (Admin)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  a uuid; b uuid; s text;
  e_early uuid; e_early2 uuid;
  d23 uuid; d24 uuid; d25 uuid;      -- Dauer 60 min, Start vor 23/24/25 h
  n23 uuid; n24 uuid; n25 uuid;      -- ohne Dauer, Start vor 23/24/25 h
  late uuid;                          -- ohne Dauer, Start 23:30 Ankara-Zeit vor 2 Tagen
  early_morning uuid;                 -- ohne Dauer, Start 00:00 Ankara-Zeit
  moved uuid; moved_future uuid; cancelled_future uuid; reg_event uuid;
  first_archived timestamptz;
  n integer;
  ok boolean;
  expected boolean;
  r record;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  if a is null or b is null then
    raise exception 'Bitte EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B eintragen.';
  end if;
  insert into public.admins (user_id, note) values (a, 'Test 008-Regeln') on conflict do nothing;
  select id into s from public.schools order by id limit 1;

  -- ---------- Testdaten (als Eigentümer) ----------
  -- 1) Lange im Voraus angelegt: created_at vor 30 Tagen bzw. vor 25 h, Start in der Zukunft
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, created_at)
  values ('{"de":"[Regel] früh angelegt"}', now() + interval '10 days', 90, s, array[s], 'confirmed', now() - interval '30 days')
  returning id into e_early;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, created_at)
  values ('{"de":"[Regel] vor 25 h angelegt"}', now() + interval '3 days', null, s, array[s], 'planned', now() - interval '25 hours')
  returning id into e_early2;

  -- 2) Mit Dauer 60 min: Start vor 23 / 24 / 25 h
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] 60min vor 23h"}', now() - interval '23 hours', 60, s, array[s], 'confirmed') returning id into d23;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] 60min vor 24h"}', now() - interval '24 hours', 60, s, array[s], 'confirmed') returning id into d24;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] 60min vor 25h"}', now() - interval '25 hours', 60, s, array[s], 'confirmed') returning id into d25;

  -- 3) Ohne Dauer: Start vor 23 / 24 / 25 h
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] ohne Dauer vor 23h"}', now() - interval '23 hours', null, s, array[s], 'planned') returning id into n23;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] ohne Dauer vor 24h"}', now() - interval '24 hours', null, s, array[s], 'planned') returning id into n24;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] ohne Dauer vor 25h"}', now() - interval '25 hours', null, s, array[s], 'planned') returning id into n25;

  -- 4) Ohne Dauer, Zeitzonen-Ränder (Ankara = Europe/Istanbul, UTC+3)
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] 23:30 Ankara"}',
          ((now() at time zone 'Europe/Istanbul')::date - 2 + time '23:30') at time zone 'Europe/Istanbul', null, s, array[s], 'planned')
  returning id into late;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] 00:00 Ankara"}',
          ((now() at time zone 'Europe/Istanbul')::date - 1)::timestamp at time zone 'Europe/Istanbul', null, s, array[s], 'planned')
  returning id into early_morning;

  -- 5) Verschieben: vorbei (würde archiviert) und künftig
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] verschoben"}', now() - interval '30 hours', 60, s, array[s], 'confirmed') returning id into moved;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] künftig verschoben"}', now() + interval '2 days', 60, s, array[s], 'confirmed') returning id into moved_future;

  -- 6) Abgesagt, Termin in der Zukunft, Absage vor 25 h (darf erst nach dem Termin verschwinden)
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status, cancelled_at)
  values ('{"de":"[Regel] abgesagt, Zukunft"}', now() + interval '14 days', 60, s, array[s], 'cancelled', now() - interval '25 hours')
  returning id into cancelled_future;

  -- 7) Anmeldung an einem Event, das archiviert wird: anmelden, solange es noch offen ist,
  --    dann (als Eigentümer) in die Vergangenheit legen – wie ein Event, das inzwischen stattgefunden hat.
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[Regel] mit Anmeldung"}', now() + interval '2 days', 60, s, array[s], 'confirmed') returning id into reg_event;
  insert into public.event_registrations (event_id, user_id, status) values (reg_event, b, 'registered');
  update public.events set start_at = now() - interval '3 days' where id = reg_event;

  -- ---------- Archivieren ----------
  perform public.archive_finished_events();

  ok := (select archived_at is null from public.events where id = e_early)
    and (select archived_at is null from public.events where id = e_early2);
  log := log || case when ok then 'OK   R1  lange im Voraus angelegt: nicht archiviert (created_at zählt nicht)'
                     else 'FEHL R1  im Voraus angelegtes Event archiviert' end || E'\n';

  log := log || case when (select archived_at is null from public.events where id = d23)
                     then 'OK   R2  Dauer 60 min, Start vor 23 h: sichtbar' else 'FEHL R2' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = d24)
                     then 'OK   R3  Dauer 60 min, Start vor 24 h: sichtbar (Ende erst vor 23 h)' else 'FEHL R3' end || E'\n';
  log := log || case when (select archived_at is not null from public.events where id = d25)
                     then 'OK   R4  Dauer 60 min, Start vor 25 h (Ende vor 24 h): archiviert' else 'FEHL R4' end || E'\n';

  log := log || case when (select archived_at is null from public.events where id = n23)
                     then 'OK   R5  ohne Dauer, Start vor 23 h: sichtbar' else 'FEHL R5' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = n24)
                     then 'OK   R6  ohne Dauer, Start vor 24 h: sichtbar' else 'FEHL R6' end || E'\n';
  -- vor 25 h: archiviert genau dann, wenn Mitternacht (Ankara) nach dem Starttag + 24 h schon vorbei ist
  expected := public.event_ends_at(now() - interval '25 hours', null) <= now() - interval '24 hours';
  log := log || case when (select archived_at is not null from public.events where id = n25) = expected
                     then 'OK   R7  ohne Dauer, Start vor 25 h: ' || case when expected then 'archiviert' else 'sichtbar' end
                          || ' (Mitternacht-Regel, abhängig von der Uhrzeit)'
                     else 'FEHL R7' end || E'\n';

  -- Zeitzonen-Ränder: 23:30 Ankara vor 2 Tagen → Ende 00:00 (30 min später) → archiviert ab Start + 24,5 h
  log := log || case when public.event_ends_at((select start_at from public.events where id = late), null)
                          = (select start_at from public.events where id = late) + interval '30 minutes'
                     then 'OK   R8  ohne Dauer, 23:30 Ankara: Ende = Mitternacht 30 min später' else 'FEHL R8' end || E'\n';
  log := log || case when public.event_ends_at((select start_at from public.events where id = early_morning), null)
                          = (select start_at from public.events where id = early_morning) + interval '24 hours'
                     then 'OK   R9  ohne Dauer, 00:00 Ankara: Ende = 24 h später (sichtbar bis Start + 48 h)' else 'FEHL R9' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = early_morning)
                     then 'OK   R9b ohne Dauer, 00:00 Ankara gestern: noch sichtbar' else 'FEHL R9b' end || E'\n';

  -- Garantie: kein Probe-Event vor Start + 24 h archiviert
  select count(*) into n from public.events
   where title ->> 'de' like '[Regel]%' and status <> 'cancelled'
     and archived_at is not null and now() < start_at + interval '24 hours';
  log := log || case when n = 0 then 'OK   R10 Garantie: kein (nicht abgesagtes) Event vor Start + 24 h archiviert'
                     else 'FEHL R10 ' || n || ' Events zu früh archiviert' end || E'\n';

  -- Idempotenz
  select archived_at into first_archived from public.events where id = d25;
  n := public.archive_finished_events();
  log := log || case when n = 0 and (select archived_at from public.events where id = d25) = first_archived
                     then 'OK   R11 zweiter Lauf: nichts Neues, Zeitpunkt unverändert (idempotent)'
                     else 'FEHL R11 zweiter Lauf: ' || n end || E'\n';

  -- Anmeldung bleibt
  log := log || case when (select archived_at is not null from public.events where id = reg_event)
                          and exists (select 1 from public.event_registrations where event_id = reg_event and user_id = b)
                     then 'OK   R12 archiviert, Anmeldung bleibt erhalten (nichts gelöscht)' else 'FEHL R12' end || E'\n';

  -- Abgesagt + Termin in der Zukunft: sichtbar bis Termin-Ende + 24 h (Entscheidung Ege, 2026-11-09)
  log := log || case when (select archived_at is null from public.events where id = cancelled_future)
                     then 'OK   R13 abgesagt vor 25 h, Termin in 14 Tagen: bleibt sichtbar bis nach dem Termin'
                     else 'FEHL R13 abgesagtes künftiges Event vor seinem Termin archiviert' end || E'\n';

  -- ---------- Verschieben über admin_update_event (als Admin) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- archiviertes (vorbei) Event in die Zukunft verschieben → wieder sichtbar
  select * into r from public.admin_list_events() x where x.id = moved;
  ok := r.archived_at is not null;
  perform public.admin_update_event(moved, r.title, now() + interval '5 days', r.host_school_id, r.school_ids,
           r.summary, r.description, r.location, r.audience, r.duration_minutes, r.capacity, r.online, r.topics, r.format);
  -- künftiges Event auf einen anderen künftigen Termin verschieben → bleibt sichtbar
  select * into r from public.admin_list_events() x where x.id = moved_future;
  perform public.admin_update_event(moved_future, r.title, now() + interval '1 hour', r.host_school_id, r.school_ids,
           r.summary, r.description, r.location, r.audience, r.duration_minutes, r.capacity, r.online, r.topics, r.format);
  -- in die Vergangenheit verschieben ist verboten (sonst könnte man ein Event vorzeitig ausblenden)
  begin
    perform public.admin_update_event(moved_future, r.title, now() - interval '2 days', r.host_school_id, r.school_ids,
             r.summary, r.description, r.location, r.audience, r.duration_minutes, r.capacity, r.online, r.topics, r.format);
    log := log || 'FEHL R16 Verschieben in die Vergangenheit erlaubt' || E'\n';
  exception when sqlstate 'DC002' then
    log := log || 'OK   R16 Verschieben in die Vergangenheit verboten (DC002)' || E'\n';
  end;
  reset role;
  perform public.archive_finished_events();
  log := log || case when ok and (select archived_at is null from public.events where id = moved)
                     then 'OK   R14 archiviertes Event verschoben (+5 Tage): wieder sichtbar, bleibt es nach erneutem Lauf'
                     else 'FEHL R14' end || E'\n';
  log := log || case when (select archived_at is null from public.events where id = moved_future)
                     then 'OK   R15 künftiges Event verschoben: bleibt sichtbar' else 'FEHL R15' end || E'\n';

  -- ---------- Chat-Gruppe (nur wenn Migration 014 ausgeführt ist) ----------
  if to_regclass('public.chat_rooms') is not null then
    execute 'insert into public.chat_rooms (kind, event_id) values (''event'', $1)' using reg_event;
    execute 'insert into public.chat_messages (room_id, sender_id, body)
             select id, $2, ''Nachricht in der Eventgruppe'' from public.chat_rooms where event_id = $1' using reg_event, b;
    perform public.archive_finished_events();
    execute 'select count(*) from public.chat_messages m join public.chat_rooms r on r.id = m.room_id where r.event_id = $1'
      into n using reg_event;
    log := log || case when n = 1 then 'OK   R17 Archivieren lässt Eventgruppe + Nachrichten unberührt'
                       else 'FEHL R17' end || E'\n';
    begin
      delete from public.events where id = reg_event;
      log := log || 'FEHL R18 Event mit Chat-Gruppe löschbar (Nachrichten würden mitgelöscht)' || E'\n';
    exception when foreign_key_violation or restrict_violation then
      log := log || 'OK   R18 Event mit Chat-Gruppe nicht löschbar (ON DELETE RESTRICT)' || E'\n';
    end;
  else
    log := log || 'INFO R17/R18 übersprungen (Migration 014 nicht ausgeführt)' || E'\n';
  end if;

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
