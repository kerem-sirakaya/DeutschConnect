-- =============================================================================
-- Chatroom: Beitreten / Raum betreten / Senden / Verlassen (Migration 014) – speichert NICHTS dauerhaft
-- =============================================================================
-- Ergänzt 014_chat_test.sql gezielt um den Ablauf „Beitreten → Raum betreten → schreiben/lesen →
-- verlassen“ und prüft dabei auch den DIREKTEN Tabellenzugriff (RLS, wie bei Supabase Realtime).
-- Läuft als Rolle "authenticated" mit gesetztem JWT – wie echte Anfragen aus der App.
--
-- WO? Nur auf einer KOPIE (lokale Test-Datenbank oder Staging), NACH Migration 014 (018 optional).
-- WIE? Drei normale Testkonten eintragen (A, B, C – keine Admins/Moderator:innen) → ganze Datei → Run.
--      "ERROR: TESTERGEBNIS ..." ist NORMAL (alles wird zurückgerollt). OK = wie erwartet, FEHL = Problem.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (normal)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  email_c constant text := 'EMAIL_KONTO_C';   -- <- eintragen (normal)
  a uuid; b uuid; c uuid; s text;
  room uuid; eroom uuid; ev uuid; m1 uuid; m2 uuid;
  r record; n bigint; ok boolean;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  select id into c from auth.users where email = email_c;
  if a is null or b is null or c is null then
    raise exception 'Bitte EMAIL_KONTO_A, EMAIL_KONTO_B und EMAIL_KONTO_C eintragen.';
  end if;
  -- Der Chat läuft nur, wenn es mindestens eine:n Admin oder Moderator:in gibt (chat_require_enabled)
  if not exists (select 1 from public.admins where user_id not in (a, b, c))
     and not exists (select 1 from public.chat_moderators where user_id not in (a, b, c)) then
    raise exception 'Bitte zuerst ein ANDERES Konto als Admin eintragen (public.admins) – sonst ist der Chat aus.';
  end if;

  -- ---------- Vorbereitung (als Eigentümer; wird zurückgerollt) ----------
  delete from public.admins where user_id in (a, b, c);
  delete from public.chat_moderators where user_id in (a, b, c);
  delete from public.chat_blocks where blocker_id in (a, b, c) or blocked_id in (a, b, c);
  delete from public.chat_bans where user_id in (a, b, c);
  delete from public.chat_room_members where user_id in (a, b, c);
  update public.chat_config set enabled = true, messages_per_minute = 120 where id = 1;
  update public.profiles set avatar_color = '#123abc' where id = a;
  select id into room from public.chat_rooms where slug = 'learning';
  select id into s from public.schools order by id limit 1;
  insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
  values ('{"de":"[T014R] Event mit Gruppe"}', now() + interval '3 days', 60, s, array[s], 'confirmed') returning id into ev;
  insert into public.event_registrations (event_id, user_id, status) values (ev, c, 'registered');
  insert into public.chat_rooms (kind, event_id) values ('event', ev) returning id into eroom;

  -- =====================================================================
  -- Kein Mitglied: Raum sehen, aber nicht betreten
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.chat_list_rooms() x where x.id = room;
  log := log || case when r.id is not null and not r.is_member then 'OK   J1 Raum in der Übersicht, Status: kein Mitglied (-> „Beitreten“)'
                     else 'FEHL J1' end || E'\n';
  select * into r from public.chat_room_detail(room);
  log := log || case when not r.is_member and not r.can_write then 'OK   J2 Raum-Details: kein Mitglied, kann nicht schreiben'
                     else 'FEHL J2' end || E'\n';
  begin
    perform * from public.chat_room_messages(room);
    log := log || 'FEHL J3 Nicht-Mitglied liest Nachrichten' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   J3 Nicht-Mitglied kann den Raum nicht betreten / nicht lesen (DC042)' || E'\n';
  end;
  begin
    perform * from public.chat_send_room_message(room, 'Hallo ohne Beitritt');
    log := log || 'FEHL J4 Nicht-Mitglied kann senden' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   J4 Nicht-Mitglied kann nicht senden (DC042)' || E'\n';
  end;
  begin
    perform * from public.chat_room_members(room);
    log := log || 'FEHL J5 Nicht-Mitglied sieht Mitgliederliste' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   J5 Nicht-Mitglied sieht keine Mitgliederliste' || E'\n';
  end;
  begin
    insert into public.chat_room_members (room_id, user_id) values (room, a);
    log := log || 'FEHL J6 Beitritt per direktem INSERT möglich' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   J6 Beitreten nur über die Funktion (kein direkter INSERT)' || E'\n';
  end;

  -- =====================================================================
  -- Beitreten -> Raum betreten -> senden
  -- =====================================================================
  perform public.chat_join_room(room);
  select * into r from public.chat_room_detail(room);
  log := log || case when r.is_member and r.can_write then 'OK   K1 nach dem Beitreten: Mitglied, darf schreiben (-> „Raum betreten“)'
                     else 'FEHL K1' end || E'\n';
  select count(*) into n from public.chat_room_messages(room);
  log := log || case when n = 0 then 'OK   K2 Mitglied betritt den Raum und liest den (leeren) Verlauf' else 'FEHL K2 ' || n end || E'\n';
  select x.id into m1 from public.chat_send_room_message(room, 'Erste Nachricht von A') x;
  select x.id into m2 from public.chat_send_room_message(room, 'Zweite Nachricht von A') x;
  select * into r from public.chat_room_messages(room) x where x.id = m1;
  log := log || case when r.is_own and r.body = 'Erste Nachricht von A' and r.sender_avatar_color = '#123abc'
                          and r.created_at is not null
                     then 'OK   K3 gesendet und gespeichert: eigene Nachricht mit Zeit und Profilfarbe'
                     else 'FEHL K3' end || E'\n';
  reset role;
  select count(*) into n from public.chat_messages where id in (m1, m2) and room_id = room and sender_id = a;
  log := log || case when n = 2 then 'OK   K4 Nachrichten liegen in der bestehenden Tabelle chat_messages' else 'FEHL K4' end || E'\n';

  -- B: vor dem Beitritt nichts, auch nicht per direktem SELECT (RLS / Realtime)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_messages m where m.room_id = room;
  log := log || case when n = 0 then 'OK   K5 Nicht-Mitglied B: direkter SELECT/Realtime liefert 0 Nachrichten (RLS)'
                     else 'FEHL K5 ' || n end || E'\n';
  perform public.chat_join_room(room);
  select count(*) into n from public.chat_room_messages(room) x where x.sender_name is not null and not x.is_own;
  log := log || case when n = 2 then 'OK   K6 B tritt bei und empfängt die bisherigen Nachrichten (mit Namen)' else 'FEHL K6 ' || n end || E'\n';
  select count(*) into n from public.chat_messages m where m.room_id = room;
  log := log || case when n = 2 then 'OK   K7 Mitglied B: RLS gibt die Nachrichten frei (Realtime-Signal kommt an)' else 'FEHL K7 ' || n end || E'\n';
  perform * from public.chat_send_room_message(room, 'Antwort von B');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_room_messages(room) x where x.body = 'Antwort von B' and not x.is_own;
  log := log || case when n = 1 then 'OK   K8 A empfängt die neue Nachricht von B' else 'FEHL K8' end || E'\n';

  -- =====================================================================
  -- Verlassen -> kein Zugriff mehr; Wiederkommen -> Verlauf noch da
  -- =====================================================================
  perform public.chat_leave_room(room);
  begin
    perform * from public.chat_room_messages(room);
    log := log || 'FEHL L1 nach dem Verlassen noch lesbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   L1 nach dem Verlassen: Nachrichten nicht mehr lesbar (DC042)' || E'\n';
  end;
  begin
    perform * from public.chat_send_room_message(room, 'nach dem Verlassen');
    log := log || 'FEHL L2 nach dem Verlassen noch sendbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   L2 nach dem Verlassen: Senden nicht möglich (DC042)' || E'\n';
  end;
  select count(*) into n from public.chat_messages m where m.room_id = room;
  log := log || case when n = 0 then 'OK   L3 nach dem Verlassen: direkter SELECT/Realtime liefert 0 Nachrichten'
                     else 'FEHL L3 ' || n end || E'\n';
  perform public.chat_join_room(room);
  select count(*) into n from public.chat_room_messages(room);
  log := log || case when n = 3 then 'OK   L4 wieder beigetreten: Gespräch geht mit dem vollen Verlauf weiter' else 'FEHL L4 ' || n end || E'\n';

  -- =====================================================================
  -- Eventgruppen bleiben wie bisher (Mitglied = verbindlich angemeldet)
  -- =====================================================================
  begin
    perform public.chat_join_room(eroom);
    log := log || 'FEHL V1 Eventgruppe per „Beitreten“ betretbar' || E'\n';
  exception when sqlstate 'P0002' then
    log := log || 'OK   V1 Eventgruppe: kein „Beitreten“ – Zugang nur über die Event-Anmeldung' || E'\n';
  end;
  begin
    perform * from public.chat_room_messages(eroom);
    log := log || 'FEHL V2 nicht angemeldete Person liest Eventgruppe' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   V2 nicht angemeldet: Eventgruppe nicht lesbar' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.chat_room_detail(eroom);
  perform * from public.chat_send_room_message(eroom, 'Hallo Eventgruppe');
  select count(*) into n from public.chat_room_messages(eroom);
  log := log || case when r.is_member and r.can_write and n = 1
                     then 'OK   V3 angemeldete Person betritt die Eventgruppe, liest und sendet' else 'FEHL V3' end || E'\n';
  select count(*) into n from public.chat_list_rooms() x where x.id = eroom and x.is_member;
  log := log || case when n = 1 then 'OK   V4 Eventgruppe erscheint unter „Meine Gruppen“' else 'FEHL V4' end || E'\n';
  reset role;

  -- Event wird automatisch gelöscht (018): Gruppe bleibt, C liest weiter (nur falls 018 vorhanden)
  if to_regprocedure('public.delete_expired_events()') is not null then
    update public.events set start_at = now() - interval '25 hours' where id = ev;
    perform public.delete_expired_events();
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.chat_room_messages(eroom);
    select * into r from public.chat_room_detail(eroom);
    log := log || case when n = 1 and r.is_member and r.archived and not r.can_write
                       then 'OK   V5 nach Event-Löschung: Gruppe + Verlauf erhalten, nur lesen'
                       else 'FEHL V5' end || E'\n';
    reset role;
  else
    log := log || 'INFO V5 übersprungen (Migration 018 nicht ausgeführt)' || E'\n';
  end if;

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
