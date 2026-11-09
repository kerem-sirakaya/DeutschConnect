-- =============================================================================
-- 004 – Ideen: Moderation + keine Unterstützung der eigenen Idee   (Version v3)
-- =============================================================================
-- Ausführen NACH 001–003 (Supabase Dashboard -> SQL Editor -> Run).
-- Läuft als EINE Transaktion: Entweder klappt alles oder es ändert sich nichts.
-- Kann gefahrlos mehrfach ausgeführt werden (auch nach 006 – das Ergebnis ist identisch).
--
-- VERSIONSGESCHICHTE (wichtig):
--   v1 (frühere Repo-Datei): Ausschlussliste "status <> 'submitted'". Seit 006 den Status
--      'rejected' einführt, würde v1 ABGELEHNTE Ideen für alle sichtbar machen – deshalb ersetzt.
--   v3 (diese Datei, live seit vor 006): ERLAUBNISLISTE collecting / review / planned.
--      Neue Status sind dadurch automatisch privat. Migration 006 prüft in ihrer
--      Selbstprüfung ZEICHENGENAU gegen v3 – mit v1 würde 006 abbrechen.
--   Die Ausdrücke unten sind identisch zu expected_policies / counts_body in
--   006_admin_events_ideas.sql (Teil 9). Repo-Datei auf v3 gebracht am 2026-11-09.
--
-- Was ändert sich?
--   1) Lesen von Ideen: Andere sehen eine Idee nur mit Status collecting, review oder
--      planned (= vom Admin freigegeben). Die EIGENEN Ideen sieht man immer.
--   2) Unterstützen: nur als man selbst, nur FREMDE und freigegebene Ideen.
--   3) Zählfunktion: zählt nur Unterstützungen von Ideen, die die Person sehen darf.
--      So verrät sie keine IDs von nicht freigegebenen Ideen.
--
-- Was ändert sich NICHT?
--   * Ideen anlegen/löschen, Unterstützung lesen/löschen: unverändert (001).
--   * Tabellen, Spalten, Profile, Events, Schulen: unverändert.
--   * Besucher ohne Login ("anon"): weiterhin kein Zugriff auf Ideen.
-- =============================================================================

begin;

-- 1) Ideen lesen: freigegeben (Erlaubnisliste) ODER eigene
drop policy if exists "ideas: lesen für Angemeldete" on public.ideas;
drop policy if exists "ideas: lesen (freigegeben oder eigene)" on public.ideas;
create policy "ideas: lesen (freigegeben oder eigene)"
  on public.ideas for select to authenticated
  using (status in ('collecting', 'review', 'planned') or author_id = (select auth.uid()));

-- 2) Unterstützen: nur als man selbst, nur freigegebene FREMDE Ideen
drop policy if exists "supports: eigene anlegen" on public.idea_supports;
create policy "supports: eigene anlegen"
  on public.idea_supports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ideas i
      where i.id = idea_id
        and i.author_id <> (select auth.uid())
        and i.status in ('collecting', 'review', 'planned')
    )
  );

-- 3) Zählfunktion: gleiche Sichtbarkeit wie Punkt 1
create or replace function public.get_idea_support_counts()
returns table (idea_id uuid, supporters bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.idea_id, count(*)
  from public.idea_supports s
  join public.ideas i on i.id = s.idea_id
  where i.status in ('collecting', 'review', 'planned') or i.author_id = (select auth.uid())
  group by s.idea_id;
$$;

-- Rechte der Funktion wie in 001 (bleiben bei "create or replace" erhalten – hier zur Sicherheit erneut)
revoke execute on function public.get_idea_support_counts() from public, anon;
grant  execute on function public.get_idea_support_counts() to authenticated;

-- 4) Selbstprüfung – bei Abweichung wird ALLES zurückgerollt
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'ideas'
                    and policyname = 'ideas: lesen (freigegeben oder eigene)'
                    and qual like '%collecting%review%planned%'
                    and qual not like '%<>%') then
    raise exception 'ABBRUCH: Lese-Policy auf ideas ist nicht v3 (Erlaubnisliste).';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'ideas' and cmd in ('SELECT', 'ALL')
                and policyname <> 'ideas: lesen (freigegeben oder eigene)') then
    raise exception 'ABBRUCH: zusätzliche Lese-Policy auf ideas gefunden.';
  end if;
  if has_function_privilege('anon', 'public.get_idea_support_counts()', 'execute') then
    raise exception 'ABBRUCH: anon darf get_idea_support_counts ausführen.';
  end if;
end;
$$;

commit;
