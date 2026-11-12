-- =============================================================================
-- 006 – Admin-Funktionen für Events und Ideen
-- =============================================================================
-- Ausführen NACH 001–005 (Supabase Dashboard -> SQL Editor -> Run).
-- IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 9 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Grundprinzip: Admins handeln AUSSCHLIESSLICH über die Funktionen admin_*().
--   * Jede Funktion prüft zuerst public.is_admin() – sonst Fehler 42501.
--   * Es werden KEINE neuen Tabellenrechte an Schüler:innen vergeben.
--   * Es gibt KEINE neue Lese-/Schreib-Policy für Admins → Admins sehen in der
--     NORMALEN App dasselbe wie alle anderen (keine Entwürfe, keine fremden offenen Ideen).
--   * Die Admin-Zuweisung (public.admins) wird NICHT verändert.
--
-- ISOLATIONSSTUFE: Die Platz- und Sperrlogik ist NUR unter READ COMMITTED korrekt
-- (Standard von PostgreSQL und der Supabase-API). Der Anmelde-Trigger und die
-- zählenden Admin-Funktionen brechen unter jeder anderen Stufe mit DC009 ab
-- (sicheres Scheitern statt möglicher Überbuchung). Details: Abschnitt 4.
--
-- Fehlercodes (SQLSTATE) für das Frontend:
--   42501 nicht erlaubt (kein Admin / Anmeldung für dieses Event nicht möglich)
--   22023 ungültige Eingabe          P0002 nicht gefunden
--   DC001 Event hat Einträge         DC002 Datum liegt in der Vergangenheit
--   DC003 nur Entwürfe löschbar      DC004 Statuswechsel nicht erlaubt
--   DC005 Plätze unter Anmeldezahl   DC006 Datum abgesagter/abgeschlossener Events fest
--   DC007 Event hat noch nicht begonnen (kann nicht abgeschlossen werden)
--   DC008 Event ist ausgebucht       DC009 falsche Isolationsstufe (nur READ COMMITTED)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Referenz-Definitionen (nur in dieser Transaktion, werden beim Commit gelöscht)
-- -----------------------------------------------------------------------------
-- PostgreSQL speichert Prüfregeln in einer eigenen, umformatierten Schreibweise.
-- Damit wir die ECHTEN Regeln zeichengenau mit den BEKANNTEN Regeln aus 001 vergleichen
-- können, legen wir dieselben Regeln auf temporären Tabellen an und lassen PostgreSQL
-- beide gleich formatieren. Diese Tabellen enthalten keine Daten.
create temp table _006_ref_events (
  status text, capacity integer, duration_minutes integer, format text, school_ids text[],
  constraint c_status_001 check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  constraint c_status_006 check (status in ('draft', 'planned', 'confirmed', 'completed', 'cancelled')),
  constraint c_capacity   check (capacity > 0),
  constraint c_duration   check (duration_minutes > 0),
  constraint c_format     check (format in ('workshop', 'meetup', 'discussion', 'competition', 'online', 'project')),
  constraint c_school_ids check (cardinality(school_ids) >= 1)
) on commit drop;

create temp table _006_ref_ideas (
  status text,
  constraint c_status_001 check (status in ('submitted', 'collecting', 'review', 'planned')),
  constraint c_status_006 check (status in ('submitted', 'collecting', 'review', 'planned', 'rejected'))
) on commit drop;

create temp table _006_ref_registrations (
  status text,
  constraint c_status check (status in ('registered', 'interested'))
) on commit drop;

-- -----------------------------------------------------------------------------
-- 1) events: Status 'draft' + Standardwert
-- -----------------------------------------------------------------------------
-- Gelöscht wird NUR eine Prüfregel, die AUSSCHLIESSLICH die Spalte status betrifft UND
-- zeichengenau der bekannten Regel aus 001 (oder der von 006 selbst) entspricht.
-- Jede andere Regel auf status führt zum ABBRUCH – sie wird nie stillschweigend entfernt.
do $$
declare
  r record;
  known_001 text := (select pg_get_constraintdef(oid) from pg_constraint
                     where conrelid = 'pg_temp._006_ref_events'::regclass and conname = 'c_status_001');
  known_006 text := (select pg_get_constraintdef(oid) from pg_constraint
                     where conrelid = 'pg_temp._006_ref_events'::regclass and conname = 'c_status_006');
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.events'::regclass and c.contype = 'c'
      and c.conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.events'::regclass and attname = 'status')]
  loop
    if r.def = known_001 or (r.conname = 'events_status_check' and r.def = known_006) then
      execute format('alter table public.events drop constraint %I', r.conname);
    else
      raise exception 'ABBRUCH: unbekannte Prüfregel "%" auf events.status (%) – wird NICHT gelöscht.', r.conname, r.def;
    end if;
  end loop;
end $$;

alter table public.events add constraint events_status_check
  check (status in ('draft', 'planned', 'confirmed', 'completed', 'cancelled'));
alter table public.events alter column status set default 'draft';

-- -----------------------------------------------------------------------------
-- 2) events: Schüler:innen sehen nur veröffentlichte Events (Erlaubnisliste)
-- -----------------------------------------------------------------------------
drop policy if exists "events: lesen für Angemeldete" on public.events;
drop policy if exists "events: lesen (veröffentlicht)" on public.events;
create policy "events: lesen (veröffentlicht)"
  on public.events for select to authenticated
  using (status in ('planned', 'confirmed', 'completed', 'cancelled'));

-- -----------------------------------------------------------------------------
-- 3) ideas: Status 'rejected' (gleiche Vorsicht wie in Teil 1)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  known_001 text := (select pg_get_constraintdef(oid) from pg_constraint
                     where conrelid = 'pg_temp._006_ref_ideas'::regclass and conname = 'c_status_001');
  known_006 text := (select pg_get_constraintdef(oid) from pg_constraint
                     where conrelid = 'pg_temp._006_ref_ideas'::regclass and conname = 'c_status_006');
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.ideas'::regclass and c.contype = 'c'
      and c.conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.ideas'::regclass and attname = 'status')]
  loop
    if r.def = known_001 or (r.conname = 'ideas_status_check' and r.def = known_006) then
      execute format('alter table public.ideas drop constraint %I', r.conname);
    else
      raise exception 'ABBRUCH: unbekannte Prüfregel "%" auf ideas.status (%) – wird NICHT gelöscht.', r.conname, r.def;
    end if;
  end loop;
end $$;

alter table public.ideas add constraint ideas_status_check
  check (status in ('submitted', 'collecting', 'review', 'planned', 'rejected'));

