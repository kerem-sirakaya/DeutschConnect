-- Run with `supabase test db` against the local/new Supabase setup.
-- This test was prepared but cannot run without a PostgreSQL/Supabase instance.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);
select ok((select relrowsecurity from pg_class where oid = 'public.dc_workspace'::regclass), 'Workspace has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.dc_commands'::regclass), 'Command log has RLS enabled');
select ok(not has_table_privilege('anon', 'public.dc_workspace', 'SELECT'), 'Anonymous clients cannot read snapshots');
select ok(not has_table_privilege('authenticated', 'public.dc_workspace', 'UPDATE'), 'Authenticated clients cannot replace snapshots');
select ok(not has_table_privilege('authenticated', 'public.dc_commands', 'SELECT'), 'Command history is private');
select ok(not has_function_privilege('authenticated', 'public.dc_commit(bigint,jsonb,uuid,text)', 'EXECUTE'), 'Clients cannot call privileged commit');
select ok(has_function_privilege('service_role', 'public.dc_commit(bigint,jsonb,uuid,text)', 'EXECUTE'), 'Only trusted backend can commit');
select * from finish();
rollback;
