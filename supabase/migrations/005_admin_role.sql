-- =============================================================================
-- 005 – Admin-Rolle (Grundlage für den Admin-Bereich)
-- =============================================================================
-- Ausführen NACH 001–004 (Supabase Dashboard -> SQL Editor -> Run).
-- Läuft als EINE Transaktion; Teil 3 prüft am Ende selbst, ob alles sicher ist –
-- sonst wird ALLES zurückgerollt. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Was ändert sich?
--   * Neue Tabelle public.admins: wer Admin ist. Nur im SQL Editor beschreibbar.
--   * Neue Funktion public.is_admin(): "Bin ICH Admin?" – true/false.
--
-- Was ändert sich NICHT?
--   * Keine bestehende Tabelle, Policy, Funktion oder Berechtigung.
--   * Normale Schüler:innen bekommen KEINE neuen Rechte.
--   * is_admin() wird hier noch von KEINER Policy benutzt – Admins können nach
--     dieser Migration also noch nichts zusätzlich.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabelle der Admins
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text check (note is null or char_length(note) <= 200)
);

-- RLS an + KEINE Policy = über die API (Browser) kann niemand Zeilen sehen oder ändern.
alter table public.admins enable row level security;

-- Supabase vergibt für neue Tabellen in "public" automatisch Rechte an anon und
-- authenticated. Die werden hier ausdrücklich entzogen (doppelte Sicherung zu RLS).
revoke all on public.admins from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Funktion: Ist die AUFRUFENDE Person Admin?
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) SELBSTPRÜFUNG – bricht ab (= alles oben wird rückgängig gemacht),
--    falls irgendetwas nicht dem erwarteten, sicheren Zustand entspricht.
-- -----------------------------------------------------------------------------
do $$
declare
  admins_oid    oid := 'public.admins'::regclass;
  users_oid     oid := 'auth.users'::regclass;
  fn_oid        oid := 'public.is_admin()'::regprocedure;
  col_user_id   smallint;
  col_created   smallint;
  users_id_col  smallint;
  table_owner   name;
  fn_owner      name;
  structure     text;
  extra         text;
  r             text;
  n             integer;
