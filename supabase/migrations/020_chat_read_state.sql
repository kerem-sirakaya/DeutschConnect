-- =============================================================================
-- 020_chat_read_state.sql – Lesestand im Chat: „ungelesen“-Markierung + Vorschau der letzten Nachricht
-- =============================================================================
-- ENTWURF v3 – noch auf KEINER Umgebung ausgeführt. Nur nach Freigabe, zuerst auf Staging.
--
-- Rein additiv: 014 wird NICHT verändert. Bestehende Tabellen, Funktionen, Policies, Mitgliedschaften,
-- Eventgruppen und private Gespräche bleiben unverändert. Neu sind:
--   Tabellen  chat_message_cursor  – pro NEUER Nachricht die speichernde Transaktion (xid8)
--             chat_read_state      – pro Person und Raum/Gespräch: Lese-Snapshot + last_read_at
--             chat_read_tokens     – vom Server erzeugte Lese-Token (Person + Ziel + Snapshot, 1×, 10 min)
--             chat_read_failures   – Protokoll fehlgeschlagener Startpunkte (nichts wird still verschluckt)
--   App       chat_load_messages(…) – Nachrichten laden UND Lese-Token erzeugen – in EINER Abfrage
--             chat_mark_read(token) – Token einlösen: gelesen = alles, was beim Laden sichtbar war
--             chat_inbox_state()    – pro eigenem Raum/Gespräch: letzte Nachricht, Absender, ungelesen
--   Trigger   Nachricht → Cursor (strikt); Beitritt/Anmeldung/Projekt-Team → Startpunkt (protokolliert)
--
-- KERNIDEE: „Gelesen“ hängt nicht an Zeitstempeln, sondern an Transaktionen. Eine Nachricht ist gelesen,
-- wenn ihre Transaktion im gespeicherten Snapshot schon abgeschlossen war (pg_visible_in_snapshot).
-- Der Snapshot entsteht in DERSELBEN Abfrage, die die angezeigten Nachrichten liest
-- (chat_room_messages/chat_conversation_messages aus 014 sind STABLE und sehen genau diesen Snapshot):
-- angezeigt ⇔ im Token-Snapshot sichtbar. Der Snapshot verlässt die Datenbank nie.
--
-- HISTORIE: Nachrichten von VOR 020 haben keinen Cursor und gelten nie als ungelesen.
-- Wer NACH 020 Mitglied wird, bekommt beim Beitritt einen Startpunkt.
--
-- Voraussetzung: 014 (Chat), 001, 013, PostgreSQL ≥ 13. 018 optional.
-- Eine Transaktion; jeder Fehler → nichts wird übernommen. Mehrfach ausführbar.
-- Rückbau: supabase/rollback/020_chat_read_state_rollback.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Voraussetzungen – ALLES, worauf 020 sich stützt. Bricht ab, BEVOR etwas angelegt wird.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  actual text;
begin
  if current_setting('server_version_num')::integer < 130000 then
    raise exception 'ABBRUCH 020: PostgreSQL 13 oder neuer nötig (pg_snapshot/xid8)';
  end if;

  -- Spalten mit Typ (und NOT NULL, wo 020 sich darauf verlässt)
  for r in select * from (values
      ('chat_rooms', 'id', 'uuid', true), ('chat_rooms', 'kind', 'text', true),
      ('chat_rooms', 'event_id', 'uuid', false), ('chat_rooms', 'idea_id', 'uuid', false),
      ('chat_room_members', 'room_id', 'uuid', true), ('chat_room_members', 'user_id', 'uuid', true),
      ('chat_messages', 'id', 'uuid', true), ('chat_messages', 'room_id', 'uuid', false),
      ('chat_messages', 'conversation_id', 'uuid', false), ('chat_messages', 'sender_id', 'uuid', true),
      ('chat_messages', 'body', 'text', true), ('chat_messages', 'created_at', 'timestamp with time zone', true),
      ('chat_messages', 'deleted_at', 'timestamp with time zone', false),
      ('chat_conversations', 'id', 'uuid', true), ('chat_conversations', 'user_a', 'uuid', true),
      ('chat_conversations', 'user_b', 'uuid', true),
      ('event_registrations', 'event_id', 'uuid', true), ('event_registrations', 'user_id', 'uuid', true),
      ('event_registrations', 'status', 'text', true),
      ('idea_members', 'idea_id', 'uuid', true), ('idea_members', 'user_id', 'uuid', true),
      ('idea_members', 'status', 'text', true),
      ('profiles', 'id', 'uuid', true), ('profiles', 'first_name', 'text', false))
      v(tbl, col, typ, required) loop
    if to_regclass('public.' || r.tbl) is null then
      raise exception 'ABBRUCH 020: Tabelle public.% fehlt', r.tbl;
    end if;
    select format_type(a.atttypid, a.atttypmod) into actual
      from pg_attribute a
     where a.attrelid = ('public.' || r.tbl)::regclass and a.attname = r.col and a.attnum > 0 and not a.attisdropped;
    if actual is null then
      raise exception 'ABBRUCH 020: Spalte public.%.% fehlt', r.tbl, r.col;
    end if;
    if actual <> r.typ then
      raise exception 'ABBRUCH 020: public.%.% hat Typ %, erwartet %', r.tbl, r.col, actual, r.typ;
    end if;
    if r.required and not (select a.attnotnull from pg_attribute a
                             where a.attrelid = ('public.' || r.tbl)::regclass and a.attname = r.col) then
      raise exception 'ABBRUCH 020: public.%.% muss NOT NULL sein', r.tbl, r.col;
    end if;
  end loop;

  -- Primärschlüssel auf den Spalten, auf die 020 verweist (Fremdschlüssel brauchen sie)
  for r in select * from (values ('chat_rooms'), ('chat_messages'), ('chat_conversations'), ('profiles')) v(tbl) loop
    if not exists (select 1 from pg_index i
                    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                   where i.indrelid = ('public.' || r.tbl)::regclass and i.indisprimary
                     and i.indnatts = 1 and a.attname = 'id') then
      raise exception 'ABBRUCH 020: public.% hat keinen Primärschlüssel auf id', r.tbl;
    end if;
  end loop;

  -- Werte, auf die die Trigger reagieren, müssen laut Prüfregeln erlaubt sein
  for r in select * from (values
      ('chat_rooms', '''topic'''), ('chat_rooms', '''project'''), ('chat_rooms', '''event'''),
      ('event_registrations', '''registered'''), ('idea_members', '''member''')) v(tbl, val) loop
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = ('public.' || r.tbl)::regclass and c.contype = 'c'
                      and pg_get_constraintdef(c.oid) like '%' || r.val || '%') then
      raise exception 'ABBRUCH 020: Prüfregel auf public.% erlaubt % nicht (andere Fassung?)', r.tbl, r.val;
    end if;
  end loop;

  -- Funktionen aus 014 mit Rückgabetyp
  for r in select * from (values
      ('public.chat_require_user()', 'uuid'), ('public.chat_require_enabled(uuid)', 'void'),
      ('public.chat_is_room_member(uuid,uuid)', 'boolean'), ('public.chat_can_read_room(uuid,uuid)', 'boolean'),
      ('public.chat_can_read_conversation(uuid,uuid)', 'boolean'), ('public.chat_is_blocked(uuid,uuid)', 'boolean'))
      v(fn, ret) loop
    if to_regprocedure(r.fn) is null then
      raise exception 'ABBRUCH 020: % fehlt – zuerst 014_chat.sql ausführen', r.fn;
    end if;
    if pg_get_function_result(to_regprocedure(r.fn)) <> r.ret then
      raise exception 'ABBRUCH 020: % liefert %, erwartet %', r.fn, pg_get_function_result(to_regprocedure(r.fn)), r.ret;
    end if;
  end loop;

  -- Nachrichten-Lader aus 014: müssen existieren, id + created_at liefern und STABLE sein
  -- (nur dann sehen sie denselben Snapshot wie das Lese-Token in chat_load_messages)
  for r in select * from (values ('public.chat_room_messages(uuid,timestamptz,integer)'),
                                 ('public.chat_conversation_messages(uuid,timestamptz,integer)')) v(fn) loop
    if to_regprocedure(r.fn) is null then
      raise exception 'ABBRUCH 020: % fehlt – zuerst 014_chat.sql ausführen', r.fn;
    end if;
    if (select p.provolatile from pg_proc p where p.oid = to_regprocedure(r.fn)) <> 's' then
      raise exception 'ABBRUCH 020: % ist nicht STABLE – Lese-Token wäre nicht konsistent', r.fn;
    end if;
    actual := pg_get_function_result(to_regprocedure(r.fn));
    if actual not like 'TABLE(id uuid,%' or actual not like '%created_at timestamp with time zone%' then
      raise exception 'ABBRUCH 020: % liefert unerwartet: %', r.fn, actual;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabellen (RLS an, KEINE Policies, keine direkten Rechte – nur über die Funktionen unten)
