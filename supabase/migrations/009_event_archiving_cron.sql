-- =============================================================================
-- 009 – Zeitplan: Events stündlich automatisch archivieren (pg_cron)
-- =============================================================================
-- ÜBERHOLT durch 018/019 (automatisches Löschen, jede Minute): Löschen ist immer vor dem
-- Archivieren fällig. Nicht mehr nötig – 019 entfernt diesen Job, falls er existiert.
-- =============================================================================
-- Ausführen NACH 008 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-
-- Eigentümer (postgres) – derselben Rolle, der archive_finished_events gehört.
-- IMMER die ganze Datei ausführen. Kann gefahrlos mehrfach ausgeführt werden
-- (ein vorhandener Job mit demselben Namen wird ersetzt, nie verdoppelt).
--
-- Warum pg_cron?
--   * Läuft IN der Datenbank – auch wenn niemand die Website offen hat.
--   * Braucht keinen Server, keine Edge Function und KEINEN Service-Role-Key.
--   * Supabase bietet pg_cron offiziell an ("Integrations -> Cron" bzw.
--     "Database -> Extensions -> pg_cron").
--   * pg_cron führt einen Job mit der Rolle aus, die ihn angelegt hat (cron.job.username).
--     Hier ist das der Eigentümer von archive_finished_events – nur er darf sie ausführen.
--     Die Funktion löscht nichts, setzt nur archived_at (Migration 008).
--
-- Zeitplan: jede Stunde zur Minute 7 (z. B. 10:07, 11:07 …). Cron rechnet in UTC –
-- das ist egal, weil archive_finished_events nur mit timestamptz vergleicht.
-- Die Datenbank archiviert also spätestens ~1 Stunde nach Ablauf der 24 Stunden;
-- die App blendet das Event bereits pünktlich aus.
--
-- Rückgängig machen (falls nötig):
--   select cron.unschedule('dc_archive_finished_events');
-- =============================================================================

begin;

-- 1) Erweiterung aktivieren (falls noch nicht geschehen)
create extension if not exists pg_cron;

do $$
declare
  fn_owner name;
begin
  if to_regprocedure('public.archive_finished_events()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 008 ausführen.';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'ABBRUCH: pg_cron ist nicht verfügbar. Bitte im Dashboard unter Database -> Extensions aktivieren.';
  end if;
  -- Der Job läuft später mit DIESER Rolle – sie muss Eigentümerin der Funktion sein
  select pg_get_userbyid(proowner) into fn_owner
  from pg_proc where oid = 'public.archive_finished_events()'::regprocedure;
  if current_user is distinct from fn_owner then
    raise exception 'ABBRUCH: Bitte als % ausführen (Eigentümer von archive_finished_events), nicht als %.', fn_owner, current_user;
  end if;
  if not has_function_privilege(current_user, 'public.archive_finished_events()', 'EXECUTE') then
    raise exception 'ABBRUCH: % darf archive_finished_events nicht ausführen.', current_user;
  end if;
end $$;

-- 2) Vorhandenen Job gleichen Namens entfernen (verhindert doppelte Jobs)
select cron.unschedule(jobid) from cron.job where jobname = 'dc_archive_finished_events';

-- 3) Job anlegen: stündlich zur Minute 7 (läuft in DIESER Datenbank als current_user)
select cron.schedule(
  'dc_archive_finished_events',
  '7 * * * *',
  'select public.archive_finished_events();'
);

-- 4) Prüfen: genau ein Job, richtiger Befehl, aktiv, in dieser Datenbank, als Eigentümer
--    der Funktion, und diese Rolle darf die Funktion ausführen
do $$
declare
  n integer;
  fn_owner name := (select pg_get_userbyid(proowner) from pg_proc
                    where oid = 'public.archive_finished_events()'::regprocedure);
begin
  select count(*) into n from cron.job where jobname = 'dc_archive_finished_events';
  if n <> 1 then
    raise exception 'ABBRUCH: Es gibt % Jobs namens dc_archive_finished_events (erwartet: 1).', n;
  end if;
  select count(*) into n from cron.job
  where jobname = 'dc_archive_finished_events'
    and schedule = '7 * * * *'
    and command = 'select public.archive_finished_events();'
    and active
    and database = current_database()
    and username = fn_owner
    and has_function_privilege(username, 'public.archive_finished_events()', 'EXECUTE');
  if n <> 1 then
    raise exception 'ABBRUCH: Der Cron-Job ist nicht wie erwartet angelegt (Datenbank, Rolle %, Befehl oder Rechte).', fn_owner;
  end if;
end $$;

commit;

-- Optional: einmal sofort archivieren, statt bis zur nächsten vollen Stunde zu warten.
-- Gibt die Zahl der archivierten Events zurück. Löscht nichts.
-- select public.archive_finished_events();
