-- Private MVP workspace. Browser clients cannot read/write the raw snapshot.
-- All commands pass the JWT-verified Edge Function and atomic compare-and-swap.
create table if not exists public.dc_workspace (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.dc_commands (
  actor_id uuid not null references auth.users(id) on delete cascade,
  command_id text not null check (length(command_id) between 1 and 150),
  created_at timestamptz not null default now(),
  primary key (actor_id, command_id)
);
alter table public.dc_workspace enable row level security;
alter table public.dc_commands enable row level security;
revoke all on public.dc_workspace, public.dc_commands from anon, authenticated;
grant all on public.dc_workspace, public.dc_commands to service_role;

create or replace function public.dc_commit(p_revision bigint, p_payload jsonb, p_actor uuid, p_command text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  perform pg_advisory_xact_lock(9347201);
  if exists (select 1 from public.dc_commands where actor_id = p_actor and command_id = p_command) then return true; end if;
  select revision into current_revision from public.dc_workspace where id = 1 for update;
  if coalesce(current_revision, 0) <> p_revision then return false; end if;
  insert into public.dc_workspace(id, revision, payload) values (1, p_revision + 1, p_payload)
    on conflict(id) do update set revision = excluded.revision, payload = excluded.payload, updated_at = now();
  insert into public.dc_commands(actor_id, command_id) values (p_actor, p_command);
  return true;
end;
$$;
revoke all on function public.dc_commit(bigint,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.dc_commit(bigint,jsonb,uuid,text) to service_role;
