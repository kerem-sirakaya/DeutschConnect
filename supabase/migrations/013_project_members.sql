-- =============================================================================
-- 013 – Projekt-Mitwirkung: Anfragen, Mitglieder, Verlassen (Integration Codex-Projekte)
-- =============================================================================
-- Ausführen NACH 001 und 012 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-
-- Eigentümer (postgres). IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 5 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- STATUS: NUR IM REPOSITORY. NICHT ausgeführt. Erst Staging, dann Freigabe durch Ege.
--
-- Abhängigkeiten:
--   * Pflicht: 001 (ideas, profiles). Ideen-Sichtbarkeit wie 004 v3 (Erlaubnisliste).
--   * Pflicht: 012 (profile_sharing) – nur für list_public_memberships(); Teil 0 prüft das.
--   * Unabhängig von 005–011 (kein is_admin(), kein archived_at, kein pg_cron, keine Nachhilfe).
--
-- Grundidee (wie in der Codex-Version von Kerem): Eine veröffentlichte Idee
-- (collecting / review / planned) ist ein Projekt. Andere Schüler:innen können
-- MITMACHEN ANFRAGEN; die Autor:in nimmt an oder lehnt ab. Mitglieder können austreten.
-- "Interesse" bleibt die bestehende Unterstützung (idea_supports) – nichts Doppeltes.
--
-- Datenschutz:
--   * Für Außenstehende: nur die ANZAHL der Mitglieder, keine Namen.
--   * Die Autor:in sieht die Vornamen der Anfragenden und Mitglieder (wie bei Nachhilfe).
--   * Mitglieder sehen die Vornamen des Teams (sie arbeiten zusammen).
--   * Im öffentlichen Profil erscheinen Mitgliedschaften NUR mit Profil-Freigabe
--     (is_public + show_projects aus 012).
--   * Keine Nachrichten, kein Chat – nur Status.
--
-- Projekt-ABSCHLUSS (Codex "completedProjectIds") ist hier bewusst NICHT enthalten:
-- dafür braucht es einen von Admins gesetzten Status (Integrationsstufe 7).
--
-- Fehlercodes (SQLSTATE): 42501 nicht angemeldet · P0002 nicht gefunden ·
--   DC021 eigene Idee · DC022 Anfrage/Mitgliedschaft besteht schon ·
--   DC023 Projekt nicht (mehr) offen · DC024 Statuswechsel nicht erlaubt
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ideas') is null or to_regclass('public.profiles') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
  if to_regclass('public.profile_sharing') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 012 ausführen.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabelle
