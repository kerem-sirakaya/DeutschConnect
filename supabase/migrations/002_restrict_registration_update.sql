-- =============================================================================
-- 002 – Sicherheitskorrektur für Event-Anmeldungen
-- =============================================================================
-- Ausführen NACH 001_initial_schema.sql (Supabase Dashboard -> SQL Editor -> Run).
-- Kann gefahrlos auch mehrfach ausgeführt werden.
--
-- Problem in 001: Angemeldete Nutzer durften JEDE Spalte ihrer Anmeldung ändern,
-- also auch "event_id". So hätte man eine Anmeldung auf ein vergangenes oder
-- abgesagtes Event "umbiegen" können – an der Regel "nur bevorstehende Events"
-- (Insert-Policy) vorbei.
--
-- Lösung: Beim Ändern darf nur noch "status" ('registered' <-> 'interested')
-- geändert werden. Wer das Event wechseln will, löscht die Anmeldung und legt
-- eine neue an – dann greift wieder die Insert-Policy.
-- =============================================================================

revoke update on public.event_registrations from authenticated;
grant  update (status) on public.event_registrations to authenticated;
