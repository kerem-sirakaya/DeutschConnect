-- =============================================================================
-- Lesestand / ungelesen / Lese-Token (Migration 020 v3) – psql-Skript mit ECHTEN, getrennten Transaktionen
-- =============================================================================
-- WARUM psql und nicht der SQL-Editor? Ob eine Nachricht „vor“ oder „nach“ dem Laden kam, hängt an
-- abgeschlossenen Transaktionen; in EINEM DO-Block lässt sich das nicht prüfen. Parallele Fälle brauchen
-- eine zweite Verbindung (Erweiterung dblink, falls installiert und verbindbar – sonst „INFO … übersprungen“).
--
-- WO? Nur auf einer KOPIE (lokale Test-Datenbank oder Staging), NACH 014 und 020 (018 optional).
-- WIE? Drei normale Testkonten eintragen (A, B, C – keine Admins/Moderator:innen; es muss ein ANDERES
--      Admin-Konto geben) und ausführen:   psql "<verbindung>" -f supabase/tests/020_chat_read_state_test.sql
-- ACHTUNG: legt Testdaten mit „[T020]“ an (auch Test-Event + Idee) und LÖSCHT sie am Ende wieder.
--          Für die Fehlerfälle F1–F3 werden kurz Test-Prüfregeln angelegt und sofort wieder entfernt.
-- Ausgabe: OK = wie erwartet, FEHL = Problem, INFO = übersprungen.
-- =============================================================================
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
\set email_a 'EMAIL_KONTO_A'
\set email_b 'EMAIL_KONTO_B'
\set email_c 'EMAIL_KONTO_C'

