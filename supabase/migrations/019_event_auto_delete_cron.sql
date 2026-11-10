-- =============================================================================
-- 019 – Zeitplan: abgelaufene Events JEDE MINUTE automatisch löschen (pg_cron)
-- =============================================================================
-- Ausführen NACH 018 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-
-- Eigentümer (postgres) – derselben Rolle, der delete_expired_events gehört.
-- IMMER die ganze Datei ausführen. Mehrfach ausführbar (Job wird ersetzt, nie verdoppelt).
--
-- STATUS: NUR IM REPOSITORY. Weder Staging noch Live ausgeführt.
--
-- Warum pg_cron? Läuft IN der Datenbank – auch wenn niemand die Website besucht.
-- Kein Server, keine Edge Function, KEIN Service-Role-Key. Cron rechnet in UTC – egal,
-- weil delete_expired_events nur absolute Zeitpunkte (timestamptz) vergleicht.
-- Jede Minute: ein Event verschwindet aus der Datenbank spätestens ~1 Minute nach
-- Ablauf seiner 24 Stunden – nie davor. (Die App blendet es bereits sekundengenau aus.)
--
-- Zusätzlich: Der Archiv-Job aus 009 (dc_archive_finished_events) wird entfernt –
-- er wird nie mehr gebraucht, weil Löschen immer vor dem Archivieren fällig ist.
--
-- Rückgängig machen (falls nötig):
--   select cron.unschedule('dc_delete_expired_events');
-- =============================================================================

begin;

create extension if not exists pg_cron;

do $$
declare
  fn_owner name;
begin
  if to_regprocedure('public.delete_expired_events()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 018 ausführen.';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'ABBRUCH: pg_cron ist nicht verfügbar. Bitte im Dashboard unter Database -> Extensions aktivieren.';
  end if;
  select pg_get_userbyid(proowner) into fn_owner
    from pg_proc where oid = 'public.delete_expired_events()'::regprocedure;
  if current_user is distinct from fn_owner then
    raise exception 'ABBRUCH: Bitte als % ausführen (Eigentümer von delete_expired_events), nicht als %.', fn_owner, current_user;
  end if;
end $$;

-- Vorhandene Jobs entfernen (verhindert Doppelungen; Archiv-Job aus 009 ist überflüssig)
select cron.unschedule(jobid) from cron.job
 where jobname in ('dc_delete_expired_events', 'dc_archive_finished_events');

select cron.schedule(
  'dc_delete_expired_events',
  '* * * * *',
  'select public.delete_expired_events();'
);

-- Prüfen: genau ein Job, richtiger Befehl, aktiv, diese Datenbank, als Eigentümer der Funktion
do $$
declare
  n integer;
  fn_owner name := (select pg_get_userbyid(proowner) from pg_proc
                    where oid = 'public.delete_expired_events()'::regprocedure);
begin
  select count(*) into n from cron.job
   where jobname = 'dc_delete_expired_events'
     and schedule = '* * * * *'
     and command = 'select public.delete_expired_events();'
     and active
     and database = current_database()
     and username = fn_owner
     and has_function_privilege(username, 'public.delete_expired_events()', 'EXECUTE');
  if n <> 1 or (select count(*) from cron.job where jobname = 'dc_delete_expired_events') <> 1 then
    raise exception 'ABBRUCH: Der Cron-Job ist nicht wie erwartet angelegt.';
  end if;
  if exists (select 1 from cron.job where jobname = 'dc_archive_finished_events') then
    raise exception 'ABBRUCH: Der alte Archiv-Job besteht noch.';
  end if;
end $$;

commit;

-- Optional: einmal sofort löschen statt bis zur nächsten Minute zu warten:
-- select public.delete_expired_events();
-- Kontrolle danach:  select * from public.event_deletion_log order by deleted_at desc;
--                    select * from cron.job_run_details order by start_time desc limit 10;
