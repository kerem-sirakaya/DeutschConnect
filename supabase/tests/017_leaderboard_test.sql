-- =============================================================================
-- Test für die Bestenlisten (Migration 017) – speichert NICHTS dauerhaft
-- =============================================================================
-- Wo? NUR im SQL Editor von "DeutschConnect-Staging" (nicht Live), NACH Migration 017.
-- Wie?
--   1. Drei vorhandene Staging-Testkonten eintragen (EMAIL_KONTO_A/B/C), siehe STAGING_RUNBOOK.md.
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--
-- Der ganze Test ist EIN Befehl und endet IMMER mit dem Fehler "TESTERGEBNIS".
-- Dadurch wird alles rückgängig gemacht (Punkte, Rundenstarts, Anzeige-Einstellungen).
-- "ERROR: TESTERGEBNIS ..." ist also NORMAL. Jede Zeile: OK = wie erwartet, FEHL = Problem.
--
-- Hinweis: Die vergangene Spielzeit wird simuliert, indem der Test die vom Server gesetzte
-- Startzeit als Datenbank-Eigentümer zurückdatiert (das kann ein:e Schüler:in NICHT – siehe L4b).
-- L7b/L7c/L13b: Jeder Einreichversuch verbraucht die Runde – auch ein abgelehnter.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen
  email_c constant text := 'EMAIL_KONTO_C';   -- <- eintragen
  a uuid;
  b uuid;
  c uuid;
  r record;
  n bigint;
  rank_a integer;
  rank_b integer;
  rank_c integer;
  log text := E'\n';

  -- kleine Hilfen (als Block-Variablen nicht möglich → unten ausgeschrieben)
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  select id into c from auth.users where email = email_c;
  if a is null or b is null or c is null then
    raise exception 'Bitte EMAIL_KONTO_A, _B und _C eintragen – alle drei Konten müssen existieren.';
  end if;

  -- Ausgangslage für den Test: keine alten Werte/Einstellungen der drei Konten (wird zurückgerollt)
  delete from public.game_scores where user_id in (a, b, c);
  delete from public.game_runs where user_id in (a, b, c);
  delete from public.game_leaderboard_optin where user_id in (a, b, c);

  -- ---------- Nicht angemeldet (anon) ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform * from public.game_leaderboard('bridge_runner');
    log := log || 'FEHL L1 anon kann die Bestenliste lesen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   L1 anon kann die Bestenliste nicht lesen' || E'\n';
  end;
  begin
    perform public.game_start_run('bridge_runner');
    log := log || 'FEHL L2 anon kann eine Runde starten' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   L2 anon kann keine Runde starten / nichts speichern' || E'\n';
  end;
  reset role;

  -- ---------- Konto A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform 1 from public.game_scores limit 1;
    log := log || 'FEHL L3 Tabelle game_scores direkt lesbar' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   L3 Tabelle game_scores nicht direkt lesbar' || E'\n';
  end;
  begin
    insert into public.game_scores (user_id, game, best_score) values (a, 'bridge_runner', 999999);
    log := log || 'FEHL L4 Punkte direkt in die Tabelle schreibbar' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   L4 Punkte nicht direkt schreibbar (nur über Funktion)' || E'\n';
  end;
  begin
    update public.game_runs set started_at = now() - interval '1 hour' where user_id = a;
    log := log || 'FEHL L4b Startzeit selbst zurückdatierbar' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   L4b Startzeit nicht selbst änderbar' || E'\n';
  end;

  begin
    perform * from public.game_submit_score('bridge_runner', 10);
    log := log || 'FEHL L5 Einreichen ohne Rundenstart möglich' || E'\n';
  exception when sqlstate 'DC031' then
    log := log || 'OK   L5 ohne Rundenstart: abgelehnt (DC031)' || E'\n';
  end;

  begin
    perform public.game_start_run('chess');
    log := log || 'FEHL L6 unbekanntes Spiel angenommen' || E'\n';
  exception when sqlstate '22023' then
    log := log || 'OK   L6 unbekanntes Spiel abgelehnt' || E'\n';
  end;

  -- Runde starten, 10 s "spielen" (Startzeit als Eigentümer zurückdatieren)
  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '10 seconds' where user_id = a and game = 'bridge_runner';
  set local role authenticated;
  -- Grenze bei 10 s: 150. Ablehnung kommt als status (keine Exception, sonst würde das DELETE zurückgerollt).
  select * into r from public.game_submit_score('bridge_runner', 151);
  log := log || case when r.status = 'implausible' and not r.is_new_best and r.best_score is null
                     then 'OK   L7 unplausible Punktzahl abgelehnt (status implausible, nichts gespeichert)'
                     else 'FEHL L7 unplausible Punktzahl: ' || r::text end || E'\n';

  -- Die abgelehnte Runde muss VERBRAUCHT sein – auch nachdem die Funktion fertig ist.
  reset role;
  select count(*) into n from public.game_runs where user_id = a and game = 'bridge_runner';
  log := log || case when n = 0 then 'OK   L7b abgelehnte Runde ist verbraucht (kein Rundenstart mehr gespeichert)'
                     else 'FEHL L7b abgelehnte Runde existiert noch (' || n || ')' end || E'\n';
  -- "Warten": jede noch vorhandene Startzeit weit zurückdatieren (es darf keine geben) …
  update public.game_runs set started_at = now() - interval '1 hour' where user_id = a and game = 'bridge_runner';
  set local role authenticated;
  -- … und dieselbe Runde erneut einreichen: muss scheitern, obwohl 151 nach 1 h plausibel wäre.
  begin
    perform * from public.game_submit_score('bridge_runner', 151);
    log := log || 'FEHL L7c abgelehnte Runde konnte nach dem Warten erneut eingereicht werden' || E'\n';
  exception when sqlstate 'DC031' then
    log := log || 'OK   L7c abgelehnte Runde nicht wiederverwendbar – auch nicht nach dem Warten (DC031)' || E'\n';
  end;

  -- Nach Ablehnung ist die Runde verbraucht → neu starten
  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '10 seconds' where user_id = a and game = 'bridge_runner';
  set local role authenticated;
  select * into r from public.game_submit_score('bridge_runner', 120);
  log := log || case when r.best_score = 120 and r.is_new_best and r.status = 'saved' then 'OK   L8 erster Bestwert 120 gespeichert'
                     else 'FEHL L8 erster Bestwert: ' || r::text end || E'\n';

  begin
    perform * from public.game_submit_score('bridge_runner', 50);
    log := log || 'FEHL L9 dieselbe Runde zweimal eingereicht' || E'\n';
  exception when sqlstate 'DC031' then
    log := log || 'OK   L9 eine Runde = genau eine Einreichung' || E'\n';
  end;

  perform public.game_start_run('bridge_runner');
  select * into r from public.game_submit_score('bridge_runner', 40);
  log := log || case when r.best_score = 120 and not r.is_new_best and r.status = 'kept' then 'OK   L10 niedrigerer Wert ersetzt Bestwert nicht'
                     else 'FEHL L10 ' || r::text end || E'\n';

  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '10 seconds' where user_id = a and game = 'bridge_runner';
  set local role authenticated;
  select * into r from public.game_submit_score('bridge_runner', 120);
  log := log || case when r.best_score = 120 and not r.is_new_best and r.status = 'kept' then 'OK   L11 gleicher Wert ist kein neuer Bestwert'
                     else 'FEHL L11 ' || r::text end || E'\n';

  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '20 seconds' where user_id = a and game = 'bridge_runner';
  set local role authenticated;
  select * into r from public.game_submit_score('bridge_runner', 200);
  log := log || case when r.best_score = 200 and r.is_new_best and r.status = 'saved' then 'OK   L12 höherer Wert wird neuer Bestwert'
                     else 'FEHL L12 ' || r::text end || E'\n';

  -- Abgelaufene Runde
  perform public.game_start_run('paper_flight');
  reset role;
  update public.game_runs set started_at = now() - interval '4 hours' where user_id = a and game = 'paper_flight';
  set local role authenticated;
  select * into r from public.game_submit_score('paper_flight', 3);
  log := log || case when r.status = 'expired' and not r.is_new_best and r.best_score is null
                     then 'OK   L13 abgelaufene Runde abgelehnt (status expired, nichts gespeichert)'
                     else 'FEHL L13 abgelaufene Runde: ' || r::text end || E'\n';
  begin
    perform * from public.game_submit_score('paper_flight', 3);
    log := log || 'FEHL L13b abgelaufene Runde erneut einreichbar' || E'\n';
  exception when sqlstate 'DC031' then
    log := log || 'OK   L13b abgelaufene Runde ist verbraucht (DC031)' || E'\n';
  end;

  -- Ohne Zustimmung: nicht in der Liste, eigener Bestwert trotzdem sichtbar
  select count(*) into n from public.game_leaderboard('bridge_runner') where is_self;
  select * into r from public.game_my_status('bridge_runner');
  log := log || case when n = 0 and r.best_score = 200 and not r.visible and r.my_rank is null
                     then 'OK   L14 ohne Zustimmung nicht in der Liste, eigener Bestwert sichtbar'
                     else 'FEHL L14 n=' || n || ' ' || r::text end || E'\n';

  perform public.game_set_leaderboard_visibility(true);
  select count(*) into n from public.game_leaderboard('bridge_runner') where is_self and display_name is not null;
  log := log || case when n = 1 then 'OK   L15 mit Zustimmung genau einmal in der Liste'
                     else 'FEHL L15 Einträge von A: ' || n end || E'\n';
  reset role;

  -- ---------- Konto B: gleicher Wert wie A (Gleichstand), auch Papierflug ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.game_set_leaderboard_visibility(true);
  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '20 seconds' where user_id = b and game = 'bridge_runner';
  set local role authenticated;
  perform * from public.game_submit_score('bridge_runner', 200);
  perform public.game_start_run('paper_flight');
  reset role;
  update public.game_runs set started_at = now() - interval '30 seconds' where user_id = b and game = 'paper_flight';
  set local role authenticated;
  perform * from public.game_submit_score('paper_flight', 12);
  reset role;

  -- ---------- Konto C: niedriger, Zustimmung an ----------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.game_set_leaderboard_visibility(true);
  perform public.game_start_run('bridge_runner');
  reset role;
  update public.game_runs set started_at = now() - interval '10 seconds' where user_id = c and game = 'bridge_runner';
  set local role authenticated;
  perform * from public.game_submit_score('bridge_runner', 90);

  -- Ränge aus Sicht von C (nur eigene Zeile markiert; Namen der anderen sichtbar, weil sie zugestimmt haben)
  select l.rank into rank_c from public.game_leaderboard('bridge_runner') l where l.is_self;
  select count(*) into n from public.game_leaderboard('bridge_runner') l where l.is_self;
  log := log || case when n = 1 then 'OK   L16 is_self nur für die eigene Zeile' else 'FEHL L16 is_self ' || n end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select l.rank into rank_a from public.game_leaderboard('bridge_runner') l where l.is_self;
  select * into r from public.game_my_status('bridge_runner');
  log := log || case when r.my_rank = rank_a then 'OK   L17 game_my_status-Platz = Platz in der Liste'
                     else 'FEHL L17 ' || r::text || ' / ' || rank_a end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select l.rank into rank_b from public.game_leaderboard('bridge_runner') l where l.is_self;
  log := log || case when rank_a = rank_b then 'OK   L18 Gleichstand A/B → gleicher Platz (' || rank_a || ')'
                     else 'FEHL L18 A=' || rank_a || ' B=' || rank_b end || E'\n';
  log := log || case when rank_c = rank_a + 2 then 'OK   L19 C danach auf Platz ' || rank_c || ' (Wettkampf-Regel 1-1-3)'
                     else 'FEHL L19 A=' || rank_a || ' C=' || rank_c end || E'\n';

  -- Spiele getrennt: A hat keinen Papierflug-Wert, B schon
  select count(*) into n from public.game_leaderboard('paper_flight') l where l.is_self;
  log := log || case when n = 1 then 'OK   L20 Papierflug-Liste getrennt (B mit eigenem Wert)'
                     else 'FEHL L20 ' || n end || E'\n';
  reset role;

  -- Nur erlaubte Spalten (keine E-Mail, keine IDs)
  select count(*) into n
    from information_schema.routines rt
    join information_schema.parameters pa on pa.specific_name = rt.specific_name
   where rt.routine_schema = 'public' and rt.routine_name = 'game_leaderboard'
     and pa.parameter_mode = 'OUT' and pa.parameter_name not in ('rank', 'display_name', 'best_score', 'is_self');
  log := log || case when n = 0 then 'OK   L21 Bestenliste gibt nur Platz, Vorname, Punkte, is_self zurück'
                     else 'FEHL L21 zusätzliche Spalten: ' || n end || E'\n';

  -- Zustimmung zurückziehen → sofort weg
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.game_set_leaderboard_visibility(false);
  select count(*) into n from public.game_leaderboard('bridge_runner') l where l.is_self;
  log := log || case when n = 0 then 'OK   L22 Zustimmung aus → nicht mehr in der Liste'
                     else 'FEHL L22' end || E'\n';
  reset role;

  raise exception 'TESTERGEBNIS (alles zurückgerollt):%', log;
end;
$$;
