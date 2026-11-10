-- =============================================================================
-- Test für den Chatroom (Migration 014) – speichert NICHTS dauerhaft
-- =============================================================================
-- Wo? NUR im SQL Editor von "DeutschConnect-Staging" (nicht Live), NACH Migration 014.
-- Wie?
--   1. Fünf Staging-Testkonten eintragen (E-Mails unten):
--        A, B, C = normale Schüler:innen-Konten · MOD = normales Konto (wird im Test kurz Moderator:in)
--        ADM = Admin-Konto (steht in public.admins; falls nicht, trägt der Test es kurz ein)
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--
-- Der ganze Test ist EIN Befehl und endet IMMER mit dem Fehler "TESTERGEBNIS".
-- Dadurch wird ALLES zurückgerollt (Räume, Nachrichten, Anfragen, Sperren, Einstellungen, Testdaten).
-- "ERROR: TESTERGEBNIS ..." ist also NORMAL. Jede Zeile: OK = wie erwartet, FEHL = Problem.
--
-- Hinweis: Innerhalb eines Befehls bleibt now() gleich. Abgelaufene Sperren / Wartezeiten werden
-- deshalb simuliert, indem der Test Zeitstempel als Datenbank-Eigentümer zurückdatiert.
-- =============================================================================

do $$
declare
  email_a   constant text := 'EMAIL_KONTO_A';    -- <- eintragen
  email_b   constant text := 'EMAIL_KONTO_B';    -- <- eintragen
  email_c   constant text := 'EMAIL_KONTO_C';    -- <- eintragen
  email_mod constant text := 'EMAIL_KONTO_MOD';  -- <- eintragen
  email_adm constant text := 'EMAIL_KONTO_ADM';  -- <- eintragen
  a uuid; b uuid; c uuid; mo uuid; ad uuid;
  general uuid; learning uuid; proom uuid; eroom uuid; idea uuid; ev uuid;
  m1 uuid; m2 uuid; m3 uuid; cm uuid; cid uuid; rid uuid; rep uuid; ban uuid;
  r record; n bigint; ok boolean; txt text; w text;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  select id into c from auth.users where email = email_c;
  select id into mo from auth.users where email = email_mod;
  select id into ad from auth.users where email = email_adm;
  if a is null or b is null or c is null or mo is null or ad is null then
    raise exception 'Bitte alle fünf E-Mails eintragen – alle Konten müssen existieren.';
  end if;

  -- ---------- Vorbereitung (als Eigentümer; wird zurückgerollt) ----------
  insert into public.admins (user_id, note) values (ad, 'Test 014') on conflict do nothing;
  delete from public.admins where user_id in (a, b, c, mo);
  delete from public.chat_moderators where user_id in (a, b, c, ad);
  insert into public.chat_moderators (user_id, note) values (mo, 'Test 014') on conflict do nothing;
  delete from public.chat_blocks where blocker_id in (a, b, c, mo, ad) or blocked_id in (a, b, c, mo, ad);
  delete from public.chat_bans where user_id in (a, b, c, mo, ad);
  delete from public.chat_requests where sender_id in (a, b, c) or recipient_id in (a, b, c);
  delete from public.chat_conversations where user_a in (a, b, c) or user_b in (a, b, c);
  delete from public.chat_room_members where user_id in (a, b, c);
  update public.chat_config set enabled = true, messages_per_minute = 120, request_cooldown_hours = 168,
                                requests_per_day = 10 where id = 1;
  insert into public.profile_sharing (user_id, is_public) values (a, true), (b, true), (c, false)
  on conflict (user_id) do update set is_public = excluded.is_public;
  select id into general from public.chat_rooms where slug = 'general';
  select id into learning from public.chat_rooms where slug = 'learning';
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (a, 'ers', 'Test-Projekt Chat', 'Kurz', 'Beschreibung für den Chat-Test, nur fiktiv.', '{language}', '{ers}', 'collecting')
  returning id into idea;
  insert into public.idea_members (idea_id, user_id, status) values (idea, b, 'member');
  insert into public.events (title, start_at, host_school_id, school_ids, status)
  values ('{"de":"Test-Event Chat"}', now() + interval '7 days', 'ers', '{ers}', 'confirmed') returning id into ev;
  insert into public.event_registrations (event_id, user_id, status) values (ev, b, 'registered');

  -- =====================================================================
  -- Sicherheit: nicht angemeldet / direkter Tabellenzugriff
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform * from public.chat_list_rooms();
    log := log || 'FEHL S1 anon kann Räume lesen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   S1 anon: kein Zugriff auf Chat-Funktionen' || E'\n';
  end;
  begin
    perform 1 from public.chat_messages limit 1;
    log := log || 'FEHL S1b anon liest chat_messages' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   S1b anon: keine Tabellenrechte' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.chat_messages (room_id, sender_id, body) values (general, a, 'direkt');
    log := log || 'FEHL S2 direkter INSERT in chat_messages möglich' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   S2 Nachrichten nur über Funktionen schreibbar' || E'\n';
  end;
  begin
    perform 1 from public.chat_reports limit 1;
    log := log || 'FEHL S3 Meldungen direkt lesbar' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   S3 Meldungen/Sperren/Protokoll nicht direkt lesbar' || E'\n';
  end;
  begin
    update public.chat_config set enabled = false;
    log := log || 'FEHL S4 Einstellungen direkt änderbar' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   S4 Einstellungen nicht direkt änderbar' || E'\n';
  end;
  reset role;

  -- Chat aus → normale Nutzer:innen gesperrt, Staff darf testen
  update public.chat_config set enabled = false where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_list_rooms();
    log := log || 'FEHL E1 Chat aus, aber nutzbar' || E'\n';
  exception when sqlstate 'DC040' then
    log := log || 'OK   E1 Chat aus → normale Nutzer:innen: DC040' || E'\n';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_list_rooms();
  log := log || case when n >= 4 then 'OK   E2 Chat aus → Moderator:in kann vorab testen' else 'FEHL E2' end || E'\n';
  reset role;
  update public.chat_config set enabled = true where id = 1;

  -- =====================================================================
  -- Gruppenräume
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_list_rooms() x where x.kind = 'topic' and not x.is_member;
  log := log || case when n >= 4 then 'OK   G1 vier Themenräume sichtbar' else 'FEHL G1 ' || n end || E'\n';
  begin
    perform * from public.chat_room_messages(general);
    log := log || 'FEHL G2 Raum ohne Beitritt lesbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G2 Raum erst nach Beitritt lesbar (DC042)' || E'\n';
  end;
  perform public.chat_join_room(general);
  select x.id into m1 from public.chat_send_room_message(general, 'Hallo zusammen, Treffpunkt Bibliothek') x;
  log := log || case when m1 is not null then 'OK   G3 beitreten + Nachricht senden' else 'FEHL G3' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_room_messages(general);
    log := log || 'FEHL G4 Nicht-Mitglied liest Raum' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G4 Nicht-Mitglied liest Raum nicht' || E'\n';
  end;
  select count(*) into n from public.chat_messages where room_id = general;   -- RLS: direkt lesen
  log := log || case when n = 0 then 'OK   G4b RLS: Nicht-Mitglied sieht auch direkt keine Raum-Nachrichten'
                     else 'FEHL G4b RLS liefert ' || n end || E'\n';
  perform public.chat_join_room(general);
  select * into r from public.chat_room_messages(general) x where x.id = m1;
  log := log || case when r.body = 'Hallo zusammen, Treffpunkt Bibliothek' and r.sender_name is not null
                          and r.created_at is not null and not r.is_own
                     then 'OK   G5 Nachricht empfangen (Text, Name, Zeitstempel)' else 'FEHL G5 ' || coalesce(r::text, 'keine') end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_leave_room(general);
  begin
    perform * from public.chat_room_messages(general);
    log := log || 'FEHL G6 nach Verlassen noch lesbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G6 nach Verlassen nicht mehr lesbar' || E'\n';
  end;
  perform public.chat_join_room(general);
  proom := public.chat_create_project_room(idea);
  log := log || case when proom is not null then 'OK   G7 Autor:in legt Projektgruppe an' else 'FEHL G7' end || E'\n';
  begin
    perform public.chat_create_event_room(ev);
    log := log || 'FEHL G8 Schüler:in legt Eventgruppe an' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   G8 Eventgruppe nur durch Moderation' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_create_project_room(idea);
    log := log || 'FEHL G9 Fremde:r legt Projektgruppe an' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   G9 nur Autor:in/Staff legt Projektgruppe an' || E'\n';
  end;
  begin
    perform * from public.chat_room_messages(proom);
    log := log || 'FEHL G10 Außenstehende:r liest Projektgruppe' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G10 Außenstehende:r liest Projektgruppe nicht' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  eroom := public.chat_create_event_room(ev);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_send_room_message(proom, 'Projekt-Nachricht von B');
  perform public.chat_send_room_message(eroom, 'Event-Nachricht von B');
  select count(*) into n from public.chat_room_messages(proom);
  log := log || case when n = 1 then 'OK   G11 Projektmitglied liest/schreibt Projektgruppe' else 'FEHL G11 ' || n end || E'\n';
  select count(*) into n from public.chat_room_messages(eroom);
  log := log || case when n = 1 then 'OK   G12 Angemeldete:r liest/schreibt Eventgruppe' else 'FEHL G12 ' || n end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_room_messages(eroom);
    log := log || 'FEHL G13 Nicht-Angemeldete:r liest Eventgruppe' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G13 Eventgruppe nur für Angemeldete' || E'\n';
  end;
  reset role;
  update public.idea_members set status = 'left' where idea_id = idea and user_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_room_messages(proom);
    log := log || 'FEHL G14 ausgetretenes Mitglied liest Projektgruppe' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   G14 nach Austritt aus dem Projekt kein Zugriff mehr' || E'\n';
  end;
  reset role;
  update public.idea_members set status = 'member' where idea_id = idea and user_id = b;

  -- =====================================================================
  -- Nachrichten: Wortfilter, Kontaktdaten, Länge, Löschen
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.chat_send_room_message(general, 'Du bist ein Arschloch!');
  m2 := r.id;
  log := log || case when r.censored then 'OK   M1 Absender:in erfährt: Wörter wurden zensiert' else 'FEHL M1' end || E'\n';
  begin
    perform public.chat_send_room_message(general, 'Schreib mir: test@example.com');
    log := log || 'FEHL M2 Kontaktdaten angenommen' || E'\n';
  exception when sqlstate 'DC043' then
    log := log || 'OK   M2 Kontaktdaten abgelehnt (DC043)' || E'\n';
  end;
  begin
    perform public.chat_send_room_message(general, '   ');
    log := log || 'FEHL M3 leere Nachricht angenommen' || E'\n';
  exception when sqlstate '22023' then
    log := log || 'OK   M3 leere/zu lange Nachricht abgelehnt' || E'\n';
  end;
  reset role;
  select count(*) into n from public.chat_messages where body ilike '%arschloch%';
  log := log || case when n = 0 then 'OK   M4 unzensierter Text ist NICHT gespeichert' else 'FEHL M4' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.chat_room_messages(general) x where x.id = m2;
  log := log || case when r.body = 'Du bist ein ***!' and not r.censored
                     then 'OK   M5 andere sehen nur die zensierte Fassung' else 'FEHL M5 ' || coalesce(r::text, '') end || E'\n';
  begin
    perform public.chat_delete_own_message(m1);
    log := log || 'FEHL M6 fremde Nachricht gelöscht' || E'\n';
  exception when sqlstate 'P0002' then
    log := log || 'OK   M6 fremde Nachricht nicht löschbar' || E'\n';
  end;
  -- Reaktionen
  ok := public.chat_toggle_reaction(m1, '👍');
  select (x.reactions -> 0 ->> 'count')::int into n from public.chat_room_messages(general) x where x.id = m1;
  log := log || case when ok and n = 1 then 'OK   R1 Reaktion hinzugefügt (Zahl 1)' else 'FEHL R1' end || E'\n';
  ok := public.chat_toggle_reaction(m1, '👍');
  select jsonb_array_length(x.reactions) into n from public.chat_room_messages(general) x where x.id = m1;
  log := log || case when not ok and n = 0 then 'OK   R2 eigene Reaktion entfernt' else 'FEHL R2' end || E'\n';
  perform public.chat_toggle_reaction(m1, '❤️');
  begin
    perform public.chat_toggle_reaction(m1, '💩');
    log := log || 'FEHL R3 beliebiges Emoji angenommen' || E'\n';
  exception when sqlstate '22023' then
    log := log || 'OK   R3 nur die feste Emoji-Auswahl' || E'\n';
  end;
  reset role;
  begin
    insert into public.chat_reactions (message_id, user_id, emoji) values (m1, b, '❤️');
    log := log || 'FEHL R4 doppelte Reaktion möglich' || E'\n';
  exception when unique_violation then
    log := log || 'OK   R4 dieselbe Reaktion je Person nur einmal (Primärschlüssel)' || E'\n';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_toggle_reaction(m1, '👍');
    log := log || 'FEHL R5 Nicht-Mitglied reagiert' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   R5 keine Reaktion auf unsichtbare Nachrichten' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.id into m3 from public.chat_send_room_message(general, 'Diese Nachricht lösche ich') x;
  perform public.chat_delete_own_message(m3);
  select * into r from public.chat_room_messages(general) x where x.id = m3;
  log := log || case when r.deleted and r.body = '' then 'OK   M7 eigene Nachricht gelöscht (Text entfernt)' else 'FEHL M7' end || E'\n';

  -- =====================================================================
  -- Private Chats: Anfragen
  -- =====================================================================
  begin
    perform public.chat_send_request(c, 'Hallo C');
    log := log || 'FEHL P1 Anfrage an privates Profil möglich' || E'\n';
  exception when sqlstate 'DC049' then
    log := log || 'OK   P1 nur Personen mit öffentlichem Profil erreichbar (DC049)' || E'\n';
  end;
  select x.id into rid from public.chat_send_request(b, 'Hallo B, wollen wir zusammen lernen?') x;
  log := log || case when rid is not null then 'OK   P2 Anfrage gesendet' else 'FEHL P2' end || E'\n';
  begin
    perform public.chat_send_request(b, 'Noch einmal');
    log := log || 'FEHL P3 zweite offene Anfrage möglich' || E'\n';
  exception when sqlstate 'DC046' then
    log := log || 'OK   P3 nur eine offene Anfrage (kein weiteres Schreiben während „ausstehend“)' || E'\n';
  end;
  select count(*) into n from public.chat_list_conversations();
  log := log || case when n = 0 then 'OK   P4 Anfrage ist KEIN Gespräch (kein Zugriff vor Annahme)' else 'FEHL P4' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_list_requests() x where x.id = rid and x.direction = 'incoming';
  log := log || case when n = 1 then 'OK   P5 Empfänger:in sieht die Anfrage' else 'FEHL P5' end || E'\n';
  begin
    perform public.chat_send_request(a, 'Gegenanfrage');
    log := log || 'FEHL P6 Gegenanfrage erzeugt zweite Anfrage' || E'\n';
  exception when sqlstate 'DC046' then
    log := log || 'OK   P6 Anfrage in Gegenrichtung sicher abgefangen (DC046)' || E'\n';
  end;
  perform public.chat_respond_request(rid, false);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_requests where id = rid;   -- RLS
  log := log || case when n = 0 then 'OK   P7 Dritte sehen fremde Anfragen nicht (RLS)' else 'FEHL P7' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_send_request(b, 'Bitte nochmal');
    log := log || 'FEHL P8 sofort neue Anfrage nach Ablehnung' || E'\n';
  exception when sqlstate 'DC047' then
    log := log || 'OK   P8 Wartezeit nach Ablehnung (DC047)' || E'\n';
  end;
  reset role;
  update public.chat_requests set decided_at = now() - interval '200 hours' where id = rid;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.id into rid from public.chat_send_request(b, 'Neuer Versuch nach der Wartezeit') x;
  perform public.chat_cancel_request(rid);
  select x.id into rid from public.chat_send_request(b, 'Hallo B, wollen wir zusammen lernen?') x;
  log := log || case when rid is not null then 'OK   P9 nach Wartezeit / Zurückziehen wieder möglich' else 'FEHL P9' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cid := public.chat_respond_request(rid, true);
  select count(*) into n from public.chat_conversation_messages(cid);
  log := log || case when cid is not null and n = 1 then 'OK   P10 angenommen → Gespräch mit Vorstellungsnachricht'
                     else 'FEHL P10' end || E'\n';
  select x.id into cm from public.chat_send_conversation_message(cid, 'Gerne, morgen nach der Schule?') x;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_conversation_messages(cid);
  log := log || case when n = 2 then 'OK   P11 beide schreiben und lesen' else 'FEHL P11 ' || n end || E'\n';
  begin
    perform public.chat_send_request(b, 'Doppelt');
    log := log || 'FEHL P12 zweites Gespräch möglich' || E'\n';
  exception when sqlstate 'DC048' then
    log := log || 'OK   P12 kein zweites Gespräch für dasselbe Paar (DC048)' || E'\n';
  end;
  reset role;
  begin
    insert into public.chat_conversations (user_a, user_b) values (least(a, b), greatest(a, b));
    log := log || 'FEHL P13 doppeltes Gespräch in der Tabelle möglich' || E'\n';
  exception when unique_violation then
    log := log || 'OK   P13 eindeutiges Paar auch in der Datenbank erzwungen' || E'\n';
  end;
  begin
    insert into public.chat_requests (sender_id, recipient_id, intro) values (a, c, 'x'), (c, a, 'y');
    log := log || 'FEHL P14 zwei offene Anfragen je Paar möglich (gleichzeitig)' || E'\n';
  exception when unique_violation then
    log := log || 'OK   P14 gleichzeitige Anfragen beider Seiten: nur eine kann entstehen' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_conversation_messages(cid);
    log := log || 'FEHL P15 Dritte lesen privates Gespräch' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   P15 Dritte lesen privates Gespräch nicht' || E'\n';
  end;
  select count(*) into n from public.chat_messages where conversation_id = cid;
  log := log || case when n = 0 then 'OK   P16 RLS: auch direkt keine fremden privaten Nachrichten' else 'FEHL P16' end || E'\n';
  begin
    perform public.chat_send_conversation_message(cid, 'Ich mische mich ein');
    log := log || 'FEHL P17 Dritte schreiben in fremdes Gespräch' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   P17 Dritte schreiben nicht in fremdes Gespräch' || E'\n';
  end;
  reset role;

  -- =====================================================================
  -- Suche
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_search('BIBLIOTHEK');
  log := log || case when n = 1 then 'OK   Q1 Suche in erlaubtem Raum (Groß-/Kleinschreibung egal)' else 'FEHL Q1 ' || n end || E'\n';
  select count(*) into n from public.chat_search('zusammen lernen');
  log := log || case when n = 1 then 'OK   Q2 Suche im eigenen Gespräch' else 'FEHL Q2 ' || n end || E'\n';
  select count(*) into n from public.chat_search('%%');
  log := log || case when n = 0 then 'OK   Q3 Platzhalter % werden wörtlich gesucht' else 'FEHL Q3 ' || n end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_search('zusammen');
  log := log || case when n = 0 then 'OK   Q4 keine Treffer aus fremden Räumen/Gesprächen' else 'FEHL Q4 ' || n end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_search('zusammen lernen');
  log := log || case when n = 0 then 'OK   Q5 auch Moderation findet keine privaten Nachrichten per Suche' else 'FEHL Q5' end || E'\n';
  reset role;

  -- =====================================================================
  -- Blockieren
  -- =====================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_set_block(a, true);
  begin
    perform * from public.chat_conversation_messages(cid);
    log := log || 'FEHL B1 Gespräch nach Blockieren lesbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   B1 nach Blockieren: Gespräch für beide unsichtbar' || E'\n';
  end;
  select count(*) into n from public.chat_room_messages(general) x where x.sender_id = a;
  log := log || case when n = 0 then 'OK   B2 Raum-Nachrichten der blockierten Person ausgeblendet' else 'FEHL B2' end || E'\n';
  select count(*) into n from public.chat_search('Bibliothek');
  log := log || case when n = 0 then 'OK   B3 Suche respektiert Blockierung' else 'FEHL B3' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_conversation_messages(cid);
    log := log || 'FEHL B4 Blockierte:r liest Gespräch' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   B4 auch die blockierte Person sieht das Gespräch nicht' || E'\n';
  end;
  begin
    perform public.chat_send_request(b, 'Umgehungsversuch');
    log := log || 'FEHL B5 Anfrage trotz Blockierung' || E'\n';
  exception when sqlstate 'DC048' or sqlstate 'DC045' then
    log := log || 'OK   B5 keine neue Anfrage/kein neues Gespräch trotz Blockierung' || E'\n';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_set_block(a, false);
  select count(*) into n from public.chat_conversation_messages(cid);
  log := log || case when n = 2 then 'OK   B6 nach Aufheben wieder sichtbar' else 'FEHL B6' end || E'\n';

  -- =====================================================================
  -- Melden + Moderation
  -- =====================================================================
  rep := public.chat_report('message', m2, 'harassment', 'Beleidigung im Raum');
  perform public.chat_report('message', cm, 'other', null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_mod_list_reports('open');
    log := log || 'FEHL A1 normale Nutzer:in liest Meldungen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A1 Meldungen nur für Moderation' || E'\n';
  end;
  begin
    perform public.chat_mod_ban(c, 'global', null, 60, 'Versuch');
    log := log || 'FEHL A2 normale Nutzer:in sperrt' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A2 normale Nutzer:innen können nicht sperren' || E'\n';
  end;
  begin
    perform public.chat_admin_delete_room(general, 'Versuch');
    log := log || 'FEHL A3 normale Nutzer:in löscht Raum' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A3 normale Nutzer:innen können keine Räume löschen' || E'\n';
  end;
  begin
    perform public.chat_admin_set_moderator(a, true, 'Selbsternennung');
    log := log || 'FEHL A4 Selbsternennung zur Moderation' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A4 Rollen nicht selbst änderbar' || E'\n';
  end;
  begin
    perform public.chat_mod_delete_message(m1, 'Versuch');
    log := log || 'FEHL A5 normale Nutzer:in löscht fremde Nachricht per Moderation' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A5 Moderations-Löschen nur für Staff' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_mod_list_reports('open') x where x.id = rep and x.evidence = 'Du bist ein ***!';
  log := log || case when n = 1 then 'OK   A6 Moderation sieht Meldung mit (zensierter) Beweis-Kopie' else 'FEHL A6' end || E'\n';
  perform public.chat_mod_delete_message(m2, 'Beleidigung');
  select count(*) into n from public.chat_messages where id = m2 and deleted_at is not null;
  log := log || case when n = 1 then 'OK   A7 Moderation löscht Raum-Nachricht' else 'FEHL A7' end || E'\n';
  reset role;
  -- private, NICHT gemeldete Nachricht (die Vorstellungsnachricht) darf Moderation nicht löschen
  select id into m3 from public.chat_messages where conversation_id = cid and sender_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_mod_delete_message(m3, 'ohne Meldung');
    log := log || 'FEHL A8 private Nachricht ohne Meldung gelöscht' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   A8 private Nachrichten nur nach Meldung (geringster Zugriff)' || E'\n';
  end;
  select count(*) into n from public.chat_mod_report_context(
    (select r2.id from public.chat_mod_list_reports('open') r2 where r2.message_id = cm), 'Prüfung der Meldung');
  log := log || case when n >= 1 then 'OK   A9 Zusammenhang einer Meldung abrufbar' else 'FEHL A9' end || E'\n';
  reset role;
  select count(*) into n from public.chat_audit_log where action = 'view_private_context' and actor_id = mo;
  log := log || case when n = 1 then 'OK   A10 Einblick in privates Gespräch wird protokolliert' else 'FEHL A10' end || E'\n';

  -- Sperren
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_mod_ban(a, 'global', null, 8 * 24 * 60, 'zu lang');
    log := log || 'FEHL K1 Moderation sperrt länger als 7 Tage' || E'\n';
  exception when sqlstate '22023' then
    log := log || 'OK   K1 Moderation höchstens 7 Tage' || E'\n';
  end;
  begin
    perform public.chat_mod_ban(ad, 'global', null, 60, 'Admin sperren');
    log := log || 'FEHL K2 Admin gesperrt' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   K2 Admins können nicht gesperrt werden' || E'\n';
  end;
  ban := public.chat_mod_ban(a, 'global', null, 60, 'Beleidigung im Raum');
  perform public.chat_mod_ban(c, 'room', general, 24 * 60, 'Spam im Raum');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach w in array array['room', 'private', 'react', 'request', 'project'] loop
    begin
      if w = 'room' then perform public.chat_send_room_message(general, 'trotz Sperre');
      elsif w = 'private' then perform public.chat_send_conversation_message(cid, 'trotz Sperre');
      elsif w = 'react' then perform public.chat_toggle_reaction(cm, '👍');
      elsif w = 'request' then perform public.chat_send_request(c, 'trotz Sperre');
      else perform public.chat_create_project_room(idea);
      end if;
      log := log || 'FEHL K3 globale Sperre umgangen: ' || w || E'\n';
    exception when sqlstate 'DC041' then
      log := log || 'OK   K3 globale Sperre greift: ' || w || E'\n';
    end;
  end loop;
  select count(*) into n from public.chat_room_messages(general);
  log := log || case when n >= 1 then 'OK   K4 gesperrte Person kann weiter lesen' else 'FEHL K4' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_join_room(general);
  perform public.chat_join_room(learning);
  begin
    perform public.chat_send_room_message(general, 'trotz Raum-Sperre');
    log := log || 'FEHL K5 Raum-Sperre umgangen' || E'\n';
  exception when sqlstate 'DC041' then
    log := log || 'OK   K5 Raum-Sperre greift im Raum' || E'\n';
  end;
  perform public.chat_send_room_message(learning, 'Im anderen Raum darf ich schreiben');
  log := log || 'OK   K6 Raum-Sperre gilt nur für den einen Raum' || E'\n';
  reset role;

  update public.chat_bans set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where id = ban;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_send_room_message(general, 'Sperre ist abgelaufen');
  log := log || 'OK   K7 abgelaufene Sperre wird automatisch erkannt' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x.id into ban from public.chat_mod_list_bans(true) x where x.user_id = c;
  perform public.chat_mod_end_ban(ban, 'Vorzeitig beendet');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_send_room_message(general, 'Sperre vorzeitig beendet');
  log := log || 'OK   K8 vorzeitig beendete Sperre gilt nicht mehr' || E'\n';
  reset role;

  -- Archivieren, Gespräch/Raum löschen
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.chat_mod_set_room_archived(proom, true, 'Projekt ruht');
  begin
    perform public.chat_admin_delete_conversation(cid, 'Versuch');
    log := log || 'FEHL D1 Moderation löscht privates Gespräch' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   D1 Gespräche löschen nur Admins' || E'\n';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_send_room_message(proom, 'im Archiv');
    log := log || 'FEHL D2 Schreiben im archivierten Raum' || E'\n';
  exception when sqlstate 'DC050' then
    log := log || 'OK   D2 archivierter Raum: nur lesen (DC050)' || E'\n';
  end;
  select count(*) into n from public.chat_room_messages(proom);
  log := log || case when n = 1 then 'OK   D3 archivierter Raum bleibt lesbar' else 'FEHL D3' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_admin_delete_conversation(cid, '');
    log := log || 'FEHL D4 Löschen ohne Begründung' || E'\n';
  exception when sqlstate '22023' then
    log := log || 'OK   D4 Löschen nur mit Begründung' || E'\n';
  end;
  perform public.chat_admin_delete_conversation(cid, 'Meldung bestätigt, Gespräch entfernt');
  perform public.chat_admin_delete_room(eroom, 'Event-Gruppe nicht mehr nötig');
  reset role;
  select count(*) into n from public.chat_messages where conversation_id = cid;
  log := log || case when n = 0 and not exists (select 1 from public.chat_conversations where id = cid)
                     then 'OK   D5 Gespräch samt Nachrichten gelöscht (keine Waisen)' else 'FEHL D5' end || E'\n';
  select count(*) into n from public.chat_reports where message_id is null and evidence = 'Gerne, morgen nach der Schule?';
  log := log || case when n = 1 then 'OK   D6 Meldung + Beweis-Kopie bleiben nach dem Löschen erhalten' else 'FEHL D6 ' || n end || E'\n';
  select count(*) into n from public.chat_requests where id = rid and conversation_id is null;
  log := log || case when n = 1 then 'OK   D7 Anfrage-Verweis sauber gelöst' else 'FEHL D7' end || E'\n';
  select count(*) into n from public.chat_rooms where id = eroom;
  log := log || case when n = 0 then 'OK   D8 Raum gelöscht' else 'FEHL D8' end || E'\n';
  select count(distinct action) into n from public.chat_audit_log
   where action in ('delete_message', 'ban', 'end_ban', 'archive_room', 'delete_conversation', 'delete_room', 'view_private_context');
  log := log || case when n = 7 then 'OK   D9 alle Moderations-Aktionen im Audit-Protokoll' else 'FEHL D9 ' || n end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.chat_conversation_messages(cid);
    log := log || 'FEHL D10 gelöschtes Gespräch noch lesbar' || E'\n';
  exception when sqlstate 'DC042' then
    log := log || 'OK   D10 beide verlieren den Zugriff auf das gelöschte Gespräch' || E'\n';
  end;
  begin
    perform * from public.chat_mod_list_audit(10);
    log := log || 'FEHL D11 normale Nutzer:in liest Audit-Protokoll' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   D11 Audit-Protokoll nur für Staff' || E'\n';
  end;
  reset role;

  -- Ratenbegrenzung
  update public.chat_config set messages_per_minute = 1 where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_send_room_message(general, 'zu schnell');
    log := log || 'FEHL L1 Ratenbegrenzung greift nicht' || E'\n';
  exception when sqlstate 'DC044' then
    log := log || 'OK   L1 Ratenbegrenzung (DC044)' || E'\n';
  end;
  reset role;

  -- Wortliste: nur Admins
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_admin_set_term('testwort', false, 'de', true);
    log := log || 'FEHL W1 Moderation ändert Wortliste' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   W1 Wortliste nur für Admins' || E'\n';
  end;
  reset role;

  -- =====================================================================
  -- Wortfilter (als Eigentümer, interne Funktion)
  -- =====================================================================
  foreach w in array array[
    'Du Arschloch', 'ARSCHLOCH!', 'a.r.s.c.h.l.o.c.h', 'a r s c h', '4rschl0ch', 'Scheiße', 'scheisse',
    'Fuuuuck', 'f u c k', 'sh!t', 'You are a bitch', 'fucking', 'şerefsiz', 'SALAK', 'amk', 'orospu çocuğu',
    'ŞEREFSİZ', 'аss', 'du-idiot', 'nett,idiot'] loop
    select * into r from public.chat_censor(w);
    log := log || case when r.censored and r.body ~ '\*\*\*' then 'OK   F+ zensiert: ' || r.body
                       else 'FEHL F+ NICHT zensiert: ' || w end || E'\n';
  end loop;
  foreach w in array array[
    'Klasse', 'Assistent', 'assignment', 'class', 'Schwimmbad', 'Mississippi', 'Scheibe', 'Scheitel', 'sıkıntı',
    'Amina', 'Analyse', 'Shiitake', 'Bastian', 'Dickens', 'pic', 'got', 'Hölle', 'Ankara', 'Sikke', 'Passau',
    'Glas', 'Masse', 'Kanal', 'Termin am 12.11.2026 um 14:30'] loop
    select * into r from public.chat_censor(w);
    log := log || case when not r.censored and r.body = w then 'OK   F- harmlos: ' || w
                       else 'FEHL F- fälschlich zensiert: ' || w || ' → ' || r.body end || E'\n';
  end loop;

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
