-- =============================================================================
-- Sicherheitstest für Ideen (RLS) – speichert NICHTS dauerhaft
-- =============================================================================
-- Wie ausführen?
--   1. Unten bei EMAIL_KONTO_A / EMAIL_KONTO_B eure zwei Test-E-Mails eintragen
--      (beide Konten müssen existieren und bestätigt sein).
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--
-- Warum wird nichts gespeichert?
--   Der ganze Test ist EIN Befehl (ein "do"-Block). Er endet absichtlich IMMER mit
--   einem Fehler namens "TESTERGEBNIS". Ein Fehler macht in PostgreSQL alle
--   Änderungen dieses Befehls rückgängig (Rollback) – auch die Test-Ideen.
--   Das Ergebnis steht in der Fehlermeldung. "ERROR" ist hier also NORMAL.
--
-- Was wird geprüft?
--   Der Test spielt "Konto A" (wie in der App, Rolle authenticated + eigene ID)
--   und versucht erlaubte und VERBOTENE Dinge. Jede Zeile beginnt mit
--   OK   = Verhalten wie erwartet
--   FEHL = Sicherheitsproblem oder unerwartetes Verhalten
--   Tests mit "(ab 004)" sind erst nach Migration 004 OK.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen
  a uuid;
  b uuid;
  a_school text;
  b_school text;
  other_school text;
  idea_a uuid;
  idea_b uuid;
  n bigint;
  log text := E'\n';