-- -----------------------------------------------------------------------------
-- 4) Sperr- und Prüf-Trigger für Event-Anmeldungen
-- -----------------------------------------------------------------------------
-- WANN prüft der Trigger?
--   * INSERT (jeder Status)                       -> Event geöffnet? (+ Plätze, falls 'registered')
--   * UPDATE, bei dem status ZU 'registered' wird -> Event geöffnet? + Plätze
--   * UPDATE in andere Richtung (registered -> interested) -> keine Einschränkung (wie bisher)
--   * UPDATE von event_id / user_id               -> immer verboten
-- "Event geöffnet" = existiert, status planned/confirmed, Beginn in der Zukunft
-- (genau die Bedingungen der Policy "registrations: eigene anlegen" aus 001).
--
-- SPERRE: FOR NO KEY UPDATE auf der Event-Zeile.
--   * schließt sich mit sich selbst aus  -> Anmeldungen für DASSELBE Event nacheinander
--   * kollidiert mit FOR UPDATE (Admin)  -> Admin-Änderungen und Anmeldungen nacheinander
--   * kollidiert NICHT mit FOR KEY SHARE -> Fremdschlüssel-Prüfungen bleiben unverändert
--
-- ISOLATION: Nur unter READ COMMITTED bekommt die Zählung NACH dem Warten auf die Sperre
-- eine neue Sicht (jede Abfrage einer VOLATILE-Funktion bekommt dort eine frische Sicht)
-- und sieht damit die soeben bestätigte Anmeldung der anderen Transaktion.
-- Unter REPEATABLE READ / SERIALIZABLE zählt sie mit der Sicht vom Transaktionsbeginn –
-- der letzte Platz könnte doppelt vergeben werden. Deshalb: Abbruch mit DC009.
create or replace function public.event_registration_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ev_status   text;
  ev_start    timestamptz;
  ev_capacity integer;
  taken       bigint;
  becomes_registered boolean;
begin
  if tg_op = 'UPDATE' then
    if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id then
      raise exception 'Eine Anmeldung kann nicht auf ein anderes Event oder eine andere Person übertragen werden.'
        using errcode = '42501';
    end if;
    becomes_registered := coalesce(new.status = 'registered', false)
                          and old.status is distinct from 'registered';
    if not becomes_registered then
      return new;   -- z. B. registered -> interested: bisheriges Verhalten, keine Einschränkung
    end if;
  else
    becomes_registered := coalesce(new.status = 'registered', false);
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Anmeldungen sind nur mit der Isolationsstufe READ COMMITTED möglich.' using errcode = 'DC009';
  end if;

  -- Exklusive Sperre – wartet ggf. auf Admin-Änderungen und andere Anmeldungen für dasselbe Event
  select e.status, e.start_at, e.capacity into ev_status, ev_start, ev_capacity
  from public.events e where e.id = new.event_id
  for no key update;

  if not found or ev_status not in ('planned', 'confirmed') or ev_start <= now() then
    raise exception 'Für dieses Event ist keine Anmeldung möglich.' using errcode = '42501';
  end if;

  if becomes_registered and ev_capacity is not null then
    select count(*) into taken
    from public.event_registrations r
    where r.event_id = new.event_id
      and r.status = 'registered'
      and r.user_id is distinct from new.user_id;
    if taken >= ev_capacity then
      raise exception 'Dieses Event ist ausgebucht.' using errcode = 'DC008';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists event_registrations_guard on public.event_registrations;
create trigger event_registrations_guard
  before insert or update on public.event_registrations
  for each row execute function public.event_registration_guard();