-- -----------------------------------------------------------------------------
-- Cursor pro Nachricht: welche Transaktion hat sie gespeichert? Wird nie geändert.
-- read_by: Person, die die Nachricht beim Speichern schon gesehen hat, obwohl sie von jemand anderem
-- stammt (Anfragetext, den chat_respond_request beim Annehmen als erste Nachricht anlegt).
create table if not exists public.chat_message_cursor (
  message_id      uuid primary key references public.chat_messages (id) on delete cascade,
  room_id         uuid,
  conversation_id uuid,
  xid             xid8 not null default pg_current_xact_id(),
  read_by         uuid
);
create index if not exists chat_message_cursor_room_idx
  on public.chat_message_cursor (room_id, xid) where room_id is not null;
create index if not exists chat_message_cursor_conversation_idx
  on public.chat_message_cursor (conversation_id, xid) where conversation_id is not null;

-- Lesestand. Wird beim Verlassen NICHT gelöscht. Raum/Gespräch/Profil gelöscht → weg (cascade).
create table if not exists public.chat_read_state (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  room_id         uuid references public.chat_rooms (id) on delete cascade,
  conversation_id uuid references public.chat_conversations (id) on delete cascade,
  read_snapshot   pg_snapshot not null,
  last_read_at    timestamptz not null default now(),
  constraint chat_read_state_one_target check ((room_id is null) <> (conversation_id is null))
);
create unique index if not exists chat_read_state_room_uq
  on public.chat_read_state (user_id, room_id) where room_id is not null;
