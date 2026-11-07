-- =============================================================================
-- Sicherheitstest für die Admin-Funktionen (Migration 006) – speichert NICHTS dauerhaft
-- =============================================================================
-- WO? Empfohlen auf einer KOPIE (lokal "supabase start" oder Staging-Projekt).
--   Der Test schreibt nur VORÜBERGEHEND und rollt am Ende alles zurück. Er setzt dabei
--   aber kurz Sperren und löst Trigger aus – in der Live-Datenbank nur mit Freigabe und
--   nicht während echte Schüler:innen die App nutzen. Rein lesend: 006_readonly_checks.sql.
--
-- Wie ausführen?
--   1. EMAIL_KONTO_A (Admin) und EMAIL_KONTO_B (normale:r Schüler:in) eintragen.
--   2. Supabase Dashboard -> SQL Editor -> New query -> einfügen -> Run.
--   3. IMMER die ganze Datei ausführen (nichts markieren) und die letzte Zeile
--      (raise exception 'TESTERGEBNIS ...') NIE entfernen.
--
-- Der ganze Test ist EIN Befehl (ein do-Block) und endet IMMER mit dem Fehler
-- "TESTERGEBNIS". Dadurch wird ALLES rückgängig gemacht: Test-Events, Test-Ideen,
-- Anmeldungen, Unterstützungen und die vorübergehenden Änderungen an public.admins.
-- Die echte Admin-Zuweisung von Konto A bleibt also unverändert.
-- "ERROR: TESTERGEBNIS ..." ist NORMAL. OK = wie erwartet, FEHL = Problem.
-- Bricht der Test mit "ABBRUCH: ..." ab, wurde ebenfalls nichts gespeichert.
--
-- Simulation: Für jedes Konto werden request.jwt.claim.sub UND request.jwt.claims
-- gesetzt und danach geprüft, dass current_user = authenticated und auth.uid()
-- die erwartete ID liefert. Sonst bricht der Test ab.
--
-- Grenze: ECHTE Gleichzeitigkeit (zwei Sitzungen, die gleichzeitig um den letzten
-- Platz konkurrieren) lässt sich in EINER Sitzung grundsätzlich nicht nachstellen.
-- Getestet wird hier: der Trigger setzt Status-, Datums- und Platzregeln auch OHNE RLS
-- durch, bei INSERT und bei UPDATE zu 'registered', und "nur noch ein Platz frei"
-- nacheinander. Für den echten Zwei-Sitzungen-Test siehe
-- supabase/tests/capacity_concurrency_manual.sql.
-- =============================================================================

do $$
declare
  email_a constant text := 'EMAIL_KONTO_A';   -- <- eintragen (Admin)
  email_b constant text := 'EMAIL_KONTO_B';   -- <- eintragen (normal)
  a uuid;
  b uuid;
  a_school text;
  b_school text;
  ev uuid;        -- Haupt-Event (draft -> planned -> confirmed -> cancelled)
  ev_old uuid;    -- Entwurf mit vergangenem Datum
  ev_done uuid;   -- veröffentlichtes Event in der Vergangenheit (für completed)
  ev_open uuid;   -- veröffentlichtes Event in der Zukunft (Positivprobe Trigger)
  ev_cap uuid;    -- veröffentlichtes Event mit genau 1 Platz
  ev_trim uuid;   -- Event mit Leerzeichen um die Texte
  s_title jsonb;
  idea_a uuid;
  idea_b uuid;
  idea_c uuid;
  n bigint;
  st text;
  ok boolean;
  ev_start timestamptz;
  cj jsonb;
  c_title jsonb;
  c_start timestamptz;
  c_schools text[];
  c_topics text[];
  log text := E'\n';
