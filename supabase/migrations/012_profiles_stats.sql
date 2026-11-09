-- =============================================================================
-- 012 – Freiwillige Schülerprofile + persönliche Statistiken
-- =============================================================================
-- Ausführen NACH 001 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-
-- Eigentümer (postgres). IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 6 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- STATUS: NUR IM REPOSITORY. NICHT ausgeführt. Vor dem Ausführen: Freigabe durch Ege,
--         zuerst auf Staging testen (wie 011).
--
-- Abhängigkeiten:
--   * Pflicht: 001 (profiles, schools, events, event_registrations, ideas, idea_supports).
--   * Optional: 011 (Nachhilfe). Fehlt 011, liefern die Nachhilfe-Zahlen NULL
--     ("noch nicht verfügbar" – keine erfundene 0). Geprüft wird zur Laufzeit.
--   * Unabhängig von 002–010 (kein is_admin(), kein events.archived_at, kein pg_cron).
--
-- Grundsatz: PRIVAT IST STANDARD.
--   * Neue Tabelle profile_sharing: EINE Zeile pro Person, nur sie selbst darf sie lesen
--     und ändern. Keine Zeile = alles privat.
--   * Ein Profil ist für andere nur sichtbar, wenn is_public = true. Dann sehen andere
--     angemeldete Schüler:innen den VORNAMEN und die Avatar-Farbe – sonst nichts.
--   * Schule, Interessen, Projektvorschläge und Aktivitätszahlen werden JEWEILS
--     zusätzlich freigegeben (show_*). Klasse, E-Mail und Konto-Daten sind NIE öffentlich.
--   * Besucher:innen ohne Konto (anon) sehen KEINE Profile.
--   * Die Tabelle profiles bleibt unverändert PRIVAT (Policy aus 001). Andere Profile
--     sind nur über die Funktionen in Teil 4 erreichbar, und die geben nur Freigegebenes aus.
--   * Ein privates und ein nicht existierendes Profil sehen von außen GLEICH aus
--     (keine Zeile) – man kann nicht ausprobieren, wer ein Konto hat.
--
-- Was ändert sich NICHT?
--   * Keine bestehende Tabelle, Policy, Funktion oder Berechtigung aus 001–011.
--
-- "Projekte" im Profil: Projekt-MITGLIEDSCHAFTEN gibt es in der Datenbank noch nicht
-- (Integrationsstufe 6, Migration 013). Bis dahin zeigt das Profil die eigenen
-- veröffentlichten Projektvorschläge (Ideen mit Status collecting/review/planned) –
-- dieselben Ideen, die ohnehin alle Angemeldeten sehen, nur jetzt mit Autor:in.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.ideas') is null
     or to_regclass('public.event_registrations') is null or to_regclass('public.idea_supports') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabelle: Freigaben (eine Zeile pro Person)
-- -----------------------------------------------------------------------------
create table if not exists public.profile_sharing (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  is_public      boolean not null default false,
  show_school    boolean not null default false,
  show_interests boolean not null default false,
  show_projects  boolean not null default false,
  show_activity  boolean not null default false,
  updated_at     timestamptz not null default now()
);

create or replace function public.profile_sharing_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_sharing_touch on public.profile_sharing;
create trigger profile_sharing_touch
  before update on public.profile_sharing
  for each row execute function public.profile_sharing_touch();

-- -----------------------------------------------------------------------------
-- 2) Row Level Security + Rechte: nur die eigene Zeile
-- -----------------------------------------------------------------------------
alter table public.profile_sharing enable row level security;

-- Lesen: nur die eigene Zeile (direkt). Schreiben: NUR über save_profile_sharing() (Teil 2b) –
-- die Funktion setzt user_id immer auf auth.uid(), man kann also keine fremde Zeile anlegen.
-- (Ein direkter Upsert über die REST-Schnittstelle würde auch user_id im UPDATE-Teil setzen
--  und bräuchte dafür ein Änderungsrecht auf user_id – das soll es nicht geben.)
revoke all on public.profile_sharing from public, anon, authenticated;
grant select on public.profile_sharing to authenticated;

drop policy if exists "profile_sharing: eigene" on public.profile_sharing;
drop policy if exists "profile_sharing: eigene lesen" on public.profile_sharing;
create policy "profile_sharing: eigene lesen" on public.profile_sharing
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 2b) Freigaben speichern (nur die eigene Zeile)
-- -----------------------------------------------------------------------------
drop function if exists public.save_profile_sharing(boolean, boolean, boolean, boolean, boolean);
create function public.save_profile_sharing(
  p_is_public boolean, p_show_school boolean, p_show_interests boolean,
  p_show_projects boolean, p_show_activity boolean
)
returns table (is_public boolean, show_school boolean, show_interests boolean,
               show_projects boolean, show_activity boolean)