create unique index if not exists chat_read_state_conversation_uq
  on public.chat_read_state (user_id, conversation_id) where conversation_id is not null;

-- Lese-Token: nur der Server kennt den Snapshot; der Client bekommt eine zufällige ID (122 Bit).
-- Gebunden an Person + genau ein Ziel, einmal einlösbar, 10 Minuten gültig.
create table if not exists public.chat_read_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  room_id         uuid references public.chat_rooms (id) on delete cascade,
  conversation_id uuid references public.chat_conversations (id) on delete cascade,
  read_snapshot   pg_snapshot not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '10 minutes',
  used_at         timestamptz,
  constraint chat_read_tokens_one_target check ((room_id is null) <> (conversation_id is null))
);
create index if not exists chat_read_tokens_user_idx on public.chat_read_tokens (user_id, created_at);

-- Protokoll: Startpunkt konnte nicht gesetzt werden. Für Admins im SQL-Editor sichtbar
-- (select * from public.chat_read_failures order by id desc;). Wird nie automatisch gelöscht.
create table if not exists public.chat_read_failures (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  source      text not null,
  user_id     uuid,
  room_id     uuid,
  sql_state   text,
  error       text
);

alter table public.chat_message_cursor enable row level security;
alter table public.chat_read_state enable row level security;
alter table public.chat_read_tokens enable row level security;
alter table public.chat_read_failures enable row level security;
revoke all on public.chat_message_cursor, public.chat_read_state, public.chat_read_tokens,
              public.chat_read_failures from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Interne Hilfsfunktionen