-- -----------------------------------------------------------------------------
-- 5) Interne Prüf-Funktionen (NICHT über die API aufrufbar)
-- -----------------------------------------------------------------------------
-- Mehrsprachiger Text (Länge wird am GETRIMMTEN Wert gemessen):
--   * null                        -> nur erlaubt, wenn required = false
--   * ein Text                    -> getrimmt 1..max_len Zeichen
--   * {"de": …, "tr": …, "en": …} -> mindestens eine Sprache; NUR de/tr/en; JEDER Wert
--                                    ein Text, getrimmt 1..max_len Zeichen
-- "Trimmen" entfernt Leerzeichen, Tabulatoren und Zeilenumbrüche am Anfang und Ende.
create or replace function public.admin_is_valid_text_json(v jsonb, max_len integer, required boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null then not required
    when jsonb_typeof(v) = 'string' then
      char_length(btrim(v #>> '{}', E' \t\r\n')) between 1 and max_len
    when jsonb_typeof(v) = 'object' then
      exists (select 1 from jsonb_each(v))
      and not exists (
        select 1 from jsonb_each(v) e
        where e.key not in ('de', 'tr', 'en')
           or jsonb_typeof(e.value) <> 'string'
           or char_length(btrim(e.value #>> '{}', E' \t\r\n')) not between 1 and max_len
      )
    else false
  end;
$$;

-- Speichert mehrsprachige Texte GETRIMMT (damit gespeicherte Länge = geprüfte Länge).
-- Wird nur NACH erfolgreicher Prüfung aufgerufen.
create or replace function public.admin_trim_text_json(v jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' then to_jsonb(btrim(v #>> '{}', E' \t\r\n'))
    when jsonb_typeof(v) = 'object' then
      (select jsonb_object_agg(e.key, btrim(e.value #>> '{}', E' \t\r\n')) from jsonb_each(v) e)
    else v
  end;
$$;

-- Prüft alle Event-Angaben. Fehler mit Code 22023 (= ungültige Eingabe).
-- Die Grenzen sind gleich oder STRENGER als die Prüfregeln aus 001
-- (capacity > 0, duration_minutes > 0, format-Liste, cardinality(school_ids) >= 1).
create or replace function public.admin_assert_event_input(
  p_title jsonb, p_summary jsonb, p_description jsonb, p_location jsonb, p_audience jsonb,
  p_start_at timestamptz, p_duration_minutes integer, p_capacity integer,
  p_host_school_id text, p_school_ids text[], p_topics text[], p_format text
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  -- Gleiche Liste wie src/data/topics.js (bei neuen Themen beides anpassen)
  allowed_topics constant text[] := array['languages', 'science', 'technology', 'arts', 'music',
                                          'sports', 'culture', 'debate', 'career', 'social'];
begin
  -- Texte
  if not public.admin_is_valid_text_json(p_title, 120, true) then
    raise exception 'Titel fehlt oder ist ungültig (nur de/tr/en, nicht leer, höchstens 120 Zeichen je Sprache).' using errcode = '22023';
  end if;
  if not public.admin_is_valid_text_json(p_summary, 300, false)
     or not public.admin_is_valid_text_json(p_description, 2000, false)
     or not public.admin_is_valid_text_json(p_location, 200, false)
     or not public.admin_is_valid_text_json(p_audience, 200, false) then
    raise exception 'Ein Textfeld ist ungültig, leer oder zu lang (nur de/tr/en).' using errcode = '22023';
  end if;

  -- Datum, Dauer, Plätze, Format
  if p_start_at is null then
    raise exception 'Datum und Uhrzeit fehlen.' using errcode = '22023';
  end if;
  if p_duration_minutes is not null and p_duration_minutes not between 1 and 1440 then
    raise exception 'Dauer muss zwischen 1 und 1440 Minuten liegen.' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity not between 1 and 10000 then
    raise exception 'Plätze müssen zwischen 1 und 10000 liegen.' using errcode = '22023';
  end if;
  if p_format is not null and p_format not in ('workshop', 'meetup', 'discussion', 'competition', 'online', 'project') then
    raise exception 'Format ist ungültig.' using errcode = '22023';
  end if;

  -- Beteiligte Schulen
  if p_school_ids is null or cardinality(p_school_ids) = 0 then
    raise exception 'Mindestens eine beteiligte Schule auswählen.' using errcode = '22023';
  end if;
  if array_ndims(p_school_ids) <> 1 or cardinality(p_school_ids) > 20 then
    raise exception 'Die Schul-Liste ist ungültig (eine einfache Liste mit höchstens 20 Schulen).' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_school_ids) s(v) where s.v is null) then
    raise exception 'Die Schul-Liste enthält leere Einträge (NULL).' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_school_ids) s(v) where s.v !~ '^[a-z0-9_-]{1,40}$') then
    raise exception 'Die Schul-Liste enthält ungültige Einträge.' using errcode = '22023';
  end if;
  if (select count(distinct s.v) from unnest(p_school_ids) s(v)) <> cardinality(p_school_ids) then
    raise exception 'Die Schul-Liste enthält eine Schule mehrfach.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_school_ids) s(v)
             where not exists (select 1 from public.schools sc where sc.id = s.v)) then
    raise exception 'Unbekannte Schule in der Auswahl.' using errcode = '22023';
  end if;
  if p_host_school_id is null or not (p_host_school_id = any (p_school_ids)) then
    raise exception 'Die Gastgeber-Schule muss zu den beteiligten Schulen gehören.' using errcode = '22023';
  end if;

  -- Themen (optional; leere Liste erlaubt)
  if p_topics is not null and cardinality(p_topics) > 0 then
    if array_ndims(p_topics) <> 1 or cardinality(p_topics) > 10 then
      raise exception 'Die Themen-Liste ist ungültig (eine einfache Liste mit höchstens 10 Themen).' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_topics) t(v) where t.v is null) then
      raise exception 'Die Themen-Liste enthält leere Einträge (NULL).' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_topics) t(v) where not (t.v = any (allowed_topics))) then
      raise exception 'Die Themen-Liste enthält ein unbekanntes Thema.' using errcode = '22023';
    end if;
    if (select count(distinct t.v) from unnest(p_topics) t(v)) <> cardinality(p_topics) then
      raise exception 'Die Themen-Liste enthält ein Thema mehrfach.' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Admin-Funktionen: EVENTS
-- -----------------------------------------------------------------------------
-- Alle Events (auch Entwürfe) + Anzahl Anmeldungen/Interessierte (nur Zahlen, keine Namen)
create or replace function public.admin_list_events()
returns table (
  id uuid, title jsonb, summary jsonb, description jsonb, location jsonb, audience jsonb,
  start_at timestamptz, duration_minutes integer, capacity integer, online boolean,
  topics text[], format text, host_school_id text, school_ids text[], status text,
  created_at timestamptz, registered_count bigint, interested_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.summary, e.description, e.location, e.audience,
           e.start_at, e.duration_minutes, e.capacity, e.online,
           e.topics, e.format, e.host_school_id, e.school_ids, e.status, e.created_at,
           count(r.event_id) filter (where r.status = 'registered'),
           count(r.event_id) filter (where r.status = 'interested')
    from public.events e
    left join public.event_registrations r on r.event_id = e.id
    group by e.id
    order by e.start_at;
end;
$$;

-- Neues Event – IMMER als Entwurf (Datum darf hier noch beliebig sein; geprüft wird beim Veröffentlichen)
create or replace function public.admin_create_event(
  p_title jsonb, p_start_at timestamptz, p_host_school_id text, p_school_ids text[],
  p_summary jsonb default null, p_description jsonb default null, p_location jsonb default null,
  p_audience jsonb default null, p_duration_minutes integer default null, p_capacity integer default null,
  p_online boolean default false, p_topics text[] default '{}', p_format text default 'meetup'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  perform public.admin_assert_event_input(p_title, p_summary, p_description, p_location, p_audience,
    p_start_at, p_duration_minutes, p_capacity, p_host_school_id, p_school_ids, p_topics, p_format);

  insert into public.events (title, summary, description, location, audience, start_at,
    duration_minutes, capacity, online, topics, format, host_school_id, school_ids, status)
  values (public.admin_trim_text_json(p_title), public.admin_trim_text_json(p_summary),
    public.admin_trim_text_json(p_description), public.admin_trim_text_json(p_location),
    public.admin_trim_text_json(p_audience), p_start_at,
    p_duration_minutes, p_capacity, coalesce(p_online, false), coalesce(p_topics, '{}'),
    coalesce(p_format, 'meetup'), p_host_school_id, p_school_ids, 'draft')
  returning id into new_id;
  return new_id;
end;
$$;

-- Event bearbeiten – ändert NIE den Status und NIE Anmeldungen.
-- Datums-Regeln:
--   draft               -> beliebiges Datum (Prüfung beim Veröffentlichen)
--   planned / confirmed -> neues Datum muss in der Zukunft liegen (unverändertes Datum ist ok)
--   cancelled/completed -> Datum darf nicht mehr geändert werden (DC006)
-- Plätze: nie weniger als die Zahl der verbindlichen Anmeldungen (DC005).
-- Nur unter READ COMMITTED (DC009) – sonst wäre die Zählung nach der Sperre veraltet.
create or replace function public.admin_update_event(
  p_id uuid, p_title jsonb, p_start_at timestamptz, p_host_school_id text, p_school_ids text[],
  p_summary jsonb, p_description jsonb, p_location jsonb, p_audience jsonb,
  p_duration_minutes integer, p_capacity integer, p_online boolean, p_topics text[], p_format text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
  old_start  timestamptz;
  registered bigint;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Admin-Änderungen an Events sind nur mit READ COMMITTED möglich.' using errcode = 'DC009';
  end if;
  perform public.admin_assert_event_input(p_title, p_summary, p_description, p_location, p_audience,
    p_start_at, p_duration_minutes, p_capacity, p_host_school_id, p_school_ids, p_topics, p_format);

  -- Sperre ZUERST setzen (kollidiert mit dem Anmelde-Trigger) – danach sind Status,
  -- Datum und Anmeldezahl verlässlich
  select e.status, e.start_at into old_status, old_start
  from public.events e where e.id = p_id
  for update;
  if not found then
    raise exception 'Event nicht gefunden.' using errcode = 'P0002';
  end if;

  if old_status in ('cancelled', 'completed') and p_start_at is distinct from old_start then
    raise exception 'Das Datum eines abgesagten oder abgeschlossenen Events kann nicht geändert werden.' using errcode = 'DC006';
  end if;
  if old_status in ('planned', 'confirmed') and p_start_at is distinct from old_start and p_start_at <= now() then
    raise exception 'Ein veröffentlichtes Event kann nicht in die Vergangenheit verschoben werden.' using errcode = 'DC002';
  end if;

  if p_capacity is not null then
    select count(*) into registered
    from public.event_registrations r where r.event_id = p_id and r.status = 'registered';
    if p_capacity < registered then
      raise exception 'Es gibt bereits % verbindliche Anmeldungen – die Plätze können nicht auf % reduziert werden.',
        registered, p_capacity using errcode = 'DC005';
    end if;
  end if;

  update public.events set
    title = public.admin_trim_text_json(p_title), summary = public.admin_trim_text_json(p_summary),
    description = public.admin_trim_text_json(p_description), location = public.admin_trim_text_json(p_location),
    audience = public.admin_trim_text_json(p_audience), start_at = p_start_at,
    duration_minutes = p_duration_minutes, capacity = p_capacity, online = coalesce(p_online, false),
    topics = coalesce(p_topics, '{}'), format = coalesce(p_format, 'meetup'),
    host_school_id = p_host_school_id, school_ids = p_school_ids
  where id = p_id;
end;
$$;

-- Status ändern – nur diese Übergänge:
--   draft     -> planned, confirmed    (veröffentlichen; Datum muss in der Zukunft liegen, DC002)
--   planned   -> confirmed, cancelled, completed
--   confirmed -> cancelled, completed
--   cancelled -> (keiner)              completed -> (keiner)
--   NIE zurück zu draft.  completed nur, wenn das Event begonnen hat (DC007).
-- Gleicher Status wie vorher: nichts zu tun (kein Fehler). Ungültiger Wechsel: DC004.
create or replace function public.admin_set_event_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
  old_start  timestamptz;
  allowed    boolean;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Admin-Änderungen an Events sind nur mit READ COMMITTED möglich.' using errcode = 'DC009';
  end if;
  if p_status is null or p_status not in ('draft', 'planned', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Ungültiger Status.' using errcode = '22023';
  end if;

  select e.status, e.start_at into old_status, old_start
  from public.events e where e.id = p_id
  for update;
  if not found then
    raise exception 'Event nicht gefunden.' using errcode = 'P0002';
  end if;
  if old_status = p_status then
    return;
  end if;

  allowed := case old_status
    when 'draft'     then p_status in ('planned', 'confirmed')
    when 'planned'   then p_status in ('confirmed', 'cancelled', 'completed')
    when 'confirmed' then p_status in ('cancelled', 'completed')
    else false   -- cancelled, completed: endgültig
  end;
  if not allowed then
    raise exception 'Statuswechsel von "%" nach "%" ist nicht erlaubt.', old_status, p_status using errcode = 'DC004';
  end if;

  if old_status = 'draft' and old_start <= now() then
    raise exception 'Das Datum liegt in der Vergangenheit – bitte zuerst das Datum ändern.' using errcode = 'DC002';
  end if;
  if p_status = 'completed' and old_start > now() then
    raise exception 'Ein Event, das noch nicht begonnen hat, kann nicht abgeschlossen werden.' using errcode = 'DC007';
  end if;

  update public.events set status = p_status where id = p_id;
end;
$$;

-- Löschen NUR für Entwürfe ohne Einträge – veröffentlichte Events werden abgesagt, nie gelöscht
create or replace function public.admin_delete_event(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
  reg_count  bigint;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Admin-Änderungen an Events sind nur mit READ COMMITTED möglich.' using errcode = 'DC009';
  end if;

  select e.status into old_status from public.events e where e.id = p_id for update;
  if not found then
    raise exception 'Event nicht gefunden.' using errcode = 'P0002';
  end if;
  if old_status <> 'draft' then
    raise exception 'Nur Entwürfe können gelöscht werden. Veröffentlichte Events bitte absagen.' using errcode = 'DC003';
  end if;
  -- Zusätzliche Sicherung (Entwürfe können keine Anmeldungen haben – siehe Trigger und Policy)
  select count(*) into reg_count from public.event_registrations r where r.event_id = p_id;
  if reg_count > 0 then
    raise exception 'Dieses Event hat % Einträge und wird nicht gelöscht.', reg_count using errcode = 'DC001';
  end if;

  delete from public.events where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Admin-Funktionen: IDEEN
-- -----------------------------------------------------------------------------
-- Alle Ideen (optional nach Status) + Unterstützer-Zahl. OHNE author_id (Datenschutz).
create or replace function public.admin_list_ideas(p_status text default null)
returns table (
  id uuid, school_id text, title text, summary text, description text, topics text[],
  format text, school_ids text[], status text, created_at timestamptz, supporters bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  return query
    select i.id, i.school_id, i.title, i.summary, i.description, i.topics,
           i.format, i.school_ids, i.status, i.created_at,
           (select count(*) from public.idea_supports s where s.idea_id = i.id)
    from public.ideas i
    where p_status is null or i.status = p_status
    order by i.created_at desc;
end;
$$;

-- Status setzen – nur diese Übergänge:
--   submitted  -> collecting (freigeben), rejected (ablehnen)
--   collecting -> review, rejected
--   review     -> planned, collecting (zurück zum Sammeln), rejected
--   planned    -> (keiner – endgültig)
--   rejected   -> submitted  = "WIEDERERÖFFNEN ZUR PRÜFUNG": Die Idee kommt zurück in die
--                 Moderations-Warteschlange und ist danach weiterhin NUR für die Autor:in
--                 sichtbar. Eine Freigabe erfordert anschließend einen eigenen Schritt
--                 submitted -> collecting. rejected -> collecting/review/planned ist VERBOTEN.
-- Gleicher Status wie vorher: nichts zu tun (kein Fehler). Ungültiger Wechsel: DC004.
create or replace function public.admin_set_idea_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
  allowed    boolean;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('submitted', 'collecting', 'review', 'planned', 'rejected') then
    raise exception 'Ungültiger Status.' using errcode = '22023';
  end if;

  select i.status into old_status from public.ideas i where i.id = p_id for update;
  if not found then
    raise exception 'Idee nicht gefunden.' using errcode = 'P0002';
  end if;
  if old_status = p_status then
    return;
  end if;

  allowed := case old_status
    when 'submitted'  then p_status in ('collecting', 'rejected')
    when 'collecting' then p_status in ('review', 'rejected')
    when 'review'     then p_status in ('planned', 'collecting', 'rejected')
    when 'rejected'   then p_status = 'submitted'   -- nur Wiedereröffnen zur Prüfung
    else false                                      -- planned: endgültig
  end;
  if not allowed then
    raise exception 'Statuswechsel von "%" nach "%" ist nicht erlaubt.', old_status, p_status using errcode = 'DC004';
  end if;

  update public.ideas set status = p_status where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Ausführungsrechte
-- -----------------------------------------------------------------------------
-- Trigger- und interne Funktionen: über die API für niemanden aufrufbar
-- (Trigger laufen trotzdem – beim Auslösen wird kein EXECUTE-Recht geprüft.)
revoke all on function public.event_registration_guard() from public, anon, authenticated;
revoke all on function public.admin_is_valid_text_json(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_trim_text_json(jsonb) from public, anon, authenticated;
revoke all on function public.admin_assert_event_input(jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz, integer, integer, text, text[], text[], text)
  from public, anon, authenticated;

-- Admin-Funktionen: nur angemeldete Nutzer dürfen sie AUFRUFEN – nur Admins kommen durch
revoke all on function public.admin_list_events() from public, anon;
revoke all on function public.admin_create_event(jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) from public, anon;
revoke all on function public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) from public, anon;
revoke all on function public.admin_set_event_status(uuid, text) from public, anon;
revoke all on function public.admin_delete_event(uuid) from public, anon;
revoke all on function public.admin_list_ideas(text) from public, anon;
revoke all on function public.admin_set_idea_status(uuid, text) from public, anon;

grant execute on function public.admin_list_events() to authenticated;
grant execute on function public.admin_create_event(jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) to authenticated;
grant execute on function public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text) to authenticated;
grant execute on function public.admin_set_event_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_event(uuid) to authenticated;
grant execute on function public.admin_list_ideas(text) to authenticated;
grant execute on function public.admin_set_idea_status(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9) SELBSTPRÜFUNG – bricht ab (= alles wird rückgängig gemacht), falls etwas nicht stimmt
-- -----------------------------------------------------------------------------
do $$
declare
  owner_name name := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.events'::regclass);
  owner_bypass boolean;
  api_fns text[] := array[
    'public.admin_list_events()',
    'public.admin_create_event(jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text)',
    'public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text)',
    'public.admin_set_event_status(uuid, text)',
    'public.admin_delete_event(uuid)',
    'public.admin_list_ideas(text)',
    'public.admin_set_idea_status(uuid, text)'
  ];
  rc_fns text[] := array[   -- Funktionen, die READ COMMITTED erzwingen müssen
    'public.event_registration_guard()',
    'public.admin_update_event(uuid, jsonb, timestamptz, text, text[], jsonb, jsonb, jsonb, jsonb, integer, integer, boolean, text[], text)',
    'public.admin_set_event_status(uuid, text)',
    'public.admin_delete_event(uuid)'
  ];
  internal_fns text[] := array[
    'public.admin_is_valid_text_json(jsonb, integer, boolean)',
    'public.admin_trim_text_json(jsonb)',
    'public.admin_assert_event_input(jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz, integer, integer, text, text[], text[], text)'
  ];
  rls_tables text[] := array['public.events', 'public.event_registrations', 'public.ideas',
                             'public.idea_supports', 'public.schools', 'public.admins'];
  policy_tables text[] := array['events', 'event_registrations', 'ideas', 'idea_supports'];
  -- Jedes einzelne Recht, das der Eigentümer für die Operationen braucht
  -- (FOR UPDATE / FOR NO KEY UPDATE setzen das UPDATE-Recht voraus)
  required_privs jsonb := $req$[
    {"t": "public.events",              "p": ["SELECT", "INSERT", "UPDATE", "DELETE"]},
    {"t": "public.event_registrations", "p": ["SELECT"]},
    {"t": "public.ideas",               "p": ["SELECT", "UPDATE"]},
    {"t": "public.idea_supports",       "p": ["SELECT"]},
    {"t": "public.schools",             "p": ["SELECT"]},
    {"t": "public.admins",              "p": ["SELECT"]}
  ]$req$::jsonb;
  -- VOLLSTÄNDIGER erwarteter Policy-Satz der vier Tabellen – exakt wie in 001, 004 (v3) und 006.
  -- Jede Policy wird kurz als Vergleichs-Policy angelegt; PostgreSQL formatiert beide gleich;
  -- verglichen wird ZEICHENGENAU (Art, Befehl, Rollen, USING, WITH CHECK).
  expected_policies jsonb := $spec$[
    {"t": "events", "n": "events: lesen (veröffentlicht)", "c": "SELECT",
     "u": "status in ('planned', 'confirmed', 'completed', 'cancelled')", "w": null},
    {"t": "event_registrations", "n": "registrations: eigene lesen", "c": "SELECT",
     "u": "user_id = (select auth.uid())", "w": null},
    {"t": "event_registrations", "n": "registrations: eigene anlegen", "c": "INSERT",
     "u": null,
     "w": "user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id and e.status in ('planned', 'confirmed') and e.start_at > now())"},
    {"t": "event_registrations", "n": "registrations: eigene ändern", "c": "UPDATE",
     "u": "user_id = (select auth.uid())", "w": "user_id = (select auth.uid())"},
    {"t": "event_registrations", "n": "registrations: eigene löschen", "c": "DELETE",
     "u": "user_id = (select auth.uid())", "w": null},
    {"t": "ideas", "n": "ideas: lesen (freigegeben oder eigene)", "c": "SELECT",
     "u": "status in ('collecting', 'review', 'planned') or author_id = (select auth.uid())", "w": null},
    {"t": "ideas", "n": "ideas: eigene anlegen", "c": "INSERT",
     "u": null,
     "w": "author_id = (select auth.uid()) and status = 'submitted' and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid()))"},
    {"t": "ideas", "n": "ideas: eigene löschen", "c": "DELETE",
     "u": "author_id = (select auth.uid())", "w": null},
    {"t": "idea_supports", "n": "supports: eigene lesen", "c": "SELECT",
     "u": "user_id = (select auth.uid())", "w": null},
    {"t": "idea_supports", "n": "supports: eigene anlegen", "c": "INSERT",
     "u": null,
     "w": "user_id = (select auth.uid()) and exists (select 1 from public.ideas i where i.id = idea_id and i.author_id <> (select auth.uid()) and i.status in ('collecting', 'review', 'planned'))"},
    {"t": "idea_supports", "n": "supports: eigene löschen", "c": "DELETE",
     "u": "user_id = (select auth.uid())", "w": null}
  ]$spec$::jsonb;
  -- Spalten aus 001 (Name:Typ:Pflichtfeld, in Tabellen-Reihenfolge)
  expected_columns jsonb := $cols$[
    {"t": "public.events", "c": "id:uuid:not null, title:jsonb:not null, summary:jsonb:null, description:jsonb:null, location:jsonb:null, audience:jsonb:null, start_at:timestamp with time zone:not null, duration_minutes:integer:null, capacity:integer:null, online:boolean:not null, topics:text[]:not null, format:text:not null, host_school_id:text:not null, school_ids:text[]:not null, status:text:not null, created_at:timestamp with time zone:not null"},
    {"t": "public.event_registrations", "c": "event_id:uuid:not null, user_id:uuid:not null, status:text:not null, created_at:timestamp with time zone:not null"},
    {"t": "public.ideas", "c": "id:uuid:not null, author_id:uuid:not null, school_id:text:not null, title:text:not null, summary:text:not null, description:text:not null, topics:text[]:not null, format:text:not null, school_ids:text[]:not null, status:text:not null, created_at:timestamp with time zone:not null"},
    {"t": "public.idea_supports", "c": "idea_id:uuid:not null, user_id:uuid:not null, created_at:timestamp with time zone:not null"}
  ]$cols$::jsonb;
  -- Funktionskörper von get_idea_support_counts() aus 004 v3 (Leerraum vereinheitlicht)
  counts_body constant text :=
    'select s.idea_id, count(*) from public.idea_supports s join public.ideas i on i.id = s.idea_id '
    || 'where i.status in (''collecting'', ''review'', ''planned'') or i.author_id = (select auth.uid()) '
    || 'group by s.idea_id;';
  spec jsonb;
  req jsonb;
  pol record;
  priv text;
  tmp_name text;
  exp_qual text;
  exp_check text;
  k integer := 0;
  fn text;
  fn_oid oid;
  tbl text;
  tbl_owner name;
  rls_on boolean;
  forced boolean;
  extra text;
  actual text;
  expected text;
begin
  -- 9.0) Die Migration muss als Eigentümer der Tabellen laufen
  if current_user is distinct from owner_name then
    raise exception 'ABBRUCH: Die Migration läuft als %, die Tabellen gehören % – bitte als Eigentümer ausführen.',
      current_user, owner_name;
  end if;

  -- 9a) SCHEMA: Spalten (Typ + Pflichtfeld) exakt wie in 001
  for spec in select value from jsonb_array_elements(expected_columns) loop
    select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' ||
                      case when a.attnotnull then 'not null' else 'null' end, ', ' order by a.attnum)
      into actual
    from pg_attribute a
    where a.attrelid = (spec ->> 't')::regclass and a.attnum > 0 and not a.attisdropped;
    if actual is distinct from spec ->> 'c' then
      raise exception 'ABBRUCH: Spalten von % weichen von 001 ab. Live: % | Erwartet: %', spec ->> 't', actual, spec ->> 'c';
    end if;
  end loop;

  -- 9a2) SCHEMA: Standardwerte, die 006 voraussetzt
  select string_agg(a.attname || '=' || pg_get_expr(d.adbin, d.adrelid), ', ' order by a.attname) into actual
  from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.events'::regclass and a.attname in ('online', 'topics', 'format', 'status');
  if actual is distinct from 'format=''meetup''::text, online=false, status=''draft''::text, topics=''{}''::text[]' then
    raise exception 'ABBRUCH: Standardwerte von events weichen ab: %', actual;
  end if;

  -- 9a3) SCHEMA: Prüfregeln (CHECK) – vollständiger Satz, zeichengenau gegen die Referenz
  select string_agg(pg_get_constraintdef(oid), ' | ' order by pg_get_constraintdef(oid)) into actual
  from pg_constraint where conrelid = 'public.events'::regclass and contype = 'c';
  select string_agg(pg_get_constraintdef(oid), ' | ' order by pg_get_constraintdef(oid)) into expected
  from pg_constraint where conrelid = 'pg_temp._006_ref_events'::regclass and contype = 'c' and conname <> 'c_status_001';
  if actual is distinct from expected then
    raise exception 'ABBRUCH: Prüfregeln von events weichen ab. Live: % | Erwartet: %', actual, expected;
  end if;

  select string_agg(pg_get_constraintdef(oid), ' | ' order by pg_get_constraintdef(oid)) into actual
  from pg_constraint where conrelid = 'public.event_registrations'::regclass and contype = 'c';
  select pg_get_constraintdef(oid) into expected
  from pg_constraint where conrelid = 'pg_temp._006_ref_registrations'::regclass and conname = 'c_status';
  if actual is distinct from expected then
    raise exception 'ABBRUCH: Prüfregeln von event_registrations weichen ab. Live: % | Erwartet: %', actual, expected;
  end if;

  select string_agg(pg_get_constraintdef(c.oid), ' | ') into actual
  from pg_constraint c
  where c.conrelid = 'public.ideas'::regclass and c.contype = 'c'
    and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.ideas'::regclass and attname = 'status')];
  select pg_get_constraintdef(oid) into expected
  from pg_constraint where conrelid = 'pg_temp._006_ref_ideas'::regclass and conname = 'c_status_006';
  if actual is distinct from expected then
    raise exception 'ABBRUCH: Prüfregel von ideas.status weicht ab. Live: % | Erwartet: %', actual, expected;
  end if;

  -- 9a4) SCHEMA: Schlüssel und Fremdschlüssel, auf die sich 006 verlässt
  -- events: Primärschlüssel ist GENAU die eine Spalte id (kein anderer, kein zusammengesetzter)
  select string_agg(array_to_string(c.conkey, ','), ';') into actual
  from pg_constraint c
  where c.conrelid = 'public.events'::regclass and c.contype = 'p';
  if actual is distinct from (select attnum::text from pg_attribute
                              where attrelid = 'public.events'::regclass and attname = 'id') then
    raise exception 'ABBRUCH: Primärschlüssel von events ist nicht genau events(id) (gefunden: Spaltennummern %).',
      coalesce(actual, '(keiner)');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_registrations'::regclass and contype = 'p'
                 and conkey = array[(select attnum from pg_attribute where attrelid = 'public.event_registrations'::regclass and attname = 'event_id'),
                                    (select attnum from pg_attribute where attrelid = 'public.event_registrations'::regclass and attname = 'user_id')]) then
    raise exception 'ABBRUCH: Primärschlüssel (event_id, user_id) auf event_registrations fehlt – Doppel-Anmeldungen wären möglich.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.idea_supports'::regclass and contype = 'p'
                 and conkey = array[(select attnum from pg_attribute where attrelid = 'public.idea_supports'::regclass and attname = 'idea_id'),
                                    (select attnum from pg_attribute where attrelid = 'public.idea_supports'::regclass and attname = 'user_id')]) then
    raise exception 'ABBRUCH: Primärschlüssel (idea_id, user_id) auf idea_supports fehlt.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_registrations'::regclass and contype = 'f'
                 and confrelid = 'public.events'::regclass and confdeltype = 'c'
                 and conkey = array[(select attnum from pg_attribute where attrelid = 'public.event_registrations'::regclass and attname = 'event_id')]) then
    raise exception 'ABBRUCH: Fremdschlüssel event_registrations.event_id -> events (on delete cascade) fehlt.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and contype = 'f'
                 and confrelid = 'public.schools'::regclass
                 and conkey = array[(select attnum from pg_attribute where attrelid = 'public.events'::regclass and attname = 'host_school_id')]) then
    raise exception 'ABBRUCH: Fremdschlüssel events.host_school_id -> schools fehlt.';
  end if;

  -- 9b/9c) POLICIES: vollständiger Satz auf events, event_registrations, ideas, idea_supports
  --   (1) KEINE Policy außer den erwarteten – weder PERMISSIVE noch RESTRICTIVE
  select string_agg(p.tablename || ': ' || p.policyname || ' (' || p.permissive || ', ' || p.cmd || ')', '; ') into extra
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any (policy_tables)
    and not exists (select 1 from jsonb_array_elements(expected_policies) s
                    where s.value ->> 't' = p.tablename and s.value ->> 'n' = p.policyname);
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Policies gefunden (auch einschränkende werden nicht geduldet): %', extra;
  end if;

  --   (2) JEDE erwartete Policy: vorhanden, PERMISSIVE, Befehl, Rollen, USING und WITH CHECK zeichengenau
  for spec in select value from jsonb_array_elements(expected_policies) loop
    k := k + 1;
    tmp_name := '006_vergleich_' || k;
    execute format('create policy %I on public.%I as permissive for %s to authenticated%s%s',
      tmp_name, spec ->> 't', spec ->> 'c',
      case when spec ->> 'u' is not null then ' using (' || (spec ->> 'u') || ')' else '' end,
      case when spec ->> 'w' is not null then ' with check (' || (spec ->> 'w') || ')' else '' end);
    select p.qual, p.with_check into exp_qual, exp_check
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = spec ->> 't' and p.policyname = tmp_name;
    execute format('drop policy %I on public.%I', tmp_name, spec ->> 't');

    select * into pol from pg_policies
    where schemaname = 'public' and tablename = spec ->> 't' and policyname = spec ->> 'n';
    if not found then
      raise exception 'ABBRUCH: Policy "%" auf % fehlt.', spec ->> 'n', spec ->> 't';
    end if;
    if pol.permissive <> 'PERMISSIVE' or pol.cmd <> spec ->> 'c' or pol.roles <> array['authenticated']::name[] then
      raise exception 'ABBRUCH: Policy "%": Art %, Befehl %, Rollen % (erwartet: PERMISSIVE, %, {authenticated}).',
        pol.policyname, pol.permissive, pol.cmd, pol.roles, spec ->> 'c';
    end if;
    if pol.qual is distinct from exp_qual then
      raise exception 'ABBRUCH: Policy "%": USING weicht ab. Live: % | Erwartet: %',
        pol.policyname, coalesce(pol.qual, '(keine)'), coalesce(exp_qual, '(keine)');
    end if;
    if pol.with_check is distinct from exp_check then
      raise exception 'ABBRUCH: Policy "%": WITH CHECK weicht ab. Live: % | Erwartet: %',
        pol.policyname, coalesce(pol.with_check, '(keine)'), coalesce(exp_check, '(keine)');
    end if;
  end loop;

  --   (3) get_idea_support_counts() entspricht 004 v3
  if not exists (
    select 1 from pg_proc
    where oid = 'public.get_idea_support_counts()'::regprocedure
      and prosecdef and provolatile = 's' and proconfig = array['search_path=""']
      and pg_get_userbyid(proowner) = owner_name
      and btrim(regexp_replace(lower(prosrc), '\s+', ' ', 'g')) = counts_body
  ) then
    raise exception 'ABBRUCH: get_idea_support_counts() entspricht nicht 004 (v3).';
  end if;

  -- 9d) KEINE neuen Tabellenrechte für Schüler:innen oder Besucher (jedes Recht einzeln)
  foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.events', priv) then
      raise exception 'ABBRUCH: authenticated hat % auf events.', priv;
    end if;
  end loop;
  foreach priv in array array['UPDATE', 'TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.ideas', priv) then
      raise exception 'ABBRUCH: authenticated hat % auf ideas.', priv;
    end if;
  end loop;
  foreach tbl in array array['public.events', 'public.ideas', 'public.event_registrations', 'public.idea_supports'] loop
    foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('anon', tbl, priv) then
        raise exception 'ABBRUCH: anon hat % auf %.', priv, tbl;
      end if;
    end loop;
  end loop;
  if has_column_privilege('authenticated', 'public.event_registrations', 'event_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.event_registrations', 'user_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.event_registrations', 'status', 'UPDATE') then
    raise exception 'ABBRUCH: Spaltenrechte auf event_registrations entsprechen nicht 002.';
  end if;

  -- 9e) Admin-API-Funktionen: security definer, search_path '', Eigentümer, Rechte
  foreach fn in array api_fns loop
    fn_oid := fn::regprocedure;
    if not exists (select 1 from pg_proc where oid = fn_oid and prosecdef
                   and proconfig = array['search_path=""']
                   and prosrc like '%public.is_admin()%') then
      raise exception 'ABBRUCH: % ist nicht wie erwartet konfiguriert.', fn;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = fn_oid) is distinct from owner_name then
      raise exception 'ABBRUCH: % hat einen anderen Eigentümer als die Tabellen.', fn;
    end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where p.oid = fn_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then
      raise exception 'ABBRUCH: PUBLIC darf % ausführen.', fn;
    end if;
    if has_function_privilege('anon', fn_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: anon darf % ausführen.', fn;
    end if;
    if not has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: authenticated darf % nicht aufrufen.', fn;
    end if;
  end loop;

  -- 9e2) Funktionen mit Zähl-/Sperrlogik erzwingen READ COMMITTED
  foreach fn in array rc_fns loop
    if not exists (select 1 from pg_proc where oid = fn::regprocedure
                   and prosrc like '%transaction_isolation%' and prosrc like '%read committed%'
                   and prosrc like '%DC009%') then
      raise exception 'ABBRUCH: % erzwingt READ COMMITTED nicht.', fn;
    end if;
  end loop;

  -- 9f) Interne Funktionen: über die API für NIEMANDEN aufrufbar, kein security definer
  foreach fn in array internal_fns loop
    fn_oid := fn::regprocedure;
    if (select prosecdef from pg_proc where oid = fn_oid) then
      raise exception 'ABBRUCH: % darf kein security definer sein.', fn;
    end if;
    if not exists (select 1 from pg_proc where oid = fn_oid and proconfig = array['search_path=""']) then
      raise exception 'ABBRUCH: % hat keinen leeren search_path.', fn;
    end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where p.oid = fn_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
       or has_function_privilege('anon', fn_oid, 'EXECUTE')
       or has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: % ist über die API aufrufbar.', fn;
    end if;
  end loop;

  -- 9g) Eigentümer der Funktionen: jedes benötigte Tabellenrecht einzeln; RLS gilt nicht für ihn;
  --     Praxis-Probe mit row_security = off. RLS bleibt für Schüler:innen aktiv.
  for req in select value from jsonb_array_elements(required_privs) loop
    for priv in select jsonb_array_elements_text(req -> 'p') loop
      if not has_table_privilege(owner_name, req ->> 't', priv) then
        raise exception 'ABBRUCH: Eigentümer % hat kein %-Recht auf %.', owner_name, priv, req ->> 't';
      end if;
    end loop;
  end loop;

  owner_bypass := coalesce((select rolbypassrls from pg_roles where rolname = owner_name), false);
  foreach tbl in array rls_tables loop
    select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
      into tbl_owner, rls_on, forced
    from pg_class c where c.oid = tbl::regclass;
    if not rls_on then
      raise exception 'ABBRUCH: Row Level Security ist auf % nicht aktiv.', tbl;
    end if;
    if not owner_bypass and (tbl_owner is distinct from owner_name or forced) then
      raise exception 'ABBRUCH: Funktionen (Eigentümer %, BYPASSRLS %) unterliegen auf % der RLS (Eigentümer %, FORCE %).',
        owner_name, owner_bypass, tbl, tbl_owner, forced;
    end if;
  end loop;

  set local row_security = off;
  foreach tbl in array rls_tables loop
    begin
      execute format('select count(*) from %s', tbl::regclass);
    exception when insufficient_privilege then
      raise exception 'ABBRUCH: % kann vom Eigentümer % nicht vollständig gelesen werden (RLS würde filtern).', tbl, owner_name;
    end;
  end loop;
  set local row_security = on;

  -- 9h) Trigger: genau dieser eine, aktiv, BEFORE INSERT OR UPDATE FOR EACH ROW, sichere Funktion
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.event_registrations'::regclass
      and t.tgname = 'event_registrations_guard'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgfoid = 'public.event_registration_guard()'::regprocedure
      and t.tgtype = (1 | 2 | 4 | 16)   -- ROW | BEFORE | INSERT | UPDATE
  ) then
    raise exception 'ABBRUCH: Trigger event_registrations_guard fehlt oder ist nicht wie erwartet eingerichtet.';
  end if;
  select string_agg(tgname, ', ') into extra
  from pg_trigger
  where tgrelid = 'public.event_registrations'::regclass and not tgisinternal
    and tgname <> 'event_registrations_guard';
  if extra is not null then
    raise exception 'ABBRUCH: weitere Trigger auf event_registrations gefunden: % – bitte prüfen.', extra;
  end if;
  fn_oid := 'public.event_registration_guard()'::regprocedure;
  if not exists (select 1 from pg_proc where oid = fn_oid and prosecdef
                 and provolatile = 'v'
                 and proconfig = array['search_path=""']
                 and pg_get_userbyid(proowner) = owner_name
                 and prosrc like '%for no key update%') then
    raise exception 'ABBRUCH: event_registration_guard() ist nicht wie erwartet konfiguriert.';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
             where p.oid = fn_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
     or has_function_privilege('anon', fn_oid, 'EXECUTE')
     or has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
    raise exception 'ABBRUCH: event_registration_guard() ist über die API aufrufbar.';
  end if;

  -- 9i) Migration 005 exakt wie definiert – NUR PRÜFUNG, es wird nichts an admins
  --     oder is_admin() erstellt, ersetzt, geändert oder berechtigt.
  <<check_admin_setup>>
  declare
    admins_oid    oid := to_regclass('public.admins');
    is_admin_oid  oid := to_regprocedure('public.is_admin()');
    admins_owner  name;
    col_user_id   smallint;
    users_id_col  smallint;
    -- Körper von is_admin() aus 005 (nur Leerraum wird vereinheitlicht, Groß-/Kleinschreibung bleibt)
    is_admin_body constant text :=
      'select exists ( select 1 from public.admins a where a.user_id = (select auth.uid()) );';
  begin
    -- Tabelle
    if admins_oid is null then
      raise exception 'ABBRUCH: Tabelle public.admins (Migration 005) fehlt.';
    end if;

    -- Spalten: genau user_id, created_at, note mit Typ und Pflichtfeld wie in 005
    select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' ||
                      case when a.attnotnull then 'not null' else 'null' end, ', ' order by a.attnum)
      into actual
    from pg_attribute a
    where a.attrelid = admins_oid and a.attnum > 0 and not a.attisdropped;
    if actual is distinct from 'user_id:uuid:not null, created_at:timestamp with time zone:not null, note:text:null' then
      raise exception 'ABBRUCH: Spalten von public.admins weichen von 005 ab: %', actual;
    end if;

    -- Standardwerte: ausschließlich created_at = now()
    select string_agg(a.attname || '=' || pg_get_expr(d.adbin, d.adrelid), ', ' order by a.attname)
      into actual
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = admins_oid;
    if actual is distinct from 'created_at=now()' then
      raise exception 'ABBRUCH: Standardwerte von public.admins weichen von 005 ab: %', actual;
    end if;

    -- Constraints: genau eine Prüfregel, ein Fremdschlüssel, ein Primärschlüssel
    select string_agg(contype::text, '' order by contype::text) into actual
    from pg_constraint where conrelid = admins_oid;
    if actual is distinct from 'cfp' then
      raise exception 'ABBRUCH: Constraints von public.admins weichen von 005 ab (gefunden: %, erwartet: c, f, p).', actual;
    end if;

    select attnum into col_user_id from pg_attribute where attrelid = admins_oid and attname = 'user_id';
    select attnum into users_id_col from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'id';

    if not exists (select 1 from pg_constraint
                   where conrelid = admins_oid and contype = 'p' and conkey = array[col_user_id]) then
      raise exception 'ABBRUCH: Primärschlüssel von public.admins liegt nicht genau auf user_id.';
    end if;
    if not exists (select 1 from pg_constraint
                   where conrelid = admins_oid and contype = 'f'
                     and conkey = array[col_user_id]
                     and confrelid = 'auth.users'::regclass
                     and confkey = array[users_id_col]
                     and confdeltype = 'c') then
      raise exception 'ABBRUCH: Fremdschlüssel public.admins.user_id -> auth.users(id) ON DELETE CASCADE fehlt oder weicht ab.';
    end if;

    -- Prüfregel für note: zeichengenau wie in 005 (Referenz nur in dieser Transaktion)
    create temp table _006_ref_admins (
      note text,
      constraint c_note check (note is null or char_length(note) <= 200)
    ) on commit drop;
    select pg_get_constraintdef(oid) into expected
    from pg_constraint where conrelid = 'pg_temp._006_ref_admins'::regclass and conname = 'c_note';
    select pg_get_constraintdef(oid) into actual
    from pg_constraint where conrelid = admins_oid and contype = 'c';
    if actual is distinct from expected then
      raise exception 'ABBRUCH: Prüfregel für public.admins.note weicht von 005 ab. Live: % | Erwartet: %', actual, expected;
    end if;

    -- Keine eigenen Trigger
    select string_agg(tgname, ', ') into extra
    from pg_trigger where tgrelid = admins_oid and not tgisinternal;
    if extra is not null then
      raise exception 'ABBRUCH: unerwartete Trigger auf public.admins: %', extra;
    end if;

    -- RLS an, nicht erzwungen, KEINE Policy (weder erlaubend noch einschränkend)
    if not (select relrowsecurity from pg_class where oid = admins_oid) then
      raise exception 'ABBRUCH: Row Level Security ist auf public.admins nicht aktiv.';
    end if;
    if (select relforcerowsecurity from pg_class where oid = admins_oid) then
      raise exception 'ABBRUCH: FORCE ROW LEVEL SECURITY ist auf public.admins aktiv (is_admin() sähe nichts).';
    end if;
    select string_agg(policyname, ', ') into extra
    from pg_policies where schemaname = 'public' and tablename = 'admins';
    if extra is not null then
      raise exception 'ABBRUCH: Policies auf public.admins gefunden: %', extra;
    end if;

    -- Tabellenrechte: PUBLIC (grantee 0 in der Rechteliste), anon und authenticated haben KEINE
    if exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
               where c.oid = admins_oid and acl.grantee = 0) then
      raise exception 'ABBRUCH: PUBLIC hat Rechte auf public.admins.';
    end if;
    foreach tbl in array array['anon', 'authenticated'] loop
      foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(tbl, admins_oid, priv) then
          raise exception 'ABBRUCH: Rolle % hat %-Recht auf public.admins.', tbl, priv;
        end if;
      end loop;
    end loop;

    -- Eigentümer: derselbe wie bei den übrigen Tabellen
    admins_owner := (select pg_get_userbyid(relowner) from pg_class where oid = admins_oid);
    if admins_owner is distinct from owner_name then
      raise exception 'ABBRUCH: public.admins gehört %, erwartet %.', admins_owner, owner_name;
    end if;

    -- Funktion is_admin(): exakte Signatur, Einstellungen, Eigentümer, Körper aus 005
    if is_admin_oid is null then
      raise exception 'ABBRUCH: Funktion public.is_admin() (Migration 005) fehlt.';
    end if;
    if not exists (
      select 1 from pg_proc
      where oid = is_admin_oid
        and prosecdef                                             -- SECURITY DEFINER
        and provolatile = 's'                                     -- STABLE
        and prolang = (select oid from pg_language where lanname = 'sql')
        and prorettype = 'boolean'::regtype
        and pronargs = 0
        and proconfig = array['search_path=""']                   -- exakt search_path = ''
    ) then
      raise exception 'ABBRUCH: public.is_admin() ist nicht wie in 005 konfiguriert (SECURITY DEFINER, STABLE, SQL, boolean, search_path '''').';
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = is_admin_oid) is distinct from admins_owner then
      raise exception 'ABBRUCH: Eigentümer von public.is_admin() ist nicht der Eigentümer von public.admins (%).', admins_owner;
    end if;
    select btrim(regexp_replace(prosrc, '\s+', ' ', 'g')) into actual from pg_proc where oid = is_admin_oid;
    if actual is distinct from is_admin_body then
      raise exception 'ABBRUCH: Körper von public.is_admin() weicht von 005 ab. Live: % | Erwartet: %', actual, is_admin_body;
    end if;

    -- Ausführungsrechte: PUBLIC und anon nein, authenticated ja
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where p.oid = is_admin_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then
      raise exception 'ABBRUCH: PUBLIC darf public.is_admin() ausführen.';
    end if;
    if has_function_privilege('anon', is_admin_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: anon darf public.is_admin() ausführen.';
    end if;
    if not has_function_privilege('authenticated', is_admin_oid, 'EXECUTE') then
      raise exception 'ABBRUCH: authenticated darf public.is_admin() nicht ausführen.';
    end if;
  end;

  -- 9j) Die Migration selbst lief unter READ COMMITTED (Hinweis für die Umgebung)
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'ABBRUCH: Diese Umgebung nutzt nicht READ COMMITTED (%) – Anmeldungen würden mit DC009 scheitern.',
      current_setting('transaction_isolation');
  end if;
end $$;

commit;
