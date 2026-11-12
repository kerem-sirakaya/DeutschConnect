-- =============================================================================
-- 003 – Öffentliche Schulinfos für das Registrierungsformular
-- =============================================================================
-- Ausführen NACH 001 und 002 (Supabase Dashboard -> SQL Editor -> Run).
-- Kann gefahrlos mehrfach ausgeführt werden.
--
-- Warum? Vor der Registrierung ist man nicht angemeldet (Rolle "anon").
-- Bisher durfte "anon" die Tabelle "schools" gar nicht lesen, deshalb konnte
-- das Formular die Schulen nicht aus der Datenbank laden.
--
-- Was ändert sich?
--   * "anon" darf NUR die Spalten id, name, short_name, city LESEN.
--   * "anon" darf weiterhin NICHTS anlegen, ändern oder löschen.
--   * partnership_status und created_at bleiben für "anon" gesperrt.
--   * Später ergänzte Spalten sind für "anon" NICHT automatisch sichtbar.
--   * Angemeldete Nutzer ("authenticated"): keine Änderung.
--   * Alle anderen Tabellen (profiles, ideas, ...): keine Änderung.
-- =============================================================================

-- 1) Rechte von "anon" auf "schools" zuerst komplett entfernen (sauberer Ausgangspunkt) ...
revoke all on public.schools from anon;

-- 2) ... dann ausschließlich Lesen dieser vier Spalten erlauben.
grant select (id, name, short_name, city) on public.schools to anon;

-- 3) RLS-Regel: "anon" darf alle Schul-ZEILEN sehen (nur Lesen).
drop policy if exists "schools: öffentliche Infos für Besucher" on public.schools;
create policy "schools: öffentliche Infos für Besucher"
  on public.schools for select to anon using (true);