-- -----------------------------------------------------------------------------
-- Ist p_new mindestens so aktuell wie p_old? (alles, was in p_old sichtbar ist, ist auch in p_new sichtbar)
-- Snapshots wachsen mit der Zeit nur – ein später geholter Snapshot deckt einen früheren immer ab.
create or replace function public.chat_snapshot_covers(p_new pg_snapshot, p_old pg_snapshot)
returns boolean language sql immutable security definer set search_path = '' as $$
  select pg_snapshot_xmax(p_old) <= pg_snapshot_xmax(p_new)
     and not exists (select 1 from pg_snapshot_xip(p_new) x where pg_visible_in_snapshot(x, p_old));
$$;

-- Lesestand setzen – nur VORWÄRTS: ein älterer Snapshot überschreibt nie einen neueren.
create or replace function public.chat_read_store(p_uid uuid, p_room uuid, p_conversation uuid, p_snap pg_snapshot)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if (p_room is null) = (p_conversation is null) then
    raise exception 'chat_read_store: genau ein Ziel' using errcode = '22023';
  end if;
  if p_room is not null then
    insert into public.chat_read_state as s (user_id, room_id, read_snapshot)
    values (p_uid, p_room, p_snap)
    on conflict (user_id, room_id) where room_id is not null
    do update set read_snapshot = excluded.read_snapshot, last_read_at = now()
     where public.chat_snapshot_covers(excluded.read_snapshot, s.read_snapshot);
  else
    insert into public.chat_read_state as s (user_id, conversation_id, read_snapshot)
    values (p_uid, p_conversation, p_snap)
    on conflict (user_id, conversation_id) where conversation_id is not null
    do update set read_snapshot = excluded.read_snapshot, last_read_at = now()
     where public.chat_snapshot_covers(excluded.read_snapshot, s.read_snapshot);
  end if;
end;
$$;

-- Fehler protokollieren (Tabelle + WARNING im Datenbank-Log). Scheitert selbst das Protokoll,
-- bleibt die WARNING – die eigentliche Aktion (Beitritt/Anmeldung) wird nie dadurch blockiert.
create or replace function public.chat_read_log_failure(p_source text, p_user uuid, p_room uuid,
                                                        p_state text, p_error text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  raise warning 'chat_read_state: Startpunkt fehlgeschlagen (% / Person % / Raum %): % %',
    p_source, p_user, p_room, p_state, p_error;
  begin
    insert into public.chat_read_failures (source, user_id, room_id, sql_state, error)
    values (p_source, p_user, p_room, p_state, left(p_error, 1000));
  exception when others then
    raise warning 'chat_read_failures: Protokoll nicht möglich: % %', sqlstate, sqlerrm;
  end;
end;
$$;

-- Trigger: jede neue Nachricht bekommt ihren Cursor. STRIKT, ohne Fehlerbehandlung:
-- Nachricht und Cursor werden gemeinsam gespeichert oder gar nicht. So kann es keine neue Nachricht
-- geben, die still nie als „ungelesen“ zählt. (Ein Fehler hier bedeutet eine kaputte Datenbank –
-- das Senden scheitert dann sichtbar mit einer Fehlermeldung und kann wiederholt werden.)
create or replace function public.chat_track_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  insert into public.chat_message_cursor (message_id, room_id, conversation_id, read_by)
  values (new.id, new.room_id, new.conversation_id,
          case when actor is not null and actor <> new.sender_id then actor end);
  return null;
end;
$$;

-- Trigger: Beitritt zu einem THEMENRAUM → Startpunkt. Eventgruppen werden übersprungen
-- (018 kopiert beim Lösen die Angemeldeten hierher – das darf keinen Lesestand verändern).
-- Scheitert der Startpunkt, bleibt der Beitritt gültig; der Fehler wird protokolliert.
-- Folge eines Fehlers: ältere Nachrichten erscheinen als ungelesen, bis der Raum geöffnet wird.
create or replace function public.chat_read_on_room_join()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.chat_rooms r where r.id = new.room_id and r.kind = 'topic') then
    begin
      perform public.chat_read_store(new.user_id, new.room_id, null, pg_current_snapshot());
    exception when others then
      perform public.chat_read_log_failure('room_join', new.user_id, new.room_id, sqlstate, sqlerrm);
    end;
  end if;
  return null;
end;
$$;

