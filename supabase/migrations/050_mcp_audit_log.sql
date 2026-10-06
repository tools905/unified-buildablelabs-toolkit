-- MCP connector: an audit record of every tool call.
--
-- One row per call: who made it, through which connector, which tool, which idea (if any), and whether
-- it worked. It holds no content from the call itself, only what happened. The clean-up job removes
-- rows older than 90 days (lib/mcp/contract.ts, MCP_LIMITS).
--
-- Only the server writes to it (with the service role, which skips row security). People can read their
-- own rows, and workspace admins can read everyone's.
--
-- tool_name and error_code are checked for length only, not against a fixed list, so adding a tool
-- later does not need a migration. lib/mcp/contract.ts holds the allowed values.

create table public.mcp_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The "client_id" claim of the token: which connector registration made the call.
  client_id text not null check (char_length(client_id) between 1 and 200),
  tool_name text not null check (char_length(tool_name) between 1 and 64),
  -- Kept as a plain reference that is cleared if the idea is deleted, so the record outlives the idea.
  idea_id uuid references public.content_ideas(id) on delete set null,
  outcome text not null check (outcome in ('ok', 'error')),
  error_code text check (error_code is null or char_length(error_code) between 1 and 40),
  created_at timestamptz not null default now(),
  -- A successful call has no error code.
  constraint mcp_audit_log_ok_has_no_error check (outcome = 'error' or error_code is null)
);

create index mcp_audit_log_workspace_idx on public.mcp_audit_log (workspace_id, created_at desc);
create index mcp_audit_log_user_idx on public.mcp_audit_log (user_id, created_at desc);

alter table public.mcp_audit_log enable row level security;

create policy "members read their own mcp audit rows"
on public.mcp_audit_log for select
to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins read all mcp audit rows"
on public.mcp_audit_log for select
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

-- Reading only: no one signed in can add, change or delete rows. The server writes with the service role.
revoke insert, update, delete on table public.mcp_audit_log from anon, authenticated;
revoke all on table public.mcp_audit_log from anon;

-- Rollback:
-- drop table if exists public.mcp_audit_log;
