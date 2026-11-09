-- =============================================================================
-- 011 – Nachhilfe-Börse (Integration der Codex-Nachhilfe in das Claude-Backend)
-- =============================================================================
-- Ausführen NACH 001 (Supabase Dashboard -> SQL Editor -> Run), als Datenbank-Eigentümer (postgres).
-- Abhängigkeiten: NUR public.profiles + public.schools (001) und auth.uid().
--   Unabhängig von 002–010 (kein is_admin(), keine Event-/Ideen-Spalten, kein pg_cron).
--   Teil 0 bricht ab, wenn 001 fehlt.
-- IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 7 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- STATUS: NUR IM REPOSITORY. Diese Datei wurde NICHT auf eine Datenbank angewendet.
--         Vor dem Ausführen: Freigabe durch Ege, zuerst auf einer Kopie/Staging testen.
--
-- Was kommt neu dazu?
--   * tutoring_entries   – Angebote ("offer") und Gesuche ("request") ohne Bezahlung
--   * tutoring_requests  – echte Kontaktanfragen an den/die Ersteller:in eines Eintrags
--                          (ersetzt den Codex-"Kontaktentwurf", der nur im Browser lag)
--   * tutoring_saves     – "Merken" (vorgemerktes Interesse, nur für einen selbst sichtbar)
--   * Funktionen tutoring_*() für Listen mit Namen und für Statuswechsel von Anfragen
--
-- Was ändert sich NICHT?
--   * Keine bestehende Tabelle, Policy, Funktion oder Berechtigung aus 001–010.
--   * Profile bleiben PRIVAT (Policy aus 001 unverändert).
--
-- Datenschutz (Schüler:innen sind minderjährig):
--   * In Listen sieht man von fremden Einträgen nur Schule + Inhalt, KEINEN Namen
--     (gleiches Prinzip wie bei Ideen).
--   * Wer eine Anfrage sendet, gibt dem/der Ersteller:in damit den eigenen Vornamen frei.
--   * Den Vornamen des/der Erstellers:in sieht der/die Absender:in erst, wenn die Anfrage
--     ANGENOMMEN wurde.
--   * Texte dürfen keine E-Mail-Adressen, Links oder Telefonnummern enthalten
--     (Prüfung public.dc_has_contact_data – identisch zu src/lib/tutoring.js).
--   * Keine privaten Chats: Nach der Annahme gibt es nur eine kurze Antwortnotiz.
--
-- Fehlercodes (SQLSTATE) für das Frontend (src/lib/tutoringApi.js):
--   42501 nicht angemeldet / nicht erlaubt     22023 ungültige Eingabe
--   P0002 nicht gefunden                        23514 Prüfregel verletzt (z. B. Kontaktdaten)
--   DC011 Eintrag nicht (mehr) aktiv            DC012 eigener Eintrag
--   DC013 Anfrage existiert bereits             DC014 Statuswechsel nicht erlaubt
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen (nur 001)
-- -----------------------------------------------------------------------------
do $
begin
  if to_regclass('public.profiles') is null or to_regclass('public.schools') is null then
    raise exception 'ABBRUCH: Bitte zuerst Migration 001 ausführen.';
  end if;
end;
$;

-- -----------------------------------------------------------------------------
-- 1) Hilfsfunktion: enthält ein Text Kontaktdaten?
-- -----------------------------------------------------------------------------
-- E-Mail-Adresse, Link (http/www) oder Telefonnummer (mind. 9 Ziffern, nur durch
-- Leerzeichen, -, /, ( ) getrennt). Daten wie 12.11.2026 oder Uhrzeiten zählen nicht.
create or replace function public.dc_has_contact_data(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    or p_text ~* '(https?://|www\.)'
    or p_text ~ '(\d[\s/()-]*){9,}',
    false);
$$;