-- Trigger: verbindliche Event-Anmeldung → Startpunkt in der Eventgruppe (falls es sie schon gibt).
create or replace function public.chat_read_on_event_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  if new.status = 'registered' and (tg_op = 'INSERT' or old.status is distinct from 'registered') then
    for rid in select r.id from public.chat_rooms r where r.event_id = new.event_id loop
      begin
        perform public.chat_read_store(new.user_id, rid, null, pg_current_snapshot());
      exception when others then
        perform public.chat_read_log_failure('event_registration', new.user_id, rid, sqlstate, sqlerrm);
      end;
    end loop;
  end if;
  return null;
end;
$$;

-- Trigger: Aufnahme ins Projekt-Team (013) → Startpunkt in der Projektgruppe.
create or replace function public.chat_read_on_project_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  if new.status = 'member' and (tg_op = 'INSERT' or old.status is distinct from 'member') then
    for rid in select r.id from public.chat_rooms r where r.kind = 'project' and r.idea_id = new.idea_id loop
      begin
        perform public.chat_read_store(new.user_id, rid, null, pg_current_snapshot());
      exception when others then
        perform public.chat_read_log_failure('project_member', new.user_id, rid, sqlstate, sqlerrm);
      end;
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists chat_message_cursor_track on public.chat_messages;
create trigger chat_message_cursor_track
  after insert on public.chat_messages
  for each row execute function public.chat_track_message();

drop trigger if exists chat_read_state_room_join on public.chat_room_members;
create trigger chat_read_state_room_join
  after insert on public.chat_room_members
  for each row execute function public.chat_read_on_room_join();

drop trigger if exists chat_read_state_event_registration on public.event_registrations;
create trigger chat_read_state_event_registration
  after insert or update of status on public.event_registrations
  for each row execute function public.chat_read_on_event_registration();

drop trigger if exists chat_read_state_project_member on public.idea_members;
create trigger chat_read_state_project_member
  after insert or update of status on public.idea_members
  for each row execute function public.chat_read_on_project_member();

-- -----------------------------------------------------------------------------
-- 3) Funktionen für die App
-- -----------------------------------------------------------------------------
-- Nachrichten laden + Lese-Token – in EINER Abfrage, also mit EINEM Snapshot:
-- genau die zurückgegebenen Nachrichten (und alles Ältere) sind im Token „sichtbar“.
-- Rechte prüfen die Lader aus 014 (DC042 ohne Zugriff → es entsteht auch kein Token).
-- Rückgabe: { "read_token": uuid, "messages": [ … Zeilen wie chat_room_messages … ] }
create or replace function public.chat_load_messages(p_room uuid, p_conversation uuid,
                                                     p_before timestamptz default null, p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  result jsonb;
begin
  perform public.chat_require_enabled(uid);
  if (p_room is null) = (p_conversation is null) then
    raise exception 'Genau einen Raum oder ein Gespräch angeben' using errcode = '22023';
  end if;

  -- eigene abgelaufene / eingelöste Token aufräumen
  delete from public.chat_read_tokens t where t.user_id = uid and (t.used_at is not null or t.expires_at <= now());

  if p_room is not null then
    with msgs as (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at, m.id), '[]'::jsonb) as list
        from public.chat_room_messages(p_room, p_before, p_limit) m
    ), tok as (
      insert into public.chat_read_tokens (user_id, room_id, read_snapshot)
      select uid, p_room, pg_current_snapshot() from msgs
      returning id
    )
    select jsonb_build_object('read_token', tok.id, 'messages', msgs.list) into result from msgs, tok;
  else
    with msgs as (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at, m.id), '[]'::jsonb) as list
        from public.chat_conversation_messages(p_conversation, p_before, p_limit) m
    ), tok as (
      insert into public.chat_read_tokens (user_id, conversation_id, read_snapshot)
      select uid, p_conversation, pg_current_snapshot() from msgs
      returning id
    )
    select jsonb_build_object('read_token', tok.id, 'messages', msgs.list) into result from msgs, tok;
  end if;

  -- höchstens 20 offene Token pro Person (älteste fallen weg)
  delete from public.chat_read_tokens t
   where t.id in (select t2.id from public.chat_read_tokens t2 where t2.user_id = uid
                   order by t2.created_at desc, t2.id offset 20);
  return result;