begin
  -- ===========================================================================
  -- 0) Vorbereitung (als Rolle des SQL Editors)
  -- ===========================================================================
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.admin_list_events()') is null
     or to_regprocedure('public.event_registration_guard()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 005 und 006 ausführen.';
  end if;
  if email_a = 'EMAIL_KONTO_A' or email_b = 'EMAIL_KONTO_B' then
    raise exception 'ABBRUCH: Bitte EMAIL_KONTO_A und EMAIL_KONTO_B eintragen.';
  end if;

  select count(*) into n from auth.users where lower(email) = lower(email_a);
  if n <> 1 then raise exception 'ABBRUCH: Zu EMAIL_KONTO_A passen % Konten (erwartet: genau 1).', n; end if;
  select count(*) into n from auth.users where lower(email) = lower(email_b);
  if n <> 1 then raise exception 'ABBRUCH: Zu EMAIL_KONTO_B passen % Konten (erwartet: genau 1).', n; end if;
  select id into a from auth.users where lower(email) = lower(email_a);
  select id into b from auth.users where lower(email) = lower(email_b);
  if a = b then raise exception 'ABBRUCH: Konto A und B sind dasselbe Konto.'; end if;

  select school_id into a_school from public.profiles where id = a;
  select school_id into b_school from public.profiles where id = b;
  if a_school is null or b_school is null then
    raise exception 'ABBRUCH: Zu Konto A oder B fehlt das Profil.';
  end if;

  if not pg_has_role(current_user, 'authenticated', 'member') or not pg_has_role(current_user, 'anon', 'member') then
    raise exception 'ABBRUCH: Die Rolle % kann nicht zu authenticated/anon wechseln – Test wäre nicht aussagekräftig.', current_user;
  end if;

  log := log || 'INFO A war vor dem Test ' ||
         case when exists (select 1 from public.admins where user_id = a) then 'Admin'
              else 'KEIN Admin (wird nur im Test eingetragen)' end || E'\n';
  log := log || 'INFO B war vor dem Test ' ||
         case when exists (select 1 from public.admins where user_id = b) then 'ADMIN (wird nur im Test entfernt – bitte prüfen!)'
              else 'kein Admin' end || E'\n';

  -- Ausgangslage NUR für diesen Test (wird am Ende zurückgerollt)
  insert into public.admins (user_id, note) values (a, 'nur Test') on conflict (user_id) do nothing;
  delete from public.admins where user_id = b;

  -- ===========================================================================
  -- 1) Konto B (normal) – JEDE Admin-Funktion muss verweigert werden
  -- ===========================================================================
  -- >>> als B
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  log := log || 'OK   T0  Simulation aktiv: Rolle authenticated, auth.uid() = B' || E'\n';

  ok := public.is_admin();
  log := log || case when not ok then 'OK   T1  B: is_admin() = false' else 'FEHL T1  B ist Admin' end || E'\n';

  begin
    perform * from public.admin_list_events();
    log := log || 'FEHL T2  B kann admin_list_events() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T2  B: admin_list_events() verweigert' || E'\n'; end;
  begin
    perform public.admin_create_event('"Hack"'::jsonb, now() + interval '5 days', 'ers', array['ers']);
    log := log || 'FEHL T3  B kann admin_create_event() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T3  B: admin_create_event() verweigert' || E'\n'; end;
  begin
    perform public.admin_update_event(gen_random_uuid(), '"Hack"'::jsonb, now() + interval '5 days', 'ers', array['ers'],
                                      null, null, null, null, null, null, false, '{}', 'meetup');
    log := log || 'FEHL T4  B kann admin_update_event() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T4  B: admin_update_event() verweigert' || E'\n'; end;
  begin
    perform public.admin_set_event_status(gen_random_uuid(), 'planned');
    log := log || 'FEHL T5  B kann admin_set_event_status() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T5  B: admin_set_event_status() verweigert' || E'\n'; end;
  begin
    perform public.admin_delete_event(gen_random_uuid());
    log := log || 'FEHL T6  B kann admin_delete_event() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T6  B: admin_delete_event() verweigert' || E'\n'; end;
  begin
    perform * from public.admin_list_ideas(null);
    log := log || 'FEHL T7  B kann admin_list_ideas() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T7  B: admin_list_ideas() verweigert' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(gen_random_uuid(), 'collecting');
    log := log || 'FEHL T8  B kann admin_set_idea_status() nutzen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T8  B: admin_set_idea_status() verweigert' || E'\n'; end;
  begin
    perform public.admin_is_valid_text_json('"x"'::jsonb, 10, true);
    log := log || 'FEHL T9a B kann admin_is_valid_text_json() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T9a B: admin_is_valid_text_json() gesperrt' || E'\n'; end;
  begin
    perform public.admin_assert_event_input(null, null, null, null, null, null, null, null, null, null, null, null);
    log := log || 'FEHL T9b B kann admin_assert_event_input() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T9b B: admin_assert_event_input() gesperrt' || E'\n'; end;
  begin
    insert into public.events (title, start_at, host_school_id, school_ids, status)
    values ('"Hack"', now() + interval '5 days', 'ers', array['ers'], 'planned');
    log := log || 'FEHL T9c B kann direkt in events schreiben' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T9c B: direktes Schreiben in events verweigert' || E'\n'; end;
  begin
    insert into public.event_registrations (event_id, user_id, status) values (gen_random_uuid(), b, 'registered');
    log := log || 'FEHL T9d Anmeldung für unbekanntes Event ohne Fehler' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T9d unbekanntes Event: gleiche Ablehnung wie Entwurf (42501)' || E'\n'; end;

  -- ===========================================================================
  -- 2) Konto A (Admin) – Eingabeprüfung
  -- ===========================================================================
  -- >>> als A
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  ok := public.is_admin();
  log := log || case when ok then 'OK   T10 A: is_admin() = true' else 'FEHL T10 A ist kein Admin' end || E'\n';
  begin
    perform public.admin_assert_event_input(null, null, null, null, null, null, null, null, null, null, null, null);
    log := log || 'FEHL T10b auch Admin A kann die interne Prüf-Funktion direkt aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T10b interne Prüf-Funktion auch für Admins gesperrt' || E'\n'; end;

  -- Jede Zeile ändert genau EINE Angabe gegenüber einem gültigen Event
  for cj in
    select value from jsonb_array_elements($cases$[
      {"t": "T11a Titel als Liste",                    "title": ["x"]},
      {"t": "T11b Titel mit 121 Zeichen",              "title_len": 121},
      {"t": "T11c Titel mit unbekannter Sprache",      "title": {"fr": "x"}},
      {"t": "T11d Titel nur Leerzeichen",              "title": "   "},
      {"t": "T11e Titel leeres Objekt",                "title": {}},
      {"t": "T11f Titel mit leerer zweiter Sprache",   "title": {"de": "Gut", "tr": ""}},
      {"t": "T11g Titel mit Leerzeichen-Sprache",      "title": {"de": "Gut", "en": " \n "}},
      {"t": "T11h Titel mit Zahl als Wert",            "title": {"de": 5}},
      {"t": "T11i Titel-Sprache zu lang",              "title_obj_len": 121},
      {"t": "T11j Zusammenfassung leere Sprache",      "summary": {"de": "Ok", "en": ""}},
      {"t": "T11k Datum fehlt",                        "no_start": true},
      {"t": "T11l leere Schul-Liste",                  "schools": []},
      {"t": "T11m NULL in der Schul-Liste",            "schools": ["ers", null]},
      {"t": "T11n doppelte Schule",                    "schools": ["ers", "ers"]},
      {"t": "T11o leerer Schul-Eintrag",               "schools": ["ers", ""]},
      {"t": "T11p unbekannte Schule",                  "schools": ["ers", "unbekannt"]},
      {"t": "T11q Gastgeber nicht beteiligt",          "host": "anka", "schools": ["ers"]},
      {"t": "T11r Plätze = 0",                         "capacity": 0},
      {"t": "T11s Dauer = 0",                          "duration": 0},
      {"t": "T11t ungültiges Format",                  "format": "party"},
      {"t": "T11u NULL in der Themen-Liste",           "topics": ["music", null]},
      {"t": "T11v doppeltes Thema",                    "topics": ["music", "music"]},
      {"t": "T11w unbekanntes Thema",                  "topics": ["kochen"]},
      {"t": "T11x Thema mit Großbuchstaben",           "topics": ["Music"]}
    ]$cases$::jsonb)
  loop
    c_title := case when cj ? 'title_len' then to_jsonb(repeat('x', (cj ->> 'title_len')::int))
                    when cj ? 'title_obj_len' then jsonb_build_object('de', 'Gut', 'tr', repeat('x', (cj ->> 'title_obj_len')::int))
                    when cj ? 'title' then cj -> 'title'
                    else '"[Rollback] Gültig"'::jsonb end;
    c_start := case when cj ? 'no_start' then null else now() + interval '5 days' end;
    c_schools := case when cj ? 'schools' then array(select jsonb_array_elements_text(cj -> 'schools'))
                      else array['ers', 'anka'] end;
    c_topics := case when cj ? 'topics' then array(select jsonb_array_elements_text(cj -> 'topics'))
                     else array['languages'] end;
    begin
      perform public.admin_create_event(c_title, c_start, coalesce(cj ->> 'host', 'ers'), c_schools,
        cj -> 'summary', null, null, null, (cj ->> 'duration')::int, (cj ->> 'capacity')::int, false, c_topics,
        coalesce(cj ->> 'format', 'meetup'));
      log := log || 'FEHL ' || (cj ->> 't') || ': wurde AKZEPTIERT' || E'\n';
    exception
      when invalid_parameter_value then log := log || 'OK   ' || (cj ->> 't') || ': abgelehnt' || E'\n';
      when others then log := log || 'FEHL ' || (cj ->> 't') || ': anderer Fehler ' || sqlstate || ' ' || sqlerrm || E'\n';
    end;
  end loop;

  -- Gegenprobe: gültige Eingabe (dreisprachig) wird akzeptiert
  begin
    ev := public.admin_create_event('{"de": "[Rollback] Gültig", "tr": "[Rollback] Geçerli", "en": "[Rollback] Valid"}'::jsonb,
                                    now() + interval '5 days', 'ers', array['ers', 'anka'],
                                    '{"de": "Kurz"}'::jsonb, null, null, null, 90, 10, false, array['languages', 'culture'], 'meetup');
    log := log || 'OK   T11z gültige Eingabe wird akzeptiert (Gegenprobe)' || E'\n';
  exception when others then
    raise exception 'ABBRUCH: T11z gültige Eingabe abgelehnt (% %) – weitere Tests wären nicht aussagekräftig.', sqlstate, sqlerrm;
  end;

  -- Länge wird am GETRIMMTEN Wert gemessen; gespeichert wird getrimmt
  begin
    ev_trim := public.admin_create_event(
      jsonb_build_object('de', '   ' || repeat('x', 120) || E'  \n', 'en', '  Valid  '),
      now() + interval '5 days', 'ers', array['ers'], to_jsonb('  Kurz  '::text));
    select e.title, e.summary into s_title, c_title from public.admin_list_events() e where e.id = ev_trim;
    log := log || case when s_title = jsonb_build_object('de', repeat('x', 120), 'en', 'Valid')
                             and c_title = to_jsonb('Kurz'::text)
                       then 'OK   T11y 120 Zeichen + Leerzeichen akzeptiert und GETRIMMT gespeichert'
                       else 'FEHL T11y gespeichert: ' || s_title::text || ' / ' || coalesce(c_title::text, 'NULL') end || E'\n';
  exception when others then
    log := log || 'FEHL T11y 120 Zeichen + Leerzeichen abgelehnt: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  -- ===========================================================================
  -- 3) Entwürfe und Statuswechsel
  -- ===========================================================================
  select e.status into st from public.admin_list_events() e where e.id = ev;
  log := log || case when st = 'draft' then 'OK   T12 neues Event ist ein Entwurf'
                     else 'FEHL T12 neues Event hat Status ' || coalesce(st, 'NULL') end || E'\n';
  select count(*) into n from public.events where id = ev;
  log := log || case when n = 0 then 'OK   T13 Admin sieht den Entwurf NICHT in der normalen Event-Liste'
                     else 'FEHL T13 Entwurf erscheint in der normalen Liste des Admins' end || E'\n';

  begin
    perform public.admin_set_event_status(ev, 'cancelled');
    log := log || 'FEHL T14 draft -> cancelled erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T14 draft -> cancelled verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev, 'completed');
    log := log || 'FEHL T15 draft -> completed erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T15 draft -> completed verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev, 'draft');
    log := log || 'OK   T15b draft -> draft ist ein No-op' || E'\n';
  exception when others then log := log || 'FEHL T15b draft -> draft ergab Fehler ' || sqlstate || E'\n'; end;

  -- Entwurf mit vergangenem Datum: nicht veröffentlichbar, aber löschbar
  ev_old := public.admin_create_event('"[Rollback] Vergangen"'::jsonb, now() - interval '1 day', 'ers', array['ers']);
  begin
    perform public.admin_set_event_status(ev_old, 'planned');
    log := log || 'FEHL T16 Event in der Vergangenheit veröffentlicht' || E'\n';
  exception when sqlstate 'DC002' then log := log || 'OK   T16 Veröffentlichen mit vergangenem Datum verweigert (DC002)' || E'\n'; end;
  begin
    perform public.admin_delete_event(ev_old);
    select count(*) into n from public.admin_list_events() e where e.id = ev_old;
    log := log || case when n = 0 then 'OK   T17 leerer Entwurf gelöscht' else 'FEHL T17 leerer Entwurf noch vorhanden' end || E'\n';
  exception when others then
    log := log || 'FEHL T17 leerer Entwurf konnte nicht gelöscht werden: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  -- Unbekannte IDs und ungültige Status
  begin
    perform public.admin_set_event_status(gen_random_uuid(), 'planned');
    log := log || 'FEHL T18 unbekannte ID (Status) ohne Fehler' || E'\n';
  exception when no_data_found then log := log || 'OK   T18 unbekannte ID (Status): nicht gefunden' || E'\n'; end;
  begin
    perform public.admin_update_event(gen_random_uuid(), '"x"'::jsonb, now() + interval '5 days', 'ers', array['ers'],
                                      null, null, null, null, null, null, false, '{}', 'meetup');
    log := log || 'FEHL T19 unbekannte ID (Bearbeiten) ohne Fehler' || E'\n';
  exception when no_data_found then log := log || 'OK   T19 unbekannte ID (Bearbeiten): nicht gefunden' || E'\n'; end;
  begin
    perform public.admin_delete_event(gen_random_uuid());
    log := log || 'FEHL T20 unbekannte ID (Löschen) ohne Fehler' || E'\n';
  exception when no_data_found then log := log || 'OK   T20 unbekannte ID (Löschen): nicht gefunden' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev, 'gibtsnicht');
    log := log || 'FEHL T21 ungültiger Event-Status akzeptiert' || E'\n';
  exception when invalid_parameter_value then log := log || 'OK   T21 ungültiger Event-Status abgelehnt' || E'\n'; end;

  -- ===========================================================================
  -- 4) B: Entwurf unsichtbar, keine Anmeldung möglich
  -- ===========================================================================
  -- >>> als B
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.events where id = ev;
  log := log || case when n = 0 then 'OK   T22 B sieht den Entwurf nicht' else 'FEHL T22 B sieht den ENTWURF' end || E'\n';
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev, b, 'registered');
    log := log || 'FEHL T23 B konnte sich für einen Entwurf anmelden' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T23 Anmeldung für Entwurf verweigert' || E'\n'; end;

  -- ===========================================================================
  -- 5) Veröffentlichen, Anmelden, Bearbeiten, Plätze, Datum, Absagen
  -- ===========================================================================
  -- >>> als A
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  perform public.admin_set_event_status(ev, 'planned');
  select e.status, e.start_at into st, ev_start from public.admin_list_events() e where e.id = ev;
  log := log || case when st = 'planned' then 'OK   T24 draft -> planned (veröffentlicht)'
                     else 'FEHL T24 Status nach Veröffentlichen: ' || coalesce(st, 'NULL') end || E'\n';
  begin
    perform public.admin_set_event_status(ev, 'planned');
    log := log || 'OK   T24b planned -> planned ist ein No-op' || E'\n';
  exception when others then log := log || 'FEHL T24b planned -> planned ergab Fehler ' || sqlstate || E'\n'; end;

  -- A meldet sich selbst an (normaler Schüler-Weg) – für den Plätze-Test
  insert into public.event_registrations (event_id, user_id, status) values (ev, a, 'registered');

  -- >>> als B: meldet sich an
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.events where id = ev;
  log := log || case when n = 1 then 'OK   T25 veröffentlichtes Event für B sichtbar'
                     else 'FEHL T25 veröffentlichtes Event für B unsichtbar' end || E'\n';
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev, b, 'registered');
    log := log || 'OK   T26 B kann sich anmelden' || E'\n';
  exception when others then
    log := log || 'FEHL T26 Anmeldung abgelehnt: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  -- >>> als A
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  -- Nie zurück zum Entwurf, nie löschen
  begin
    perform public.admin_set_event_status(ev, 'draft');
    log := log || 'FEHL T27 planned -> draft erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T27 planned -> draft verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_delete_event(ev);
    log := log || 'FEHL T28 veröffentlichtes Event wurde GELÖSCHT' || E'\n';
  exception when sqlstate 'DC003' then log := log || 'OK   T28 veröffentlichtes Event kann nicht gelöscht werden (DC003)' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev, 'completed');
    log := log || 'FEHL T28b zukünftiges Event abgeschlossen' || E'\n';
  exception when sqlstate 'DC007' then log := log || 'OK   T28b zukünftiges Event kann nicht abgeschlossen werden (DC007)' || E'\n'; end;

  -- Plätze: 2 verbindliche Anmeldungen (A und B)
  begin
    perform public.admin_update_event(ev, '"[Rollback] Gültig"'::jsonb, ev_start, 'ers', array['ers', 'anka'],
                                      null, null, null, null, 90, 1, false, array['languages'], 'meetup');
    log := log || 'FEHL T29 Plätze unter die Anmeldezahl reduziert' || E'\n';
  exception when sqlstate 'DC005' then log := log || 'OK   T29 Plätze < Anmeldungen verweigert (DC005)' || E'\n'; end;

  -- Bearbeiten mit gleichem Datum und Plätzen = Anmeldezahl: Status und Anmeldungen unverändert
  perform public.admin_update_event(ev, '"[Rollback] Neuer Titel"'::jsonb, ev_start, 'ers', array['ers', 'anka'],
                                    null, null, null, null, 90, 2, false, array['languages'], 'meetup');
  select e.status, e.registered_count into st, n from public.admin_list_events() e where e.id = ev;
  log := log || case when st = 'planned' and n = 2 then 'OK   T30 Bearbeiten: Status bleibt planned, 2 Anmeldungen bleiben'
                     else 'FEHL T30 nach Bearbeiten: Status ' || coalesce(st, 'NULL') || ', Anmeldungen ' || coalesce(n::text, 'NULL') end || E'\n';

  -- ECHTER Beweis: A sieht die Anmeldung von B direkt NICHT (RLS), die Admin-Funktion zählt sie trotzdem
  select count(*) into n from public.event_registrations where event_id = ev and user_id = b;
  log := log || case when n = 0 then 'OK   T31 A sieht die Anmeldung von B direkt nicht – Admin-Zählung (2) enthält fremde Daten'
                     else 'FEHL T31 A kann fremde Anmeldungen DIREKT lesen' end || E'\n';

  -- Datum: veröffentlichtes Event nicht in die Vergangenheit verschieben
  begin
    perform public.admin_update_event(ev, '"[Rollback] Neuer Titel"'::jsonb, now() - interval '1 hour', 'ers', array['ers', 'anka'],
                                      null, null, null, null, 90, 2, false, array['languages'], 'meetup');
    log := log || 'FEHL T32 veröffentlichtes Event in die Vergangenheit verschoben' || E'\n';
  exception when sqlstate 'DC002' then log := log || 'OK   T32 veröffentlichtes Event nicht in die Vergangenheit verschiebbar (DC002)' || E'\n'; end;
  -- Verschieben in die Zukunft ist erlaubt
  ev_start := ev_start + interval '1 day';
  perform public.admin_update_event(ev, '"[Rollback] Neuer Titel"'::jsonb, ev_start, 'ers', array['ers', 'anka'],
                                    null, null, null, null, 90, 2, false, array['languages'], 'meetup');
  log := log || 'OK   T33 veröffentlichtes Event in die Zukunft verschoben' || E'\n';

  -- planned -> confirmed -> cancelled; Anmeldungen bleiben
  perform public.admin_set_event_status(ev, 'confirmed');
  begin
    perform public.admin_set_event_status(ev, 'draft');
    log := log || 'FEHL T34 confirmed -> draft erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T34 confirmed -> draft verweigert (DC004)' || E'\n'; end;
  perform public.admin_set_event_status(ev, 'cancelled');
  select e.status, e.registered_count into st, n from public.admin_list_events() e where e.id = ev;
  log := log || case when st = 'cancelled' and n = 2 then 'OK   T35 planned -> confirmed -> cancelled: 2 Anmeldungen bleiben erhalten'
                     else 'FEHL T35 nach Absagen: Status ' || coalesce(st, 'NULL') || ', Anmeldungen ' || coalesce(n::text, 'NULL') end || E'\n';

  begin
    perform public.admin_set_event_status(ev, 'planned');
    log := log || 'FEHL T36 cancelled -> planned erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T36 cancelled -> planned verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev, 'completed');
    log := log || 'FEHL T37 cancelled -> completed erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T37 cancelled -> completed verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_update_event(ev, '"[Rollback] Neuer Titel"'::jsonb, ev_start + interval '1 day', 'ers', array['ers', 'anka'],
                                      null, null, null, null, 90, 2, false, array['languages'], 'meetup');
    log := log || 'FEHL T38 Datum eines abgesagten Events geändert' || E'\n';
  exception when sqlstate 'DC006' then log := log || 'OK   T38 Datum eines abgesagten Events fest (DC006)' || E'\n'; end;
  begin
    perform public.admin_update_event(ev, '"[Rollback] Abgesagt – Text korrigiert"'::jsonb, ev_start, 'ers', array['ers', 'anka'],
                                      null, null, null, null, 90, 2, false, array['languages'], 'meetup');
    log := log || 'OK   T39 Text eines abgesagten Events (gleiches Datum) korrigierbar' || E'\n';
  exception when others then log := log || 'FEHL T39 Textkorrektur verweigert: ' || sqlstate || E'\n'; end;

  -- ===========================================================================
  -- 6) Sperr-Trigger – Regeln gelten auch OHNE RLS (als Rolle des SQL Editors)
  -- ===========================================================================
  reset role;
  ev_open := public.admin_create_event('"[Rollback] Offen"'::jsonb, now() + interval '9 days', 'ers', array['ers']);
  -- (admin_create_event als Editor-Rolle: is_admin() prüft auth.uid() = A, siehe request.jwt.claims)
  perform public.admin_set_event_status(ev_open, 'planned');

  -- Direktes Einfügen als Eigentümer (RLS greift nicht) – nur der Trigger schützt
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev, b, 'interested');
    log := log || 'FEHL T40 Trigger lässt Anmeldung für abgesagtes Event zu (ohne RLS)' || E'\n';
  exception
    when insufficient_privilege then log := log || 'OK   T40 Trigger blockiert abgesagtes Event auch ohne RLS' || E'\n';
    when unique_violation then log := log || 'FEHL T40 Trigger hat nicht vor der Datenbank-Regel abgelehnt' || E'\n';
  end;
  ev_old := public.admin_create_event('"[Rollback] Entwurf 2"'::jsonb, now() + interval '9 days', 'ers', array['ers']);
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev_old, b, 'registered');
    log := log || 'FEHL T41 Trigger lässt Anmeldung für Entwurf zu (ohne RLS)' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T41 Trigger blockiert Entwurf auch ohne RLS' || E'\n'; end;
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev_open, b, 'registered');
    log := log || 'OK   T42 Trigger lässt gültige Anmeldung zu (Gegenprobe)' || E'\n';
  exception when others then log := log || 'FEHL T42 gültige Anmeldung vom Trigger blockiert: ' || sqlstate || ' ' || sqlerrm || E'\n'; end;
  begin
    update public.event_registrations set event_id = ev where event_id = ev_open and user_id = b;
    log := log || 'FEHL T43 Anmeldung konnte auf ein anderes Event verschoben werden' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T43 Verschieben einer Anmeldung blockiert' || E'\n'; end;

  -- UPDATE-Umgehung: interested -> registered, nachdem das Event in der Vergangenheit liegt
  update public.event_registrations set status = 'interested' where event_id = ev_open and user_id = b;
  update public.events set start_at = now() - interval '1 hour' where id = ev_open;   -- direkt, nur im Test
  begin
    update public.event_registrations set status = 'registered' where event_id = ev_open and user_id = b;
    log := log || 'FEHL T43b interested -> registered für vergangenes Event möglich (ohne RLS)' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T43b interested -> registered für vergangenes Event blockiert (Trigger, ohne RLS)' || E'\n';
  end;

  -- Veröffentlichtes Event in der Vergangenheit (direkt angelegt) -> abschließen
  insert into public.events (title, start_at, host_school_id, school_ids, status)
  values ('"[Rollback] Vorbei"', now() - interval '2 hours', 'ers', array['ers'], 'planned')
  returning id into ev_done;

  -- >>> als A
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  begin
    perform public.admin_set_event_status(ev_done, 'completed');
    log := log || 'OK   T44 vergangenes Event: planned -> completed' || E'\n';
  exception when others then log := log || 'FEHL T44 Abschließen verweigert: ' || sqlstate || ' ' || sqlerrm || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev_done, 'planned');
    log := log || 'FEHL T45 completed -> planned erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T45 completed -> planned verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_event_status(ev_done, 'cancelled');
    log := log || 'FEHL T46 completed -> cancelled erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T46 completed -> cancelled verweigert (DC004)' || E'\n'; end;

  -- ===========================================================================
  -- 7) B nach dem Absagen: Schüler-Regeln unverändert
  -- ===========================================================================
  -- >>> als B
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.events where id = ev and status = 'cancelled';
  log := log || case when n = 1 then 'OK   T47 abgesagtes Event bleibt für B sichtbar (wie bisher)'
                     else 'FEHL T47 abgesagtes Event für B unsichtbar' end || E'\n';
  update public.event_registrations set status = 'interested' where event_id = ev and user_id = b;
  get diagnostics n = row_count;
  log := log || case when n = 1 then 'OK   T48 B kann registered -> interested weiter ändern (wie bisher)'
                     else 'FEHL T48 Statusänderung der eigenen Anmeldung nicht möglich' end || E'\n';
  begin
    update public.event_registrations set status = 'registered' where event_id = ev and user_id = b;
    log := log || 'FEHL T48b interested -> registered für abgesagtes Event möglich (UPDATE-Umgehung)' || E'\n';
  exception when insufficient_privilege then
    log := log || 'OK   T48b interested -> registered für abgesagtes Event blockiert' || E'\n';
  end;
  delete from public.event_registrations where event_id = ev and user_id = b;
  get diagnostics n = row_count;
  log := log || case when n = 1 then 'OK   T49 B kann die eigene Anmeldung entfernen'
                     else 'FEHL T49 B konnte die eigene Anmeldung nicht entfernen' end || E'\n';
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev, b, 'registered');
    log := log || 'FEHL T50 neue Anmeldung für abgesagtes Event möglich' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T50 keine neue Anmeldung für abgesagtes Event' || E'\n'; end;

  -- ===========================================================================
  -- 7b) Plätze: nur noch EIN Platz frei (nacheinander; Gleichzeitigkeit siehe Datei-Kopf)
  -- ===========================================================================
  -- >>> als A: Event mit genau 1 Platz anlegen, veröffentlichen, selbst den Platz belegen
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  ev_cap := public.admin_create_event('"[Rollback] Ein Platz"'::jsonb, now() + interval '8 days', 'ers', array['ers', 'anka'],
                                      null, null, null, null, 60, 1, false, '{}', 'meetup');
  perform public.admin_set_event_status(ev_cap, 'planned');
  insert into public.event_registrations (event_id, user_id, status) values (ev_cap, a, 'registered');
  log := log || 'OK   T50a A belegt den einzigen Platz' || E'\n';

  -- >>> als B
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev_cap, b, 'registered');
    log := log || 'FEHL T50b verbindliche Anmeldung trotz vollem Event' || E'\n';
  exception when sqlstate 'DC008' then log := log || 'OK   T50b volles Event: verbindliche Anmeldung verweigert (DC008)' || E'\n'; end;
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev_cap, b, 'interested');
    log := log || 'OK   T50c volles Event: "interessiert" bleibt möglich' || E'\n';
  exception when others then log := log || 'FEHL T50c "interessiert" verweigert: ' || sqlstate || E'\n'; end;
  begin
    update public.event_registrations set status = 'registered' where event_id = ev_cap and user_id = b;
    log := log || 'FEHL T50d interested -> registered trotz vollem Event (UPDATE-Umgehung)' || E'\n';
  exception when sqlstate 'DC008' then log := log || 'OK   T50d volles Event: interested -> registered verweigert (DC008)' || E'\n'; end;

  -- >>> als A: gibt den Platz frei
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  delete from public.event_registrations where event_id = ev_cap and user_id = a;

  -- >>> als B: rückt nach
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  begin
    update public.event_registrations set status = 'registered' where event_id = ev_cap and user_id = b;
    get diagnostics n = row_count;
    log := log || case when n = 1 then 'OK   T50e freier Platz: interested -> registered erlaubt'
                       else 'FEHL T50e keine Zeile geändert' end || E'\n';
  exception when others then log := log || 'FEHL T50e Nachrücken verweigert: ' || sqlstate || ' ' || sqlerrm || E'\n'; end;

  -- >>> als A: Platz ist jetzt wieder belegt
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  begin
    insert into public.event_registrations (event_id, user_id, status) values (ev_cap, a, 'registered');
    log := log || 'FEHL T50f zweite verbindliche Anmeldung bei 1 Platz' || E'\n';
  exception when sqlstate 'DC008' then log := log || 'OK   T50f Platz belegt: zweite verbindliche Anmeldung verweigert (DC008)' || E'\n'; end;
  select e.registered_count into n from public.admin_list_events() e where e.id = ev_cap;
  log := log || case when n = 1 then 'OK   T50g Kapazität eingehalten: genau 1 verbindliche Anmeldung'
                     else 'FEHL T50g ' || coalesce(n::text, 'NULL') || ' verbindliche Anmeldungen bei 1 Platz' end || E'\n';

  -- >>> zurück zu B (für die Ideen-Tests)
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  -- ===========================================================================
  -- 8) Ideen
  -- ===========================================================================
  -- B reicht zwei Ideen ein (normaler Schüler-Weg)
  insert into public.ideas (school_id, title, summary, description, topics, school_ids)
  values (b_school, '[Rollback] Idee B1', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{languages}', array[b_school])
  returning id into idea_b;
  insert into public.ideas (school_id, title, summary, description, topics, school_ids)
  values (b_school, '[Rollback] Idee B2', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{science}', array[b_school])
  returning id into idea_c;

  -- >>> als A: reicht ebenfalls eine Idee ein und moderiert
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  insert into public.ideas (school_id, title, summary, description, topics, school_ids)
  values (a_school, '[Rollback] Idee A', 'Kurz', 'Testbeschreibung mit mehr als zwanzig Zeichen', '{music}', array[a_school])
  returning id into idea_a;

  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when n = 0 then 'OK   T51 eingereichte fremde Idee in der normalen Liste des Admins unsichtbar'
                     else 'FEHL T51 eingereichte fremde Idee in der normalen Liste des Admins' end || E'\n';
  select count(*) into n from public.admin_list_ideas('submitted') i where i.id = idea_b;
  log := log || case when n = 1 then 'OK   T52 eingereichte Idee nur über admin_list_ideas() sichtbar'
                     else 'FEHL T52 eingereichte Idee fehlt in admin_list_ideas()' end || E'\n';

  -- Ungültige Übergänge aus "submitted"
  begin
    perform public.admin_set_idea_status(idea_b, 'review');
    log := log || 'FEHL T53 submitted -> review erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T53 submitted -> review verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'planned');
    log := log || 'FEHL T54 submitted -> planned erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T54 submitted -> planned verweigert (DC004)' || E'\n'; end;

  -- Freigeben
  perform public.admin_set_idea_status(idea_b, 'collecting');
  perform public.admin_set_idea_status(idea_c, 'collecting');
  perform public.admin_set_idea_status(idea_a, 'collecting');
  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when n = 1 then 'OK   T55 freigegebene Idee in der normalen Liste sichtbar'
                     else 'FEHL T55 freigegebene Idee nicht sichtbar' end || E'\n';
  begin
    perform public.admin_set_idea_status(idea_b, 'submitted');
    log := log || 'FEHL T56 collecting -> submitted erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T56 collecting -> submitted verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'planned');
    log := log || 'FEHL T57 collecting -> planned erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T57 collecting -> planned verweigert (DC004)' || E'\n'; end;

  -- Weg bis "planned" (endgültig)
  perform public.admin_set_idea_status(idea_c, 'review');
  perform public.admin_set_idea_status(idea_c, 'planned');
  select i.status into st from public.admin_list_ideas(null) i where i.id = idea_c;
  log := log || case when st = 'planned' then 'OK   T58 collecting -> review -> planned'
                     else 'FEHL T58 Status ist ' || coalesce(st, 'NULL') end || E'\n';
  begin
    perform public.admin_set_idea_status(idea_c, 'collecting');
    log := log || 'FEHL T59 planned -> collecting erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T59 planned -> collecting verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_c, 'rejected');
    log := log || 'FEHL T60 planned -> rejected erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T60 planned -> rejected verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_c, 'planned');
    log := log || 'OK   T61 planned -> planned ist ein No-op' || E'\n';
  exception when others then log := log || 'FEHL T61 planned -> planned ergab Fehler ' || sqlstate || E'\n'; end;

  -- >>> als B: sieht die freigegebene Idee von A und unterstützt sie
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.ideas where id = idea_a;
  log := log || case when n = 1 then 'OK   T62 freigegebene Idee für Schüler:in B sichtbar'
                     else 'FEHL T62 freigegebene Idee für B unsichtbar' end || E'\n';
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_a, b);
    log := log || 'OK   T63 B unterstützt die freigegebene Idee von A' || E'\n';
  exception when others then
    log := log || 'FEHL T63 Unterstützung abgelehnt: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  -- >>> als A: ECHTER Beweis, dass der Admin fremde Unterstützungen zählt
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.idea_supports where idea_id = idea_a;
  log := log || case when n = 0 then 'OK   T64 A sieht die Unterstützung von B direkt nicht (RLS)'
                     else 'FEHL T64 A kann fremde Unterstützungen DIREKT lesen' end || E'\n';
  select i.supporters into n from public.admin_list_ideas(null) i where i.id = idea_a;
  log := log || case when n = 1 then 'OK   T65 admin_list_ideas() zählt die fremde Unterstützung von B (1)'
                     else 'FEHL T65 admin_list_ideas() zählt ' || coalesce(n::text, 'NULL') || ' statt 1' end || E'\n';

  -- Ablehnen
  perform public.admin_set_idea_status(idea_b, 'rejected');
  perform public.admin_set_idea_status(idea_a, 'rejected');
  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when n = 0 then 'OK   T66 abgelehnte fremde Idee für andere unsichtbar'
                     else 'FEHL T66 abgelehnte fremde Idee ist SICHTBAR' end || E'\n';
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_b, a);
    log := log || 'FEHL T67 abgelehnte Idee konnte unterstützt werden' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T67 abgelehnte Idee kann nicht unterstützt werden' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'collecting');
    log := log || 'FEHL T68 rejected -> collecting erlaubt (direkte Freigabe)' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T68 rejected -> collecting verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'review');
    log := log || 'FEHL T68b rejected -> review erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T68b rejected -> review verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'planned');
    log := log || 'FEHL T68c rejected -> planned erlaubt' || E'\n';
  exception when sqlstate 'DC004' then log := log || 'OK   T68c rejected -> planned verweigert (DC004)' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(idea_b, 'gibtsnicht');
    log := log || 'FEHL T69 ungültiger Ideen-Status akzeptiert' || E'\n';
  exception when invalid_parameter_value then log := log || 'OK   T69 ungültiger Ideen-Status abgelehnt' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(gen_random_uuid(), 'collecting');
    log := log || 'FEHL T70 unbekannte Ideen-ID ohne Fehler' || E'\n';
  exception when no_data_found then log := log || 'OK   T70 unbekannte Ideen-ID: nicht gefunden' || E'\n'; end;
  select i.supporters into n from public.admin_list_ideas('rejected') i where i.id = idea_a;
  log := log || case when n = 1 then 'OK   T71 Admin sieht die Zahl der abgelehnten Idee weiterhin (1)'
                     else 'FEHL T71 Admin sieht ' || coalesce(n::text, 'NULL') end || E'\n';

  -- >>> als B: abgelehnte Ideen aus Sicht einer Schülerin / eines Schülers
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from b then
    raise exception 'ABBRUCH: Simulation von Konto B fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  select count(*) into n from public.ideas where id = idea_a;
  log := log || case when n = 0 then 'OK   T72 abgelehnte Idee von A für B unsichtbar'
                     else 'FEHL T72 abgelehnte Idee von A für B SICHTBAR' end || E'\n';
  select count(*) into n from public.get_idea_support_counts() c where c.idea_id = idea_a;
  log := log || case when n = 0 then 'OK   T73 get_idea_support_counts() verrät keine Zahl der abgelehnten Idee'
                     else 'FEHL T73 get_idea_support_counts() zeigt die abgelehnte Idee' end || E'\n';
  select count(*) into n from public.ideas where id = idea_b and status = 'rejected';
  log := log || case when n = 1 then 'OK   T74 Autor:in B sieht die eigene abgelehnte Idee'
                     else 'FEHL T74 Autor:in B sieht die eigene abgelehnte Idee nicht' end || E'\n';
  delete from public.idea_supports where idea_id = idea_a and user_id = b;
  get diagnostics n = row_count;
  log := log || case when n = 1 then 'OK   T75 B kann die eigene Unterstützung entfernen'
                     else 'FEHL T75 B konnte die eigene Unterstützung nicht entfernen' end || E'\n';
  begin
    insert into public.idea_supports (idea_id, user_id) values (idea_a, b);
    log := log || 'FEHL T76 abgelehnte Idee erneut unterstützt' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T76 abgelehnte Idee kann nicht neu unterstützt werden' || E'\n'; end;
  begin
    update public.ideas set status = 'collecting' where id = idea_b;
    log := log || 'FEHL T77 Autor:in kann den Status der eigenen Idee ändern' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T77 Autor:in kann den Status nicht selbst ändern' || E'\n'; end;

  -- >>> als A: Ablehnung zurücknehmen = erneut prüfen (nicht direkt freigeben)
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;
  perform public.admin_set_idea_status(idea_b, 'submitted');
  select i.status into st from public.admin_list_ideas(null) i where i.id = idea_b;
  select count(*) into n from public.ideas where id = idea_b;
  log := log || case when st = 'submitted' and n = 0 then 'OK   T78 rejected -> submitted: wieder in Prüfung, für andere unsichtbar'
                     else 'FEHL T78 Status ' || coalesce(st, 'NULL') || ', sichtbar ' || n end || E'\n';

  -- ===========================================================================
  -- 9) Datenschutz der Admin-Listen (als Rolle des SQL Editors)
  -- ===========================================================================
  reset role;
  log := log || case when pg_get_function_result('public.admin_list_events()'::regprocedure) !~* '(user|author|email|first_name|grade)'
                     then 'OK   T79 admin_list_events() gibt keine personenbezogenen Spalten aus'
                     else 'FEHL T79 admin_list_events() gibt personenbezogene Spalten aus' end || E'\n';
  log := log || case when pg_get_function_result('public.admin_list_ideas(text)'::regprocedure) !~* '(user|author|email|first_name|grade)'
                     then 'OK   T80 admin_list_ideas() gibt keine personenbezogenen Spalten aus'
                     else 'FEHL T80 admin_list_ideas() gibt personenbezogene Spalten aus' end || E'\n';

  -- ===========================================================================
  -- 10) Besucher ohne Login (anon)
  -- ===========================================================================
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'ABBRUCH: Simulation als Besucher fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  begin
    perform * from public.admin_list_events();
    log := log || 'FEHL T81 Besucher können admin_list_events() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T81 Besucher: admin_list_events() gesperrt' || E'\n'; end;
  begin
    perform * from public.admin_list_ideas(null);
    log := log || 'FEHL T82 Besucher können admin_list_ideas() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T82 Besucher: admin_list_ideas() gesperrt' || E'\n'; end;
  begin
    perform public.admin_create_event('"Hack"'::jsonb, now() + interval '5 days', 'ers', array['ers']);
    log := log || 'FEHL T83 Besucher können admin_create_event() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T83 Besucher: admin_create_event() gesperrt' || E'\n'; end;
  begin
    perform public.admin_set_idea_status(gen_random_uuid(), 'collecting');
    log := log || 'FEHL T84 Besucher können admin_set_idea_status() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T84 Besucher: admin_set_idea_status() gesperrt' || E'\n'; end;
  begin
    perform 1 from public.events limit 1;
    log := log || 'FEHL T85 Besucher können events lesen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T85 Besucher: events gesperrt (wie bisher)' || E'\n'; end;
  begin
    perform public.is_admin();
    log := log || 'FEHL T86 Besucher können is_admin() aufrufen' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T86 Besucher: is_admin() gesperrt' || E'\n'; end;

  -- ===========================================================================
  -- 11) Admin-Rechte entziehen wirkt sofort (wird am Ende zurückgerollt)
  -- ===========================================================================
  reset role;
  delete from public.admins where user_id = a;

  -- >>> als A
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'ABBRUCH: Simulation von Konto A fehlgeschlagen (Rolle %, auth.uid() %).', current_user, auth.uid();
  end if;

  ok := public.is_admin();
  log := log || case when not ok then 'OK   T87 nach dem Entziehen: is_admin() = false'
                     else 'FEHL T87 nach dem Entziehen noch Admin' end || E'\n';
  begin
    perform * from public.admin_list_events();
    log := log || 'FEHL T88 nach dem Entziehen noch Zugriff auf admin_list_events()' || E'\n';
  exception when insufficient_privilege then log := log || 'OK   T88 nach dem Entziehen: Admin-Funktionen sofort gesperrt' || E'\n'; end;
  reset role;

  -- ===========================================================================
  -- Ende: ALLES rückgängig machen (diese Zeile niemals entfernen)
  -- ===========================================================================
  raise exception 'TESTERGEBNIS (alles wurde zurückgerollt):%', log;
end $$;
