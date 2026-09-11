-- Links toolkit tickets to existing Linear issues. v1 scope per
-- docs/PRD_LINEAR_INTEGRATION.md: link-only (no status/assignee mirroring),
-- no push-to-Linear. Auto-linking covers both a deterministic identifier
-- match ('auto_identifier') and an AI-judged title/description match
-- ('auto_semantic') — both link directly, tagged distinctly so an
-- AI-guessed link stays easy to identify and audit later.
--
-- Multiple tickets are currently allowed to link to the same Linear issue
-- (no uniqueness enforced) — a deliberate relaxation for now.

create type public.linear_link_source as enum ('auto_identifier', 'auto_semantic', 'manual');

alter table public.tickets
  add column linear_issue_id text,
  add column linear_issue_identifier text,
  add column linear_issue_url text,
  add column linear_link_source public.linear_link_source,
  add column linear_link_confidence numeric(3, 2),
  add column linear_linked_at timestamptz,
  add column linear_linked_by uuid references public.profiles(id) on delete set null,
  add column linear_match_checked_at timestamptz;

create index tickets_linear_issue_idx on public.tickets (linear_issue_id) where linear_issue_id is not null;

create table public.linear_integration_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  linear_team_ids text[] not null default '{}',
  suggest_threshold numeric(3, 2) not null default 0.50,
  updated_at timestamptz not null default now()
);

create trigger linear_integration_settings_touch_updated_at
before update on public.linear_integration_settings
for each row execute function public.touch_updated_at();

alter table public.linear_integration_settings enable row level security;

create policy "workspace members read linear settings"
on public.linear_integration_settings for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins manage linear settings"
on public.linear_integration_settings for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

-- down migration:
-- drop policy if exists "admins manage linear settings" on public.linear_integration_settings;
-- drop policy if exists "workspace members read linear settings" on public.linear_integration_settings;
-- drop trigger if exists linear_integration_settings_touch_updated_at on public.linear_integration_settings;
-- drop table if exists public.linear_integration_settings;
-- drop index if exists tickets_linear_issue_idx;
-- alter table public.tickets
--   drop column if exists linear_match_checked_at,
--   drop column if exists linear_linked_by,
--   drop column if exists linear_linked_at,
--   drop column if exists linear_link_confidence,
--   drop column if exists linear_link_source,
--   drop column if exists linear_issue_url,
--   drop column if exists linear_issue_identifier,
--   drop column if exists linear_issue_id;
-- drop type if exists public.linear_link_source;