end;
$$;

-- Token einlösen. Nur die eigene Person, nur einmal, nur innerhalb von 10 Minuten, nur solange
-- noch Lesezugriff auf GENAU das Ziel des Tokens besteht. Älteres Token → Lesestand bleibt.
-- Fehler: DC060 unbekannt/fremd · DC061 abgelaufen · DC062 schon eingelöst · DC042 kein Zugriff mehr.
create or replace function public.chat_mark_read(p_token uuid)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.chat_require_user();
  tok public.chat_read_tokens%rowtype;
  result timestamptz;
begin
  perform public.chat_require_enabled(uid);
  select * into tok from public.chat_read_tokens t where t.id = p_token for update;
  if not found or tok.user_id is distinct from uid then
    raise exception 'Ungültiges Lese-Token' using errcode = 'DC060';  -- fremd und unbekannt sehen gleich aus
  end if;
  if tok.used_at is not null then
    raise exception 'Lese-Token wurde schon verwendet' using errcode = 'DC062';
  end if;
  if tok.expires_at <= now() then
    raise exception 'Lese-Token ist abgelaufen' using errcode = 'DC061';
  end if;
  if tok.room_id is not null and not public.chat_can_read_room(tok.room_id, uid) then
    raise exception 'Kein Zugriff auf diesen Raum' using errcode = 'DC042';
  end if;
  if tok.conversation_id is not null and not public.chat_can_read_conversation(tok.conversation_id, uid) then
    raise exception 'Kein Zugriff auf dieses Gespräch' using errcode = 'DC042';
  end if;

  update public.chat_read_tokens t set used_at = now() where t.id = p_token;
  perform public.chat_read_store(uid, tok.room_id, tok.conversation_id, tok.read_snapshot);
  select s.last_read_at into result from public.chat_read_state s
   where s.user_id = uid
     and (s.room_id = tok.room_id or s.conversation_id = tok.conversation_id);
  return result;
end;
$$;

