-- =============================================================================
-- 006 – NUR LESENDE Prüfungen für die LIVE-Datenbank
-- =============================================================================
-- Jede Abfrage hier ist ein reines SELECT auf Systemkataloge oder Einstellungen.
-- Es wird NICHTS geschrieben, gesperrt oder geändert. Gefahrlos im SQL Editor ausführbar,
-- vor UND nach Migration 006. Abfragen einzeln ausführen und mit "Erwartet" vergleichen.
-- =============================================================================

-- R1) Isolationsstufe (Erwartet: read committed)
show default_transaction_isolation;
select current_setting('transaction_isolation') as aktuelle_stufe;

-- R2) Eigentümer, RLS und FORCE der beteiligten Tabellen
--     Erwartet: owner = postgres, rls = true, force = false
select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity as rls, c.relforcerowsecurity as force
from pg_class c
where c.oid in ('public.events'::regclass, 'public.event_registrations'::regclass, 'public.ideas'::regclass,
                'public.idea_supports'::regclass, 'public.schools'::regclass, 'public.admins'::regclass)
order by 1;
select rolname, rolbypassrls from pg_roles where rolname = 'postgres';

-- R3) ALLE Policies der vier Tabellen (auch RESTRICTIVE)
--     Erwartet nach 006: genau 11 Zeilen, alle PERMISSIVE, Rolle {authenticated}
select tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('events', 'event_registrations', 'ideas', 'idea_supports')
order by tablename, cmd, policyname;

-- R4) Spalten (Typ, Pflichtfeld, Standardwert) der beteiligten Tabellen
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('events', 'event_registrations', 'ideas', 'idea_supports')
order by table_name, ordinal_position;

-- R5) Alle Constraints (CHECK, PK, FK, UNIQUE) der beteiligten Tabellen
--     Erwartet u. a.: event_registrations PRIMARY KEY (event_id, user_id),
--     CHECK status in ('registered','interested'), FK event_id -> events ON DELETE CASCADE
select conrelid::regclass as tabelle, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.events'::regclass, 'public.event_registrations'::regclass,
                   'public.ideas'::regclass, 'public.idea_supports'::regclass)
order by 1, contype, conname;

-- R6) Eigene Trigger auf den beteiligten Tabellen
--     Erwartet vor 006: keine; nach 006: nur event_registrations_guard
select tgrelid::regclass as tabelle, tgname, tgenabled, tgfoid::regprocedure as funktion
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.events'::regclass, 'public.event_registrations'::regclass,
                  'public.ideas'::regclass, 'public.idea_supports'::regclass);

-- R7) Funktionen: Eigentümer, SECURITY DEFINER, Einstellungen, Rechte
--     Erwartet nach 006: admin_* -> prosecdef = true, proconfig = {search_path=""},
--     proacl ohne "=X/" (PUBLIC) und ohne "anon=X"; interne Funktionen ohne authenticated=X
select p.oid::regprocedure as funktion, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile,
       p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'admin\_%' or p.proname in ('is_admin', 'get_idea_support_counts', 'event_registration_guard'))
order by 1;

-- R8) Tabellenrechte von anon und authenticated (je Recht einzeln)
--     Erwartet: anon nirgends; authenticated auf events nur SELECT, auf ideas kein UPDATE
select t.tabelle, r.rolle, p.recht, has_table_privilege(r.rolle, t.tabelle, p.recht) as hat_recht
from (values ('public.events'), ('public.event_registrations'), ('public.ideas'), ('public.idea_supports')) t(tabelle)
cross join (values ('anon'), ('authenticated')) r(rolle)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(recht)
order by 1, 2, 3;

-- R9) Spaltenrecht aus 002 (Erwartet: nur status = true)
select col, has_column_privilege('authenticated', 'public.event_registrations', col, 'UPDATE') as update_erlaubt
from unnest(array['event_id', 'user_id', 'status', 'created_at']) col;

-- R10) Datenstand (nur Anzahlen, keine personenbezogenen Daten)
select status, count(*) from public.events group by status order by 1;
select status, count(*) from public.ideas group by status order by 1;
select status, count(*) from public.event_registrations group by status order by 1;
-- Überbuchte Events? (Erwartet: keine Zeilen)
select e.id, e.capacity, count(*) filter (where r.status = 'registered') as verbindlich
from public.events e join public.event_registrations r on r.event_id = e.id
where e.capacity is not null
group by e.id, e.capacity
having count(*) filter (where r.status = 'registered') > e.capacity;
