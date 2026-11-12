-- =============================================================================
-- Sicherheitstest für admin_delete_idea (Migration 007) – speichert NICHTS dauerhaft
-- =============================================================================
-- WO? Empfohlen auf einer KOPIE (lokal "supabase start" oder Staging-Projekt).
--   Der Test legt nur VORÜBERGEHEND Test-Ideen an und rollt am Ende alles zurück.
--   Echte Ideen werden NICHT angefasst (gelöscht werden nur die eigenen Test-Ideen).
--
-- Wie ausführen?
--   1. Migration 007 muss ausgeführt sein.
--   2. EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B (normale:r Schüler:in) eintragen.
--   3. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--   4. IMMER die ganze Datei ausführen und die letzte Zeile
--      (raise exception 'TESTERGEBNIS ...') NIE entfernen.
--
-- Der Test endet IMMER mit "ERROR: TESTERGEBNIS ..." – das ist NORMAL und bedeutet,
-- dass alles zurückgerollt wurde. OK = wie erwartet, FEHL = Problem.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (Admin)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  a uuid;
  b uuid;
  b_school text;
  i_sub uuid;   -- submitted  (darf NICHT gelöscht werden)
  i_col uuid;   -- collecting (mit Unterstützung von A)
  i_rev uuid;   -- review
  i_pla uuid;   -- planned
  i_rej uuid;   -- rejected
  i_own uuid;   -- eigene Idee von B (Schülerrecht aus 001 bleibt)
  n bigint;
  log text := E'\n';