-- ---------- Vorbereitung (als Eigentümer) ----------
\set owner 'reset role; set request.jwt.claims = '''';'
:owner
select count(*) = 3 as ok_users from auth.users where email in (:'email_a', :'email_b', :'email_c') \gset
\if :ok_users
\else
  \echo 'ABBRUCH: EMAIL_KONTO_A/B/C eintragen (drei vorhandene Konten).'
  \quit
\endif
select id as a from auth.users where email = :'email_a' \gset
select id as b from auth.users where email = :'email_b' \gset
select id as c from auth.users where email = :'email_c' \gset
select not exists (select 1 from public.admins where user_id in (:'a', :'b', :'c'))
   and not exists (select 1 from public.chat_moderators where user_id in (:'a', :'b', :'c'))
   and (exists (select 1 from public.admins) or exists (select 1 from public.chat_moderators)) as ok_roles \gset
\if :ok_roles
\else
  \echo 'ABBRUCH: A/B/C dürfen keine Admins/Moderator:innen sein, und es muss ein ANDERES Admin-Konto geben.'
  \quit
\endif
-- Person wechseln wie eine echte App-Anfrage: JWT-Claims setzen + Rolle authenticated
\set as_a 'reset role; set request.jwt.claims = ''{"sub":"' :a '","role":"authenticated"}''; set role authenticated;'
\set as_b 'reset role; set request.jwt.claims = ''{"sub":"' :b '","role":"authenticated"}''; set role authenticated;'
\set as_c 'reset role; set request.jwt.claims = ''{"sub":"' :c '","role":"authenticated"}''; set role authenticated;'

select coalesce((select enabled from public.chat_config where id = 1), false) as prev_enabled \gset
select coalesce(max(id), 0) as fail_mark from public.chat_read_failures \gset
update public.chat_config set enabled = true where id = 1;
delete from public.chat_blocks where blocker_id in (:'a', :'b', :'c') or blocked_id in (:'a', :'b', :'c');
delete from public.chat_room_members where user_id in (:'a', :'b', :'c');
delete from public.chat_read_state where user_id in (:'a', :'b', :'c');
delete from public.chat_read_tokens where user_id in (:'a', :'b', :'c');
select id as room from public.chat_rooms where slug = 'learning' \gset
select id as room2 from public.chat_rooms where kind = 'topic' and id <> :'room' order by slug limit 1 \gset
select id as school from public.schools order by id limit 1 \gset
insert into public.events (title, start_at, duration_minutes, host_school_id, school_ids, status)
values ('{"de":"[T020] Event mit Gruppe"}', now() + interval '3 days', 60, :'school', array[:'school'], 'confirmed')
returning id as ev \gset
insert into public.event_registrations (event_id, user_id, status) values (:'ev', :'c', 'registered');
insert into public.chat_rooms (kind, event_id) values ('event', :'ev') returning id as eroom \gset
delete from public.chat_conversations where user_a = least(:'a'::uuid, :'c'::uuid) and user_b = greatest(:'a'::uuid, :'c'::uuid);
insert into public.chat_conversations (user_a, user_b) values (least(:'a'::uuid, :'c'::uuid), greatest(:'a'::uuid, :'c'::uuid))
returning id as conv \gset
insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
values (:'c', :'school', '[T020] Projekt', 'Test', 'Testprojekt für Migration 020', array['language'], array[:'school'], 'planned')
returning id as idea \gset
insert into public.chat_rooms (kind, idea_id) values ('project', :'idea') returning id as proom \gset
-- IDs für die DO-Blöcke unten (authenticated darf chat_rooms nicht direkt lesen)
set t020.room = :'room';
set t020.conv = :'conv';
set t020.a = :'a';
set t020.c = :'c';

-- Hilfsfunktionen (nur diese Sitzung, laufen mit den Rechten der aktuellen Person)
create or replace function pg_temp.unread(p_room uuid, p_conv uuid) returns boolean language sql as $$
  select coalesce((select x.has_unread from public.chat_inbox_state() x
                    where x.room_id is not distinct from p_room and x.conversation_id is not distinct from p_conv), false)
$$;
-- wie die App: laden (Token) → anzeigen → Token einlösen
create or replace function pg_temp.read_all(p_room uuid, p_conv uuid) returns void language plpgsql as $$
begin
  perform public.chat_mark_read((public.chat_load_messages(p_room, p_conv, null, 100) ->> 'read_token')::uuid);
end;
$$;
grant execute on function pg_temp.unread(uuid, uuid), pg_temp.read_all(uuid, uuid) to authenticated;

-- =====================================================================
-- H) Historie und Beitritt
-- =====================================================================
:owner
insert into public.chat_room_members (room_id, user_id) values (:'room', :'b');
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] alt (vor 020)') returning id as m_old \gset
delete from public.chat_message_cursor where message_id = :'m_old';   -- simuliert eine Nachricht von VOR Migration 020
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] vor dem Beitritt');
:as_a
select public.chat_join_room(:'room') is null as _x \gset
select case when not pg_temp.unread(:'room', null)
            and (select last_body from public.chat_inbox_state() where room_id = :'room') = '[T020] vor dem Beitritt'
       then 'OK   H1 neues Mitglied: Verlauf von VOR dem Beitritt (auch vor 020) ist nicht ungelesen, Vorschau stimmt'
       else 'FEHL H1' end;
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] nach dem Beitritt') returning created_at as t_after \gset
:as_a
select case when pg_temp.unread(:'room', null) then 'OK   H2 Nachricht NACH dem Beitritt ist ungelesen' else 'FEHL H2' end;
select case when pg_temp.unread(:'room', null) then 'OK   H3 Übersicht abrufen markiert nichts als gelesen' else 'FEHL H3' end;
select pg_temp.read_all(:'room', null) is null as _x \gset
select case when not pg_temp.unread(:'room', null) then 'OK   H4 geladen + Token eingelöst: gelesen' else 'FEHL H4' end;

-- =====================================================================
-- T) Lese-Token: vom Server erzeugt, gebunden, einmalig, befristet
-- =====================================================================
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] für Token-Tests');
:as_a
select public.chat_load_messages(:'room', null) as loaded \gset
select (:'loaded'::jsonb ->> 'read_token') as tok_a \gset
select case when :'tok_a' ~ '^[0-9a-f-]{36}$' and jsonb_typeof(:'loaded'::jsonb -> 'messages') = 'array'
            and (:'loaded'::jsonb -> 'messages') @> '[{"body":"[T020] für Token-Tests"}]'
            and (select array_agg(k order by k) from jsonb_object_keys(:'loaded'::jsonb) k) = array['messages', 'read_token']
            and position(':' in :'tok_a') = 0
       then 'OK   T1 Laden liefert Nachrichten + zufällige Token-ID (kein Snapshot beim Client)' else 'FEHL T1' end;
:as_b
set t020.tok = :'tok_a';
do $$ begin perform public.chat_mark_read(current_setting('t020.tok')::uuid); raise notice 'FEHL T2 fremdes Token eingelöst';
exception when sqlstate 'DC060' then raise notice 'OK   T2 Token einer anderen Person: abgelehnt (DC060)'; end $$;
:as_a
do $$ begin perform public.chat_mark_read(gen_random_uuid()); raise notice 'FEHL T3 erfundenes Token angenommen';
exception when sqlstate 'DC060' then raise notice 'OK   T3 erfundene Token-ID: abgelehnt (DC060)'; end $$;
select public.chat_mark_read(:'tok_a') is not null as _x \gset
select case when not pg_temp.unread(:'room', null) then 'OK   T4 eigenes Token eingelöst: gelesen' else 'FEHL T4' end;
do $$ begin perform public.chat_mark_read(current_setting('t020.tok')::uuid); raise notice 'FEHL T5 Token zweimal eingelöst';
exception when sqlstate 'DC062' then raise notice 'OK   T5 Token ein zweites Mal: abgelehnt (DC062)'; end $$;
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_exp \gset
:owner
update public.chat_read_tokens set expires_at = now() - interval '1 second' where id = :'tok_exp';
:as_a
set t020.tok = :'tok_exp';
do $$ begin perform public.chat_mark_read(current_setting('t020.tok')::uuid); raise notice 'FEHL T6 abgelaufenes Token angenommen';
exception when sqlstate 'DC061' then raise notice 'OK   T6 abgelaufenes Token: abgelehnt (DC061)'; end $$;
-- Token gilt nur für SEIN Ziel: Raum-Token lässt das Gespräch unberührt
:owner
insert into public.chat_messages (conversation_id, sender_id, body) values (:'conv', :'c', '[T020] Gespräch ungelesen');
:as_a
select pg_temp.read_all(:'room', null) is null as _x \gset
select case when pg_temp.unread(null, :'conv') then 'OK   T7 Raum-Token markiert kein anderes Gespräch' else 'FEHL T7' end;
-- Veraltetes Token setzt den Lesestand nicht zurück
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_old \gset
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] zwischen zwei Token');
:as_a
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_new \gset
select public.chat_mark_read(:'tok_new') is not null as _x \gset
select public.chat_mark_read(:'tok_old') is not null as _x \gset
select case when not pg_temp.unread(:'room', null)
       then 'OK   T8 älteres Token nach neuerem eingelöst: Lesestand bleibt' else 'FEHL T8' end;
-- Nicht-Mitglied: kein Laden, kein Token
:owner
select count(*) as tokens_before from public.chat_read_tokens where user_id = :'b' \gset
:as_b
set t020.eroom = :'eroom';
do $$ begin perform public.chat_load_messages(current_setting('t020.eroom')::uuid, null);
  raise notice 'FEHL T9 Nicht-Mitglied lädt Eventgruppe';
exception when sqlstate 'DC042' then raise notice 'OK   T9 Nicht-Mitglied: Laden verweigert (DC042)'; end $$;
:owner
select case when (select count(*) from public.chat_read_tokens where user_id = :'b') = :tokens_before
       then 'OK   T10 dabei wurde kein Token erzeugt' else 'FEHL T10' end;
-- Obergrenze: höchstens 20 offene Token pro Person
:as_a
do $$ begin for i in 1..25 loop perform public.chat_load_messages(current_setting('t020.room')::uuid, null); end loop; end $$;
:owner
select case when (select count(*) from public.chat_read_tokens where user_id = :'a') <= 20
       then 'OK   T11 höchstens 20 offene Token pro Person' else 'FEHL T11' end;

-- =====================================================================
-- K) Laden und Markieren konsistent (auch parallel)
-- =====================================================================
:owner
select exists (select 1 from pg_extension where extname = 'dblink') as has_dblink \gset
\if :has_dblink
do $$ begin
  perform dblink_connect('t020', format('host=localhost port=%s dbname=%s user=%s',
                                        current_setting('port'), current_database(), current_user));
exception when others then raise notice 'INFO K1–K3 übersprungen: keine zweite Verbindung (%)', sqlerrm;
end $$;
select coalesce('t020' = any(dblink_get_connections()), false) as has_conn \gset
\else
\echo 'INFO K1–K3 übersprungen: Erweiterung dblink nicht installiert'
\set has_conn false
\endif
\if :has_conn
-- K1: Nachricht wird gerade gespeichert, während geladen wird → nicht angezeigt UND danach ungelesen
:as_a
select pg_temp.read_all(:'room', null) is null as _x \gset
:owner
select dblink_exec('t020', 'begin') as _x \gset
select dblink_exec('t020', format('insert into public.chat_messages (room_id, sender_id, body) values (%L, %L, %L)',
                                  :'room', :'b', '[T020] parallel beim Laden')) as _x \gset
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] fertig vor dem Laden');
:as_a
select public.chat_load_messages(:'room', null) as loaded \gset
select (:'loaded'::jsonb ->> 'read_token') as tok_k \gset
:owner
select dblink_exec('t020', 'commit') as _x \gset
:as_a
select public.chat_mark_read(:'tok_k') is not null as _x \gset
select case when (:'loaded'::jsonb -> 'messages') @> '[{"body":"[T020] fertig vor dem Laden"}]'
            and not (:'loaded'::jsonb -> 'messages') @> '[{"body":"[T020] parallel beim Laden"}]'
            and pg_temp.unread(:'room', null)
       then 'OK   K1 parallel gespeicherte Nachricht: nicht angezeigt → nach dem Einlösen ungelesen; angezeigte gelesen'
       else 'FEHL K1' end;
select pg_temp.read_all(:'room', null) is null as _x \gset
-- K2: gleiches xmax – älteres Token (parallele Nachricht noch offen) nach neuerem einlösen
:owner
select dblink_exec('t020', 'begin') as _x \gset
select dblink_exec('t020', format('insert into public.chat_messages (room_id, sender_id, body) values (%L, %L, %L)',
                                  :'room', :'b', '[T020] offen beim alten Token')) as _x \gset
:as_a
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_k_old \gset
:owner
select dblink_exec('t020', 'commit') as _x \gset
:as_a
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_k_new \gset
select public.chat_mark_read(:'tok_k_new') is not null as _x \gset
select public.chat_mark_read(:'tok_k_old') is not null as _x \gset
:owner
select pg_snapshot_xmax(o.read_snapshot) = pg_snapshot_xmax(n.read_snapshot) as same_xmax
  from public.chat_read_tokens o, public.chat_read_tokens n where o.id = :'tok_k_old' and n.id = :'tok_k_new' \gset
:as_a
select case when not pg_temp.unread(:'room', null)
       then 'OK   K2 älteres Token (gleiches xmax: ' || :'same_xmax' || ') setzt den Lesestand nicht zurück' else 'FEHL K2' end;
-- K3: Wettlauf – 40× parallel speichern (zufällige Verzögerung) und gleichzeitig laden.
--     Invariante: angezeigt ⇔ im Token-Snapshot sichtbar (für jede Nachricht mit Cursor im Gespräch).
:owner
do $$
declare
  res jsonb; tok uuid; snap pg_snapshot; ids uuid[]; bad integer := 0; hidden integer := 0; i integer;
begin
  for i in 1..40 loop
    perform dblink_send_query('t020', format(
      'insert into public.chat_messages (conversation_id, sender_id, body) select %L, %L, %L from (select pg_sleep(random() * 0.02)) s',
      current_setting('t020.conv'), current_setting('t020.c'), '[T020] Wettlauf ' || i));
    perform pg_sleep(random() * 0.02);
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t020.a'), 'role', 'authenticated')::text, true);
    set local role authenticated;
    res := public.chat_load_messages(null, current_setting('t020.conv')::uuid, null, 100);
    reset role;
    tok := (res ->> 'read_token')::uuid;
    select t.read_snapshot into snap from public.chat_read_tokens t where t.id = tok;
    select coalesce(array_agg((e ->> 'id')::uuid), '{}') into ids from jsonb_array_elements(res -> 'messages') e;
    select bad + count(*) into bad from public.chat_message_cursor x
     where x.conversation_id = current_setting('t020.conv')::uuid
       and pg_visible_in_snapshot(x.xid, snap) <> (x.message_id = any(ids));
    select hidden + count(*) into hidden from public.chat_message_cursor x
     where x.conversation_id = current_setting('t020.conv')::uuid and not pg_visible_in_snapshot(x.xid, snap);
    perform * from dblink_get_result('t020') as r(status text);
    perform * from dblink_get_result('t020') as r(status text);
  end loop;
  if bad = 0 then
    raise notice 'OK   K3 Wettlauf 40×: angezeigt ⇔ im Token sichtbar, immer (davon % × Nachricht beim Laden noch unsichtbar)', hidden;
  else
    raise notice 'FEHL K3 % Abweichungen zwischen Anzeige und Token', bad;
  end if;
end $$;
select dblink_disconnect('t020') as _x \gset
\endif

-- =====================================================================
-- F) Fehlerbehandlung der Trigger
-- =====================================================================
-- F1/F2: Startpunkt scheitert (künstliche Prüfregel) → Beitritt/Anmeldung bleibt gültig, Fehler protokolliert
:owner
alter table public.chat_read_state add constraint t020_fail check (user_id <> :'b') not valid;
:as_b
select public.chat_join_room(:'room2') is null as _x \gset
insert into public.event_registrations (event_id, user_id, status) values (:'ev', :'b', 'registered');
:owner
alter table public.chat_read_state drop constraint t020_fail;
select case when exists (select 1 from public.chat_room_members where room_id = :'room2' and user_id = :'b')
            and exists (select 1 from public.chat_read_failures where id > :fail_mark and source = 'room_join'
                          and user_id = :'b' and room_id = :'room2' and sql_state = '23514')
       then 'OK   F1 Startpunkt beim Beitritt gescheitert: Beitritt gültig, Fehler protokolliert' else 'FEHL F1' end;
select case when exists (select 1 from public.event_registrations where event_id = :'ev' and user_id = :'b' and status = 'registered')
            and exists (select 1 from public.chat_read_failures where id > :fail_mark and source = 'event_registration'
                          and user_id = :'b' and room_id = :'eroom')
       then 'OK   F2 Startpunkt bei Event-Anmeldung gescheitert: Anmeldung gültig, Fehler protokolliert' else 'FEHL F2' end;
-- F3: Cursor kann nicht gespeichert werden → die Nachricht wird NICHT gespeichert (beides oder nichts)
alter table public.chat_message_cursor add constraint t020_fail2 check (conversation_id is distinct from :'conv') not valid;
do $$ begin
  insert into public.chat_messages (conversation_id, sender_id, body)
  values (current_setting('t020.conv')::uuid, current_setting('t020.c')::uuid, '[T020] ohne Cursor');
  raise notice 'FEHL F3 Nachricht ohne Cursor gespeichert';
exception when check_violation then
  raise notice 'OK   F3 Cursor-Fehler: Senden scheitert sichtbar, keine Nachricht ohne Cursor';
end $$;
alter table public.chat_message_cursor drop constraint t020_fail2;
select case when not exists (select 1 from public.chat_messages where body = '[T020] ohne Cursor')
            and not exists (select 1 from public.chat_messages m left join public.chat_message_cursor x on x.message_id = m.id
                             where x.message_id is null and m.body like '[T020]%' and m.id <> :'m_old')
       then 'OK   F4 keine einzige neue Testnachricht ohne Cursor' else 'FEHL F4' end;

-- =====================================================================
-- L) Verlassen und wieder beitreten
-- =====================================================================
:as_a
select pg_temp.read_all(:'room', null) is null as _x \gset
select (public.chat_load_messages(:'room', null) ->> 'read_token') as tok_leave \gset
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] vor dem Verlassen');
:as_a
select public.chat_leave_room(:'room') is null as _x \gset
set t020.tok = :'tok_leave';
do $$ begin perform public.chat_mark_read(current_setting('t020.tok')::uuid); raise notice 'FEHL L0 Token nach Verlassen eingelöst';
exception when sqlstate 'DC042' then raise notice 'OK   L0 Token nach dem Verlassen: abgelehnt (DC042)'; end $$;
:owner
select case when (select count(*) from public.chat_read_state where user_id = :'a' and room_id = :'room') = 1
       then 'OK   L1 Lesestand bleibt beim Verlassen gespeichert' else 'FEHL L1' end;
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] während A weg ist');
:as_a
select case when (select count(*) from public.chat_inbox_state() where room_id = :'room') = 0
       then 'OK   L2 nach dem Verlassen: keine Vorschau, kein Ungelesen' else 'FEHL L2' end;
select public.chat_join_room(:'room') is null as _x \gset
select case when not pg_temp.unread(:'room', null)
       then 'OK   L3 wieder beigetreten: Nachrichten von vor dem (Wieder-)Beitritt nicht ungelesen' else 'FEHL L3' end;
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] nach Wiederbeitritt');
:as_a
select case when pg_temp.unread(:'room', null) then 'OK   L4 neue Nachricht nach dem Wiederbeitritt: ungelesen' else 'FEHL L4' end;

-- =====================================================================
-- G) Eventgruppen, Projektgruppen, private Gespräche
-- =====================================================================
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'eroom', :'c', '[T020] Event: vor A');
insert into public.chat_messages (room_id, sender_id, body) values (:'proom', :'c', '[T020] Projekt: vor A');
:as_a
insert into public.event_registrations (event_id, user_id, status) values (:'ev', :'a', 'registered');
select case when (select count(*) from public.chat_inbox_state() where room_id = :'eroom') = 1 and not pg_temp.unread(:'eroom', null)
       then 'OK   G1 Event-Anmeldung: Eventgruppe sichtbar, ältere Nachrichten nicht ungelesen' else 'FEHL G1' end;
:owner
insert into public.idea_members (idea_id, user_id, status) values (:'idea', :'a', 'requested');
update public.idea_members set status = 'member', decided_at = now() where idea_id = :'idea' and user_id = :'a';
:as_a
select case when (select count(*) from public.chat_inbox_state() where room_id = :'proom') = 1 and not pg_temp.unread(:'proom', null)
       then 'OK   G2 Aufnahme ins Projekt-Team: ältere Nachrichten nicht ungelesen' else 'FEHL G2' end;
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'eroom', :'c', '[T020] Event: nach A');
insert into public.chat_messages (room_id, sender_id, body) values (:'proom', :'c', '[T020] Projekt: nach A');
:as_a
select case when pg_temp.unread(:'eroom', null) and pg_temp.unread(:'proom', null)
       then 'OK   G3 neue Nachrichten in Event- und Projektgruppe: ungelesen' else 'FEHL G3' end;
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'eroom', :'a', '[T020] Event: von A an C');
:as_c
select case when pg_temp.unread(:'eroom', null) then 'OK   G4 C: neue Nachricht in der Eventgruppe ungelesen' else 'FEHL G4' end;
:owner
select to_regprocedure('public.delete_expired_events()') is not null as has_018 \gset
\if :has_018
update public.events set start_at = now() - interval '25 hours' where id = :'ev';
select public.delete_expired_events() as _x \gset
:as_c
select case when pg_temp.unread(:'eroom', null)
            and (select last_body from public.chat_inbox_state() where room_id = :'eroom') = '[T020] Event: von A an C'
       then 'OK   G5 Event gelöscht (018): Gruppe, Vorschau und „ungelesen“ bleiben erhalten' else 'FEHL G5' end;
\else
\echo 'INFO G5 übersprungen (Migration 018 nicht ausgeführt)'
\endif
-- Anfrage annehmen: die erste Nachricht stammt von C, wird aber von A (Annehmende:r) angelegt
:as_a
select pg_temp.read_all(null, :'conv') is null as _x \gset
:owner
select set_config('request.jwt.claims', json_build_object('sub', :'a', 'role', 'authenticated')::text, false) as _x \gset
insert into public.chat_messages (conversation_id, sender_id, body, created_at)
values (:'conv', :'c', '[T020] Anfragetext von C', now() - interval '1 day');   -- wie chat_respond_request(): auth.uid() = A
:as_a
select case when not pg_temp.unread(null, :'conv')
       then 'OK   G6 angenommene Anfrage: Anfragetext gilt für die annehmende Person als gelesen' else 'FEHL G6' end;
:owner
insert into public.chat_messages (conversation_id, sender_id, body) values (:'conv', :'c', '[T020] Hallo A');
:as_a
select case when pg_temp.unread(null, :'conv') then 'OK   G7 privates Gespräch: neue Nachricht ungelesen' else 'FEHL G7' end;
select pg_temp.read_all(null, :'conv') is null as _x \gset
select case when not pg_temp.unread(null, :'conv') then 'OK   G8 privates Gespräch gelesen' else 'FEHL G8' end;
select pg_temp.read_all(:'room', null) is null as _x \gset
:owner
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'a', '[T020] eigene');
insert into public.chat_messages (room_id, sender_id, body, deleted_at) values (:'room', :'b', '', now());
insert into public.chat_blocks (blocker_id, blocked_id) values (:'a', :'b');
insert into public.chat_messages (room_id, sender_id, body) values (:'room', :'b', '[T020] von blockierter Person');
:as_a
select case when not pg_temp.unread(:'room', null)
            and (select last_body from public.chat_inbox_state() where room_id = :'room') = '[T020] eigene'
       then 'OK   G9 eigene, gelöschte und blockierte Nachrichten: nicht ungelesen, nicht in der Vorschau' else 'FEHL G9' end;
:owner
delete from public.chat_blocks where blocker_id = :'a' and blocked_id = :'b';

-- =====================================================================
-- S) Rechte
-- =====================================================================
:as_b
select case when (select count(*) from public.chat_inbox_state() where conversation_id = :'conv' or room_id = :'proom') = 0
       then 'OK   S1 fremdes Gespräch / fremde Projektgruppe: keine Vorschau' else 'FEHL S1' end;
do $$ begin perform public.chat_load_messages(null, current_setting('t020.conv')::uuid); raise notice 'FEHL S2 fremdes Gespräch ladbar';
exception when sqlstate 'DC042' then raise notice 'OK   S2 fremdes Gespräch: Laden verweigert (DC042)'; end $$;
do $$ begin perform 1 from public.chat_read_state; raise notice 'FEHL S3 Lesestand direkt lesbar';
exception when insufficient_privilege then raise notice 'OK   S3 chat_read_state nicht direkt lesbar'; end $$;
do $$ begin perform 1 from public.chat_message_cursor; raise notice 'FEHL S4 Cursor direkt lesbar';
exception when insufficient_privilege then raise notice 'OK   S4 chat_message_cursor nicht direkt lesbar'; end $$;
do $$ begin perform 1 from public.chat_read_tokens; raise notice 'FEHL S5 Token direkt lesbar';
exception when insufficient_privilege then raise notice 'OK   S5 chat_read_tokens nicht direkt lesbar (Snapshot bleibt im Server)'; end $$;
do $$ begin
  insert into public.chat_read_tokens (user_id, room_id, read_snapshot)
  values (auth.uid(), current_setting('t020.room')::uuid, '1:999999999:');
  raise notice 'FEHL S6 Token selbst angelegt';
exception when insufficient_privilege then raise notice 'OK   S6 Token nicht selbst anlegbar (nicht fälschbar)'; end $$;
do $$ begin perform 1 from public.chat_read_failures; raise notice 'FEHL S7 Fehlerprotokoll lesbar';
exception when insufficient_privilege then raise notice 'OK   S7 chat_read_failures nicht direkt lesbar'; end $$;
do $$ begin
  perform public.chat_read_store(auth.uid(), current_setting('t020.room')::uuid, null, pg_current_snapshot());
  raise notice 'FEHL S8 interne Funktion aufrufbar';
exception when insufficient_privilege then raise notice 'OK   S8 interne Funktion chat_read_store nicht aufrufbar'; end $$;
do $$ begin perform public.chat_load_messages(null, null); raise notice 'FEHL S9 ohne Ziel angenommen';
exception when sqlstate '22023' then raise notice 'OK   S9 chat_load_messages ohne Ziel abgelehnt'; end $$;
reset role;
set request.jwt.claims = '';
set role anon;
do $$ begin perform * from public.chat_inbox_state(); raise notice 'FEHL S10 anonym nutzbar';
exception when insufficient_privilege then raise notice 'OK   S10 ohne Anmeldung: chat_inbox_state gesperrt'; end $$;
do $$ begin perform public.chat_load_messages(current_setting('t020.room')::uuid, null); raise notice 'FEHL S11 anonym nutzbar';
exception when insufficient_privilege then raise notice 'OK   S11 ohne Anmeldung: chat_load_messages gesperrt'; end $$;
do $$ begin perform public.chat_mark_read(gen_random_uuid()); raise notice 'FEHL S12 anonym nutzbar';
exception when insufficient_privilege then raise notice 'OK   S12 ohne Anmeldung: chat_mark_read gesperrt'; end $$;

-- =====================================================================
-- P) Bestehendes aus 014 unverändert
-- =====================================================================
:as_a
select case when (select count(*) from public.chat_list_rooms() where id = :'room' and is_member) = 1
            and (select count(*) from public.chat_room_messages(:'room')) > 0
       then 'OK   P1 chat_list_rooms / chat_room_messages (014) funktionieren unverändert' else 'FEHL P1' end;

-- ---------- Aufräumen (als Eigentümer) ----------
:owner
alter table public.chat_read_state drop constraint if exists t020_fail;
alter table public.chat_message_cursor drop constraint if exists t020_fail2;
delete from public.chat_blocks where blocker_id in (:'a', :'b', :'c') or blocked_id in (:'a', :'b', :'c');
delete from public.chat_messages where body like '[T020]%' or (room_id = :'room' and sender_id = :'b' and body = '');
delete from public.chat_rooms where id in (:'eroom', :'proom');
delete from public.chat_conversations where id = :'conv';
delete from public.events where id = :'ev';
\if :has_018
delete from public.event_deletion_log where event_id = :'ev';
\endif
delete from public.ideas where id = :'idea';
delete from public.chat_room_members where room_id in (:'room', :'room2') and user_id in (:'a', :'b');
delete from public.chat_read_state where user_id in (:'a', :'b', :'c');
delete from public.chat_read_tokens where user_id in (:'a', :'b', :'c');
delete from public.chat_read_failures where id > :fail_mark and user_id in (:'a', :'b', :'c');
update public.chat_config set enabled = :'prev_enabled'::boolean where id = 1;
select case when (select count(*) from public.chat_messages where body like '[T020]%') = 0
       then 'OK   aufgeräumt' else 'FEHL Testdaten übrig' end;
