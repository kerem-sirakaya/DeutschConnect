-- =============================================================================
-- Test: Projekt-/Eventgruppen erst nach Admin-Freigabe (Migration 014) – speichert NICHTS dauerhaft
-- =============================================================================
-- Prüft die BESTEHENDE Sperre in der Datenbank (keine neue Migration):
--   chat_create_project_room: Idee muss collecting/review/planned sein (= vom Admin freigegeben)
--   chat_create_event_room:   nur Staff, Event muss planned/confirmed sein (= veröffentlicht)
--   chat_rooms: RLS an, keine direkten Tabellenrechte → Umgehung per REST-API unmöglich
--
-- Wo? NUR im SQL Editor von "DeutschConnect-Staging" (nicht Live), NACH Migration 014.
-- Wie?
--   1. Drei Staging-Testkonten eintragen:
--        A   = normales Schüler:innen-Konto (Autor:in der Test-Ideen)
--        MOD = normales Konto (wird im Test kurz Chat-Moderator:in)
--        ADM = Admin-Konto (steht in public.admins; falls nicht, trägt der Test es kurz ein)
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
-- Der Test endet IMMER mit "ERROR: TESTERGEBNIS ..." → alles wird zurückgerollt. Das ist NORMAL.
-- Jede Zeile: OK = wie erwartet, FEHL = Problem.
-- =============================================================================