begin
  -- ===========================================================================
  -- 0) Vorbereitung (als Rolle des SQL Editors)
  -- ===========================================================================
  if to_regprocedure('public.admin_delete_idea(uuid)') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 007 ausführen.';
  end if;
  if email_a = 'EMAIL_KONTO_A' or email_b = 'EMAIL_KONTO_B' then
    raise exception 'ABBRUCH: Bitte EMAIL_KONTO_A und EMAIL_KONTO_B eintragen.';
  end if;
  select count(*) into n from auth.users where lower(email) in (lower(email_a), lower(email_b));
  if n <> 2 then raise exception 'ABBRUCH: Zu den beiden E-Mails passen % Konten (erwartet: 2).', n; end if;
  select id into a from auth.users where lower(email) = lower(email_a);
  select id into b from auth.users where lower(email) = lower(email_b);
  if a = b then raise exception 'ABBRUCH: Konto A und B sind dasselbe Konto.'; end if;
  select school_id into b_school from public.profiles where id = b;
  if b_school is null or not exists (select 1 from public.profiles where id = a) then
    raise exception 'ABBRUCH: Zu Konto A oder B fehlt das Profil.';
  end if;
  if not pg_has_role(current_user, 'authenticated', 'member') or not pg_has_role(current_user, 'anon', 'member') then
    raise exception 'ABBRUCH: Die Rolle % kann nicht zu authenticated/anon wechseln.', current_user;
  end if;

  -- Ausgangslage NUR für diesen Test (wird am Ende zurückgerollt)
  insert into public.admins (user_id, note) values (a, 'nur Test') on conflict (user_id) do nothing;
  delete from public.admins where user_id = b;

  -- Test-Ideen von B (direkt als SQL-Editor-Rolle, damit jeder Status gesetzt werden kann)
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] submitted', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[b_school], 'submitted')
  returning id into i_sub;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] collecting', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{science}', array[b_school], 'collecting')
  returning id into i_col;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] review', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{arts}', array[b_school], 'review')
  returning id into i_rev;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] planned', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{music}', array[b_school], 'planned')
  returning id into i_pla;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] rejected', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{sports}', array[b_school], 'rejected')
  returning id into i_rej;
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids, status)
  values (b, b_school, '[Rollback] eigene', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{culture}', array[b_school], 'submitted')
  returning id into i_own;
  -- Unterstützung von A für die collecting-Idee (fremde, freigegebene Idee)
  insert into public.idea_supports (idea_id, user_id) values (i_col, a);

  -- ===========================================================================
  -- 1) Besucher ohne Login (anon): darf die Funktion gar nicht aufrufen
  -- ===========================================================================
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.admin_delete_idea(i_col);
    log := log || 'FEHL T1  anon konnte admin_delete_idea aufrufen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T1  anon: admin_delete_idea verweigert (42501)' || E'\n';
  end;

  -- ===========================================================================
  -- 2) Konto B (normal): kein Löschen fremder Ideen – weder per Funktion noch direkt
  -- ===========================================================================
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen.';
  end if;

  begin
    perform public.admin_delete_idea(i_col);
    log := log || 'FEHL T2  B konnte admin_delete_idea aufrufen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T2  B: admin_delete_idea verweigert (42501)' || E'\n';
  end;

  -- Schülerrecht aus 001 bleibt: eigene Idee löschen geht weiterhin
  delete from public.ideas where id = i_own;
  get diagnostics n = row_count;
  log := log || case when n = 1 then 'OK   T3  B darf eigene Idee weiterhin löschen (Policy 001)'
                     else 'FEHL T3  B kann eigene Idee nicht mehr löschen' end || E'\n';

  -- ===========================================================================
  -- 3) Konto A (Admin)
  -- ===========================================================================
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen.';
  end if;

  -- submitted: nicht löschbar
  begin
    perform public.admin_delete_idea(i_sub);
    log := log || 'FEHL T4  submitted-Idee wurde gelöscht' || E'\n';
  exception when sqlstate 'DC010' then
    log := log || 'OK   T4  submitted-Idee nicht löschbar (DC010)' || E'\n';
  end;

  -- collecting mit Unterstützung: Idee UND Unterstützung weg
  perform public.admin_delete_idea(i_col);
  reset role;  -- Prüfung ohne RLS
  log := log || case when not exists (select 1 from public.ideas where id = i_col)
                     then 'OK   T5  collecting-Idee gelöscht' else 'FEHL T5  collecting-Idee existiert noch' end || E'\n';
  log := log || case when not exists (select 1 from public.idea_supports where idea_id = i_col)
                     then 'OK   T6  Unterstützungen mitgelöscht (keine verwaisten Einträge)'
                     else 'FEHL T6  verwaiste Unterstützungen' end || E'\n';
  log := log || case when exists (select 1 from public.ideas where id = i_sub)
                     then 'OK   T7  submitted-Idee existiert weiterhin' else 'FEHL T7  submitted-Idee fehlt' end || E'\n';

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- review, planned, rejected: löschbar
  perform public.admin_delete_idea(i_rev);
  perform public.admin_delete_idea(i_pla);
  perform public.admin_delete_idea(i_rej);
  reset role;
  select count(*) into n from public.ideas where id in (i_rev, i_pla, i_rej);
  log := log || case when n = 0 then 'OK   T8  review/planned/rejected gelöscht'
                     else 'FEHL T8  ' || n || ' Ideen nicht gelöscht' end || E'\n';

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Nicht vorhanden / leer
  begin
    perform public.admin_delete_idea(i_col);  -- wurde schon gelöscht
    log := log || 'FEHL T9  gelöschte Idee erneut "gelöscht" ohne Fehler' || E'\n';
  exception when no_data_found then
    log := log || 'OK   T9  nicht vorhandene Idee: P0002' || E'\n';
  end;
  begin
    perform public.admin_delete_idea(null);
    log := log || 'FEHL T10 null wurde akzeptiert' || E'\n';
  exception when invalid_parameter_value then
    log := log || 'OK   T10 null: 22023' || E'\n';
  end;

  -- Admin-Status ändert die normale Sicht nicht: A kann fremde submitted-Idee NICHT direkt löschen
  delete from public.ideas where id = i_sub;
  get diagnostics n = row_count;
  log := log || case when n = 0 then 'OK   T11 A: direktes DELETE fremder Idee bleibt durch RLS verboten'
                     else 'FEHL T11 A konnte fremde Idee direkt löschen' end || E'\n';

  reset role;
  -- ===========================================================================
  -- Ende: ALLES rückgängig machen (diese Zeile niemals entfernen)
  -- ===========================================================================
  raise exception 'TESTERGEBNIS (alles wurde zurückgerollt):%', log;
end $$;
