-- =============================================================================
-- 017 – Bestenlisten für Papierflug und Brückenläufer (Integrationsstufe 8b)
-- =============================================================================
-- Ausführen NACH 001 und 012 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-
-- Eigentümer (postgres). IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 5 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- STATUS: NUR IM REPOSITORY. Erst STAGING (DeutschConnect-Staging), dann Freigabe durch Ege.
--         Live NICHT ausführen.
--
-- Nummer: 017 ist im Integrationsplan für Bestenlisten reserviert (014 Gruppen, 015 Admin-Module,
-- 016 Online-Schach – noch nicht vorhanden). 017 hängt von keiner davon ab.
--
-- Abhängigkeiten:
--   * Pflicht: 001 (profiles: id = auth.users.id, first_name).
--   * Pflicht: 012 (nur für die gleiche Grundhaltung „Profile sind privat“; keine Tabelle daraus nötig) –
--     Teil 0 prüft trotzdem, dass 012 ausgeführt ist, damit die Reihenfolge der Integration stimmt.
--   * Unabhängig von 005–011, 013 (kein is_admin(), kein pg_cron).
--
-- Spiele (Kerems Spiele aus der Codex-Version): 'paper_flight' (Papierflug), 'bridge_runner' (Brückenläufer).
--
-- Datenschutz:
--   * Profile sind seit 012 standardmäßig privat. Deshalb erscheint ein Vorname NUR in der Bestenliste,
--     wenn die Person das ausdrücklich einschaltet (game_leaderboard_optin, Standard: aus).
--   * Bestenliste zeigt nur: Platz, Vorname, Bestwert, „das bin ich“. Keine E-Mail, keine Schule,
--     keine Klasse, keine IDs anderer Personen.
--   * Nur für angemeldete Nutzer:innen (wie das Profil-Verzeichnis aus 012).
--
-- Schutz vor gefälschten Punkten (der Browser ist nicht vertrauenswürdig):
--   * Punkte können NUR über game_submit_score() gespeichert werden – immer für auth.uid(),
--     eine fremde ID kann man nicht übergeben. Kein direkter Tabellenzugriff.
--   * Vor jeder Runde ruft das Spiel game_start_run() auf; der SERVER merkt sich die Startzeit.
--     Beim Einreichen wird geprüft, ob die Punktzahl in der seitdem vergangenen Zeit überhaupt
--     erreichbar ist (Grenzen aus den Spielregeln, großzügig + 5 s Netzwerk-Puffer):
--       bridge_runner: Punkte = Spielzeit × 10            → höchstens floor((Sekunden + 5) × 10)
--       paper_flight:  1 Punkt je Säule, Säulen kommen frühestens alle ~1,17 s, die erste nach ~2,3 s
--                                                         → höchstens floor((Sekunden + 5) / 1,1) + 1
--   * Ein Rundenstart gilt für GENAU eine Einreichung und höchstens 3 Stunden. Er wird bei JEDEM
--     Einreichversuch verbraucht – auch wenn die Punktzahl abgelehnt wird (kein „Warten und nochmal
--     einreichen“). Ablehnungen kommen deshalb als status zurück, nicht als Fehler (siehe Teil 3).
--   * Ein niedrigerer Wert ersetzt NIE einen höheren Bestwert (auch nicht bei gleichem Wert).
--   Grenze: Ein Programm, das das Spiel wirklich spielt (Bot), lässt sich so nicht erkennen.
--
-- Fehlercodes (SQLSTATE): 42501 nicht angemeldet · 22023 ungültiges Spiel/ungültige Punktzahl ·
--   DC031 keine laufende Runde (bzw. Runde schon verbraucht)
-- Ergebnis-Status von game_submit_score(): saved · kept · implausible · expired
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
  if to_regclass('public.profile_sharing') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 012 ausführen.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabellen – KEIN direkter Zugriff (RLS an, keine Policies, keine Rechte)
-- -----------------------------------------------------------------------------
-- Bestwert pro Person und Spiel (eine Zeile pro Person/Spiel → jede Person nur einmal je Liste).
create table if not exists public.game_scores (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game        text not null check (game in ('paper_flight', 'bridge_runner')),
  best_score  integer not null check (best_score between 0 and 1000000),
  achieved_at timestamptz not null default now(),
  primary key (user_id, game)
);

create index if not exists game_scores_ranking_idx
  on public.game_scores (game, best_score desc, achieved_at asc);

-- Laufende Runde: vom Server gesetzte Startzeit (eine pro Person/Spiel; neuer Start überschreibt).
create table if not exists public.game_runs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game       text not null check (game in ('paper_flight', 'bridge_runner')),
  started_at timestamptz not null default now(),
  primary key (user_id, game)
);