do $$
declare
  email_a   constant text := 'EMAIL_KONTO_A';    -- <- eintragen
  email_mod constant text := 'EMAIL_KONTO_MOD';  -- <- eintragen
  email_adm constant text := 'EMAIL_KONTO_ADM';  -- <- eintragen
  a uuid; mo uuid; ad uuid;
  i_wait uuid; i_ok uuid; i_rej uuid; e_draft uuid; e_cancel uuid;
  r1 uuid; r2 uuid; n bigint; st text;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into mo from auth.users where email = email_mod;
  select id into ad from auth.users where email = email_adm;
  if a is null or mo is null or ad is null then
    raise exception 'Bitte alle drei E-Mails eintragen – alle Konten müssen existieren.';
  end if;

  -- ---------- Vorbereitung (als Eigentümer; wird zurückgerollt) ----------
  insert into public.admins (user_id, note) values (ad, 'Test 014 Freigabe') on conflict do nothing;
  delete from public.admins where user_id in (a, mo);
  delete from public.chat_moderators where user_id in (a, ad);
  insert into public.chat_moderators (user_id, note) values (mo, 'Test 014 Freigabe') on conflict do nothing;
  delete from public.chat_bans where user_id in (a, mo, ad);
  update public.chat_config set enabled = true where id = 1;
  -- Ideen wie von Schüler:innen eingereicht: Status 'submitted' (wartet auf Admin)
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (a, 'ers', 'Test Freigabe – wartet', 'Kurz', 'Beschreibung für den Freigabe-Test, nur fiktiv.', '{language}', '{ers}', 'submitted')
  returning id into i_wait;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (a, 'ers', 'Test Freigabe – wird freigegeben', 'Kurz', 'Beschreibung für den Freigabe-Test, nur fiktiv.', '{language}', '{ers}', 'submitted')
  returning id into i_ok;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (a, 'ers', 'Test Freigabe – wird abgelehnt', 'Kurz', 'Beschreibung für den Freigabe-Test, nur fiktiv.', '{language}', '{ers}', 'submitted')
  returning id into i_rej;
  -- Events wie vom Admin angelegt: Status 'draft' (noch nicht veröffentlicht)
  insert into public.events (title, start_at, host_school_id, school_ids, status)
  values ('{"de":"Test Freigabe – Entwurf"}', now() + interval '7 days', 'ers', '{ers}', 'draft') returning id into e_draft;
  insert into public.events (title, start_at, host_school_id, school_ids, status)
  values ('{"de":"Test Freigabe – wird abgesagt"}', now() + interval '8 days', 'ers', '{ers}', 'draft') returning id into e_cancel;

  -- ========== 1) Idee wartet auf Admin → keine Projektgruppe ==========
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_create_project_room(i_wait);
    log := log || 'FEHL F1 Projektgruppe für nicht freigegebene Idee angelegt' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F1 Idee wartet auf Admin → Projektgruppe blockiert (42501)' || E'\n';
  end;
  reset role;

  -- ========== Admin entscheidet (bestehender Ablauf, admin_set_idea_status aus Migration 006) ==========
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_idea_status(i_ok, 'collecting');   -- freigeben
  perform public.admin_set_idea_status(i_rej, 'rejected');    -- ablehnen
  perform public.admin_set_event_status(e_draft, 'planned');  -- Event veröffentlichen (siehe F4)
  reset role;
  -- e_draft ist jetzt veröffentlicht – für F3 braucht es einen echten Entwurf: neu anlegen
  insert into public.events (title, start_at, host_school_id, school_ids, status)
  values ('{"de":"Test Freigabe – Entwurf 2"}', now() + interval '9 days', 'ers', '{ers}', 'draft') returning id into r2;

  -- ========== 2) Idee freigegeben → Projektgruppe möglich, keine Doppelten ==========
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r1 := public.chat_create_project_room(i_ok);
  log := log || case when r1 is not null then 'OK   F2 Idee freigegeben → Projektgruppe angelegt' else 'FEHL F2' end || E'\n';
  if public.chat_create_project_room(i_ok) = r1 then
    log := log || 'OK   F2b zweiter Versuch liefert dieselbe Gruppe (keine Doppelte)' || E'\n';
  else
    log := log || 'FEHL F2b zweite Gruppe entstanden' || E'\n';
  end if;
  -- ========== 5a) abgelehnte Idee → keine Projektgruppe ==========
  begin
    perform public.chat_create_project_room(i_rej);
    log := log || 'FEHL F5a Projektgruppe für abgelehnte Idee angelegt' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F5a abgelehnte Idee → Projektgruppe blockiert (42501)' || E'\n';
  end;
  -- ========== 6) Umgehungsversuche über die API ==========
  begin
    insert into public.chat_rooms (kind, idea_id, created_by) values ('project', i_wait, a);
    log := log || 'FEHL F6a direkter INSERT in chat_rooms möglich' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F6a direkter INSERT in chat_rooms gesperrt' || E'\n';
  end;
  begin
    update public.ideas set status = 'collecting' where id = i_wait;
    get diagnostics n = row_count;
    log := log || case when n = 0 then 'OK   F6b Schüler:in kann eigene Idee nicht selbst freigeben (0 Zeilen)'
                       else 'FEHL F6b Idee selbst freigegeben' end || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F6b Schüler:in kann eigene Idee nicht selbst freigeben' || E'\n';
  end;
  begin
    perform public.admin_set_idea_status(i_wait, 'collecting');
    log := log || 'FEHL F6c Schüler:in nutzt Admin-Freigabe' || E'\n';
  exception when others then
    log := log || 'OK   F6c Admin-Freigabe nur für Admins (' || sqlstate || ')' || E'\n';
  end;
  begin
    perform public.chat_create_event_room(e_draft);
    log := log || 'FEHL F6d Schüler:in legt Eventgruppe an' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F6d Eventgruppe nur durch Moderation/Admin' || E'\n';
  end;
  reset role;
  select status into st from public.ideas where id = i_wait;
  log := log || case when st = 'submitted' then 'OK   F6e wartende Idee ist weiterhin submitted' else 'FEHL F6e Status ' || st end || E'\n';
  select count(*) into n from public.chat_rooms where idea_id = i_wait;
  log := log || case when n = 0 then 'OK   F6f keine Gruppe für die wartende Idee entstanden' else 'FEHL F6f' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.chat_create_project_room(i_ok);
    log := log || 'FEHL F6g anon legt Projektgruppe an' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   F6g ohne Anmeldung kein Zugriff' || E'\n';
  end;
  reset role;

  -- ========== 3) Event nicht veröffentlicht → keine Eventgruppe ==========
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_create_event_room(r2);
    log := log || 'FEHL F3 Eventgruppe für Entwurf angelegt' || E'\n';
  exception when sqlstate 'P0002' then
    log := log || 'OK   F3 Event noch nicht freigegeben (draft) → Eventgruppe blockiert (P0002)' || E'\n';
  end;
  -- ========== 4) Event veröffentlicht → Eventgruppe möglich, keine Doppelten ==========
  r1 := public.chat_create_event_room(e_draft);
  log := log || case when r1 is not null then 'OK   F4 Event freigegeben → Eventgruppe angelegt' else 'FEHL F4' end || E'\n';
  if public.chat_create_event_room(e_draft) = r1 then
    log := log || 'OK   F4b zweiter Versuch liefert dieselbe Gruppe (keine Doppelte)' || E'\n';
  else
    log := log || 'FEHL F4b zweite Eventgruppe entstanden' || E'\n';
  end if;
  reset role;

  -- ========== 5b) abgesagtes Event → keine Eventgruppe ==========
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_event_status(e_cancel, 'planned');
  perform public.admin_set_event_status(e_cancel, 'cancelled');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.chat_create_event_room(e_cancel);
    log := log || 'FEHL F5b Eventgruppe für abgesagtes Event angelegt' || E'\n';
  exception when sqlstate 'P0002' then
    log := log || 'OK   F5b abgesagtes Event → Eventgruppe blockiert (P0002)' || E'\n';
  end;
  reset role;

  select count(*) into n from public.chat_rooms where event_id in (e_draft, e_cancel, r2);
  log := log || case when n = 1 then 'OK   F7 genau eine Eventgruppe (nur für das veröffentlichte Event)' else 'FEHL F7 ' || n end || E'\n';

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