-- Übersicht: pro Raum, in dem man MITGLIED ist, und pro eigenem Gespräch.
--   * letzte sichtbare Nachricht (nicht gelöscht; im Raum nicht von blockierten Personen) mit Absender
--   * has_unread: sichtbare fremde Nachricht MIT Cursor, deren Transaktion im eigenen Lese-Snapshot
--     noch nicht abgeschlossen war (ohne Lesestand: jede fremde Nachricht mit Cursor)
-- Markiert NICHTS als gelesen.
create or replace function public.chat_inbox_state()
returns table (room_id uuid, conversation_id uuid, last_message_at timestamptz, last_body text,
               last_sender_name text, last_is_own boolean, has_unread boolean, last_read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := public.chat_require_user();
begin
  perform public.chat_require_enabled(uid);
  return query
    select r.id, null::uuid, lm.created_at, lm.body, lm.first_name, lm.sender_id = uid,
           exists (select 1 from public.chat_message_cursor x
                     join public.chat_messages m2 on m2.id = x.message_id
                    where x.room_id = r.id
                      and (rs.read_snapshot is null
                           or (x.xid >= pg_snapshot_xmin(rs.read_snapshot)
                               and not pg_visible_in_snapshot(x.xid, rs.read_snapshot)))
                      and x.read_by is distinct from uid
                      and m2.deleted_at is null and m2.sender_id <> uid
                      and not public.chat_is_blocked(uid, m2.sender_id)),
           rs.last_read_at
      from public.chat_rooms r
      left join lateral (select m.created_at, m.body, m.sender_id, p.first_name
                           from public.chat_messages m
                           join public.profiles p on p.id = m.sender_id
                          where m.room_id = r.id and m.deleted_at is null
                            and not public.chat_is_blocked(uid, m.sender_id)
                          order by m.created_at desc, m.id desc limit 1) lm on true
      left join public.chat_read_state rs on rs.user_id = uid and rs.room_id = r.id
     where public.chat_is_room_member(r.id, uid)
    union all
    select null::uuid, c.id, lm.created_at, lm.body, lm.first_name, lm.sender_id = uid,
           exists (select 1 from public.chat_message_cursor x
                     join public.chat_messages m2 on m2.id = x.message_id
                    where x.conversation_id = c.id
                      and (rs.read_snapshot is null
                           or (x.xid >= pg_snapshot_xmin(rs.read_snapshot)
                               and not pg_visible_in_snapshot(x.xid, rs.read_snapshot)))
                      and x.read_by is distinct from uid
                      and m2.deleted_at is null and m2.sender_id <> uid),
           rs.last_read_at
      from public.chat_conversations c
      left join lateral (select m.created_at, m.body, m.sender_id, p.first_name
                           from public.chat_messages m
                           join public.profiles p on p.id = m.sender_id
                          where m.conversation_id = c.id and m.deleted_at is null
                          order by m.created_at desc, m.id desc limit 1) lm on true
      left join public.chat_read_state rs on rs.user_id = uid and rs.conversation_id = c.id
     where uid in (c.user_a, c.user_b) and not public.chat_is_blocked(c.user_a, c.user_b);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Ausführrechte (Supabase vergibt neue Funktionen sonst automatisch auch an anon)
-- -----------------------------------------------------------------------------
revoke all on function public.chat_snapshot_covers(pg_snapshot, pg_snapshot) from public, anon, authenticated;
revoke all on function public.chat_read_store(uuid, uuid, uuid, pg_snapshot) from public, anon, authenticated;
revoke all on function public.chat_read_log_failure(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.chat_track_message() from public, anon, authenticated;
revoke all on function public.chat_read_on_room_join() from public, anon, authenticated;
revoke all on function public.chat_read_on_event_registration() from public, anon, authenticated;
revoke all on function public.chat_read_on_project_member() from public, anon, authenticated;
revoke all on function public.chat_load_messages(uuid, uuid, timestamptz, integer) from public, anon;
revoke all on function public.chat_mark_read(uuid) from public, anon;
revoke all on function public.chat_inbox_state() from public, anon;
grant execute on function public.chat_load_messages(uuid, uuid, timestamptz, integer) to authenticated;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_inbox_state() to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Selbstprüfung – jeder Fehler bricht die ganze Migration ab (nichts wird übernommen)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  f text;
  r record;
  me oid := (select oid from pg_roles where rolname = current_user);
  user_functions constant text[] := array[
    'public.chat_load_messages(uuid,uuid,timestamptz,integer)', 'public.chat_mark_read(uuid)',
    'public.chat_inbox_state()'];
  internal_functions constant text[] := array[
    'public.chat_snapshot_covers(pg_snapshot,pg_snapshot)', 'public.chat_read_store(uuid,uuid,uuid,pg_snapshot)',
    'public.chat_read_log_failure(text,uuid,uuid,text,text)', 'public.chat_track_message()',
    'public.chat_read_on_room_join()', 'public.chat_read_on_event_registration()',
    'public.chat_read_on_project_member()'];
begin
  -- Tabellen: RLS an, keine Policies, keine direkten Rechte, gehören dem ausführenden Konto
  foreach t in array array['public.chat_message_cursor', 'public.chat_read_state', 'public.chat_read_tokens',
                           'public.chat_read_failures'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'Selbstprüfung 020: RLS auf % ist aus', t;
    end if;
    if exists (select 1 from pg_policies p where p.schemaname || '.' || p.tablename = t) then
      raise exception 'Selbstprüfung 020: % darf keine Policies haben', t;
    end if;
    if (select c.relowner from pg_class c where c.oid = t::regclass) <> me then
      raise exception 'Selbstprüfung 020: % gehört nicht %', t, current_user;
    end if;
    if has_table_privilege('anon', t, 'select, insert, update, delete, truncate, references, trigger')
       or has_table_privilege('authenticated', t, 'select, insert, update, delete, truncate, references, trigger') then
      raise exception 'Selbstprüfung 020: direkte Tabellenrechte auf %', t;
    end if;
    if exists (select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = t::regclass and a.grantee = 0) then
      raise exception 'Selbstprüfung 020: % hat Rechte für PUBLIC', t;
    end if;
  end loop;

  -- Funktionen: vorhanden, Eigentümer, SECURITY DEFINER, search_path exakt leer, keine PUBLIC/anon-Rechte
  foreach f in array user_functions || internal_functions loop
    select p.oid, p.proowner, p.prosecdef, p.proconfig, p.proacl into r
      from pg_proc p where p.oid = to_regprocedure(f);
    if r.oid is null then
      raise exception 'Selbstprüfung 020: % fehlt', f;
    end if;
    if r.proowner <> me then
      raise exception 'Selbstprüfung 020: % gehört nicht %', f, current_user;
    end if;
    if not r.prosecdef then
      raise exception 'Selbstprüfung 020: % ist nicht SECURITY DEFINER', f;
    end if;
    if r.proconfig is distinct from array['search_path=""'] then
      raise exception 'Selbstprüfung 020: % hat search_path %, erwartet leer', f, r.proconfig;
    end if;
    if exists (select 1 from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a where a.grantee = 0) then
      raise exception 'Selbstprüfung 020: % ist für PUBLIC ausführbar', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'Selbstprüfung 020: % ist für anon ausführbar', f;
    end if;
  end loop;
  foreach f in array user_functions loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'Selbstprüfung 020: % ist für authenticated NICHT ausführbar', f;
    end if;
  end loop;
  foreach f in array internal_functions loop
    if has_function_privilege('authenticated', f, 'execute') then
      raise exception 'Selbstprüfung 020: interne Funktion % ist für authenticated ausführbar', f;
    end if;
  end loop;

  -- Strikter Cursor-Trigger: KEINE Fehlerbehandlung im Quelltext (Nachricht + Cursor gemeinsam oder gar nicht)
  if (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.chat_track_message()')) ~* 'exception' then
    raise exception 'Selbstprüfung 020: chat_track_message darf Fehler nicht abfangen';
  end if;
  -- Startpunkt-Trigger: Fehler werden protokolliert, nicht verschluckt
  foreach f in array array['public.chat_read_on_room_join()', 'public.chat_read_on_event_registration()',
                           'public.chat_read_on_project_member()'] loop
    if (select p.prosrc from pg_proc p where p.oid = to_regprocedure(f)) !~ 'chat_read_log_failure' then
      raise exception 'Selbstprüfung 020: % protokolliert Fehler nicht', f;
    end if;
  end loop;

  -- Trigger: vorhanden, aktiv, AFTER … FOR EACH ROW, richtige Funktion
  for r in select * from (values
      ('public.chat_messages', 'chat_message_cursor_track', 'public.chat_track_message()'),
      ('public.chat_room_members', 'chat_read_state_room_join', 'public.chat_read_on_room_join()'),
      ('public.event_registrations', 'chat_read_state_event_registration', 'public.chat_read_on_event_registration()'),
      ('public.idea_members', 'chat_read_state_project_member', 'public.chat_read_on_project_member()'))
      v(tbl, trg, fn) loop
    if not exists (select 1 from pg_trigger tg
                    where tg.tgrelid = r.tbl::regclass and tg.tgname = r.trg and not tg.tgisinternal
                      and tg.tgenabled = 'O' and tg.tgfoid = to_regprocedure(r.fn)
                      and (tg.tgtype & 1) = 1      -- FOR EACH ROW
                      and (tg.tgtype & 2) = 0) then -- AFTER
      raise exception 'Selbstprüfung 020: Trigger % auf % fehlt oder ist falsch eingerichtet', r.trg, r.tbl;
    end if;
  end loop;

  -- Laufzeit: Snapshot-Logik
  if pg_visible_in_snapshot(pg_current_xact_id(), pg_current_snapshot()) then
    raise exception 'Selbstprüfung 020: pg_visible_in_snapshot verhält sich unerwartet';
  end if;
  if not public.chat_snapshot_covers('100:120:', '100:120:110')        -- später: 110 fertig
     or public.chat_snapshot_covers('100:120:110', '100:120:')         -- früher: 110 noch offen
     or not public.chat_snapshot_covers('100:130:', '100:120:')
     or public.chat_snapshot_covers('100:120:', '100:130:') then
    raise exception 'Selbstprüfung 020: chat_snapshot_covers liefert falsche Ergebnisse';
  end if;
end;
$$;

commit;
