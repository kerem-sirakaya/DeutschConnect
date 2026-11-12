-- =============================================================================
-- DeutschConnect – Datenbankstruktur (Tabellen + Row Level Security)
-- =============================================================================
-- Wie ausführen?
--   Supabase Dashboard -> SQL Editor -> New query -> diesen Inhalt einfügen -> Run.
--   Das Skript ist für ein LEERES Projekt gedacht (einmalig ausführen).
--
-- Grundprinzip der Sicherheit (Row Level Security = RLS):
--   * Auf JEDER Tabelle ist RLS aktiv. Ohne passende "policy" sieht niemand etwas.
--   * Nicht angemeldete Besucher (Rolle "anon") bekommen KEINEN Zugriff.
--   * Angemeldete Nutzer (Rolle "authenticated") sehen/ändern nur, was die
--     Policies unten ausdrücklich erlauben.
--   * Events, Schulen und Ideen-Status werden (vorerst) nur im Supabase-
--     Dashboard gepflegt – dort gelten die Regeln nicht für euch als Admins.
--
-- Datenschutz (Schüler:innen sind minderjährig):
--   * Profile sind PRIVAT: jede Person sieht nur ihr eigenes Profil.
--   * Ideen zeigen anderen nur die Schule, nie den Namen.
--   * Anmeldungen und Unterstützungen sieht nur die Person selbst;
--     andere sehen höchstens eine Gesamtzahl.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) SCHULEN
-- -----------------------------------------------------------------------------
create table public.schools (
  id                 text primary key,            -- z. B. 'ers', 'anka' (wie in src/data/schools.js)
  name               text not null,
  short_name         text not null,
  city               text,
  partnership_status text not null default 'interest'
                     check (partnership_status in ('initiator', 'interest', 'confirmed')),
  created_at         timestamptz not null default now()
);

insert into public.schools (id, name, short_name, city, partnership_status) values
  ('ers',  'Ernst-Reuter-Schule Ankara', 'ERS',        'Ankara', 'initiator'),
  ('anka', 'Anka Bilim',                 'Anka Bilim', 'Ankara', 'interest');


-- -----------------------------------------------------------------------------
-- 2) PROFILE (ein Profil pro Benutzerkonto)
-- -----------------------------------------------------------------------------
-- Bewusst wenige Daten (Datensparsamkeit): Vorname, Schule, Klasse, Interessen.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  first_name   text not null check (char_length(first_name) between 1 and 40),
  school_id    text not null references public.schools (id),
  grade        smallint check (grade between 5 and 13),
  avatar_color text not null default '#2f6fd6' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  interests    text[] not null default '{}' check (cardinality(interests) <= 20),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Profil automatisch anlegen, sobald sich jemand registriert.
-- Vorname, Schule und Klasse kommen aus dem Registrierungsformular (user metadata).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, school_id, grade)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Neu'),
    new.raw_user_meta_data ->> 'school_id',
    nullif(new.raw_user_meta_data ->> 'grade', '')::smallint
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automatisch setzen
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3) EVENTS
-- -----------------------------------------------------------------------------
-- Mehrsprachige Texte als JSON: {"de": "...", "tr": "...", "en": "..."}
-- (oder einfach ein Text in Anführungszeichen: "Nur ein Titel").
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  title            jsonb not null,
  summary          jsonb,
  description      jsonb,
  location         jsonb,
  audience         jsonb,
  start_at         timestamptz not null,
  duration_minutes integer check (duration_minutes > 0),
  capacity         integer check (capacity > 0),
  online           boolean not null default false,
  topics           text[] not null default '{}',
  format           text not null default 'meetup'
                   check (format in ('workshop', 'meetup', 'discussion', 'competition', 'online', 'project')),
  host_school_id   text not null references public.schools (id),
  school_ids       text[] not null check (cardinality(school_ids) >= 1),
  status           text not null default 'planned'
                   check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  created_at       timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 4) EVENT-ANMELDUNGEN
