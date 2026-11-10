-- =============================================================================
-- 014 – Chatroom: Gruppenräume, private 1:1-Chats mit Nachrichtenanfragen, Reaktionen,
--       Suche, Wortfilter, Meldungen, Blockieren, Sperren, Moderation, Audit-Protokoll
-- =============================================================================
-- Ausführen NACH 001, 005, 011, 012, 013 (Supabase Dashboard -> SQL Editor -> Run), als
-- Datenbank-Eigentümer (postgres). IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 9 prüft am Ende selbst, ob alles sicher ist – sonst wird
-- ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- STATUS: NUR IM REPOSITORY. Erst STAGING (DeutschConnect-Staging), dann Freigabe durch Ege.
--         Live NICHT ausführen. Der Chat ist nach dem Ausführen AUS (chat_config.enabled = false).
--
-- Grundidee: Konzepte aus Kerems Codex-Version (Themenräume, Projekt-/Eventgruppen, Melden,
-- Blockieren, Kontaktdaten-Schutz), aber RELATIONAL wie der Rest von DeutschConnect – kein
-- JSON-Gesamtpaket, keine Edge Function mit Service-Role-Schlüssel.
--
-- Sicherheit (Kurzfassung):
--   * Schreiben NUR über SECURITY-DEFINER-Funktionen, immer für auth.uid(); keine Funktion
--     nimmt die eigene Nutzer-ID aus dem Browser entgegen.
--   * Lesen über Funktionen (mit Anzeigenamen, Reaktionen, Block-Filter). Für Supabase Realtime
--     haben 5 Tabellen zusätzlich SELECT-Policies (nur eigene/erlaubte Zeilen). Alle anderen
--     Tabellen: RLS an, keine Policies, keine Rechte.
--   * Rollen: Admin = public.admins / is_admin() (Migration 005). Moderator:in = chat_moderators
--     (nur Admins können eintragen). Rechte werden IN DER DATENBANK geprüft.
--   * Nachrichten werden VOR dem Speichern durch den Wortfilter geschickt; gespeichert und
--     ausgeliefert wird nur die zensierte Fassung. Kontaktdaten (E-Mail, Links, Telefon) werden
--     abgelehnt (wie Nachhilfe, 011).
--   * Private Chats: erst Anfrage, Gespräch erst nach Annahme. Pro Personenpaar höchstens eine
--     offene Anfrage und ein Gespräch (eindeutige Indizes – auch bei gleichzeitigen Anfragen).
--   * Sperren (global / pro Raum) und Blockieren werden bei JEDER Schreibaktion geprüft.
--   * Admins lesen private Nachrichten NICHT allgemein – nur den gemeldeten Inhalt und (protokolliert)
--     den Zusammenhang einer Meldung.
--
-- Fehlercodes (SQLSTATE):
--   42501 nicht angemeldet / keine Berechtigung · P0002 nicht gefunden · 22023 ungültige Eingabe
--   DC040 Chat ausgeschaltet · DC041 gesperrt (DETAIL = Ende, HINT = global|room)
--   DC042 kein Zugriff (kein Mitglied / kein Gespräch) · DC043 Kontaktdaten nicht erlaubt
--   DC044 zu viele Nachrichten/Anfragen · DC045 blockiert · DC046 offene Anfrage besteht schon
--   (HINT = incoming|outgoing) · DC047 Wartezeit nach Ablehnung (DETAIL = bis wann)
--   DC048 Gespräch besteht schon (DETAIL = Gesprächs-ID) · DC049 Person nicht erreichbar
--   DC050 Raum/Gespräch archiviert (nur lesen)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.events') is null
     or to_regclass('public.event_registrations') is null or to_regclass('public.ideas') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
  if to_regclass('public.admins') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 005 ausführen (Admin-Rolle).';
  end if;
  if to_regprocedure('public.dc_has_contact_data(text)') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 011 ausführen (Kontaktdaten-Prüfung).';
  end if;
  if to_regclass('public.profile_sharing') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 012 ausführen (Profil-Freigaben).';
  end if;
  if to_regclass('public.idea_members') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 013 ausführen (Projekt-Mitglieder).';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabellen
-- -----------------------------------------------------------------------------
-- Einstellungen (genau eine Zeile). enabled = false → Chat für normale Nutzer:innen aus.
create table if not exists public.chat_config (
  id                     integer primary key default 1 check (id = 1),
  enabled                boolean not null default false,
  request_cooldown_hours integer not null default 168 check (request_cooldown_hours between 0 and 8760),
  requests_per_day       integer not null default 10 check (requests_per_day between 1 and 100),
  messages_per_minute    integer not null default 10 check (messages_per_minute between 1 and 120),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles (id) on delete set null
);
insert into public.chat_config (id) values (1) on conflict (id) do nothing;

-- Moderator:innen (Admins stehen in public.admins aus 005).
create table if not exists public.chat_moderators (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- Räume: 4 feste Themenräume + Projekt- und Event-Gruppen (eine je Projekt/Event).
create table if not exists public.chat_rooms (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('topic', 'project', 'event')),
  slug        text unique check (slug is null or slug ~ '^[a-z]{3,20}$'),
  idea_id     uuid unique references public.ideas (id) on delete cascade,
  -- RESTRICT: Ein Event mit Chat-Gruppe kann nicht gelöscht werden, sonst verschwänden Nachrichten
  -- ohne eigene Aufbewahrungsregel. Erst die Gruppe bewusst in der Chat-Moderation löschen (protokolliert).
  -- (Über die App ist das ohnehin nicht möglich: löschbar sind nur Entwürfe, Gruppen gibt es nur für
  -- geplante/bestätigte Events, und die werden nie wieder Entwurf.) Ablauf/Archivieren (008) löscht nichts.
  -- Automatisches Löschen (018) löst die Gruppe VORHER vom Event: chat_detach_event_room (unten) –
  -- Nachrichten bleiben, Angemeldete bleiben Mitglieder (nur lesen), Titel als Kopie in event_title.
  event_id    uuid unique references public.events (id) on delete restrict,
  event_title jsonb,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
  -- Prüfregel chat_rooms_kind_target: siehe unten (gemeinsam mit dem Umstellungs-Block)
);
insert into public.chat_rooms (kind, slug)
values ('topic', 'general'), ('topic', 'learning'), ('topic', 'projects'), ('topic', 'events')
on conflict (slug) do nothing;

-- Falls chat_rooms aus einer älteren Fassung von 014 schon existiert: Verknüpfung zu events auf RESTRICT umstellen.
do $$
declare
  fk record;
begin
  for fk in select c.conname from pg_constraint c
             where c.conrelid = 'public.chat_rooms'::regclass and c.contype = 'f'
               and c.confrelid = 'public.events'::regclass and c.confdeltype <> 'r' loop
    execute format('alter table public.chat_rooms drop constraint %I', fk.conname);
    alter table public.chat_rooms
      add constraint chat_rooms_event_id_fkey foreign key (event_id) references public.events (id) on delete restrict;
  end loop;
end;
$$;

-- Eventgruppe OHNE Event (event_id = null) gibt es nur, wenn ihr Event gelöscht wurde (018) –
-- dann ist sie immer archiviert (nur lesen). Gilt auch für ältere Fassungen dieser Tabelle.
alter table public.chat_rooms add column if not exists event_title jsonb;
alter table public.chat_rooms drop constraint if exists chat_rooms_kind_target;
alter table public.chat_rooms add constraint chat_rooms_kind_target check (
  (kind = 'topic'   and slug is not null and idea_id is null and event_id is null) or
  (kind = 'project' and slug is null and idea_id is not null and event_id is null) or
  (kind = 'event'   and slug is null and idea_id is null and (event_id is not null or archived_at is not null)));

-- Mitgliedschaft NUR für Themenräume (Projekt/Event: abgeleitet aus 013 bzw. 001).
create table if not exists public.chat_room_members (
  room_id   uuid not null references public.chat_rooms (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists chat_room_members_user_idx on public.chat_room_members (user_id);

-- Private Gespräche: genau zwei Personen (user_a < user_b), höchstens EIN Gespräch je Paar.
create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  constraint chat_conversations_pair check (user_a < user_b),
  constraint chat_conversations_unique_pair unique (user_a, user_b)
);
create index if not exists chat_conversations_b_idx on public.chat_conversations (user_b);

-- Nachrichtenanfragen. Eine Anfrage ist KEIN Gespräch.
create table if not exists public.chat_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  intro           text not null check (char_length(intro) between 1 and 500),
  intro_censored  boolean not null default false,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'blocked')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  conversation_id uuid references public.chat_conversations (id) on delete set null,
  constraint chat_requests_not_self check (sender_id <> recipient_id)
);
-- Höchstens EINE offene Anfrage je Personenpaar – egal in welche Richtung.
create unique index if not exists chat_requests_one_pending_per_pair
  on public.chat_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';
create index if not exists chat_requests_recipient_idx on public.chat_requests (recipient_id, status);
create index if not exists chat_requests_sender_idx on public.chat_requests (sender_id, created_at);

-- Nachrichten (Raum ODER Gespräch). body ist IMMER die zensierte Fassung.
create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid references public.chat_rooms (id) on delete cascade,
  conversation_id uuid references public.chat_conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  censored        boolean not null default false,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles (id) on delete set null,
  constraint chat_messages_one_target check ((room_id is null) <> (conversation_id is null)),
  constraint chat_messages_body check (
    (deleted_at is null and char_length(body) between 1 and 1000) or (deleted_at is not null and body = ''))
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, created_at);
create index if not exists chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);
create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id, created_at);

-- Reaktionen: kleine feste Auswahl, je Person/Nachricht/Emoji höchstens einmal.
create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists chat_reactions_user_idx on public.chat_reactions (user_id);

-- Blockieren (gilt in beide Richtungen für Sichtbarkeit und Kontakt).
create table if not exists public.chat_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint chat_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked_id);

