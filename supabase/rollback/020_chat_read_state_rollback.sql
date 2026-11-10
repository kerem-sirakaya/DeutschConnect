-- =============================================================================
-- Rückbau von 020_chat_read_state.sql (v3)
-- =============================================================================
-- Entfernt NUR den Lesestand: 4 Trigger, 10 Funktionen, 4 Tabellen (inkl. Fehlerprotokoll).
-- Nachrichten, Räume, Gespräche, Mitgliedschaften, Event-Anmeldungen und Projekt-Teams (014/001/013)
-- bleiben unverändert. Danach gibt es keine „ungelesen“-Markierung mehr. Mehrfach ausführbar.
-- Tipp: vorher ggf. das Fehlerprotokoll sichern:  select * from public.chat_read_failures;
-- =============================================================================
begin;

drop trigger if exists chat_message_cursor_track on public.chat_messages;
drop trigger if exists chat_read_state_room_join on public.chat_room_members;
drop trigger if exists chat_read_state_event_registration on public.event_registrations;
drop trigger if exists chat_read_state_project_member on public.idea_members;

drop function if exists public.chat_inbox_state();
drop function if exists public.chat_mark_read(uuid);
drop function if exists public.chat_load_messages(uuid, uuid, timestamptz, integer);
drop function if exists public.chat_read_on_project_member();
drop function if exists public.chat_read_on_event_registration();
drop function if exists public.chat_read_on_room_join();
drop function if exists public.chat_track_message();
drop function if exists public.chat_read_log_failure(text, uuid, uuid, text, text);
drop function if exists public.chat_read_store(uuid, uuid, uuid, pg_snapshot);
drop function if exists public.chat_snapshot_covers(pg_snapshot, pg_snapshot);

drop table if exists public.chat_read_tokens;
drop table if exists public.chat_read_state;
drop table if exists public.chat_message_cursor;
drop table if exists public.chat_read_failures;

-- Kontrolle: alles weg, Tabellen aus 014/001/013 unverändert vorhanden
do $$
declare
  t text;
begin
  foreach t in array array['public.chat_read_tokens', 'public.chat_read_state', 'public.chat_message_cursor',
                           'public.chat_read_failures'] loop
    if to_regclass(t) is not null then
      raise exception 'Rückbau 020 unvollständig: % existiert noch', t;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('chat_inbox_state', 'chat_mark_read', 'chat_load_messages',
                    'chat_read_on_project_member', 'chat_read_on_event_registration', 'chat_read_on_room_join',
                    'chat_track_message', 'chat_read_log_failure', 'chat_read_store', 'chat_snapshot_covers'))
     or exists (select 1 from pg_trigger where tgname in ('chat_message_cursor_track', 'chat_read_state_room_join',
                'chat_read_state_event_registration', 'chat_read_state_project_member')) then
    raise exception 'Rückbau 020 unvollständig: Funktionen oder Trigger übrig';
  end if;
  foreach t in array array['public.chat_messages', 'public.chat_room_members', 'public.chat_rooms',
                           'public.chat_conversations', 'public.event_registrations', 'public.idea_members'] loop
    if to_regclass(t) is null then
      raise exception 'Rückbau 020: % fehlt – bitte prüfen', t;
    end if;
  end loop;
end;
$$;

commit;