begin
  -- ---------- 3a) Spalten: genau diese drei, mit Typ und Pflichtfeld ----------
  select string_agg(
           a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' ||
           case when a.attnotnull then 'not null' else 'null' end,
           ', ' order by a.attnum)
    into structure
  from pg_attribute a
  where a.attrelid = admins_oid and a.attnum > 0 and not a.attisdropped;
  if structure is distinct from
     'user_id:uuid:not null, created_at:timestamp with time zone:not null, note:text:null' then
    raise exception 'ABBRUCH: public.admins hat unerwartete Spalten: %', structure;
  end if;

  select attnum into col_user_id from pg_attribute where attrelid = admins_oid and attname = 'user_id';
  select attnum into col_created from pg_attribute where attrelid = admins_oid and attname = 'created_at';
  select attnum into users_id_col from pg_attribute where attrelid = users_oid and attname = 'id';

  -- ---------- 3b) Standardwerte: nur created_at = now() ----------
  if (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
      where d.adrelid = admins_oid and d.adnum = col_created) is distinct from 'now()' then
    raise exception 'ABBRUCH: created_at hat nicht den Standardwert now().';
  end if;
  select count(*) into n from pg_attrdef where adrelid = admins_oid and adnum <> col_created;
  if n > 0 then
    raise exception 'ABBRUCH: public.admins hat unerwartete weitere Standardwerte.';
  end if;

  -- ---------- 3c) Regeln (Constraints): genau 1 Prüfregel, 1 Fremdschlüssel, 1 Primärschlüssel ----------
  select string_agg(contype::text, '' order by contype::text) into extra
  from pg_constraint where conrelid = admins_oid;
  if extra is distinct from 'cfp' then
    raise exception 'ABBRUCH: public.admins hat unerwartete Regeln (gefunden: %, erwartet: c, f, p).', extra;
  end if;

  -- Primärschlüssel genau auf user_id
  if not exists (
    select 1 from pg_constraint
    where conrelid = admins_oid and contype = 'p' and conkey = array[col_user_id]
  ) then
    raise exception 'ABBRUCH: Primärschlüssel von public.admins liegt nicht genau auf user_id.';
  end if;

  -- Fremdschlüssel: user_id -> auth.users(id), ON DELETE CASCADE
  if not exists (
    select 1 from pg_constraint
    where conrelid = admins_oid and contype = 'f'
      and conkey = array[col_user_id]
      and confrelid = users_oid
      and confkey = array[users_id_col]
      and confdeltype = 'c'
  ) then
    raise exception 'ABBRUCH: Fremdschlüssel user_id -> auth.users(id) ON DELETE CASCADE fehlt oder ist anders.';
  end if;

  -- Prüfregel für note: leer ODER höchstens 200 Zeichen
  -- (Leerzeichen und Klammern werden beim Vergleich ignoriert, weil PostgreSQL sie selbst formatiert.)
  if not exists (
    select 1 from pg_constraint
    where conrelid = admins_oid and contype = 'c'
      and regexp_replace(pg_get_constraintdef(oid), '[[:space:]()]', '', 'g')
          = 'CHECKnoteISNULLORchar_lengthnote<=200'
  ) then
    raise exception 'ABBRUCH: Prüfregel für note (höchstens 200 Zeichen) fehlt oder ist anders.';
  end if;

  -- Keine eigenen Trigger (könnten heimlich Daten verändern)
  select string_agg(tgname, ', ') into extra
  from pg_trigger where tgrelid = admins_oid and not tgisinternal;
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Trigger auf public.admins: %', extra;
  end if;

  -- ---------- 3d) Row Level Security: an, nicht erzwungen, keine Policy ----------
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

  -- ---------- 3e) Tabellenrechte ----------
  select pg_get_userbyid(relowner) into table_owner from pg_class where oid = admins_oid;

  -- PUBLIC (= "alle Rollen") darf KEINEN Eintrag in der Rechteliste haben.
  -- PUBLIC ist keine echte Rolle; in der Rechteliste (ACL) steht es als grantee = 0.
  if exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = admins_oid and acl.grantee = 0
  ) then
    raise exception 'ABBRUCH: PUBLIC hat Rechte auf public.admins.';
  end if;

  -- anon und authenticated: keinerlei Rechte (auch nicht über Gruppen-Mitgliedschaften)
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.admins', 'select, insert, update, delete, truncate, references, trigger') then
      raise exception 'ABBRUCH: Rolle % hat Rechte auf public.admins.', r;
    end if;
  end loop;

  -- Ausdrückliche Einträge in der Rechteliste: nur Eigentümer und service_role (Server-Schlüssel)
  select string_agg(distinct g.rolname, ', ') into extra
  from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  join pg_roles g on g.oid = acl.grantee
  where c.oid = admins_oid
    and g.rolname not in (table_owner, 'service_role');
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Rechte auf public.admins für: %', extra;
  end if;

  -- ---------- 3f) Eigentümer der Funktion: darf admins trotz RLS lesen, ist keine App-Rolle ----------
  select pg_get_userbyid(proowner) into fn_owner from pg_proc where oid = fn_oid;

  if fn_owner is distinct from table_owner then
    raise exception 'ABBRUCH: Eigentümer von is_admin() (%) ist nicht Eigentümer von admins (%).', fn_owner, table_owner;
  end if;
  if fn_owner in ('anon', 'authenticated', 'service_role') then
    raise exception 'ABBRUCH: is_admin() gehört der App-Rolle %.', fn_owner;
  end if;
  -- App-Rollen dürfen nicht "Mitglied" der Eigentümer-Rolle sein (sonst könnten sie als Eigentümer handeln)
  foreach r in array array['anon', 'authenticated'] loop
    if pg_has_role(r, fn_owner, 'member') then
      raise exception 'ABBRUCH: Rolle % ist Mitglied der Eigentümer-Rolle %.', r, fn_owner;
    end if;
  end loop;
  -- Der Eigentümer muss admins lesen dürfen (als Eigentümer ohne FORCE RLS: RLS gilt für ihn nicht – siehe 3d)
  if not has_table_privilege(fn_owner, 'public.admins', 'select') then
    raise exception 'ABBRUCH: Eigentümer % darf public.admins nicht lesen.', fn_owner;
  end if;

  -- ---------- 3g) Einstellungen der Funktion ----------
  if not exists (
    select 1 from pg_proc
    where oid = fn_oid
      and prosecdef                                          -- SECURITY DEFINER
      and provolatile = 's'                                  -- STABLE (liest nur)
      and prolang = (select oid from pg_language where lanname = 'sql')
      and prorettype = 'boolean'::regtype
      and pronargs = 0                                       -- kein Parameter
      and proconfig = array['search_path=""']                -- genau search_path = ''
      and prosrc like '%public.admins%'
      and prosrc like '%auth.uid()%'
  ) then
    raise exception 'ABBRUCH: public.is_admin() ist nicht wie erwartet konfiguriert.';
  end if;

  -- ---------- 3h) Ausführungsrechte der Funktion ----------
  -- PUBLIC: kein EXECUTE-Eintrag in der Rechteliste (ohne revoke hätte PUBLIC standardmäßig EXECUTE!)
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = fn_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'ABBRUCH: PUBLIC darf public.is_admin() ausführen.';
  end if;

  if has_function_privilege('anon', 'public.is_admin()', 'execute') then
    raise exception 'ABBRUCH: Rolle anon darf public.is_admin() ausführen.';
  end if;
  if not has_function_privilege('authenticated', 'public.is_admin()', 'execute') then
    raise exception 'ABBRUCH: Rolle authenticated darf public.is_admin() nicht ausführen.';
  end if;

  -- Ausdrückliche Einträge: nur Eigentümer, authenticated, service_role
  select string_agg(distinct g.rolname, ', ') into extra
  from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  join pg_roles g on g.oid = acl.grantee
  where p.oid = fn_oid
    and g.rolname not in (fn_owner, 'authenticated', 'service_role');
  if extra is not null then
    raise exception 'ABBRUCH: unerwartete Ausführungsrechte auf is_admin() für: %', extra;
  end if;
end $$;

commit;