-- Zeitlich begrenzte Sperren (global oder für einen Raum).
create table if not exists public.chat_bans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  scope      text not null check (scope in ('global', 'room')),
  room_id    uuid references public.chat_rooms (id) on delete cascade,
  reason     text not null check (char_length(reason) between 3 and 500),
  issued_by  uuid references public.profiles (id) on delete set null,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  ended_at   timestamptz,
  ended_by   uuid references public.profiles (id) on delete set null,
  end_reason text check (end_reason is null or char_length(end_reason) <= 500),
  constraint chat_bans_scope check ((scope = 'room') = (room_id is not null)),
  constraint chat_bans_period check (ends_at > starts_at)
);
create index if not exists chat_bans_user_idx on public.chat_bans (user_id, ends_at);

-- Meldungen. evidence = Kopie des (zensierten) gemeldeten Textes → bleibt erhalten,
-- auch wenn Nachricht/Gespräch später gelöscht wird.
create table if not exists public.chat_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references public.profiles (id) on delete set null,
  target_type       text not null check (target_type in ('message', 'user', 'room', 'conversation', 'request')),
  category          text not null check (category in ('language', 'harassment', 'discrimination', 'privacy', 'spam', 'other')),
  note              text check (note is null or char_length(note) <= 500),
  message_id        uuid references public.chat_messages (id) on delete set null,
  target_user_id    uuid references public.profiles (id) on delete set null,
  room_id           uuid references public.chat_rooms (id) on delete set null,
  conversation_id   uuid references public.chat_conversations (id) on delete set null,
  request_id        uuid references public.chat_requests (id) on delete set null,
  evidence          text,
  evidence_sent_at  timestamptz,
  status            text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at        timestamptz not null default now(),
  resolved_by       uuid references public.profiles (id) on delete set null,
  resolved_at       timestamptz,
  resolution        text check (resolution is null or char_length(resolution) <= 500)
);
create index if not exists chat_reports_status_idx on public.chat_reports (status, created_at);

-- Audit-Protokoll aller Moderations-/Admin-Aktionen (nur Funktionen schreiben, nur Staff liest).
create table if not exists public.chat_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  reason      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_audit_created_idx on public.chat_audit_log (created_at desc);