-- -----------------------------------------------------------------------------
-- 2) Tabellen
-- -----------------------------------------------------------------------------
create table if not exists public.tutoring_entries (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  school_id    text not null references public.schools (id),
  kind         text not null check (kind in ('offer', 'request')),
  subject      text not null check (char_length(btrim(subject)) between 2 and 80),
  topics       text not null check (char_length(btrim(topics)) between 3 and 200),
  description  text not null check (char_length(btrim(description)) between 20 and 1000),
  availability text not null check (char_length(btrim(availability)) between 3 and 200),
  languages    text[] not null check (cardinality(languages) between 1 and 3
                                      and languages <@ array['de', 'tr', 'en']::text[]),
  format       text not null check (format in ('online', 'school', 'either')),
  status       text not null default 'active' check (status in ('active', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tutoring_entries_no_contact_data check (
    not public.dc_has_contact_data(subject || ' ' || topics || ' ' || description || ' ' || availability))
);

create index if not exists tutoring_entries_owner_idx on public.tutoring_entries (owner_id);
create index if not exists tutoring_entries_status_idx on public.tutoring_entries (status, created_at desc);

create table if not exists public.tutoring_requests (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.tutoring_entries (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  message       text not null check (char_length(btrim(message)) between 10 and 600
                                     and not public.dc_has_contact_data(message)),
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  response_note text check (response_note is null
                            or (char_length(response_note) <= 600 and not public.dc_has_contact_data(response_note))),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (entry_id, sender_id)
);

create index if not exists tutoring_requests_sender_idx on public.tutoring_requests (sender_id);

create table if not exists public.tutoring_saves (
  entry_id   uuid not null references public.tutoring_entries (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- updated_at automatisch setzen
create or replace function public.tutoring_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tutoring_entries_touch on public.tutoring_entries;
create trigger tutoring_entries_touch
  before update on public.tutoring_entries
  for each row execute function public.tutoring_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Row Level Security + Rechte
-- -----------------------------------------------------------------------------
alter table public.tutoring_entries  enable row level security;
alter table public.tutoring_requests enable row level security;
alter table public.tutoring_saves    enable row level security;

revoke all on public.tutoring_entries, public.tutoring_requests, public.tutoring_saves
  from public, anon, authenticated;

-- Einträge: Lesen läuft über tutoring_list_entries() (Teil 4) – so sieht niemand fremde
-- owner_id. Direkt lesbar ist NUR die Spalte id (nötig für "update … where id = … returning id").
-- Die Policies unten begrenzen zusätzlich, welche Zeilen überhaupt erreichbar sind.
-- Anlegen nur mit festen Spalten (created_at/updated_at/status setzt die Datenbank).
grant select (id) on public.tutoring_entries to authenticated;
grant insert (owner_id, school_id, kind, subject, topics, description, availability, languages, format)
  on public.tutoring_entries to authenticated;
grant delete on public.tutoring_entries to authenticated;
grant update (kind, subject, topics, description, availability, languages, format, status)
  on public.tutoring_entries to authenticated;

drop policy if exists "tutoring: aktive oder eigene lesen" on public.tutoring_entries;
create policy "tutoring: aktive oder eigene lesen" on public.tutoring_entries
  for select to authenticated
  using (status = 'active' or owner_id = (select auth.uid()));

drop policy if exists "tutoring: eigene anlegen" on public.tutoring_entries;
create policy "tutoring: eigene anlegen" on public.tutoring_entries
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'active'
    and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists "tutoring: eigene bearbeiten" on public.tutoring_entries;
create policy "tutoring: eigene bearbeiten" on public.tutoring_entries
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "tutoring: eigene löschen" on public.tutoring_entries;
create policy "tutoring: eigene löschen" on public.tutoring_entries
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Anfragen: KEIN direkter Zugriff (keine Rechte, keine Policy = alles gesperrt).
-- Lesen, Senden, Beantworten und Zurückziehen NUR über die Funktionen in Teil 5;
-- sie prüfen selbst, wer beteiligt ist.
drop policy if exists "tutoring_requests: beteiligte lesen" on public.tutoring_requests;

-- Merken: nur eigene Einträge in der Merkliste.
grant select, insert, delete on public.tutoring_saves to authenticated;

drop policy if exists "tutoring_saves: eigene" on public.tutoring_saves;
create policy "tutoring_saves: eigene" on public.tutoring_saves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 4) Liste der Einträge (mit Merk-/Anfragestatus, ohne fremde Namen)
-- -----------------------------------------------------------------------------
drop function if exists public.tutoring_list_entries();
create function public.tutoring_list_entries()
returns table (
  id uuid, school_id text, kind text, subject text, topics text, description text,
  availability text, languages text[], format text, status text,
  created_at timestamptz, updated_at timestamptz,
  is_own boolean, is_saved boolean, my_request_status text, incoming_pending integer
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
  return query
    select e.id, e.school_id, e.kind, e.subject, e.topics, e.description,
           e.availability, e.languages, e.format, e.status, e.created_at, e.updated_at,
           e.owner_id = uid,
           exists (select 1 from public.tutoring_saves s where s.entry_id = e.id and s.user_id = uid),
           (select r.status from public.tutoring_requests r where r.entry_id = e.id and r.sender_id = uid),
           case when e.owner_id = uid then
             (select count(*)::integer from public.tutoring_requests r
               where r.entry_id = e.id and r.status = 'pending')
           else 0 end
    from public.tutoring_entries e
    where e.status = 'active' or e.owner_id = uid
       -- eigene gemerkte oder angefragte Einträge bleiben sichtbar, auch wenn geschlossen
       or exists (select 1 from public.tutoring_saves s where s.entry_id = e.id and s.user_id = uid)
       or exists (select 1 from public.tutoring_requests r where r.entry_id = e.id and r.sender_id = uid)
    order by e.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Anfragen: senden, beantworten, zurückziehen, auflisten
-- -----------------------------------------------------------------------------
drop function if exists public.tutoring_send_request(uuid, text);
create function public.tutoring_send_request(p_entry_id uuid, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  entry public.tutoring_entries%rowtype;
  existing public.tutoring_requests%rowtype;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 10 and 600 then
    raise exception 'Nachricht 10–600 Zeichen' using errcode = '22023';
  end if;
  select * into entry from public.tutoring_entries where id = p_entry_id for share;
  if not found then
    raise exception 'Eintrag nicht gefunden' using errcode = 'P0002';
  end if;
  if entry.status <> 'active' then
    raise exception 'Eintrag ist nicht aktiv' using errcode = 'DC011';
  end if;
  if entry.owner_id = uid then
    raise exception 'Eigener Eintrag' using errcode = 'DC012';
  end if;

  select * into existing from public.tutoring_requests
   where entry_id = p_entry_id and sender_id = uid for update;
  if found then
    -- Nur eine zurückgezogene Anfrage darf erneut gesendet werden.
    if existing.status <> 'withdrawn' then
      raise exception 'Anfrage existiert bereits' using errcode = 'DC013';
    end if;
    update public.tutoring_requests
       set message = btrim(p_message), status = 'pending', response_note = null,
           responded_at = null, created_at = now()
     where id = existing.id;
    return existing.id;
  end if;

  insert into public.tutoring_requests (entry_id, sender_id, message)
  values (p_entry_id, uid, btrim(p_message))
  returning id into new_id;
  return new_id;
end;
$$;

drop function if exists public.tutoring_respond_request(uuid, boolean, text);
create function public.tutoring_respond_request(p_request_id uuid, p_accept boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req public.tutoring_requests%rowtype;
  v_owner uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'Entscheidung fehlt' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 600 then
    raise exception 'Notiz max. 600 Zeichen' using errcode = '22023';
  end if;
  select * into req from public.tutoring_requests where id = p_request_id for update;
  if not found then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  select e.owner_id into v_owner from public.tutoring_entries e where e.id = req.entry_id;
  if v_owner is distinct from uid then
    -- Fremde Anfragen sind für Dritte unsichtbar → wie "nicht gefunden" behandeln
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'Nur offene Anfragen können beantwortet werden' using errcode = 'DC014';
  end if;
  update public.tutoring_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now()
   where id = p_request_id;
end;
$$;

drop function if exists public.tutoring_withdraw_request(uuid);
create function public.tutoring_withdraw_request(p_request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req public.tutoring_requests%rowtype;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  select * into req from public.tutoring_requests where id = p_request_id for update;
  if not found or req.sender_id <> uid then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if req.status not in ('pending', 'accepted') then
    raise exception 'Anfrage kann nicht zurückgezogen werden' using errcode = 'DC014';
  end if;
  update public.tutoring_requests set status = 'withdrawn', responded_at = now() where id = p_request_id;
end;
$$;

drop function if exists public.tutoring_list_requests();
create function public.tutoring_list_requests()
returns table (
  id uuid, entry_id uuid, direction text,
  entry_kind text, entry_subject text, entry_topics text, entry_status text,
  other_first_name text, other_school_id text,
  message text, status text, response_note text,
  created_at timestamptz, responded_at timestamptz
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
  return query
    -- Eingehend: Ich habe den Eintrag erstellt → ich sehe den Vornamen der absendenden Person.
    select r.id, r.entry_id, 'incoming'::text,
           e.kind, e.subject, e.topics, e.status,
           p.first_name, p.school_id,
           r.message, r.status, r.response_note, r.created_at, r.responded_at
      from public.tutoring_requests r
      join public.tutoring_entries e on e.id = r.entry_id
      join public.profiles p on p.id = r.sender_id
     where e.owner_id = uid
    union all
    -- Ausgehend: Den Vornamen der erstellenden Person erst nach der Annahme zeigen.
    select r.id, r.entry_id, 'outgoing'::text,
           e.kind, e.subject, e.topics, e.status,
           case when r.status = 'accepted' then p.first_name else null end, e.school_id,
           r.message, r.status, r.response_note, r.created_at, r.responded_at
      from public.tutoring_requests r
      join public.tutoring_entries e on e.id = r.entry_id
      join public.profiles p on p.id = e.owner_id
     where r.sender_id = uid
    order by 13 desc;
end;
$$;

-- Ausführrechte: nur angemeldete Nutzer:innen (nicht PUBLIC/anon)
revoke execute on function public.tutoring_list_entries()                         from public, anon;
revoke execute on function public.tutoring_send_request(uuid, text)               from public, anon;
revoke execute on function public.tutoring_respond_request(uuid, boolean, text)   from public, anon;
revoke execute on function public.tutoring_withdraw_request(uuid)                 from public, anon;
revoke execute on function public.tutoring_list_requests()                        from public, anon;
grant  execute on function public.tutoring_list_entries()                         to authenticated;
grant  execute on function public.tutoring_send_request(uuid, text)               to authenticated;
grant  execute on function public.tutoring_respond_request(uuid, boolean, text)   to authenticated;
grant  execute on function public.tutoring_withdraw_request(uuid)                 to authenticated;
grant  execute on function public.tutoring_list_requests()                        to authenticated;
revoke execute on function public.tutoring_touch_updated_at()                     from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6) (bewusst leer) Admin-Moderation für Nachhilfe folgt in einer eigenen Migration
--    (Integrationsstufe 7, siehe docs/INTEGRATION_PROGRESS.md).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['tutoring_entries', 'tutoring_requests', 'tutoring_saves'] loop
    if not (select c.relrowsecurity from pg_class c
             where c.oid = ('public.' || t)::regclass) then
      raise exception 'ABBRUCH: RLS ist auf % nicht aktiv', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'ABBRUCH: anon darf % lesen', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.tutoring_requests', 'select,insert,update,delete') then
    raise exception 'ABBRUCH: tutoring_requests darf nur über Funktionen genutzt werden';
  end if;
  if has_column_privilege('authenticated', 'public.tutoring_entries', 'owner_id', 'select')
     or has_column_privilege('authenticated', 'public.tutoring_entries', 'description', 'select') then
    raise exception 'ABBRUCH: tutoring_entries darf nur über tutoring_list_entries() gelesen werden';
  end if;
  if has_column_privilege('authenticated', 'public.tutoring_entries', 'created_at', 'insert')
     or has_column_privilege('authenticated', 'public.tutoring_entries', 'status', 'insert') then
    raise exception 'ABBRUCH: created_at/status dürfen beim Anlegen nicht gesetzt werden';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = 'public.tutoring_list_entries()'::regprocedure) is not true then
    raise exception 'ABBRUCH: tutoring_list_entries muss SECURITY DEFINER sein';
  end if;
  if has_column_privilege('authenticated', 'public.tutoring_entries', 'owner_id', 'update')
     or has_column_privilege('authenticated', 'public.tutoring_entries', 'school_id', 'update') then
    raise exception 'ABBRUCH: owner_id/school_id dürfen nicht änderbar sein';
  end if;
  if has_function_privilege('anon', 'public.tutoring_list_entries()', 'execute') then
    raise exception 'ABBRUCH: anon darf tutoring_list_entries ausführen';
  end if;
  if not public.dc_has_contact_data('schreib mir: a.b@example.org')
     or not public.dc_has_contact_data('0532 123 45 67')
     or public.dc_has_contact_data('Am 12.11.2026 von 14:00-16:00 Uhr, Klasse 10') then
    raise exception 'ABBRUCH: dc_has_contact_data verhält sich nicht wie erwartet';
  end if;
end;
$$;

commit;