language plpgsql
volatile
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
  if p_is_public is null or p_show_school is null or p_show_interests is null
     or p_show_projects is null or p_show_activity is null then
    raise exception 'Alle Freigaben müssen true oder false sein' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then
    raise exception 'Profil nicht gefunden' using errcode = 'P0002';
  end if;
  insert into public.profile_sharing as s
         (user_id, is_public, show_school, show_interests, show_projects, show_activity)
  values (uid, p_is_public, p_show_school, p_show_interests, p_show_projects, p_show_activity)
  on conflict (user_id) do update
     set is_public = excluded.is_public, show_school = excluded.show_school,
         show_interests = excluded.show_interests, show_projects = excluded.show_projects,
         show_activity = excluded.show_activity;
  return query
    select s.is_public, s.show_school, s.show_interests, s.show_projects, s.show_activity
      from public.profile_sharing s where s.user_id = uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Persönliche Statistik (nur die eigenen Zahlen, nur echte Daten)
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER, damit die Zahlen stabil bleiben, auch wenn ein Event später für
-- Schüler:innen ausgeblendet wird (z. B. Archiv aus 008). Gefiltert wird IMMER auf
-- auth.uid() – fremde Daten sind nicht abfragbar.
--   events_upcoming     angemeldet (registered), Event geplant/bestätigt, Beginn in der Zukunft
--   events_past         angemeldet, Event NICHT abgesagt und bereits vorbei
--                       (= "angemeldet und stattgefunden" – eine Anwesenheit wird NICHT erfasst)
--   events_interested   Status "interested"
--   ideas_submitted     alle eigenen Ideen (auch eingereicht/abgelehnt – nur für dich sichtbar)
--   ideas_published     eigene Ideen mit Status collecting/review/planned
--   ideas_planned       eigene Ideen mit Status planned
--   supports_given      eigene Unterstützungen
--   supports_received   Unterstützungen anderer für eigene Ideen
--   tutoring_*          NULL, wenn 011 fehlt
drop function if exists public.get_my_activity_stats();
create function public.get_my_activity_stats()
returns table (
  events_upcoming integer, events_past integer, events_interested integer,
  ideas_submitted integer, ideas_published integer, ideas_planned integer,
  supports_given integer, supports_received integer,
  tutoring_offers integer, tutoring_requests integer, tutoring_contacts integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  t_offers integer;
  t_requests integer;
  t_contacts integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  -- Nachhilfe nur, wenn Migration 011 ausgeführt wurde (dynamisch, sonst Fehler beim Anlegen)
  if to_regclass('public.tutoring_entries') is not null and to_regclass('public.tutoring_requests') is not null then
    execute $q$
      select (select count(*)::integer from public.tutoring_entries
               where owner_id = $1 and kind = 'offer' and status = 'active'),
             (select count(*)::integer from public.tutoring_entries
               where owner_id = $1 and kind = 'request' and status = 'active'),
             (select count(*)::integer from public.tutoring_requests r
                join public.tutoring_entries e on e.id = r.entry_id
               where r.status = 'accepted' and (r.sender_id = $1 or e.owner_id = $1))
    $q$ into t_offers, t_requests, t_contacts using uid;
  end if;

  return query
    select
      (select count(*)::integer from public.event_registrations r
         join public.events e on e.id = r.event_id
        where r.user_id = uid and r.status = 'registered'
          and e.status in ('planned', 'confirmed') and e.start_at > now()),
      (select count(*)::integer from public.event_registrations r
         join public.events e on e.id = r.event_id
        where r.user_id = uid and r.status = 'registered'
          and e.status in ('planned', 'confirmed', 'completed')
          and e.start_at + make_interval(mins => coalesce(e.duration_minutes, 0)) < now()),
      (select count(*)::integer from public.event_registrations r
        where r.user_id = uid and r.status = 'interested'),
      (select count(*)::integer from public.ideas i where i.author_id = uid),
      (select count(*)::integer from public.ideas i
        where i.author_id = uid and i.status in ('collecting', 'review', 'planned')),
      (select count(*)::integer from public.ideas i where i.author_id = uid and i.status = 'planned'),
      (select count(*)::integer from public.idea_supports s where s.user_id = uid),
      (select count(*)::integer from public.idea_supports s
         join public.ideas i on i.id = s.idea_id
        where i.author_id = uid and s.user_id <> uid),
      t_offers, t_requests, t_contacts;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Öffentliche Profile (nur Freigegebenes)
-- -----------------------------------------------------------------------------
-- Verzeichnis: alle Profile mit is_public = true. Schule/Interessen nur, wenn freigegeben.
drop function if exists public.list_public_profiles();
create function public.list_public_profiles()
returns table (id uuid, first_name text, avatar_color text, school_id text, interests text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.avatar_color,
           case when s.show_school then p.school_id else null end,
           case when s.show_interests then p.interests else '{}'::text[] end
      from public.profile_sharing s
      join public.profiles p on p.id = s.user_id
     where s.is_public
     order by lower(p.first_name), p.id;
end;
$$;

-- Ein Profil. Fremde: nur wenn is_public (sonst KEINE Zeile – wie "gibt es nicht").
-- Eigenes Profil: immer (Vorschau), mit denselben Ausblendungen wie für andere.
--   projects: JSON-Liste der veröffentlichten eigenen Projektvorschläge (nur mit show_projects)
--   Aktivitätszahlen nur mit show_activity, sonst NULL.
drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user_id uuid)
returns table (
  id uuid, first_name text, avatar_color text, school_id text, interests text[],
  is_public boolean, is_self boolean, show_projects boolean, show_activity boolean,
  projects jsonb,
  ideas_published integer, events_past integer, supports_received integer
)
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
  if p_user_id is null then
    return;
  end if;
  return query
    select p.id, p.first_name, p.avatar_color,
           case when coalesce(s.show_school, false) then p.school_id else null end,
           case when coalesce(s.show_interests, false) then p.interests else '{}'::text[] end,
           coalesce(s.is_public, false),
           p.id = uid,
           coalesce(s.show_projects, false),
           coalesce(s.show_activity, false),
           case when coalesce(s.show_projects, false) then
             coalesce((select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'title', i.title, 'summary', i.summary, 'status', i.status,
                         'school_id', i.school_id, 'topics', i.topics, 'created_at', i.created_at)
                       order by i.created_at desc)
                         from public.ideas i
                        where i.author_id = p.id and i.status in ('collecting', 'review', 'planned')),
                      '[]'::jsonb)
           else '[]'::jsonb end,
           case when coalesce(s.show_activity, false) then
             (select count(*)::integer from public.ideas i
               where i.author_id = p.id and i.status in ('collecting', 'review', 'planned'))
           end,
           case when coalesce(s.show_activity, false) then
             (select count(*)::integer from public.event_registrations r
                join public.events e on e.id = r.event_id
               where r.user_id = p.id and r.status = 'registered'
                 and e.status in ('planned', 'confirmed', 'completed')
                 and e.start_at + make_interval(mins => coalesce(e.duration_minutes, 0)) < now())
           end,
           case when coalesce(s.show_activity, false) then
             (select count(*)::integer from public.idea_supports su
                join public.ideas i on i.id = su.idea_id
               where i.author_id = p.id and su.user_id <> p.id
                 and i.status in ('collecting', 'review', 'planned'))
           end
      from public.profiles p
      left join public.profile_sharing s on s.user_id = p.id
     where p.id = p_user_id
       and (p.id = uid or coalesce(s.is_public, false));
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Ausführrechte: nur angemeldete Nutzer:innen (nicht PUBLIC/anon)
-- -----------------------------------------------------------------------------
revoke execute on function public.get_my_activity_stats()  from public, anon;
revoke execute on function public.list_public_profiles()   from public, anon;
revoke execute on function public.get_public_profile(uuid) from public, anon;
grant  execute on function public.get_my_activity_stats()  to authenticated;
grant  execute on function public.list_public_profiles()   to authenticated;
grant  execute on function public.get_public_profile(uuid) to authenticated;
revoke execute on function public.save_profile_sharing(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant  execute on function public.save_profile_sharing(boolean, boolean, boolean, boolean, boolean) to authenticated;
revoke execute on function public.profile_sharing_touch()  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.profile_sharing'::regclass) then
    raise exception 'ABBRUCH: RLS ist auf profile_sharing nicht aktiv';
  end if;
  if has_table_privilege('anon', 'public.profile_sharing', 'select,insert,update,delete') then
    raise exception 'ABBRUCH: anon hat Rechte auf profile_sharing';
  end if;
  if has_table_privilege('authenticated', 'public.profile_sharing', 'insert,update,delete,truncate')
     or has_any_column_privilege('authenticated', 'public.profile_sharing', 'insert,update') then
    raise exception 'ABBRUCH: profile_sharing darf nur über save_profile_sharing() geändert werden';
  end if;
  -- profiles bleibt privat: anon darf nichts, und die Policy aus 001 ist unverändert die einzige Lese-Policy
  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'ABBRUCH: anon darf profiles lesen';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
                and policyname <> 'profiles: eigenes Profil lesen') then
    raise exception 'ABBRUCH: unerwartete Lese-Policy auf profiles – Profile müssen privat bleiben';
  end if;
  foreach f in array array['public.get_my_activity_stats()', 'public.list_public_profiles()',
                           'public.get_public_profile(uuid)',
                           'public.save_profile_sharing(boolean,boolean,boolean,boolean,boolean)'] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'ABBRUCH: anon darf % ausführen', f;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) is not true then
      raise exception 'ABBRUCH: % muss SECURITY DEFINER sein', f;
    end if;
  end loop;
end;
$$;

commit;