-- Wortliste des Filters (von Admins pflegbar). term_norm = normalisierte Form (chat_norm).
create table if not exists public.chat_terms (
  term_norm    text primary key check (term_norm ~ '^[a-z]{2,40}$'),
  match_prefix boolean not null default false,
  language     text not null default 'other' check (language in ('de', 'tr', 'en', 'other')),
  added_by     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- RLS überall an; Rechte erst einmal komplett entziehen (Realtime-Lesezugriff: Teil 7).
do $$
declare
  t text;
begin
  foreach t in array array['chat_config', 'chat_moderators', 'chat_rooms', 'chat_room_members',
    'chat_conversations', 'chat_requests', 'chat_messages', 'chat_reactions', 'chat_blocks', 'chat_bans',
    'chat_reports', 'chat_audit_log', 'chat_terms'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Wortfilter
-- -----------------------------------------------------------------------------
-- Normalisierung: Unicode vereinheitlichen (NFKD), Akzente/Umlaut-Punkte entfernen, Kleinbuchstaben,
-- türkisches ı/İ und ß, häufige Ersatzzeichen (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i, 8→b),
-- kyrillische Doppelgänger, alles außer a–z entfernen, Buchstaben-Wiederholungen zusammenfassen.
create or replace function public.chat_norm(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := coalesce(p_text, '');
begin
  t := replace(replace(t, 'İ', 'i'), 'ı', 'i');
  t := normalize(t, NFKD);
  t := regexp_replace(t, '[̀-ͯ]', '', 'g');
  t := lower(t);
  t := replace(t, 'ß', 'ss');
  t := translate(t, 'аеорсхукі', 'aeopcxyki');
  t := translate(t, '013457@$!8', 'oieastasib');
  t := regexp_replace(t, '[^a-z]', '', 'g');
  t := regexp_replace(t, '(.)\1+', '\1', 'g');
  return t;
end;
$$;

-- Ist ein (normalisiertes) Wort auf der Liste? exact = ganzes Wort, prefix = Wortanfang (Zusammensetzungen).
create or replace function public.chat_is_bad_word(p_norm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_norm, '') <> '' and exists (
    select 1 from public.chat_terms t
     where (not t.match_prefix and p_norm = t.term_norm)
        or (t.match_prefix and left(p_norm, char_length(t.term_norm)) = t.term_norm));
$$;

-- Zensiert einen Text Wort für Wort (Wortgrenzen = Leerraum; Satzzeichen am Wortende bleiben).
-- Erkennt auch Schreibweisen mit Leerzeichen zwischen Einzelbuchstaben („f u c k“) und
-- Wörter, die mit , ; : ? ( ) " / \ _ - zusammengeklebt sind.
create or replace function public.chat_censor(p_text text, out body text, out censored boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  segs text[];
  n integer;
  i integer := 1;
  k integer;
  last_letter integer;
  letters text;
  seg text;
  core text;
  trail text;
  part text;
  replaced text;
begin
  body := '';
  censored := false;
  select coalesce(array_agg(m[1] order by ord), '{}') into segs
    from regexp_matches(coalesce(p_text, ''), '(\s+|\S+)', 'g') with ordinality as x(m, ord);
  n := coalesce(array_length(segs, 1), 0);

  while i <= n loop
    seg := segs[i];
    if seg ~ '^\s+$' then
      body := body || seg; i := i + 1; continue;
    end if;

    -- a) Einzelbuchstaben mit Leerzeichen dazwischen („f u c k“, „a r s c h“)
    if char_length(public.chat_norm(seg)) = 1 then
      k := i; letters := ''; last_letter := i;
      loop
        exit when k > n or segs[k] ~ '^\s+$' or char_length(public.chat_norm(segs[k])) <> 1;
        letters := letters || public.chat_norm(segs[k]);
        last_letter := k;
        exit when k + 2 > n or segs[k + 1] !~ '^\s+$';
        k := k + 2;
      end loop;
      if char_length(letters) >= 3 and public.chat_is_bad_word(public.chat_norm(letters)) then
        body := body || '***'; censored := true; i := last_letter + 1; continue;
      end if;
    end if;

    -- b) ganzes Wort (ohne Satzzeichen am Ende)
    trail := coalesce(substring(seg from '[.,!?;:)"]+$'), '');
    core := left(seg, char_length(seg) - char_length(trail));
    if core <> '' and public.chat_is_bad_word(public.chat_norm(core)) then
      body := body || '***' || trail; censored := true; i := i + 1; continue;
    end if;

    -- c) zusammengeklebte Teile („nett,idiot“, „du-arsch“)
    replaced := seg;
    foreach part in array regexp_split_to_array(core, '[,;:?()"/\\_-]+') loop
      if char_length(public.chat_norm(part)) >= 2 and public.chat_is_bad_word(public.chat_norm(part)) then
        replaced := replace(replaced, part, '***'); censored := true;
      end if;
    end loop;
    body := body || replaced;
    i := i + 1;
  end loop;
end;
$$;

-- Startliste (bewusst eher kurz und eindeutig; mehrdeutige Wörter wie „dick“, „got“, „pic“, „mal“
-- fehlen absichtlich – sie würden harmlose Wörter treffen). Pflege über chat_admin_set_term().
insert into public.chat_terms (term_norm, match_prefix, language)
select public.chat_norm(v.term), v.prefix, v.lang
  from (values
    -- Deutsch
    ('arsch', true, 'de'), ('fick', true, 'de'), ('fotze', true, 'de'), ('hure', true, 'de'),
    ('schlampe', true, 'de'), ('wichs', true, 'de'), ('scheiß', true, 'de'), ('scheiss', true, 'de'),
    ('missgeburt', true, 'de'), ('spast', false, 'de'), ('spasti', false, 'de'), ('penner', false, 'de'),
    ('vollidiot', true, 'de'), ('idiot', false, 'other'), ('idioten', false, 'de'), ('idiots', false, 'en'),
    ('drecksau', true, 'de'), ('schwuchtel', true, 'de'),
    ('kanake', true, 'de'), ('neger', true, 'de'), ('bastard', true, 'other'),
    -- Türkisch
    ('amk', false, 'tr'), ('aq', false, 'tr'), ('orospu', true, 'tr'), ('siktir', true, 'tr'),
    ('sikerim', true, 'tr'), ('sikik', true, 'tr'), ('amcık', true, 'tr'), ('amınakoy', true, 'tr'),
    ('yarrak', true, 'tr'), ('yavşak', true, 'tr'), ('şerefsiz', true, 'tr'), ('pezevenk', true, 'tr'),
    ('kahpe', true, 'tr'), ('gerizekalı', true, 'tr'), ('salak', true, 'tr'), ('aptal', false, 'tr'),
    ('ibne', true, 'tr'), ('götveren', true, 'tr'),
    -- Englisch
    ('fuck', true, 'en'), ('motherfuck', true, 'en'), ('shit', false, 'en'), ('shitty', false, 'en'),
    ('bullshit', false, 'en'), ('bitch', true, 'en'), ('asshole', true, 'en'), ('ass', false, 'en'),
    ('cunt', true, 'en'), ('whore', true, 'en'), ('slut', true, 'en'), ('retard', true, 'en'),
    ('nigger', true, 'en'), ('nigga', true, 'en'), ('faggot', true, 'en'), ('fag', false, 'en'),
    ('dickhead', true, 'en'), ('wanker', true, 'en')
  ) as v(term, prefix, lang)
on conflict (term_norm) do nothing;

-- -----------------------------------------------------------------------------
-- 3) Hilfsfunktionen (Rollen, Schalter, Zugriff, Sperren) – intern bzw. für Policies
-- -----------------------------------------------------------------------------
create or replace function public.chat_is_admin(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and exists (select 1 from public.admins a where a.user_id = p_uid);
$$;

create or replace function public.chat_is_staff(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and (public.chat_is_admin(p_uid)
         or exists (select 1 from public.chat_moderators m where m.user_id = p_uid));
$$;

create or replace function public.chat_is_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_blocks b
                  where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;

-- Mitglied eines Raums? Themenraum: Beitritt; Projekt: Autor:in oder Mitglied (013);
-- Event: angemeldet (001); nach dem Löschen des Events (018) die beim Löschen gesicherte Liste
-- in chat_room_members. Archivierte Räume bleiben für Mitglieder lesbar.
create or replace function public.chat_is_room_member(p_room uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and exists (
    select 1 from public.chat_rooms r
     where r.id = p_room and (
       (r.kind = 'topic' and exists (select 1 from public.chat_room_members m where m.room_id = r.id and m.user_id = p_uid))
       or (r.kind = 'project' and exists (
             select 1 from public.ideas i where i.id = r.idea_id and (i.author_id = p_uid or exists (
               select 1 from public.idea_members im where im.idea_id = i.id and im.user_id = p_uid and im.status = 'member'))))
       or (r.kind = 'event' and r.event_id is not null and exists (
             select 1 from public.event_registrations er
              where er.event_id = r.event_id and er.user_id = p_uid and er.status = 'registered'))
       or (r.kind = 'event' and r.event_id is null and exists (
             select 1 from public.chat_room_members m where m.room_id = r.id and m.user_id = p_uid))));
$$;

create or replace function public.chat_can_read_room(p_room uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.chat_is_room_member(p_room, p_uid) or public.chat_is_staff(p_uid);
$$;

-- Gespräch lesen: nur die zwei Beteiligten und nur, solange keine Blockierung besteht.
create or replace function public.chat_can_read_conversation(p_conversation uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and exists (
    select 1 from public.chat_conversations c
     where c.id = p_conversation and p_uid in (c.user_a, c.user_b)
       and not public.chat_is_blocked(c.user_a, c.user_b));
$$;

-- Für die SELECT-Policy (Realtime): darf die angemeldete Person diese Nachricht sehen?
create or replace function public.chat_message_visible(p_room uuid, p_conversation uuid, p_sender uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_room is not null then public.chat_can_read_room(p_room, auth.uid())
                                 and not public.chat_is_blocked(auth.uid(), p_sender)
    else public.chat_can_read_conversation(p_conversation, auth.uid())
  end;
$$;

-- Aktive Sperre? (global oder für den Raum) → Ende + Bereich, sonst keine Zeile.
create or replace function public.chat_active_ban(p_uid uuid, p_room uuid)
returns table (ends_at timestamptz, scope text)
language sql stable security definer set search_path = '' as $$
  select b.ends_at, b.scope from public.chat_bans b
   where b.user_id = p_uid and b.ended_at is null and b.starts_at <= now() and b.ends_at > now()
     and (b.scope = 'global' or (p_room is not null and b.room_id = p_room))
   order by (b.scope = 'global') desc, b.ends_at desc
   limit 1;
$$;

-- Angemeldet? → eigene ID, sonst 42501.
create or replace function public.chat_require_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Chat eingeschaltet? Für normale Nutzer:innen nur, wenn enabled UND mindestens eine Person
-- mit Moderationsrechten existiert. Staff darf vorab testen.
create or replace function public.chat_require_enabled(p_uid uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.chat_is_staff(p_uid) then
    return;
  end if;
  if not coalesce((select c.enabled from public.chat_config c where c.id = 1), false)
     or not (exists (select 1 from public.admins) or exists (select 1 from public.chat_moderators)) then
    raise exception 'Chat ist ausgeschaltet' using errcode = 'DC040';
  end if;
end;
$$;

-- Darf schreiben/reagieren? Prüft Sperre (global bzw. Raum). Wirft DC041 mit Ende + Bereich.
create or replace function public.chat_require_not_banned(p_uid uuid, p_room uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  ban record;
begin
  select * into ban from public.chat_active_ban(p_uid, p_room);
  if found then
    raise exception 'Gesperrt' using errcode = 'DC041', detail = ban.ends_at::text, hint = ban.scope;
  end if;
end;
$$;

-- Text prüfen + zensieren (gemeinsam für Nachrichten, Anfragen, Meldungs-Notizen).
create or replace function public.chat_clean_text(p_text text, p_max integer, out body text, out censored boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  t text := btrim(coalesce(p_text, ''));
  c record;
begin
  if char_length(t) < 1 or char_length(t) > p_max then
    raise exception 'Text leer oder zu lang' using errcode = '22023';
  end if;
  if public.dc_has_contact_data(t) then
    raise exception 'Kontaktdaten sind nicht erlaubt' using errcode = 'DC043';
  end if;
  select * into c from public.chat_censor(t);
  body := c.body;
  censored := c.censored;
end;
$$;

create or replace function public.chat_audit(p_actor uuid, p_action text, p_type text, p_id text,
                                            p_reason text, p_details jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.chat_audit_log (actor_id, action, target_type, target_id, reason, details)
  values (p_actor, p_action, p_type, p_id, p_reason, coalesce(p_details, '{}'::jsonb));
$$;

-- Nachrichten-Zeilen inkl. Reaktionen für die Anzeige (intern; Zugriff prüft der Aufrufer).
-- Mit Profilfarbe der Absender:in (avatar_color, für das Profilbild-Kürzel – wie im Verzeichnis aus 012).
-- Rückgabe geändert -> vorher löschen (die beiden Aufrufer werden unten ebenfalls neu angelegt).
drop function if exists public.chat_room_messages(uuid, timestamptz, integer);
drop function if exists public.chat_conversation_messages(uuid, timestamptz, integer);
drop function if exists public.chat_message_rows(uuid, uuid, uuid, timestamptz, integer);
create or replace function public.chat_message_rows(p_room uuid, p_conversation uuid, p_uid uuid,
                                                   p_before timestamptz, p_limit integer)
returns table (id uuid, sender_id uuid, sender_name text, sender_avatar_color text, is_own boolean, body text,
               censored boolean, created_at timestamptz, deleted boolean, reactions jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, x.sender_id, x.sender_name, x.sender_avatar_color, x.is_own, x.body, x.censored, x.created_at,
         x.deleted, x.reactions
    from (
      select m.id, m.sender_id, p.first_name as sender_name, p.avatar_color as sender_avatar_color,
             m.sender_id = p_uid as is_own,
             m.body, (m.censored and m.sender_id = p_uid) as censored, m.created_at,
             m.deleted_at is not null as deleted,
             coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'mine', r.mine) order by r.emoji)
                         from (select cr.emoji, count(*)::integer as cnt, bool_or(cr.user_id = p_uid) as mine
                                 from public.chat_reactions cr where cr.message_id = m.id group by cr.emoji) r),
                      '[]'::jsonb) as reactions
        from public.chat_messages m
        join public.profiles p on p.id = m.sender_id
       where (m.room_id = p_room or m.conversation_id = p_conversation)
         and (p_before is null or m.created_at < p_before)
         and not public.chat_is_blocked(p_uid, m.sender_id)
       order by m.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x
   order by x.created_at asc;
$$;

-- -----------------------------------------------------------------------------
-- 4) Funktionen für alle angemeldeten Nutzer:innen
-- -----------------------------------------------------------------------------
-- Eigener Stand: Rolle, Chat an/aus, eigene globale Sperre.
create or replace function public.chat_status()
returns table (enabled boolean, role text, ban_ends_at timestamptz, cooldown_hours integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  return query
    select coalesce(c.enabled, false)
             and (exists (select 1 from public.admins) or exists (select 1 from public.chat_moderators)),
           case when public.chat_is_admin(uid) then 'admin'
                when public.chat_is_staff(uid) then 'moderator' else 'user' end,
           (select b.ends_at from public.chat_active_ban(uid, null) b where b.scope = 'global'),
           c.request_cooldown_hours
      from public.chat_config c where c.id = 1;
end;
$$;

-- Räume, die man sehen darf: alle Themenräume (beitreten möglich) + eigene Projekt-/Event-Gruppen.
create or replace function public.chat_list_rooms()
returns table (id uuid, kind text, slug text, idea_id uuid, idea_title text, event_id uuid, event_title jsonb,
               is_member boolean, member_count integer, archived boolean, last_message_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  return query
    select r.id, r.kind, r.slug, r.idea_id, i.title, r.event_id, coalesce(e.title, r.event_title),
           public.chat_is_room_member(r.id, uid),
           case
             when r.kind = 'topic' or r.event_id is null
               then (select count(*)::integer from public.chat_room_members m where m.room_id = r.id)
             when r.kind = 'project' then 1 + (select count(*)::integer from public.idea_members im
                                       where im.idea_id = r.idea_id and im.status = 'member')
             else (select count(*)::integer from public.event_registrations er
                    where er.event_id = r.event_id and er.status = 'registered') end,
           r.archived_at is not null,
           (select max(m.created_at) from public.chat_messages m where m.room_id = r.id and m.deleted_at is null)
      from public.chat_rooms r
      left join public.ideas i on i.id = r.idea_id
      left join public.events e on e.id = r.event_id
     where (r.kind = 'topic' and (r.archived_at is null or public.chat_is_staff(uid)))
        or public.chat_can_read_room(r.id, uid)
     order by (r.kind = 'topic') desc, r.slug nulls last, r.created_at;
end;
$$;

create or replace function public.chat_join_room(p_room uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  if not exists (select 1 from public.chat_rooms r where r.id = p_room and r.kind = 'topic' and r.archived_at is null) then
    raise exception 'Raum nicht gefunden' using errcode = 'P0002';
  end if;
  insert into public.chat_room_members (room_id, user_id) values (p_room, uid) on conflict do nothing;
end;
$$;

create or replace function public.chat_leave_room(p_room uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  delete from public.chat_room_members m where m.room_id = p_room and m.user_id = uid;
end;
$$;

-- Projektgruppe anlegen: Autor:in einer veröffentlichten Idee (oder Staff). Eine je Projekt.
create or replace function public.chat_create_project_room(p_idea uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  rid uuid;
begin
  perform public.chat_require_enabled(uid);
  perform public.chat_require_not_banned(uid, null);
  if not exists (select 1 from public.ideas i where i.id = p_idea and i.status in ('collecting', 'review', 'planned')
                   and (i.author_id = uid or public.chat_is_staff(uid))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.chat_rooms (kind, idea_id, created_by) values ('project', p_idea, uid)
  on conflict (idea_id) do nothing;
  select r.id into rid from public.chat_rooms r where r.idea_id = p_idea;
  return rid;
end;
$$;

-- Eventgruppe anlegen: nur Staff (Events haben keine Besitzer:innen, sie kommen von Admins).
create or replace function public.chat_create_event_room(p_event uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  rid uuid;
begin
  if not public.chat_is_staff(uid) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event and e.status in ('planned', 'confirmed')) then
    raise exception 'Event nicht gefunden' using errcode = 'P0002';
  end if;
  insert into public.chat_rooms (kind, event_id, created_by) values ('event', p_event, uid)
  on conflict (event_id) do nothing;
  select r.id into rid from public.chat_rooms r where r.event_id = p_event;
  perform public.chat_audit(uid, 'create_event_room', 'room', rid::text, null, jsonb_build_object('event_id', p_event));
  return rid;
end;
$$;

-- INTERN (nur Datenbank-Eigentümer; aufgerufen von delete_expired_events, Migration 018):
-- Eventgruppe vom Event lösen, BEVOR das Event gelöscht wird – damit der Chatverlauf erhalten bleibt.
--   * verbindlich Angemeldete werden als Mitglieder gesichert (chat_room_members) -> lesen weiter mit
--   * Event-Titel wird kopiert (event_title), Raum archiviert (nur lesen), event_id = null
--   * Nachrichten, Reaktionen, Meldungen bleiben unverändert; Eintrag im Audit-Protokoll
-- Gibt die Raum-ID zurück (null = Event hatte keine Gruppe). Mehrfach aufrufen ist harmlos.
create or replace function public.chat_detach_event_room(p_event uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  rid uuid;
  n_members integer;
begin
  select r.id into rid from public.chat_rooms r where r.event_id = p_event for update;
  if rid is null then
    return null;
  end if;
  insert into public.chat_room_members (room_id, user_id)
  select rid, er.user_id from public.event_registrations er
   where er.event_id = p_event and er.status = 'registered'
  on conflict do nothing;
  get diagnostics n_members = row_count;
  update public.chat_rooms r
     set event_title = (select e.title from public.events e where e.id = p_event),
         archived_at = coalesce(r.archived_at, now()),
         event_id = null
   where r.id = rid;
  perform public.chat_audit(null, 'detach_event_room', 'room', rid::text, 'Event automatisch gelöscht (018)',
                            jsonb_build_object('event_id', p_event, 'members_kept', n_members,
                                               'messages', (select count(*) from public.chat_messages m where m.room_id = rid)));
  return rid;
end;
$$;

-- Raum-Details inkl. „darf ich schreiben?“ und – falls gesperrt – Ende + Bereich der Sperre.
drop function if exists public.chat_room_detail(uuid);
create or replace function public.chat_room_detail(p_room uuid)
returns table (id uuid, kind text, slug text, idea_id uuid, idea_title text, event_id uuid, event_title jsonb,
               is_member boolean, archived boolean, can_write boolean, ban_ends_at timestamptz, ban_scope text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  if not exists (select 1 from public.chat_rooms r where r.id = p_room
                   and (public.chat_can_read_room(r.id, uid) or (r.kind = 'topic' and r.archived_at is null))) then
    raise exception 'Raum nicht gefunden' using errcode = 'P0002';
  end if;
  return query
    select r.id, r.kind, r.slug, r.idea_id, i.title, r.event_id, coalesce(e.title, r.event_title),
           public.chat_is_room_member(r.id, uid),
           r.archived_at is not null,
           public.chat_is_room_member(r.id, uid) and r.archived_at is null
             and coalesce(e.status, '') <> 'cancelled'
             and not exists (select 1 from public.chat_active_ban(uid, r.id)),
           (select b.ends_at from public.chat_active_ban(uid, r.id) b),
           (select b.scope from public.chat_active_ban(uid, r.id) b)
      from public.chat_rooms r
      left join public.ideas i on i.id = r.idea_id
      left join public.events e on e.id = r.event_id
     where r.id = p_room;
end;
$$;

-- Mitgliederliste (nur Vornamen) – nur für Mitglieder bzw. Staff.
create or replace function public.chat_room_members(p_room uuid)
returns table (user_id uuid, first_name text, is_self boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
  r record;
begin
  perform public.chat_require_enabled(uid);
  if not public.chat_can_read_room(p_room, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  select * into r from public.chat_rooms x where x.id = p_room;
  return query
    select p.id, p.first_name, p.id = uid
      from public.profiles p
     where not public.chat_is_blocked(uid, p.id)
       and ((r.kind = 'topic' and exists (select 1 from public.chat_room_members m where m.room_id = r.id and m.user_id = p.id))
         or (r.kind = 'project' and (p.id = (select i.author_id from public.ideas i where i.id = r.idea_id)
               or exists (select 1 from public.idea_members im where im.idea_id = r.idea_id and im.user_id = p.id and im.status = 'member')))
         or (r.kind = 'event' and r.event_id is not null and exists (select 1 from public.event_registrations er
               where er.event_id = r.event_id and er.user_id = p.id and er.status = 'registered'))
         or (r.kind = 'event' and r.event_id is null
               and exists (select 1 from public.chat_room_members m where m.room_id = r.id and m.user_id = p.id)))
     order by p.first_name;
end;
$$;

create or replace function public.chat_room_messages(p_room uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, sender_name text, sender_avatar_color text, is_own boolean, body text,
               censored boolean, created_at timestamptz, deleted boolean, reactions jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  if not public.chat_can_read_room(p_room, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  return query select * from public.chat_message_rows(p_room, null, uid, p_before, p_limit);
end;
$$;

-- Ratenbegrenzung für Nachrichten (alle Räume + Gespräche zusammen).
create or replace function public.chat_require_message_rate(p_uid uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(*) from public.chat_messages m
       where m.sender_id = p_uid and m.created_at > now() - interval '1 minute')
     >= (select c.messages_per_minute from public.chat_config c where c.id = 1) then
    raise exception 'Zu viele Nachrichten' using errcode = 'DC044';
  end if;
end;
$$;

create or replace function public.chat_send_room_message(p_room uuid, p_body text)
returns table (id uuid, censored boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
  rm record;
  clean record;
  mid uuid;
begin
  perform public.chat_require_enabled(uid);
  select r.*, e.status as event_status into rm
    from public.chat_rooms r left join public.events e on e.id = r.event_id where r.id = p_room;
  if not found then
    raise exception 'Raum nicht gefunden' using errcode = 'P0002';
  end if;
  if not public.chat_is_room_member(p_room, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  if rm.archived_at is not null or rm.event_status = 'cancelled' then
    raise exception 'Raum archiviert' using errcode = 'DC050';
  end if;
  perform public.chat_require_not_banned(uid, p_room);
  perform public.chat_require_message_rate(uid);
  select * into clean from public.chat_clean_text(p_body, 1000);
  insert into public.chat_messages (room_id, sender_id, body, censored)
  values (p_room, uid, clean.body, clean.censored)
  returning chat_messages.id into mid;
  return query select mid, clean.censored;
end;
$$;

-- Eigene Nachricht löschen (Text wird entfernt, Zeile bleibt als „gelöscht“; Reaktionen weg).
create or replace function public.chat_delete_own_message(p_message uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  update public.chat_messages m
     set body = '', deleted_at = now(), deleted_by = uid, censored = false
   where m.id = p_message and m.sender_id = uid and m.deleted_at is null;
  if not found then
    raise exception 'Nachricht nicht gefunden' using errcode = 'P0002';
  end if;
  delete from public.chat_reactions r where r.message_id = p_message;
end;
$$;

-- Reaktion an/aus. Nur auf sichtbare, nicht gelöschte Nachrichten; Sperren gelten.
create or replace function public.chat_toggle_reaction(p_message uuid, p_emoji text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  m record;
begin
  perform public.chat_require_enabled(uid);
  select x.*, r.archived_at as room_archived, c.archived_at as conv_archived into m
    from public.chat_messages x
    left join public.chat_rooms r on r.id = x.room_id
    left join public.chat_conversations c on c.id = x.conversation_id
   where x.id = p_message and x.deleted_at is null;
  if not found then
    raise exception 'Nachricht nicht gefunden' using errcode = 'P0002';
  end if;
  if (m.room_id is not null and not (public.chat_is_room_member(m.room_id, uid) and not public.chat_is_blocked(uid, m.sender_id)))
     or (m.conversation_id is not null and not public.chat_can_read_conversation(m.conversation_id, uid)) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  if m.room_archived is not null or m.conv_archived is not null then
    raise exception 'Archiviert' using errcode = 'DC050';
  end if;
  perform public.chat_require_not_banned(uid, m.room_id);
  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '👏') then
    raise exception 'Unbekannte Reaktion' using errcode = '22023';
  end if;
  delete from public.chat_reactions r where r.message_id = p_message and r.user_id = uid and r.emoji = p_emoji;
  if found then
    return false;
  end if;
  insert into public.chat_reactions (message_id, user_id, emoji) values (p_message, uid, p_emoji)
  on conflict do nothing;
  return true;
end;
$$;

-- ---------- Private Chats: Anfragen ----------
-- Anfrage senden. Empfänger:in muss ein öffentliches Profil haben (Profile sind seit 012 privat).
create or replace function public.chat_send_request(p_recipient uuid, p_intro text)
returns table (id uuid, censored boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
  cfg record;
  clean record;
  last_declined timestamptz;
  existing uuid;
  pending record;
  rid uuid;
begin
  perform public.chat_require_enabled(uid);
  perform public.chat_require_not_banned(uid, null);
  if p_recipient is null or p_recipient = uid
     or not exists (select 1 from public.profiles p where p.id = p_recipient)
     or not coalesce((select s.is_public from public.profile_sharing s where s.user_id = p_recipient), false) then
    raise exception 'Person nicht erreichbar' using errcode = 'DC049';
  end if;
  if public.chat_is_blocked(uid, p_recipient) then
    raise exception 'Blockiert' using errcode = 'DC045';
  end if;
  select c.id into existing from public.chat_conversations c
   where c.user_a = least(uid, p_recipient) and c.user_b = greatest(uid, p_recipient);
  if existing is not null then
    raise exception 'Gespräch besteht schon' using errcode = 'DC048', detail = existing::text;
  end if;
  select r.id, r.sender_id into pending from public.chat_requests r
   where r.status = 'pending'
     and least(r.sender_id, r.recipient_id) = least(uid, p_recipient)
     and greatest(r.sender_id, r.recipient_id) = greatest(uid, p_recipient);
  if found then
    raise exception 'Offene Anfrage besteht' using errcode = 'DC046',
      hint = case when pending.sender_id = uid then 'outgoing' else 'incoming' end;
  end if;
  select * into cfg from public.chat_config c where c.id = 1;
  select max(r.decided_at) into last_declined from public.chat_requests r
   where r.sender_id = uid and r.recipient_id = p_recipient and r.status = 'declined';
  if last_declined is not null and last_declined + make_interval(hours => cfg.request_cooldown_hours) > now() then
    raise exception 'Wartezeit' using errcode = 'DC047',
      detail = (last_declined + make_interval(hours => cfg.request_cooldown_hours))::text;
  end if;
  if (select count(*) from public.chat_requests r
       where r.sender_id = uid and r.created_at > now() - interval '24 hours') >= cfg.requests_per_day then
    raise exception 'Zu viele Anfragen' using errcode = 'DC044';
  end if;
  select * into clean from public.chat_clean_text(p_intro, 500);
  begin
    insert into public.chat_requests (sender_id, recipient_id, intro, intro_censored)
    values (uid, p_recipient, clean.body, clean.censored)
    returning chat_requests.id into rid;
  exception when unique_violation then
    -- gleichzeitige Anfrage der anderen Person (oder Doppelklick) – nur EINE offene Anfrage je Paar
    raise exception 'Offene Anfrage besteht' using errcode = 'DC046', hint = 'incoming';
  end;
  return query select rid, clean.censored;
end;
$$;

-- Eigene Anfragen: eingehende (offen) und ausgehende (offen + zuletzt entschieden).
create or replace function public.chat_list_requests()
returns table (id uuid, direction text, other_id uuid, other_name text, intro text, status text,
               created_at timestamptz, decided_at timestamptz, conversation_id uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  return query
    select r.id, case when r.recipient_id = uid then 'incoming' else 'outgoing' end,
           case when r.recipient_id = uid then r.sender_id else r.recipient_id end,
           p.first_name, r.intro, r.status, r.created_at, r.decided_at, r.conversation_id
      from public.chat_requests r
      join public.profiles p on p.id = case when r.recipient_id = uid then r.sender_id else r.recipient_id end
     where ((r.recipient_id = uid and r.status = 'pending')
         or (r.sender_id = uid and (r.status = 'pending' or r.decided_at > now() - interval '30 days')))
       and not public.chat_is_blocked(r.sender_id, r.recipient_id)
     order by r.created_at desc
     limit 100;
end;
$$;

-- Anfrage annehmen/ablehnen (nur Empfänger:in). Annehmen legt das Gespräch an (atomar) und
-- übernimmt die Vorstellungsnachricht als erste Nachricht.
create or replace function public.chat_respond_request(p_request uuid, p_accept boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  req record;
  cid uuid;
begin
  perform public.chat_require_enabled(uid);
  select * into req from public.chat_requests r where r.id = p_request and r.recipient_id = uid for update;
  if not found or req.status <> 'pending' then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if p_accept is not true then
    update public.chat_requests r set status = 'declined', decided_at = now() where r.id = p_request;
    return null;
  end if;
  perform public.chat_require_not_banned(uid, null);
  if public.chat_is_blocked(req.sender_id, req.recipient_id) then
    raise exception 'Blockiert' using errcode = 'DC045';
  end if;
  insert into public.chat_conversations (user_a, user_b)
  values (least(req.sender_id, req.recipient_id), greatest(req.sender_id, req.recipient_id))
  on conflict (user_a, user_b) do nothing;
  select c.id into cid from public.chat_conversations c
   where c.user_a = least(req.sender_id, req.recipient_id) and c.user_b = greatest(req.sender_id, req.recipient_id);
  insert into public.chat_messages (conversation_id, sender_id, body, censored, created_at)
  values (cid, req.sender_id, req.intro, req.intro_censored, req.created_at);
  update public.chat_requests r set status = 'accepted', decided_at = now(), conversation_id = cid where r.id = p_request;
  return cid;
end;
$$;

-- Eigene offene Anfrage zurückziehen.
create or replace function public.chat_cancel_request(p_request uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  update public.chat_requests r set status = 'cancelled', decided_at = now()
   where r.id = p_request and r.sender_id = uid and r.status = 'pending';
  if not found then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- Private Chats: Gespräche ----------
create or replace function public.chat_list_conversations()
returns table (id uuid, other_id uuid, other_name text, created_at timestamptz, archived boolean,
               last_message_at timestamptz, last_body text, last_is_own boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  return query
    select c.id, o.id, o.first_name, c.created_at, c.archived_at is not null,
           lm.created_at, lm.body, lm.sender_id = uid
      from public.chat_conversations c
      join public.profiles o on o.id = case when c.user_a = uid then c.user_b else c.user_a end
      left join lateral (select m.created_at, m.body, m.sender_id from public.chat_messages m
                          where m.conversation_id = c.id and m.deleted_at is null
                          order by m.created_at desc limit 1) lm on true
     where uid in (c.user_a, c.user_b) and not public.chat_is_blocked(c.user_a, c.user_b)
     order by coalesce(lm.created_at, c.created_at) desc;
end;
$$;

create or replace function public.chat_conversation_detail(p_conversation uuid)
returns table (id uuid, other_id uuid, other_name text, archived boolean, can_write boolean, ban_ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  if not public.chat_can_read_conversation(p_conversation, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  return query
    select c.id, o.id, o.first_name, c.archived_at is not null,
           c.archived_at is null and not exists (select 1 from public.chat_active_ban(uid, null)),
           (select b.ends_at from public.chat_active_ban(uid, null) b)
      from public.chat_conversations c
      join public.profiles o on o.id = case when c.user_a = uid then c.user_b else c.user_a end
     where c.id = p_conversation;
end;
$$;

create or replace function public.chat_conversation_messages(p_conversation uuid, p_before timestamptz default null,
                                                            p_limit integer default 50)
returns table (id uuid, sender_id uuid, sender_name text, sender_avatar_color text, is_own boolean, body text,
               censored boolean, created_at timestamptz, deleted boolean, reactions jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  if not public.chat_can_read_conversation(p_conversation, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  return query select * from public.chat_message_rows(null, p_conversation, uid, p_before, p_limit);
end;
$$;

create or replace function public.chat_send_conversation_message(p_conversation uuid, p_body text)
returns table (id uuid, censored boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
  clean record;
  mid uuid;
begin
  perform public.chat_require_enabled(uid);
  if not public.chat_can_read_conversation(p_conversation, uid) then
    raise exception 'Kein Zugriff' using errcode = 'DC042';
  end if;
  if exists (select 1 from public.chat_conversations c where c.id = p_conversation and c.archived_at is not null) then
    raise exception 'Gespräch archiviert' using errcode = 'DC050';
  end if;
  perform public.chat_require_not_banned(uid, null);
  perform public.chat_require_message_rate(uid);
  select * into clean from public.chat_clean_text(p_body, 1000);
  insert into public.chat_messages (conversation_id, sender_id, body, censored)
  values (p_conversation, uid, clean.body, clean.censored)
  returning chat_messages.id into mid;
  return query select mid, clean.censored;
end;
$$;

-- ---------- Suche ----------
-- Nur in Räumen, die man lesen darf (Mitglied; Staff ausgenommen – die Suche nutzt NUR
-- Mitgliedschaft) und in eigenen, nicht blockierten Gesprächen. Groß-/Kleinschreibung egal.
create or replace function public.chat_search(p_query text, p_limit integer default 30)
returns table (message_id uuid, room_id uuid, room_kind text, room_slug text, idea_title text, event_title jsonb,
               conversation_id uuid, other_name text, sender_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
  q text := btrim(coalesce(p_query, ''));
  pattern text;
begin
  perform public.chat_require_enabled(uid);
  if char_length(q) < 2 or char_length(q) > 100 then
    raise exception 'Suchbegriff 2–100 Zeichen' using errcode = '22023';
  end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select m.id, m.room_id, r.kind, r.slug, i.title, coalesce(e.title, r.event_title), m.conversation_id,
           case when c.id is null then null
                else (select p2.first_name from public.profiles p2
                       where p2.id = case when c.user_a = uid then c.user_b else c.user_a end) end,
           p.first_name, m.body, m.created_at
      from public.chat_messages m
      join public.profiles p on p.id = m.sender_id
      left join public.chat_rooms r on r.id = m.room_id
      left join public.ideas i on i.id = r.idea_id
      left join public.events e on e.id = r.event_id
      left join public.chat_conversations c on c.id = m.conversation_id
     where m.deleted_at is null
       and m.body ilike pattern
       and not public.chat_is_blocked(uid, m.sender_id)
       and ((m.room_id is not null and public.chat_is_room_member(m.room_id, uid))
         or (m.conversation_id is not null and public.chat_can_read_conversation(m.conversation_id, uid)))
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

-- ---------- Blockieren ----------
-- Blockieren beendet offene Anfragen zwischen beiden und macht das Gespräch für beide unsichtbar.
create or replace function public.chat_set_block(p_user uuid, p_blocked boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  if p_user is null or p_user = uid or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if p_blocked then
    insert into public.chat_blocks (blocker_id, blocked_id) values (uid, p_user) on conflict do nothing;
    update public.chat_requests r set status = 'blocked', decided_at = now()
     where r.status = 'pending'
       and ((r.sender_id = uid and r.recipient_id = p_user) or (r.sender_id = p_user and r.recipient_id = uid));
  else
    delete from public.chat_blocks b where b.blocker_id = uid and b.blocked_id = p_user;
  end if;
  return p_blocked;
end;
$$;

create or replace function public.chat_list_blocks()
returns table (user_id uuid, first_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  return query
    select p.id, p.first_name, b.created_at from public.chat_blocks b
      join public.profiles p on p.id = b.blocked_id
     where b.blocker_id = uid order by b.created_at desc;
end;
$$;

-- ---------- Melden ----------
-- Man kann nur melden, was man selbst sehen darf. Die gemeldete Person erfährt nichts über die meldende.
create or replace function public.chat_report(p_target_type text, p_target_id uuid, p_category text, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  rid uuid;
  msg record;
  req record;
  note_clean text;
begin
  if p_category is null or p_category not in ('language', 'harassment', 'discrimination', 'privacy', 'spam', 'other') then
    raise exception 'Ungültige Kategorie' using errcode = '22023';
  end if;
  if p_note is not null and btrim(p_note) <> '' then
    select c.body into note_clean from public.chat_clean_text(p_note, 500) c;
  end if;
  if p_target_type = 'message' then
    select * into msg from public.chat_messages m where m.id = p_target_id;
    if not found
       or (msg.room_id is not null and not public.chat_can_read_room(msg.room_id, uid))
       or (msg.conversation_id is not null and not exists (
             select 1 from public.chat_conversations c where c.id = msg.conversation_id and uid in (c.user_a, c.user_b))) then
      raise exception 'Nicht gefunden' using errcode = 'P0002';
    end if;
    insert into public.chat_reports (reporter_id, target_type, category, note, message_id, target_user_id, room_id,
                                     conversation_id, evidence, evidence_sent_at)
    values (uid, 'message', p_category, note_clean, msg.id, msg.sender_id, msg.room_id, msg.conversation_id,
            nullif(msg.body, ''), msg.created_at)
    returning id into rid;
  elsif p_target_type = 'user' then
    if p_target_id is null or p_target_id = uid or not exists (select 1 from public.profiles p where p.id = p_target_id) then
      raise exception 'Nicht gefunden' using errcode = 'P0002';
    end if;
    insert into public.chat_reports (reporter_id, target_type, category, note, target_user_id)
    values (uid, 'user', p_category, note_clean, p_target_id) returning id into rid;
  elsif p_target_type = 'room' then
    if not public.chat_can_read_room(p_target_id, uid) then
      raise exception 'Nicht gefunden' using errcode = 'P0002';
    end if;
    insert into public.chat_reports (reporter_id, target_type, category, note, room_id)
    values (uid, 'room', p_category, note_clean, p_target_id) returning id into rid;
  elsif p_target_type = 'conversation' then
    if not exists (select 1 from public.chat_conversations c where c.id = p_target_id and uid in (c.user_a, c.user_b)) then
      raise exception 'Nicht gefunden' using errcode = 'P0002';
    end if;
    insert into public.chat_reports (reporter_id, target_type, category, note, conversation_id, target_user_id)
    select uid, 'conversation', p_category, note_clean, c.id, case when c.user_a = uid then c.user_b else c.user_a end
      from public.chat_conversations c where c.id = p_target_id
    returning id into rid;
  elsif p_target_type = 'request' then
    select * into req from public.chat_requests r where r.id = p_target_id and r.recipient_id = uid;
    if not found then
      raise exception 'Nicht gefunden' using errcode = 'P0002';
    end if;
    insert into public.chat_reports (reporter_id, target_type, category, note, request_id, target_user_id,
                                     evidence, evidence_sent_at)
    values (uid, 'request', p_category, note_clean, req.id, req.sender_id, req.intro, req.created_at)
    returning id into rid;
  else
    raise exception 'Ungültiges Ziel' using errcode = '22023';
  end if;
  return rid;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Moderation (Moderator:innen + Admins). Jede Aktion → Audit-Protokoll.
--    Moderator:innen: Meldungen, Nachrichten löschen, Raum-Sperren und globale Sperren bis 7 Tage,
--                     Räume archivieren, Eventgruppen anlegen.
--    Admins zusätzlich: Räume/Gespräche löschen, Gespräche archivieren, Sperren bis 365 Tage,
--                       Moderator:innen, Wortliste, Chat an/aus und Einstellungen.
-- -----------------------------------------------------------------------------
create or replace function public.chat_require_staff()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  if not public.chat_is_staff(uid) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function public.chat_require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
begin
  if not public.chat_is_admin(uid) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function public.chat_require_reason(p_reason text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    raise exception 'Begründung (3–500 Zeichen) fehlt' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

create or replace function public.chat_mod_list_reports(p_status text default 'open')
returns table (id uuid, target_type text, category text, note text, status text, created_at timestamptz,
               reporter_name text, target_user_id uuid, target_user_name text, message_id uuid, room_id uuid,
               room_slug text, conversation_id uuid, request_id uuid, evidence text, evidence_sent_at timestamptz,
               resolved_at timestamptz, resolution text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
begin
  return query
    select r.id, r.target_type, r.category, r.note, r.status, r.created_at, rp.first_name, r.target_user_id,
           tu.first_name, r.message_id, r.room_id, cr.slug, r.conversation_id, r.request_id, r.evidence,
           r.evidence_sent_at, r.resolved_at, r.resolution
      from public.chat_reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.profiles tu on tu.id = r.target_user_id
      left join public.chat_rooms cr on cr.id = r.room_id
     where p_status is null or r.status = p_status
     order by r.created_at desc
     limit 200;
end;
$$;

create or replace function public.chat_mod_resolve_report(p_report uuid, p_status text, p_resolution text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_resolution);
begin
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Ungültiger Status' using errcode = '22023';
  end if;
  update public.chat_reports r set status = p_status, resolved_by = uid, resolved_at = now(), resolution = v_reason
   where r.id = p_report;
  if not found then
    raise exception 'Meldung nicht gefunden' using errcode = 'P0002';
  end if;
  perform public.chat_audit(uid, 'resolve_report', 'report', p_report::text, v_reason, jsonb_build_object('status', p_status));
end;
$$;

-- Zusammenhang einer Meldung (bis zu 5 Nachrichten davor/danach). Bei privaten Gesprächen nur
-- über diesen Weg, mit Begründung, und IMMER protokolliert (geringstmöglicher Zugriff).
create or replace function public.chat_mod_report_context(p_report uuid, p_reason text)
returns table (id uuid, sender_name text, body text, created_at timestamptz, deleted boolean, is_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_reason);
  rep record;
  anchor record;
begin
  select * into rep from public.chat_reports r where r.id = p_report;
  if not found or rep.message_id is null then
    raise exception 'Kein Nachrichtenbezug' using errcode = 'P0002';
  end if;
  select * into anchor from public.chat_messages m where m.id = rep.message_id;
  if not found then
    raise exception 'Nachricht nicht mehr vorhanden' using errcode = 'P0002';
  end if;
  perform public.chat_audit(uid, case when anchor.conversation_id is not null then 'view_private_context'
                                      else 'view_room_context' end,
                            'report', p_report::text, v_reason,
                            jsonb_build_object('message_id', anchor.id, 'conversation_id', anchor.conversation_id,
                                               'room_id', anchor.room_id));
  return query
    select x.id, p.first_name, x.body, x.created_at, x.deleted_at is not null, x.id = anchor.id
      from (
        (select m.* from public.chat_messages m
          where (m.room_id = anchor.room_id or m.conversation_id = anchor.conversation_id)
            and m.created_at <= anchor.created_at order by m.created_at desc limit 6)
        union
        (select m.* from public.chat_messages m
          where (m.room_id = anchor.room_id or m.conversation_id = anchor.conversation_id)
            and m.created_at > anchor.created_at order by m.created_at asc limit 5)
      ) x
      join public.profiles p on p.id = x.sender_id
     order by x.created_at;
end;
$$;

-- Nachricht löschen (Moderation). Private Nachrichten nur, wenn sie gemeldet wurden.
create or replace function public.chat_mod_delete_message(p_message uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_reason);
  m record;
begin
  select * into m from public.chat_messages x where x.id = p_message;
  if not found then
    raise exception 'Nachricht nicht gefunden' using errcode = 'P0002';
  end if;
  if m.conversation_id is not null and not exists (select 1 from public.chat_reports r where r.message_id = p_message) then
    raise exception 'Private Nachrichten nur nach Meldung' using errcode = '42501';
  end if;
  update public.chat_messages x set body = '', deleted_at = now(), deleted_by = uid, censored = false
   where x.id = p_message and x.deleted_at is null;
  delete from public.chat_reactions r where r.message_id = p_message;
  perform public.chat_audit(uid, 'delete_message', 'message', p_message::text, v_reason,
                            jsonb_build_object('room_id', m.room_id, 'conversation_id', m.conversation_id,
                                               'sender_id', m.sender_id));
end;
$$;

-- Personen suchen (für Sperren) – nur Staff, nur Vorname + Schule.
create or replace function public.chat_mod_find_users(p_query text)
returns table (user_id uuid, first_name text, school_id text, is_staff boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
  q text := btrim(coalesce(p_query, ''));
begin
  if char_length(q) < 2 then
    raise exception 'Mindestens 2 Zeichen' using errcode = '22023';
  end if;
  return query
    select p.id, p.first_name, p.school_id, public.chat_is_staff(p.id)
      from public.profiles p
     where p.first_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     order by p.first_name limit 20;
end;
$$;

-- Sperre aussprechen. Moderator:innen höchstens 7 Tage; Admins höchstens 365 Tage.
-- Admins können nicht gesperrt werden; Moderator:innen nur von Admins.
create or replace function public.chat_mod_ban(p_user uuid, p_scope text, p_room uuid, p_minutes integer, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_reason);
  max_minutes integer := case when public.chat_is_admin(uid) then 365 * 24 * 60 else 7 * 24 * 60 end;
  bid uuid;
begin
  if p_user is null or p_user = uid or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if public.chat_is_admin(p_user) or (public.chat_is_staff(p_user) and not public.chat_is_admin(uid)) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_scope not in ('global', 'room') or (p_scope = 'room') <> (p_room is not null)
     or (p_room is not null and not exists (select 1 from public.chat_rooms r where r.id = p_room)) then
    raise exception 'Ungültiger Bereich' using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > max_minutes then
    raise exception 'Ungültige Dauer' using errcode = '22023';
  end if;
  insert into public.chat_bans (user_id, scope, room_id, reason, issued_by, ends_at)
  values (p_user, p_scope, p_room, v_reason, uid, now() + make_interval(mins => p_minutes))
  returning id into bid;
  perform public.chat_audit(uid, 'ban', 'user', p_user::text, v_reason,
                            jsonb_build_object('ban_id', bid, 'scope', p_scope, 'room_id', p_room, 'minutes', p_minutes));
  return bid;
end;
$$;

create or replace function public.chat_mod_end_ban(p_ban uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_reason);
begin
  update public.chat_bans b set ended_at = now(), ended_by = uid, end_reason = v_reason
   where b.id = p_ban and b.ended_at is null and b.ends_at > now();
  if not found then
    raise exception 'Keine aktive Sperre' using errcode = 'P0002';
  end if;
  perform public.chat_audit(uid, 'end_ban', 'ban', p_ban::text, v_reason, '{}'::jsonb);
end;
$$;

create or replace function public.chat_mod_list_bans(p_active_only boolean default true)
returns table (id uuid, user_id uuid, user_name text, scope text, room_id uuid, room_slug text, reason text,
               issued_by_name text, starts_at timestamptz, ends_at timestamptz, ended_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
begin
  return query
    select b.id, b.user_id, u.first_name, b.scope, b.room_id, r.slug, b.reason, i.first_name, b.starts_at,
           b.ends_at, b.ended_at, b.ended_at is null and b.ends_at > now()
      from public.chat_bans b
      join public.profiles u on u.id = b.user_id
      left join public.profiles i on i.id = b.issued_by
      left join public.chat_rooms r on r.id = b.room_id
     where not coalesce(p_active_only, true) or (b.ended_at is null and b.ends_at > now())
     order by b.starts_at desc limit 200;
end;
$$;

create or replace function public.chat_mod_set_room_archived(p_room uuid, p_archived boolean, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_staff();
  v_reason text := public.chat_require_reason(p_reason);
begin
  -- Gruppe eines gelöschten Events (018) bleibt archiviert – kein Event mehr, in das man schreiben könnte
  if not p_archived and exists (select 1 from public.chat_rooms r
                                 where r.id = p_room and r.kind = 'event' and r.event_id is null) then
    raise exception 'Das Event dieser Gruppe wurde gelöscht.' using errcode = 'DC051';
  end if;
  update public.chat_rooms r
     set archived_at = case when p_archived then coalesce(r.archived_at, now()) end,
         archived_by = case when p_archived then uid end
   where r.id = p_room;
  if not found then
    raise exception 'Raum nicht gefunden' using errcode = 'P0002';
  end if;
  perform public.chat_audit(uid, case when p_archived then 'archive_room' else 'unarchive_room' end,
                            'room', p_room::text, v_reason, '{}'::jsonb);
end;
$$;

create or replace function public.chat_mod_list_audit(p_limit integer default 100)
returns table (id bigint, actor_name text, action text, target_type text, target_id text, reason text,
               details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
begin
  return query
    select a.id, p.first_name, a.action, a.target_type, a.target_id, a.reason, a.details, a.created_at
      from public.chat_audit_log a left join public.profiles p on p.id = a.actor_id
     order by a.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Alle Räume für die Verwaltung (auch archivierte), mit Nachrichtenzahl – ohne Inhalte.
create or replace function public.chat_mod_list_rooms()
returns table (id uuid, kind text, slug text, idea_title text, event_title jsonb, archived boolean,
               message_count integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_staff();
begin
  return query
    select r.id, r.kind, r.slug, i.title, coalesce(e.title, r.event_title), r.archived_at is not null,
           (select count(*)::integer from public.chat_messages m where m.room_id = r.id), r.created_at
      from public.chat_rooms r
      left join public.ideas i on i.id = r.idea_id
      left join public.events e on e.id = r.event_id
     order by (r.kind = 'topic') desc, r.created_at;
end;
$$;

-- ---------- Nur Admins ----------
-- Gespräche nur als Metadaten (wer, seit wann, wie viele Nachrichten) – KEINE Inhalte.
create or replace function public.chat_admin_list_conversations()
returns table (id uuid, name_a text, name_b text, created_at timestamptz, archived boolean, message_count integer,
               open_reports integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_admin();
begin
  return query
    select c.id, pa.first_name, pb.first_name, c.created_at, c.archived_at is not null,
           (select count(*)::integer from public.chat_messages m where m.conversation_id = c.id),
           (select count(*)::integer from public.chat_reports r where r.conversation_id = c.id and r.status = 'open')
      from public.chat_conversations c
      join public.profiles pa on pa.id = c.user_a
      join public.profiles pb on pb.id = c.user_b
     order by c.created_at desc limit 500;
end;
$$;

create or replace function public.chat_admin_set_conversation_archived(p_conversation uuid, p_archived boolean, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  v_reason text := public.chat_require_reason(p_reason);
begin
  update public.chat_conversations c
     set archived_at = case when p_archived then coalesce(c.archived_at, now()) end,
         archived_by = case when p_archived then uid end
   where c.id = p_conversation;
  if not found then
    raise exception 'Gespräch nicht gefunden' using errcode = 'P0002';
  end if;
  perform public.chat_audit(uid, case when p_archived then 'archive_conversation' else 'unarchive_conversation' end,
                            'conversation', p_conversation::text, v_reason, '{}'::jsonb);
end;
$$;

-- Gespräch ENDGÜLTIG löschen: Nachrichten + Reaktionen werden mitgelöscht (Fremdschlüssel cascade),
-- Meldungen bleiben (Verweise werden null, die Beweis-Kopie bleibt). Atomar in einer Funktion.
create or replace function public.chat_admin_delete_conversation(p_conversation uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  v_reason text := public.chat_require_reason(p_reason);
  c record;
  n integer;
begin
  select * into c from public.chat_conversations x where x.id = p_conversation for update;
  if not found then
    raise exception 'Gespräch nicht gefunden' using errcode = 'P0002';
  end if;
  select count(*) into n from public.chat_messages m where m.conversation_id = p_conversation;
  update public.chat_requests r set conversation_id = null where r.conversation_id = p_conversation;
  delete from public.chat_conversations x where x.id = p_conversation;
  perform public.chat_audit(uid, 'delete_conversation', 'conversation', p_conversation::text, v_reason,
                            jsonb_build_object('user_a', c.user_a, 'user_b', c.user_b, 'messages', n));
end;
$$;

-- Raum ENDGÜLTIG löschen (inkl. Nachrichten, Reaktionen, Mitgliedschaften, Raum-Sperren).
create or replace function public.chat_admin_delete_room(p_room uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  v_reason text := public.chat_require_reason(p_reason);
  r record;
  n integer;
begin
  select * into r from public.chat_rooms x where x.id = p_room for update;
  if not found then
    raise exception 'Raum nicht gefunden' using errcode = 'P0002';
  end if;
  select count(*) into n from public.chat_messages m where m.room_id = p_room;
  delete from public.chat_rooms x where x.id = p_room;
  perform public.chat_audit(uid, 'delete_room', 'room', p_room::text, v_reason,
                            jsonb_build_object('kind', r.kind, 'slug', r.slug, 'idea_id', r.idea_id,
                                               'event_id', r.event_id, 'messages', n));
end;
$$;

create or replace function public.chat_admin_list_staff()
returns table (user_id uuid, first_name text, role text, note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_admin();
begin
  return query
    select p.id, p.first_name, 'admin'::text, null::text from public.admins a join public.profiles p on p.id = a.user_id
    union all
    select p.id, p.first_name, 'moderator'::text, m.note from public.chat_moderators m join public.profiles p on p.id = m.user_id
     where not exists (select 1 from public.admins a where a.user_id = m.user_id)
    order by 3, 2;
end;
$$;

-- Moderator:in ernennen / entfernen (Admins selbst werden in public.admins verwaltet – siehe Doku).
create or replace function public.chat_admin_set_moderator(p_user uuid, p_moderator boolean, p_note text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  v_reason text := public.chat_require_reason(p_note);
begin
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if p_moderator then
    insert into public.chat_moderators (user_id, added_by, note) values (p_user, uid, v_reason)
    on conflict (user_id) do update set note = excluded.note;
  else
    delete from public.chat_moderators m where m.user_id = p_user;
  end if;
  perform public.chat_audit(uid, case when p_moderator then 'add_moderator' else 'remove_moderator' end,
                            'user', p_user::text, v_reason, '{}'::jsonb);
end;
$$;

create or replace function public.chat_admin_get_config()
returns table (enabled boolean, request_cooldown_hours integer, requests_per_day integer, messages_per_minute integer,
               staff_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_admin();
begin
  return query
    select c.enabled, c.request_cooldown_hours, c.requests_per_day, c.messages_per_minute,
           ((select count(*) from public.admins) + (select count(*) from public.chat_moderators m
              where not exists (select 1 from public.admins a where a.user_id = m.user_id)))::integer
      from public.chat_config c where c.id = 1;
end;
$$;

create or replace function public.chat_admin_set_config(p_enabled boolean, p_cooldown_hours integer,
                                                       p_requests_per_day integer, p_messages_per_minute integer,
                                                       p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  v_reason text := public.chat_require_reason(p_reason);
begin
  update public.chat_config c
     set enabled = coalesce(p_enabled, c.enabled),
         request_cooldown_hours = coalesce(p_cooldown_hours, c.request_cooldown_hours),
         requests_per_day = coalesce(p_requests_per_day, c.requests_per_day),
         messages_per_minute = coalesce(p_messages_per_minute, c.messages_per_minute),
         updated_at = now(), updated_by = uid
   where c.id = 1;
  perform public.chat_audit(uid, 'set_config', 'config', '1', v_reason,
                            jsonb_build_object('enabled', p_enabled, 'cooldown_hours', p_cooldown_hours,
                                               'requests_per_day', p_requests_per_day,
                                               'messages_per_minute', p_messages_per_minute));
end;
$$;

create or replace function public.chat_admin_list_terms()
returns table (term_norm text, match_prefix boolean, language text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_admin();
begin
  return query select t.term_norm, t.match_prefix, t.language, t.created_at from public.chat_terms t order by t.term_norm;
end;
$$;

-- Wort hinzufügen/entfernen. Das Wort wird normalisiert gespeichert (chat_norm).
create or replace function public.chat_admin_set_term(p_term text, p_match_prefix boolean, p_language text, p_add boolean)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_admin();
  norm text := public.chat_norm(p_term);
begin
  if norm !~ '^[a-z]{2,40}$' then
    raise exception 'Ungültiges Wort' using errcode = '22023';
  end if;
  if p_add then
    insert into public.chat_terms (term_norm, match_prefix, language, added_by)
    values (norm, coalesce(p_match_prefix, false), coalesce(nullif(p_language, ''), 'other'), uid)
    on conflict (term_norm) do update set match_prefix = excluded.match_prefix, language = excluded.language;
  else
    delete from public.chat_terms t where t.term_norm = norm;
  end if;
  -- Das Wort selbst steht NICHT im Protokoll (keine Schimpfwörter in Logs), nur die Länge.
  perform public.chat_audit(uid, case when p_add then 'add_term' else 'remove_term' end, 'term', null, null,
                            jsonb_build_object('length', char_length(norm), 'prefix', p_match_prefix));
  return norm;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Ausführrechte
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
  user_functions text[] := array[
    'public.chat_status()', 'public.chat_list_rooms()', 'public.chat_join_room(uuid)', 'public.chat_leave_room(uuid)',
    'public.chat_create_project_room(uuid)', 'public.chat_create_event_room(uuid)', 'public.chat_room_detail(uuid)',
    'public.chat_room_members(uuid)', 'public.chat_room_messages(uuid,timestamptz,integer)',
    'public.chat_send_room_message(uuid,text)', 'public.chat_delete_own_message(uuid)',
    'public.chat_toggle_reaction(uuid,text)', 'public.chat_send_request(uuid,text)', 'public.chat_list_requests()',
    'public.chat_respond_request(uuid,boolean)', 'public.chat_cancel_request(uuid)',
    'public.chat_list_conversations()', 'public.chat_conversation_detail(uuid)',
    'public.chat_conversation_messages(uuid,timestamptz,integer)', 'public.chat_send_conversation_message(uuid,text)',
    'public.chat_search(text,integer)', 'public.chat_set_block(uuid,boolean)', 'public.chat_list_blocks()',
    'public.chat_report(text,uuid,text,text)',
    'public.chat_mod_list_reports(text)', 'public.chat_mod_resolve_report(uuid,text,text)',
    'public.chat_mod_report_context(uuid,text)', 'public.chat_mod_delete_message(uuid,text)',
    'public.chat_mod_find_users(text)', 'public.chat_mod_ban(uuid,text,uuid,integer,text)',
    'public.chat_mod_end_ban(uuid,text)', 'public.chat_mod_list_bans(boolean)',
    'public.chat_mod_set_room_archived(uuid,boolean,text)', 'public.chat_mod_list_audit(integer)',
    'public.chat_mod_list_rooms()', 'public.chat_admin_list_conversations()',
    'public.chat_admin_set_conversation_archived(uuid,boolean,text)', 'public.chat_admin_delete_conversation(uuid,text)',
    'public.chat_admin_delete_room(uuid,text)', 'public.chat_admin_list_staff()',
    'public.chat_admin_set_moderator(uuid,boolean,text)', 'public.chat_admin_get_config()',
    'public.chat_admin_set_config(boolean,integer,integer,integer,text)', 'public.chat_admin_list_terms()',
    'public.chat_admin_set_term(text,boolean,text,boolean)'];
  internal_functions text[] := array[
    'public.chat_norm(text)', 'public.chat_is_bad_word(text)', 'public.chat_censor(text)',
    'public.chat_is_admin(uuid)', 'public.chat_is_staff(uuid)', 'public.chat_is_blocked(uuid,uuid)',
    'public.chat_is_room_member(uuid,uuid)', 'public.chat_can_read_room(uuid,uuid)',
    'public.chat_can_read_conversation(uuid,uuid)', 'public.chat_active_ban(uuid,uuid)', 'public.chat_require_user()',
    'public.chat_require_enabled(uuid)', 'public.chat_require_not_banned(uuid,uuid)',
    'public.chat_clean_text(text,integer)', 'public.chat_audit(uuid,text,text,text,text,jsonb)',
    'public.chat_message_rows(uuid,uuid,uuid,timestamptz,integer)', 'public.chat_require_message_rate(uuid)',
    'public.chat_require_staff()', 'public.chat_require_admin()', 'public.chat_require_reason(text)'];
begin
  foreach f in array user_functions loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array internal_functions loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Löst Eventgruppen vom Event (018): NUR der Datenbank-Eigentümer (Zeitplan), nicht für App-Nutzer:innen
  revoke execute on function public.chat_detach_event_room(uuid) from public, anon, authenticated;
  -- Für die SELECT-Policy auf chat_messages (Realtime) – liefert nur true/false für die eigene Person.
  revoke execute on function public.chat_message_visible(uuid, uuid, uuid) from public, anon;
  grant execute on function public.chat_message_visible(uuid, uuid, uuid) to authenticated;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Realtime: SELECT nur auf erlaubte Zeilen (Supabase prüft diese Policies pro Empfänger:in).
--    Die App lädt nach jedem Signal über die Funktionen oben neu – der Signal-Inhalt wird nicht angezeigt.
-- -----------------------------------------------------------------------------
grant select on public.chat_messages, public.chat_reactions, public.chat_requests, public.chat_conversations,
                public.chat_room_members to authenticated;

drop policy if exists "chat_messages: sichtbar" on public.chat_messages;
create policy "chat_messages: sichtbar" on public.chat_messages for select to authenticated
  using (public.chat_message_visible(room_id, conversation_id, sender_id));

drop policy if exists "chat_reactions: sichtbar" on public.chat_reactions;
create policy "chat_reactions: sichtbar" on public.chat_reactions for select to authenticated
  using (exists (select 1 from public.chat_messages m where m.id = message_id));

drop policy if exists "chat_requests: eigene" on public.chat_requests;
create policy "chat_requests: eigene" on public.chat_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "chat_conversations: eigene" on public.chat_conversations;
create policy "chat_conversations: eigene" on public.chat_conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "chat_room_members: eigene" on public.chat_room_members;
create policy "chat_room_members: eigene" on public.chat_room_members for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['chat_messages', 'chat_reactions', 'chat_requests', 'chat_conversations', 'chat_room_members'] loop
      if not exists (select 1 from pg_publication_tables p
                      where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) (bewusst leer) – kein pg_cron, keine automatische Löschfrist: Aufbewahrungsdauer ist eine
--    offene Entscheidung (siehe docs/CHATROOM.md).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 9) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  f record;
  probe record;
begin
  -- RLS überall an
  foreach t in array array['chat_config', 'chat_moderators', 'chat_rooms', 'chat_room_members', 'chat_conversations',
    'chat_requests', 'chat_messages', 'chat_reactions', 'chat_blocks', 'chat_bans', 'chat_reports',
    'chat_audit_log', 'chat_terms'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'ABBRUCH: RLS ist auf % nicht aktiv', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete') then
      raise exception 'ABBRUCH: anon hat Rechte auf %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete,truncate') then
      raise exception 'ABBRUCH: authenticated darf % direkt ändern', t;
    end if;
  end loop;
  -- Nur die 5 Realtime-Tabellen sind lesbar (über Policies), alle anderen gar nicht
  foreach t in array array['chat_config', 'chat_moderators', 'chat_rooms', 'chat_blocks', 'chat_bans',
    'chat_reports', 'chat_audit_log', 'chat_terms'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'ABBRUCH: % darf nicht direkt lesbar sein', t;
    end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t) then
      raise exception 'ABBRUCH: % soll keine Policies haben', t;
    end if;
  end loop;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename like 'chat\_%'
               and p.cmd <> 'SELECT') then
    raise exception 'ABBRUCH: Chat-Policies dürfen nur lesen';
  end if;
  -- Alle chat_-Funktionen: SECURITY DEFINER (außer reinen Hilfen) mit festem search_path; keine für anon
  for f in select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'chat\_%' loop
    if f.proconfig is distinct from array['search_path=""'] then
      raise exception 'ABBRUCH: % braucht search_path = ''''', f.sig;
    end if;
    if has_function_privilege('anon', f.sig, 'execute') then
      raise exception 'ABBRUCH: anon darf % ausführen', f.sig;
    end if;
    if not f.prosecdef and f.proname not in ('chat_norm', 'chat_require_reason') then
      raise exception 'ABBRUCH: % muss SECURITY DEFINER sein', f.sig;
    end if;
  end loop;
  -- Interne Hilfen nicht für angemeldete Nutzer:innen
  if has_function_privilege('authenticated', 'public.chat_censor(text)', 'execute')
     or has_function_privilege('authenticated', 'public.chat_audit(uuid,text,text,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.chat_is_staff(uuid)', 'execute') then
    raise exception 'ABBRUCH: interne Chat-Hilfen sind für authenticated freigegeben';
  end if;
  -- Wortfilter kurz prüfen
  select * into probe from public.chat_censor('Du bist ein Arschloch!');
  if probe.body <> 'Du bist ein ***!' or not probe.censored then
    raise exception 'ABBRUCH: Wortfilter arbeitet nicht wie erwartet (%)', probe.body;
  end if;
  select * into probe from public.chat_censor('Klasse Assistent in Ankara');
  if probe.censored then
    raise exception 'ABBRUCH: Wortfilter zensiert harmlose Wörter';
  end if;
  -- Event löschen darf Chat-Nachrichten NICHT automatisch mitlöschen (keine Aufbewahrungsregel)
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'public.chat_rooms'::regclass and c.contype = 'f'
                and c.confrelid = 'public.events'::regclass and c.confdeltype <> 'r') then
    raise exception 'ABBRUCH: chat_rooms.event_id muss ON DELETE RESTRICT sein';
  end if;
  -- Gruppe vom Event lösen (018): nur Eigentümer
  if exists (select 1 from pg_roles g where g.rolname in ('anon', 'authenticated')
               and has_function_privilege(g.rolname, 'public.chat_detach_event_room(uuid)', 'execute')) then
    raise exception 'ABBRUCH: chat_detach_event_room ist für App-Rollen ausführbar';
  end if;
  -- Chat ist nach der Migration AUS, solange niemand ihn einschaltet
  if (select count(*) from public.chat_rooms r where r.kind = 'topic') < 4 then
    raise exception 'ABBRUCH: Themenräume fehlen';
  end if;
end;
$$;

commit;
