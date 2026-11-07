-- =============================================================================
-- 004 – Ideen: Moderation + keine Unterstützung der eigenen Idee
-- =============================================================================
-- Ausführen NACH 001–003 (Supabase Dashboard -> SQL Editor -> Run).
-- Läuft als EINE Transaktion: Entweder klappt alles oder es ändert sich nichts.
-- Kann gefahrlos mehrfach ausgeführt werden.
--
-- Was ändert sich?
--   1) Lesen von Ideen: Andere sehen eine Idee erst, wenn ein Admin ihren Status
--      im Dashboard von 'submitted' auf z. B. 'collecting' setzt (= Freigabe).
--      Die EIGENEN Ideen sieht man immer – auch vor der Freigabe.
--   2) Unterstützen: nur Ideen, die man sehen darf UND die nicht von einem selbst sind.
--      (Die Unterabfrage auf "ideas" unterliegt selbst der Lese-Regel aus Punkt 1.)
--   3) Zählfunktion: zählt nur Unterstützungen von Ideen, die die Person sehen darf.
--      So verrät sie keine IDs von noch nicht freigegebenen Ideen.
--
-- Was ändert sich NICHT?
--   * Ideen anlegen/löschen, Unterstützung lesen/löschen: unverändert.
--   * Tabellen, Spalten, Profile, Events, Schulen: unverändert.
--   * Besucher ohne Login ("anon"): weiterhin kein Zugriff auf Ideen.
-- =============================================================================

begin;

-- 1) Ideen lesen: freigegeben ODER eigene
drop policy if exists "ideas: lesen für Angemeldete" on public.ideas;
drop policy if exists "ideas: lesen (freigegeben oder eigene)" on public.ideas;
create policy "ideas: lesen (freigegeben oder eigene)"
  on public.ideas for select to authenticated
  using (status <> 'submitted' or author_id = (select auth.uid()));

-- 2) Unterstützen: nur als man selbst, nur sichtbare FREMDE Ideen
drop policy if exists "supports: eigene anlegen" on public.idea_supports;
create policy "supports: eigene anlegen"
  on public.idea_supports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ideas i
      where i.id = idea_id
        and i.author_id <> (select auth.uid())
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
  where i.status <> 'submitted' or i.author_id = (select auth.uid())
  group by s.idea_id;
$$;

-- Rechte der Funktion wie in 001 (bleiben bei "create or replace" erhalten – hier zur Sicherheit erneut)
revoke execute on function public.get_idea_support_counts() from public, anon;
grant  execute on function public.get_idea_support_counts() to authenticated;

commit;
