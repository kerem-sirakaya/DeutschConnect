-- Read-only status evidence; no user data and no schema or data changes.
select
  exists(select 1 from supabase_migrations.schema_migrations where version='202611070001') as migration_applied,
  (select relrowsecurity from pg_class where oid='public.dc_workspace'::regclass) as workspace_rls,
  (select relrowsecurity from pg_class where oid='public.dc_commands'::regclass) as commands_rls,
  not has_table_privilege('anon','public.dc_workspace','SELECT') as anon_snapshot_denied,
  not has_table_privilege('authenticated','public.dc_workspace','SELECT') as account_snapshot_denied,
  not has_table_privilege('authenticated','public.dc_workspace','UPDATE') as account_snapshot_update_denied,
  not has_table_privilege('authenticated','public.dc_commands','SELECT') as account_command_log_denied,
  not has_function_privilege('authenticated','public.dc_commit(bigint,jsonb,uuid,text)','EXECUTE') as account_commit_denied,
  has_function_privilege('service_role','public.dc_commit(bigint,jsonb,uuid,text)','EXECUTE') as server_commit_allowed,
  pg_get_functiondef('public.dc_commit(bigint,jsonb,uuid,text)'::regprocedure) like '%pg_advisory_xact_lock%' as commit_uses_lock,
  pg_get_functiondef('public.dc_commit(bigint,jsonb,uuid,text)'::regprocedure) like '%p_revision%' as commit_checks_revision;