-- -----------------------------------------------------------------------------
create table public.event_registrations (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status     text not null check (status in ('registered', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);


-- -----------------------------------------------------------------------------
-- 5) IDEEN + UNTERSTÜTZUNGEN
-- -----------------------------------------------------------------------------
create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  school_id   text not null references public.schools (id),
  title       text not null check (char_length(title) between 5 and 80),
  summary     text not null check (char_length(summary) <= 200),
  description text not null check (char_length(description) between 20 and 600),
  topics      text[] not null check (cardinality(topics) between 1 and 3),
  format      text not null default 'meetup'
              check (format in ('workshop', 'meetup', 'discussion', 'competition', 'online', 'project')),
  school_ids  text[] not null check (cardinality(school_ids) >= 1),
  status      text not null default 'submitted'
              check (status in ('submitted', 'collecting', 'review', 'planned')),
  created_at  timestamptz not null default now()
);

create table public.idea_supports (
  idea_id    uuid not null references public.ideas (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

-- Anzahl der Unterstützungen pro Idee – OHNE zu verraten, WER unterstützt hat.
create function public.get_idea_support_counts()
returns table (idea_id uuid, supporters bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.idea_id, count(*) from public.idea_supports s group by s.idea_id;
$$;


-- -----------------------------------------------------------------------------
-- 6) ZUGRIFFSRECHTE (Grants) – wer darf überhaupt welche Befehle senden?
-- -----------------------------------------------------------------------------
revoke all on public.schools, public.profiles, public.events,
              public.event_registrations, public.ideas, public.idea_supports
  from anon, authenticated;

grant select                  on public.schools             to authenticated;
grant select                  on public.events              to authenticated;
grant select                  on public.profiles            to authenticated;
-- Schule darf NICHT selbst geändert werden (sonst könnte man "die Schule wechseln").
grant update (first_name, grade, avatar_color, interests) on public.profiles to authenticated;
grant select, insert, update, delete on public.event_registrations to authenticated;
grant select, insert, delete  on public.ideas               to authenticated;
grant select, insert, delete  on public.idea_supports       to authenticated;

revoke execute on function public.get_idea_support_counts() from public, anon;
grant  execute on function public.get_idea_support_counts() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7) ROW LEVEL SECURITY – welche ZEILEN darf jemand sehen/ändern?
-- -----------------------------------------------------------------------------
alter table public.schools             enable row level security;
alter table public.profiles            enable row level security;
alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;
alter table public.ideas               enable row level security;
alter table public.idea_supports       enable row level security;

-- Schulen & Events: alle angemeldeten Nutzer dürfen lesen.
create policy "schools: lesen für Angemeldete"
  on public.schools for select to authenticated using (true);

create policy "events: lesen für Angemeldete"
  on public.events for select to authenticated using (true);

-- Profile: nur das EIGENE Profil lesen und bearbeiten.
create policy "profiles: eigenes Profil lesen"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: eigenes Profil bearbeiten"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Anmeldungen: nur eigene; neue nur für bevorstehende Events.
create policy "registrations: eigene lesen"
  on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "registrations: eigene anlegen"
  on public.event_registrations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status in ('planned', 'confirmed') and e.start_at > now()
    )
  );

create policy "registrations: eigene ändern"
  on public.event_registrations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "registrations: eigene löschen"
  on public.event_registrations for delete to authenticated
  using (user_id = (select auth.uid()));

-- Ideen: alle Angemeldeten lesen; anlegen nur als man selbst, für die eigene
-- Schule und mit Status 'submitted'; löschen nur eigene. Status ändern nur Admins (Dashboard).
create policy "ideas: lesen für Angemeldete"
  on public.ideas for select to authenticated using (true);

create policy "ideas: eigene anlegen"
  on public.ideas for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'submitted'
    and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid()))
  );

create policy "ideas: eigene löschen"
  on public.ideas for delete to authenticated
  using (author_id = (select auth.uid()));

-- Unterstützungen: nur eigene sehen, anlegen, entfernen.
create policy "supports: eigene lesen"
  on public.idea_supports for select to authenticated
  using (user_id = (select auth.uid()));

create policy "supports: eigene anlegen"
  on public.idea_supports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "supports: eigene löschen"
  on public.idea_supports for delete to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 8) Indizes für schnellere Abfragen
-- -----------------------------------------------------------------------------
create index events_start_at_idx          on public.events (start_at);
create index event_registrations_user_idx on public.event_registrations (user_id);
create index ideas_author_idx             on public.ideas (author_id);
create index ideas_created_at_idx         on public.ideas (created_at desc);
create index idea_supports_user_idx       on public.idea_supports (user_id);