-- -----------------------------------------------------------------------------
create table if not exists public.idea_members (
  idea_id      uuid not null references public.ideas (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'requested'
               check (status in ('requested', 'member', 'declined', 'left')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  primary key (idea_id, user_id)
);

create index if not exists idea_members_user_idx on public.idea_members (user_id);

-- KEIN direkter Zugriff: RLS an, keine Policies, keine Rechte. Alles über Teil 2–3.
alter table public.idea_members enable row level security;
revoke all on public.idea_members from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Aktionen
-- -----------------------------------------------------------------------------
-- Mitmachen anfragen. Nach "declined" oder "left" ist eine neue Anfrage möglich.
drop function if exists public.project_request_join(uuid);
create function public.project_request_join(p_idea_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_author uuid;
  v_status text;
  existing text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  select i.author_id, i.status into v_author, v_status from public.ideas i where i.id = p_idea_id for share;
  if not found then
    raise exception 'Projekt nicht gefunden' using errcode = 'P0002';
  end if;
  if v_author = uid then
    raise exception 'Eigene Idee' using errcode = 'DC021';
  end if;
  if v_status not in ('collecting', 'review', 'planned') then
    -- nicht veröffentlichte Ideen sind für andere unsichtbar → wie "nicht gefunden"
    raise exception 'Projekt nicht gefunden' using errcode = 'P0002';
  end if;
  select m.status into existing from public.idea_members m
   where m.idea_id = p_idea_id and m.user_id = uid for update;
  if existing in ('requested', 'member') then
    raise exception 'Besteht schon' using errcode = 'DC022';
  end if;
  insert into public.idea_members as m (idea_id, user_id, status, requested_at, decided_at)
  values (p_idea_id, uid, 'requested', now(), null)
  on conflict (idea_id, user_id) do update
     set status = 'requested', requested_at = now(), decided_at = null;
  return 'requested';
end;
$$;

-- Eigene offene Anfrage zurückziehen (Zeile wird entfernt).
drop function if exists public.project_cancel_request(uuid);
create function public.project_cancel_request(p_idea_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  delete from public.idea_members m
   where m.idea_id = p_idea_id and m.user_id = uid and m.status = 'requested';
  if not found then
    raise exception 'Keine offene Anfrage' using errcode = 'P0002';
  end if;
end;
$$;

-- Als Mitglied austreten.
drop function if exists public.project_leave(uuid);
create function public.project_leave(p_idea_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  update public.idea_members m set status = 'left', decided_at = now()
   where m.idea_id = p_idea_id and m.user_id = uid and m.status = 'member';
  if not found then
    raise exception 'Keine Mitgliedschaft' using errcode = 'P0002';
  end if;
end;
$$;

-- Autor:in nimmt eine Anfrage an oder lehnt sie ab.
drop function if exists public.project_review_request(uuid, uuid, boolean);
create function public.project_review_request(p_idea_id uuid, p_user_id uuid, p_accept boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_author uuid;
  v_status text;
  current_status text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_accept is null or p_user_id is null then
    raise exception 'Eingabe fehlt' using errcode = '22023';
  end if;
  select i.author_id, i.status into v_author, v_status from public.ideas i where i.id = p_idea_id for share;
  if not found or v_author is distinct from uid then
    raise exception 'Projekt nicht gefunden' using errcode = 'P0002';
  end if;
  if v_status not in ('collecting', 'review', 'planned') then
    raise exception 'Projekt ist nicht offen' using errcode = 'DC023';
  end if;
  select m.status into current_status from public.idea_members m
   where m.idea_id = p_idea_id and m.user_id = p_user_id for update;
  if not found then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if current_status <> 'requested' then
    raise exception 'Nur offene Anfragen' using errcode = 'DC024';
  end if;
  update public.idea_members m
     set status = case when p_accept then 'member' else 'declined' end, decided_at = now()
   where m.idea_id = p_idea_id and m.user_id = p_user_id;
  return case when p_accept then 'member' else 'declined' end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Lesen
-- -----------------------------------------------------------------------------
-- Überblick für EINE Idee: Anzahl Mitglieder (für alle, die die Idee sehen dürfen),
-- eigener Status, offene Anfragen (nur für die Autor:in, sonst NULL).
drop function if exists public.project_get_overview(uuid);
create function public.project_get_overview(p_idea_id uuid)
returns table (member_count integer, my_status text, is_owner boolean, pending_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_author uuid;
  v_status text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  select i.author_id, i.status into v_author, v_status from public.ideas i where i.id = p_idea_id;
  -- gleiche Sichtbarkeit wie die Lese-Policy auf ideas (004 v3): freigegeben oder eigene
  if not found or (v_status not in ('collecting', 'review', 'planned') and v_author <> uid) then
    return;
  end if;
  return query
    select (select count(*)::integer from public.idea_members m
             where m.idea_id = p_idea_id and m.status = 'member'),
           (select m.status from public.idea_members m where m.idea_id = p_idea_id and m.user_id = uid),
           v_author = uid,
           case when v_author = uid then
             (select count(*)::integer from public.idea_members m
               where m.idea_id = p_idea_id and m.status = 'requested')
           end;
end;
$$;

-- Team einer Idee mit Vornamen. Autor:in: Mitglieder + offene Anfragen.
-- Mitglieder: nur Mitglieder. Alle anderen: KEINE Zeilen.
drop function if exists public.project_get_team(uuid);
create function public.project_get_team(p_idea_id uuid)
returns table (user_id uuid, first_name text, school_id text, status text, requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_author uuid;
  v_is_member boolean;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  select i.author_id into v_author from public.ideas i where i.id = p_idea_id;
  if not found then
    return;
  end if;
  v_is_member := exists (select 1 from public.idea_members m
                          where m.idea_id = p_idea_id and m.user_id = uid and m.status = 'member');
  if v_author <> uid and not v_is_member then
    return;
  end if;
  return query
    select m.user_id, p.first_name, p.school_id, m.status, m.requested_at
      from public.idea_members m
      join public.profiles p on p.id = m.user_id
     where m.idea_id = p_idea_id
       and (m.status = 'member' or (m.status = 'requested' and v_author = uid))
     order by m.status, m.requested_at;
end;
$$;

-- Eigene Mitwirkungen (angefragt / Mitglied) – für "Mein Bereich".
drop function if exists public.project_my_memberships();
create function public.project_my_memberships()
returns table (idea_id uuid, title text, summary text, idea_status text, school_id text,
               my_status text, member_count integer, requested_at timestamptz)
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
  return query
    select i.id, i.title, i.summary, i.status, i.school_id, m.status,
           (select count(*)::integer from public.idea_members x
             where x.idea_id = i.id and x.status = 'member'),
           m.requested_at
      from public.idea_members m
      join public.ideas i on i.id = m.idea_id
     where m.user_id = uid and m.status in ('requested', 'member')
     order by m.requested_at desc;
end;
$$;

-- Mitgliedschaften einer Person für ihr öffentliches Profil – NUR mit Freigabe
-- (is_public + show_projects, Migration 012), nur veröffentlichte Ideen.
drop function if exists public.list_public_memberships(uuid);
create function public.list_public_memberships(p_user_id uuid)
returns table (idea_id uuid, title text, summary text, idea_status text, school_id text)
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
  return query
    select i.id, i.title, i.summary, i.status, i.school_id
      from public.idea_members m
      join public.ideas i on i.id = m.idea_id
      join public.profile_sharing s on s.user_id = m.user_id
     where m.user_id = p_user_id and m.status = 'member'
       and i.status in ('collecting', 'review', 'planned')
       and s.show_projects and (s.is_public or m.user_id = uid)
     order by m.decided_at desc nulls last;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Ausführrechte: nur angemeldete Nutzer:innen
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.project_request_join(uuid)', 'public.project_cancel_request(uuid)', 'public.project_leave(uuid)',
    'public.project_review_request(uuid,uuid,boolean)', 'public.project_get_overview(uuid)',
    'public.project_get_team(uuid)', 'public.project_my_memberships()', 'public.list_public_memberships(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.idea_members'::regclass) then
    raise exception 'ABBRUCH: RLS ist auf idea_members nicht aktiv';
  end if;
  if has_table_privilege('anon', 'public.idea_members', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.idea_members', 'select,insert,update,delete,truncate') then
    raise exception 'ABBRUCH: idea_members darf nur über Funktionen genutzt werden';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'idea_members') then
    raise exception 'ABBRUCH: idea_members soll keine Policies haben (kein direkter Zugriff)';
  end if;
  foreach f in array array[
    'public.project_request_join(uuid)', 'public.project_cancel_request(uuid)', 'public.project_leave(uuid)',
    'public.project_review_request(uuid,uuid,boolean)', 'public.project_get_overview(uuid)',
    'public.project_get_team(uuid)', 'public.project_my_memberships()', 'public.list_public_memberships(uuid)'
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
end;
$$;

commit;
