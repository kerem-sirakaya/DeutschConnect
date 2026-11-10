-- =============================================================================
-- RÜCKBAU von Migration 014 (Chatroom) – LÖSCHT ALLE CHAT-DATEN ENDGÜLTIG
-- =============================================================================
-- Nur ausführen, wenn der Chat komplett entfernt werden soll (z. B. schwerer Fehler auf Staging).
-- Für ein schnelles ABSCHALTEN genügt stattdessen:
--     update public.chat_config set enabled = false where id = 1;
-- (Daten bleiben erhalten, Schüler:innen können den Chat sofort nicht mehr benutzen.)
--
-- Wo? SQL Editor des betroffenen Projekts (zuerst Staging). Vorher ggf. Meldungen/Audit-Protokoll
-- sichern (Export), falls sie als Nachweis gebraucht werden – sie werden mitgelöscht.
-- Läuft als EINE Transaktion. Bestehende Tabellen anderer Migrationen werden NICHT verändert.
-- =============================================================================

begin;

-- 1) Realtime-Veröffentlichung aufheben (nur falls vorhanden)
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['chat_messages', 'chat_reactions', 'chat_requests', 'chat_conversations', 'chat_room_members'] loop
      if exists (select 1 from pg_publication_tables p
                  where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- 2) Tabellen (Policies, Indizes und Fremdschlüssel verschwinden mit)
drop table if exists public.chat_reports cascade;
drop table if exists public.chat_reactions cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_requests cascade;
drop table if exists public.chat_conversations cascade;
drop table if exists public.chat_bans cascade;
drop table if exists public.chat_room_members cascade;
drop table if exists public.chat_rooms cascade;
drop table if exists public.chat_blocks cascade;
drop table if exists public.chat_moderators cascade;
drop table if exists public.chat_audit_log cascade;
drop table if exists public.chat_terms cascade;
drop table if exists public.chat_config cascade;

-- 3) Alle Funktionen mit dem Präfix chat_ (nur die aus 014)
do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'chat\_%' loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end;
$$;

-- 4) Kontrolle
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname like 'chat\_%' and c.relkind = 'r')
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname like 'chat\_%') then
    raise exception 'ABBRUCH: Rückbau unvollständig';
  end if;
end;
$$;

commit;