-- Freiwillige Anzeige in den Bestenlisten (gilt für beide Spiele). Ohne Zeile = aus.
create table if not exists public.game_leaderboard_optin (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  visible    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.game_scores enable row level security;
alter table public.game_runs enable row level security;
alter table public.game_leaderboard_optin enable row level security;
revoke all on public.game_scores, public.game_runs, public.game_leaderboard_optin
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Hilfsfunktion: höchste plausible Punktzahl (nur intern, siehe Teil 4)
-- -----------------------------------------------------------------------------
drop function if exists public.game_max_plausible_score(text, double precision);
create function public.game_max_plausible_score(p_game text, p_seconds double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_game
    when 'bridge_runner' then floor((greatest(p_seconds, 0) + 5) * 10)::integer
    when 'paper_flight'  then floor((greatest(p_seconds, 0) + 5) / 1.1)::integer + 1
    else 0
  end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Aktionen für angemeldete Nutzer:innen
-- -----------------------------------------------------------------------------
-- Neue Runde beginnt: Startzeit merken (überschreibt eine ältere, nicht eingereichte Runde).
drop function if exists public.game_start_run(text);
create function public.game_start_run(p_game text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  started timestamptz;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_game is null or p_game not in ('paper_flight', 'bridge_runner') then
    raise exception 'Unbekanntes Spiel' using errcode = '22023';
  end if;
  insert into public.game_runs as r (user_id, game, started_at)
  values (uid, p_game, now())
  on conflict (user_id, game) do update set started_at = excluded.started_at
  returning r.started_at into started;
  return started;
end;
$$;

-- Runde beendet: Punktzahl prüfen und nur als Bestwert speichern, wenn sie HÖHER ist.
-- Ergebnis: aktueller Bestwert, ob es ein neuer Bestwert war, und status (siehe unten).
--
-- WICHTIG: Nach dem Löschen der Runde darf diese Funktion KEINE Exception mehr auslösen.
-- Eine Exception rollt die ganze Funktion zurück – auch das DELETE. Die Runde wäre dann noch da
-- und könnte später (wenn genug Zeit vergangen ist) erneut eingereicht werden.
-- Deshalb werden abgelehnte Einreichungen als ERGEBNIS gemeldet (status), nicht als Fehler:
--   status = 'saved'        neuer Bestwert gespeichert
--          = 'kept'         gültig, aber nicht höher → Bestwert bleibt
--          = 'implausible'  Punktzahl in der vergangenen Zeit nicht erreichbar → nichts gespeichert
--          = 'expired'      Runde älter als 3 Stunden → nichts gespeichert
-- In allen vier Fällen ist die Runde danach VERBRAUCHT.
-- Fehler (Exception) nur VOR dem Löschen bzw. wenn es keine Runde gibt (dann gibt es nichts zurückzurollen).
drop function if exists public.game_submit_score(text, integer);
create function public.game_submit_score(p_game text, p_score integer)
returns table (best_score integer, is_new_best boolean, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  run_started timestamptz;
  seconds double precision;
  previous integer;
  outcome text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_game is null or p_game not in ('paper_flight', 'bridge_runner') then
    raise exception 'Unbekanntes Spiel' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000000 then
    raise exception 'Ungültige Punktzahl' using errcode = '22023';
  end if;

  -- Runde genau einmal verwenden: lesen UND löschen in einem Schritt.
  delete from public.game_runs r
   where r.user_id = uid and r.game = p_game
  returning r.started_at into run_started;

  if run_started is null then
    -- Nichts gelöscht → Exception ist hier unschädlich.
    raise exception 'Keine laufende Runde' using errcode = 'DC031';
  end if;

  -- AB HIER KEINE EXCEPTION MEHR (siehe oben).
  select s.best_score into previous
    from public.game_scores s where s.user_id = uid and s.game = p_game;

  seconds := extract(epoch from (now() - run_started));
  if seconds > 3 * 60 * 60 then
    outcome := 'expired';
  elsif p_score > public.game_max_plausible_score(p_game, seconds) then
    outcome := 'implausible';
  elsif previous is null or p_score > previous then
    insert into public.game_scores as s (user_id, game, best_score, achieved_at)
    values (uid, p_game, p_score, now())
    on conflict (user_id, game) do update
      set best_score = excluded.best_score, achieved_at = excluded.achieved_at
      where s.best_score < excluded.best_score;   -- doppelte Sicherung bei gleichzeitigen Aufrufen
    outcome := 'saved';
  else
    outcome := 'kept';
  end if;

  -- Immer GENAU eine Zeile (auch ohne bisherigen Bestwert → best_score = null).
  return query
    select (select s.best_score from public.game_scores s where s.user_id = uid and s.game = p_game),
           outcome = 'saved',
           outcome;
end;
$$;

-- Anzeige in den Bestenlisten ein-/ausschalten (gilt für beide Spiele). Gibt den neuen Stand zurück.
drop function if exists public.game_set_leaderboard_visibility(boolean);
create function public.game_set_leaderboard_visibility(p_visible boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result boolean;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_visible is null then
    raise exception 'Ungültiger Wert' using errcode = '22023';
  end if;
  insert into public.game_leaderboard_optin as o (user_id, visible, updated_at)
  values (uid, p_visible, now())
  on conflict (user_id) do update set visible = excluded.visible, updated_at = excluded.updated_at
  returning o.visible into result;
  return result;
end;
$$;

-- Eigener Stand für ein Spiel: Bestwert (oder null), Anzeige an/aus, eigener Platz (nur wenn sichtbar).
drop function if exists public.game_my_status(text);
create function public.game_my_status(p_game text)
returns table (best_score integer, visible boolean, my_rank integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_game is null or p_game not in ('paper_flight', 'bridge_runner') then
    raise exception 'Unbekanntes Spiel' using errcode = '22023';
  end if;
  return query
    with me as (
      select s.best_score from public.game_scores s where s.user_id = uid and s.game = p_game
    ), opt as (
      select coalesce((select o.visible from public.game_leaderboard_optin o where o.user_id = uid), false) as visible
    )
    select (select me.best_score from me),
           opt.visible,
           case when opt.visible and exists (select 1 from me) then
             (select count(*)::integer + 1
                from public.game_scores s
                join public.game_leaderboard_optin o on o.user_id = s.user_id and o.visible
               where s.game = p_game and s.best_score > (select me.best_score from me))
           end
      from opt;
end;
$$;

-- Bestenliste: Top 10 der Personen, die die Anzeige eingeschaltet haben.
-- Platz nach Wettkampf-Regel: gleiche Punkte = gleicher Platz (1, 1, 3, …).
-- Bei gleichen Punkten steht weiter oben, wer den Wert zuerst erreicht hat.
drop function if exists public.game_leaderboard(text);
create function public.game_leaderboard(p_game text)
returns table (rank integer, display_name text, best_score integer, is_self boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_game is null or p_game not in ('paper_flight', 'bridge_runner') then
    raise exception 'Unbekanntes Spiel' using errcode = '22023';
  end if;
  return query
    select (rank() over (order by s.best_score desc))::integer,
           p.first_name,
           s.best_score,
           s.user_id = uid
      from public.game_scores s
      join public.game_leaderboard_optin o on o.user_id = s.user_id and o.visible
      join public.profiles p on p.id = s.user_id
     where s.game = p_game
     order by s.best_score desc, s.achieved_at asc, s.user_id
     limit 10;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Ausführrechte: Aktionen nur für angemeldete Nutzer:innen; Hilfsfunktion für niemanden
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.game_start_run(text)', 'public.game_submit_score(text,integer)',
    'public.game_set_leaderboard_visibility(boolean)', 'public.game_my_status(text)',
    'public.game_leaderboard(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.game_max_plausible_score(text, double precision)
    from public, anon, authenticated;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  f text;
begin
  foreach t in array array['public.game_scores', 'public.game_runs', 'public.game_leaderboard_optin'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'ABBRUCH: RLS ist auf % nicht aktiv', t;
    end if;
    if has_table_privilege('anon', t, 'select,insert,update,delete')
       or has_table_privilege('authenticated', t, 'select,insert,update,delete,truncate') then
      raise exception 'ABBRUCH: % darf nur über Funktionen genutzt werden', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = split_part(t, '.', 2)) then
      raise exception 'ABBRUCH: % soll keine Policies haben (kein direkter Zugriff)', t;
    end if;
  end loop;
  foreach f in array array[
    'public.game_start_run(text)', 'public.game_submit_score(text,integer)',
    'public.game_set_leaderboard_visibility(boolean)', 'public.game_my_status(text)',
    'public.game_leaderboard(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'ABBRUCH: anon darf % ausführen', f;
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and p.proconfig = array['search_path=""']) then
      raise exception 'ABBRUCH: % muss SECURITY DEFINER mit search_path = '''' sein', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.game_max_plausible_score(text,double precision)', 'execute')
     or has_function_privilege('anon', 'public.game_max_plausible_score(text,double precision)', 'execute') then
    raise exception 'ABBRUCH: game_max_plausible_score ist nur intern';
  end if;
  -- Nach dem Verbrauchen der Runde darf game_submit_score keine Exception auslösen
  -- (sonst würde das DELETE zurückgerollt und die Runde wäre wiederverwendbar).
  if (select position('raise' in split_part(p.prosrc, 'AB HIER KEINE EXCEPTION MEHR', 2)) <> 0
             or position('AB HIER KEINE EXCEPTION MEHR' in p.prosrc) = 0
        from pg_proc p where p.oid = 'public.game_submit_score(text,integer)'::regprocedure) then
    raise exception 'ABBRUCH: game_submit_score darf nach dem Verbrauchen der Runde keine Exception auslösen';
  end if;
  -- Plausibilitätsgrenzen kurz nachrechnen
  if public.game_max_plausible_score('bridge_runner', 10) <> 150
     or public.game_max_plausible_score('paper_flight', 6) <> 11
     or public.game_max_plausible_score('chess', 100) <> 0 then
    raise exception 'ABBRUCH: Plausibilitätsgrenzen stimmen nicht';
  end if;
end;
$$;

commit;
