-- MCP connector: safety rules for the sign-in tokens an app gets when a person connects it.
--
-- A connector token is a normal Supabase login token that also carries a `client_id` claim (the app it was
-- issued to). It acts as the person, so the database's own rules already limit it to what that person may
-- do. This migration narrows it further, to what the connector's tools need and nothing else, so that a
-- leaked token (or a bug) can't read or change the rest of the toolkit through Supabase's own API.
--
-- Three layers, none of which touches a normal login (a token without `client_id` passes every rule):
--   1. Row rules on every table in `public`: a connector token is refused outright, except on the Content
--      Board tables and the three it needs to find its workspace and show names. Nothing it holds can delete.
--   2. A check in front of every request to the REST API (PostgREST), which also covers views and functions
--      that row rules can't: a connector token may only call the tables of layer 1.
--   3. The same for storage: a connector token can't read or write files (the connector's own tools read
--      them with the server's connection).
--
-- The server's own connection (service role) skips all of this, so cron jobs, the upload page and the
-- connector's server-side steps are unaffected.
--
-- When a new table is added, run `select * from public.mcp_unprotected_tables();` (as the service role, or in
-- the SQL editor): any table it lists has no connector rule yet. Re-running this migration covers them.

-- ---------------------------------------------------------------------------------------------------
-- Is the current request made with a connector token?
create or replace function public.is_connector_token()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> ''
$$;

-- ---------------------------------------------------------------------------------------------------
-- Layer 1: row rules. Restrictive rules are ANDed with the ones that already exist, so they can only take
-- access away. The names start with "connector tokens" so this migration can be run again safely.
do $$
declare
  t record;
  -- what the connector's tools read and write as the person
  board_open constant text[] := array['content_ideas', 'content_idea_review_points'];
  -- what it only reads: files and assignments (the server changes those), names, and who is in the workspace
  read_only constant text[] := array['content_idea_attachments', 'content_idea_assignees', 'profiles', 'workspace_members', 'workspaces'];
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', 'connector tokens blocked', t.tablename);
    execute format('drop policy if exists %I on public.%I', 'connector tokens may not insert', t.tablename);
    execute format('drop policy if exists %I on public.%I', 'connector tokens may not update', t.tablename);
    execute format('drop policy if exists %I on public.%I', 'connector tokens may not delete', t.tablename);

    if t.tablename = any (board_open) then
      -- read, add and change, but never delete
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_connector_token())',
        'connector tokens may not delete', t.tablename);
    elsif t.tablename = any (read_only) then
      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_connector_token())',
        'connector tokens may not insert', t.tablename);
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated using (not public.is_connector_token()) with check (not public.is_connector_token())',
        'connector tokens may not update', t.tablename);
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_connector_token())',
        'connector tokens may not delete', t.tablename);
    else
      -- everything else: no access at all
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (not public.is_connector_token()) with check (not public.is_connector_token())',
        'connector tokens blocked', t.tablename);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Layer 2: a check in front of every REST request. PostgREST runs this function before each request; it
-- stops a connector token from reaching anything but the tables the connector uses. That includes the
-- database functions (`/rpc/...`) and views, which row rules don't cover.
--
-- It must never break the API for everyone, so it does nothing unless it can read a `client_id` claim.
create or replace function public.mcp_restrict_connector_requests()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  path text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return;
  end;
  if claims is null or coalesce(claims ->> 'client_id', '') = '' then
    return;
  end if;

  path := coalesce(current_setting('request.path', true), '');
  if path !~ '^/(content_ideas|content_idea_attachments|content_idea_review_points|content_idea_assignees|profiles|workspace_members|workspaces)$' then
    raise exception 'This sign-in can only use the Content Board.' using errcode = '42501';
  end if;
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'public.mcp_restrict_connector_requests';

-- ---------------------------------------------------------------------------------------------------
-- Layer 3: storage. A connector token gets no access to files; the connector's tools use the server's own
-- connection for them.
drop policy if exists "connector tokens blocked" on storage.objects;
create policy "connector tokens blocked"
on storage.objects
as restrictive
for all
to authenticated
using (not public.is_connector_token())
with check (not public.is_connector_token());

-- ---------------------------------------------------------------------------------------------------
-- Checks, for the service role only.
create or replace function public.mcp_unprotected_tables()
returns table (table_name text)
language sql
stable
set search_path = ''
as $$
  select t.tablename::text
  from pg_catalog.pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname like 'connector tokens%'
    )
  order by 1
$$;

-- Tables with row security switched off are open to every signed-in person, connector or not.
create or replace function public.mcp_tables_without_row_security()
returns table (table_name text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  order by 1
$$;

revoke all on function public.mcp_unprotected_tables() from public, anon, authenticated;
revoke all on function public.mcp_tables_without_row_security() from public, anon, authenticated;
grant execute on function public.mcp_unprotected_tables() to service_role;
grant execute on function public.mcp_tables_without_row_security() to service_role;

notify pgrst, 'reload config';

-- Rollback (restores everything to how it was before this migration):
-- alter role authenticator reset pgrst.db_pre_request;
-- notify pgrst, 'reload config';
-- drop function if exists public.mcp_restrict_connector_requests();
-- drop policy if exists "connector tokens blocked" on storage.objects;
-- do $$ declare p record; begin
--   for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and policyname like 'connector tokens%' loop
--     execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
--   end loop; end $$;
-- drop function if exists public.mcp_unprotected_tables();
-- drop function if exists public.mcp_tables_without_row_security();
-- drop function if exists public.is_connector_token();