begin
  -- ---------- Vorbereitung (als Admin) ----------
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  if a is null or b is null then
    raise exception 'Bitte EMAIL_KONTO_A und EMAIL_KONTO_B eintragen – beide Konten müssen existieren.';
  end if;
  select school_id into a_school from public.profiles where id = a;
  select school_id into b_school from public.profiles where id = b;
  other_school := case when a_school = 'ers' then 'anka' else 'ers' end;

  -- Eine NICHT freigegebene Idee von Konto B (nur innerhalb dieses Tests)
  insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids)
  values (b, b_school, '[Rollback] Idee von B', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[b_school])
  returning id into idea_b;

  -- ---------- Ab hier: Konto A, genau wie in der App ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T1: eigene Idee für die eigene Schule anlegen -> soll klappen
  begin
    insert into public.ideas (school_id, title, summary, description, topics, school_ids)
    values (a_school, '[Rollback] Idee von A', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[a_school])
    returning id into idea_a;
    log := log || 'OK   T1 eigene Idee anlegen: erlaubt' || E'\n';
  exception when others then
    log := log || 'FEHL T1 eigene Idee anlegen wurde abgelehnt: ' || sqlerrm || E'\n';
  end;

  -- T2: Idee für eine ANDERE Schule -> muss abgelehnt werden
  begin
    insert into public.ideas (school_id, title, summary, description, topics, school_ids)
    values (other_school, '[Rollback] Fremde Schule', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[other_school]);
    log := log || 'FEHL T2 Idee für andere Schule wurde ERLAUBT' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T2 Idee für andere Schule: abgelehnt' || E'\n';
  end;

  -- T3: Idee im Namen von Konto B -> muss abgelehnt werden
  begin
    insert into public.ideas (author_id, school_id, title, summary, description, topics, school_ids)
    values (b, a_school, '[Rollback] Fremder Name', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[a_school]);
    log := log || 'FEHL T3 Idee im Namen einer anderen Person wurde ERLAUBT' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T3 Idee im Namen einer anderen Person: abgelehnt' || E'\n';
  end;

  -- T4: Idee direkt als "planned" anlegen -> muss abgelehnt werden
  begin
    insert into public.ideas (school_id, title, summary, description, topics, school_ids, status)
    values (a_school, '[Rollback] Status geschummelt', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[a_school], 'planned');
    log := log || 'FEHL T4 Status selbst gesetzt wurde ERLAUBT' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T4 Status selbst setzen: abgelehnt' || E'\n';
  end;

  -- T5: Status der eigenen Idee nachträglich ändern -> muss abgelehnt werden
  begin
    update public.ideas set status = 'planned' where id = idea_a;
    log := log || 'FEHL T5 Status ändern wurde ERLAUBT' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T5 Status ändern: abgelehnt' || E'\n';
  end;

  -- T6: nicht freigegebene Idee von B sehen -> darf nicht sichtbar sein (ab 004)
  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when n = 0 then 'OK   T6 nicht freigegebene fremde Idee: unsichtbar'
                     else 'FEHL T6 nicht freigegebene fremde Idee ist SICHTBAR (ab 004)' end || E'\n';

  -- T7: nicht freigegebene Idee von B unterstützen -> abgelehnt (ab 004)
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_b, a);
    log := log || 'FEHL T7 Unterstützung einer nicht freigegebenen Idee wurde ERLAUBT (ab 004)' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T7 Unterstützung einer nicht freigegebenen Idee: abgelehnt' || E'\n';
  end;

  -- T8: EIGENE Idee unterstützen -> abgelehnt (ab 004)
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_a, a);
    log := log || 'FEHL T8 eigene Idee unterstützen wurde ERLAUBT (ab 004)' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T8 eigene Idee unterstützen: abgelehnt' || E'\n';
  end;

  -- ---------- Admin gibt Idee B frei ----------
  reset role;
  update public.ideas set status = 'collecting' where id = idea_b;
  set local role authenticated;

  -- T9: freigegebene Idee von B sehen -> sichtbar
  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when n = 1 then 'OK   T9 freigegebene Idee: sichtbar'
                     else 'FEHL T9 freigegebene Idee ist NICHT sichtbar' end || E'\n';

  -- T10: freigegebene Idee unterstützen -> soll klappen
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_b, a);
    log := log || 'OK   T10 freigegebene Idee unterstützen: erlaubt' || E'\n';
  exception when others then
    log := log || 'FEHL T10 Unterstützung wurde abgelehnt: ' || sqlerrm || E'\n';
  end;

  -- T11: dieselbe Idee ein zweites Mal unterstützen -> muss abgelehnt werden
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_b, a);
    log := log || 'FEHL T11 doppelte Unterstützung wurde ERLAUBT' || E'\n';
  exception when unique_violation then
    log := log || 'OK   T11 doppelte Unterstützung: abgelehnt' || E'\n';
  end;

  -- T12: Zählfunktion zeigt genau 1 Unterstützung
  select coalesce(max(supporters), 0) into n from public.get_idea_support_counts() where idea_id = idea_b;
  log := log || case when n = 1 then 'OK   T12 Zählung nach Unterstützen: 1'
                     else 'FEHL T12 Zählung nach Unterstützen: ' || n end || E'\n';

  -- T13: Unterstützung entfernen -> Zählung 0
  delete from public.idea_supports where idea_id = idea_b and user_id = a;
  select coalesce(max(supporters), 0) into n from public.get_idea_support_counts() where idea_id = idea_b;
  log := log || case when n = 0 then 'OK   T13 Zählung nach Entfernen: 0'
                     else 'FEHL T13 Zählung nach Entfernen: ' || n end || E'\n';

  -- T14: Profil von B lesen -> muss leer bleiben (Profile sind privat)
  select count(*) into n from public.profiles where id = b;
  log := log || case when n = 0 then 'OK   T14 fremdes Profil: nicht lesbar'
                     else 'FEHL T14 fremdes Profil ist LESBAR' end || E'\n';

  -- T15: Idee von B löschen -> darf nichts löschen
  delete from public.ideas where id = idea_b;
  get diagnostics n = row_count;
  log := log || case when n = 0 then 'OK   T15 fremde Idee löschen: nichts gelöscht'
                     else 'FEHL T15 fremde Idee wurde GELÖSCHT' end || E'\n';

  -- T16: Zählfunktion kann nicht direkt manipuliert werden (es gibt keine Zähl-Spalte)
  begin
    execute 'update public.ideas set supporters = 99 where id = $1' using idea_b;
    log := log || 'FEHL T16 Zähl-Spalte existiert und ist änderbar' || E'\n';
  exception when undefined_column or insufficient_privilege then
    log := log || 'OK   T16 keine änderbare Zählung vorhanden' || E'\n';
  end;

  -- ---------- Ende: alles rückgängig machen ----------
  reset role;
  raise exception 'TESTERGEBNIS (alles wurde zurückgerollt):%', log;
end $$;
