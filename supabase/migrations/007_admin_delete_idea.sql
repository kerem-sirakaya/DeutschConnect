-- =============================================================================
-- 007 – Admin: Ideen löschen
-- =============================================================================
-- Ausführen NACH 001–006 (Supabase Dashboard -> SQL Editor -> Run).
-- IMMER die ganze Datei ausführen (nichts markieren).
-- Läuft als EINE Transaktion; Teil 3 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Was ändert sich?
--   * Neue Funktion public.admin_delete_idea(p_id uuid) – nur für Admins.
--     Löscht eine Idee mit Status collecting, review, planned oder rejected
--     samt ihrer Unterstützungen (idea_supports).
--
-- Was ändert sich NICHT?
--   * Keine Tabelle, keine Policy, keine Tabellenrechte, kein Trigger.
--   * Schüler:innen bekommen KEINE neuen Rechte. Sie dürfen weiterhin nur ihre
--     EIGENEN Ideen löschen (Policy aus 001) – daran ändert sich nichts.
--   * Admins sehen in der normalen App weiterhin dasselbe wie alle anderen.
--
-- Warum nicht für 'submitted'?
--   Eingereichte Ideen werden über "Freigeben" oder "Ablehnen" moderiert (Migration 006).
--   Löschen ist erst danach möglich – so geht keine neue Einreichung ungeprüft verloren.
--
-- Unterstützungen: idea_supports.idea_id hat ON DELETE CASCADE (001). Die Funktion
-- löscht sie zusätzlich ausdrücklich VOR der Idee – beides in derselben Transaktion,
-- es können also keine verwaisten Einträge entstehen. Teil 3 prüft das CASCADE.
--
-- Fehlercodes (SQLSTATE) für das Frontend:
--   42501 nicht erlaubt (kein Admin)     22023 ungültige Eingabe
--   P0002 Idee nicht gefunden            DC010 Idee in diesem Status nicht löschbar
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Voraussetzungen: 005 und 006 müssen ausgeführt sein
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'ABBRUCH: public.is_admin() fehlt – bitte zuerst Migration 005 ausführen.';
  end if;
  if to_regprocedure('public.admin_set_idea_status(uuid, text)') is null then
    raise exception 'ABBRUCH: admin_set_idea_status fehlt – bitte zuerst Migration 006 ausführen.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ideas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%rejected%'
  ) then
    raise exception 'ABBRUCH: ideas.status kennt "rejected" noch nicht – bitte zuerst Migration 006 ausführen.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Funktion: Idee löschen (nur Admins)
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_idea(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Keine Idee angegeben.' using errcode = '22023';
  end if;

  -- Sperre: verhindert, dass gleichzeitig eine Unterstützung entsteht oder der Status wechselt
  select i.status into old_status from public.ideas i where i.id = p_id for update;
  if not found then
    raise exception 'Idee nicht gefunden.' using errcode = 'P0002';
  end if;
  -- Erlaubnisliste: neue Status sind automatisch NICHT löschbar
  if old_status not in ('collecting', 'review', 'planned', 'rejected') then
    raise exception 'Ideen mit Status "%" können hier nicht gelöscht werden. Eingereichte Ideen bitte zuerst freigeben oder ablehnen.', old_status
      using errcode = 'DC010';
  end if;

  delete from public.idea_supports s where s.idea_id = p_id;
  delete from public.ideas i where i.id = p_id;
end;
$$;

revoke all on function public.admin_delete_idea(uuid) from public, anon;
grant execute on function public.admin_delete_idea(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) SELBSTPRÜFUNG – bricht ab (= alles oben wird rückgängig gemacht),
--    falls etwas nicht dem erwarteten, sicheren Zustand entspricht.
-- -----------------------------------------------------------------------------
do $$
declare
  fn_oid      oid := 'public.admin_delete_idea(uuid)'::regprocedure;
  ideas_oid   oid := 'public.ideas'::regclass;
  supp_oid    oid := 'public.idea_supports'::regclass;
  owner_name  name := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.ideas'::regclass);
  extra       text;
  r           text;
  t           regclass;
begin
  -- 3a) Funktion: security definer, search_path '', prüft is_admin(), gleicher Eigentümer wie die Tabellen
  if not exists (
    select 1 from pg_proc
    where oid = fn_oid and prosecdef
      and proconfig = array['search_path=""']
      and prorettype = 'void'::regtype
      and prosrc like '%public.is_admin()%'
      and prosrc like '%42501%'
  ) then
    raise exception 'ABBRUCH: admin_delete_idea ist nicht wie erwartet konfiguriert.';
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = fn_oid) is distinct from owner_name then
    raise exception 'ABBRUCH: admin_delete_idea hat einen anderen Eigentümer als public.ideas.';
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = supp_oid) is distinct from owner_name then
    raise exception 'ABBRUCH: public.idea_supports hat einen anderen Eigentümer als public.ideas.';
  end if;
  if owner_name in ('anon', 'authenticated', 'service_role') then
    raise exception 'ABBRUCH: Die Tabellen gehören der App-Rolle %.', owner_name;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if pg_has_role(r, owner_name, 'member') then
      raise exception 'ABBRUCH: Rolle % ist Mitglied der Eigentümer-Rolle %.', r, owner_name;
    end if;
  end loop;

  -- 3b) Ausführungsrechte: nicht PUBLIC, nicht anon, aber authenticated
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
             where p.oid = fn_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then
    raise exception 'ABBRUCH: PUBLIC darf admin_delete_idea ausführen.';
  end if;
  if has_function_privilege('anon', fn_oid, 'EXECUTE') then
    raise exception 'ABBRUCH: anon darf admin_delete_idea ausführen.';
  end if;
  if not has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
    raise exception 'ABBRUCH: authenticated darf admin_delete_idea nicht aufrufen.';
  end if;
  select string_agg(distinct g.rolname, ', ') into extra
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  join pg_roles g on g.oid = acl.grantee
  where p.oid = fn_oid and g.rolname not in (owner_name, 'authenticated', 'service_role');
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Ausführungsrechte auf admin_delete_idea für: %', extra;
  end if;

  -- 3c) Unterstützungen hängen mit ON DELETE CASCADE an der Idee (keine verwaisten Einträge)
  if not exists (
    select 1 from pg_constraint
    where conrelid = supp_oid and contype = 'f' and confrelid = ideas_oid and confdeltype = 'c'
  ) then
    raise exception 'ABBRUCH: idea_supports.idea_id -> ideas(id) ON DELETE CASCADE fehlt.';
  end if;

  -- 3d) Der Eigentümer darf löschen; RLS bleibt für Schüler:innen aktiv und gilt nicht für ihn
  foreach t in array array['public.ideas'::regclass, 'public.idea_supports'::regclass] loop
    if not has_table_privilege(owner_name, t, 'select, delete') then
      raise exception 'ABBRUCH: Eigentümer % darf % nicht lesen/löschen.', owner_name, t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t) then
      raise exception 'ABBRUCH: Row Level Security ist auf % nicht aktiv.', t;
    end if;
    if (select relforcerowsecurity from pg_class where oid = t) then
      raise exception 'ABBRUCH: FORCE ROW LEVEL SECURITY ist auf % aktiv (Funktion sähe nichts).', t;
    end if;
    -- Keine neuen Rechte für Besucher; keine Admin-Policies (Admins handeln nur über Funktionen)
    if has_table_privilege('anon', t, 'select, insert, update, delete, truncate') then
      raise exception 'ABBRUCH: anon hat Rechte auf %.', t;
    end if;
    if has_table_privilege('authenticated', t, 'truncate') then
      raise exception 'ABBRUCH: authenticated darf % leeren (TRUNCATE).', t;
    end if;
    if exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = (select relname from pg_class where oid = t)
                 and (coalesce(qual, '') like '%is_admin%' or coalesce(with_check, '') like '%is_admin%')) then
      raise exception 'ABBRUCH: Auf % gibt es eine Admin-Policy – nicht vorgesehen.', t;
    end if;
  end loop;

  -- 3e) Schüler:innen: Löschen von Ideen weiterhin NUR über die Policy "eigene löschen" aus 001
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'ideas' and cmd = 'DELETE'
                   and qual like '%author_id%auth.uid()%') then
    raise exception 'ABBRUCH: Die Lösch-Policy für eigene Ideen (001) fehlt oder ist anders.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ideas' and cmd in ('DELETE', 'ALL')) <> 1 then
    raise exception 'ABBRUCH: Auf public.ideas gibt es unerwartete weitere Lösch-Policies.';
  end if;
end $$;

commit;
