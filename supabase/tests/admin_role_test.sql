-- =============================================================================
-- Sicherheitstest für die Admin-Rolle (Migration 005) – speichert NICHTS dauerhaft
-- =============================================================================
-- Wie ausführen?
--   1. EMAIL_KONTO_A (wird im Test kurz Admin) und EMAIL_KONTO_B (normal) eintragen.
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--
-- Der ganze Test ist EIN Befehl und endet IMMER mit dem Fehler "TESTERGEBNIS".
-- Dadurch wird alles rückgängig gemacht – auch das kurze Eintragen von A als Admin.
-- "ERROR: TESTERGEBNIS ..." ist also NORMAL. Jede Zeile: OK = wie erwartet,
-- FEHL = Sicherheitsproblem oder unerwartetes Verhalten.
--
-- Hinweis: Ist Konto A schon ECHT als Admin eingetragen, meldet T1 "FEHL"
-- (dann ist A ja bereits Admin) – das ist in dem Fall kein Sicherheitsproblem.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen
  a uuid;
  b uuid;
  ok boolean;
  n bigint;
  log text := E'\n';
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  if a is null or b is null then
    raise exception 'Bitte EMAIL_KONTO_A und EMAIL_KONTO_B eintragen – beide Konten müssen existieren.';
  end if;

  -- ---------- Als Konto A, bevor A Admin ist ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.is_admin();
  log := log || case when not ok then 'OK   T1 A vor der Zuweisung: kein Admin'
                     else 'FEHL T1 A ist bereits Admin (siehe Hinweis oben)' end || E'\n';
  reset role;

  -- ---------- Als Konto B (normale:r Schüler:in) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := public.is_admin();
  log := log || case when not ok then 'OK   T2 B: is_admin() = false'
                     else 'FEHL T2 B ist ADMIN' end || E'\n';

  begin
    perform 1 from public.admins limit 1;
    log := log || 'FEHL T3 B kann die Admin-Liste LESEN' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T3 B kann die Admin-Liste nicht lesen' || E'\n';
  end;

  begin
    insert into public.admins (user_id) values (b);
    log := log || 'FEHL T4 B konnte sich SELBST zum Admin machen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T4 B kann sich nicht selbst zum Admin machen' || E'\n';
  end;

  begin
    update public.admins set note = 'x' where true;
    log := log || 'FEHL T5 B kann Admin-Einträge ÄNDERN' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T5 B kann Admin-Einträge nicht ändern' || E'\n';
  end;

  begin
    delete from public.admins where true;
    log := log || 'FEHL T6 B kann Admin-Einträge LÖSCHEN' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T6 B kann Admin-Einträge nicht löschen' || E'\n';
  end;

  -- Versuch, sich über gefälschte Daten im Token als A auszugeben, ist hier nicht
  -- möglich: Das Token wird von Supabase signiert; im Test setzen wir es nur als Admin.
  reset role;

  -- ---------- Admin (SQL Editor) trägt A ein – nur innerhalb dieses Tests ----------
  insert into public.admins (user_id, note) values (a, 'nur Test') on conflict (user_id) do nothing;

  -- ---------- Als Konto A, jetzt Admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := public.is_admin();
  log := log || case when ok then 'OK   T7 A nach der Zuweisung: is_admin() = true'
                     else 'FEHL T7 A ist nach der Zuweisung KEIN Admin' end || E'\n';

  begin
    insert into public.admins (user_id) values (b);
    log := log || 'FEHL T8 Admin A konnte B über die API zum Admin machen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T8 auch Admins können über die API keine Admins ernennen' || E'\n';
  end;
  reset role;

  -- ---------- B ist weiterhin kein Admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.is_admin();
  log := log || case when not ok then 'OK   T9 B bleibt kein Admin, obwohl A Admin ist'
                     else 'FEHL T9 B ist ADMIN' end || E'\n';
  reset role;

  -- ---------- Besucher ohne Login ----------
  set local role anon;
  begin
    perform public.is_admin();
    log := log || 'FEHL T10 Besucher ohne Login dürfen is_admin() aufrufen' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T10 Besucher ohne Login: is_admin() gesperrt' || E'\n';
  end;
  reset role;

  -- ---------- Bestehende Regeln unverändert (Stichprobe) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id = a;
  log := log || case when n = 0 then 'OK   T11 B kann das Profil von A weiterhin nicht lesen'
                     else 'FEHL T11 B kann das Profil von A LESEN' end || E'\n';
  reset role;

  raise exception 'TESTERGEBNIS (alles wurde zurückgerollt):%', log;
end $$;
