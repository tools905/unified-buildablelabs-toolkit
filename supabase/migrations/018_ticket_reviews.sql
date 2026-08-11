create type public.ticket_review_status as enum ('pending_review', 'verified', 'disputed');

alter table public.tickets
  add column claimed_progress_percent integer check (claimed_progress_percent between 0 and 100),
  add column verified_progress_percent integer check (verified_progress_percent between 0 and 100),
  add column review_status public.ticket_review_status,
  add column reviewer_id uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_notes text;

create index tickets_reviewer_review_status_idx on public.tickets(reviewer_id, review_status);

-- One configurable reviewer per workspace ("team members submit progress,
-- the project lead reviews it"). Kept as a single setting rather than a
-- per-role rules table since there is currently one reviewer, not many.
create table public.ticket_review_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  default_reviewer_id uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

create trigger ticket_review_settings_touch_updated_at
before update on public.ticket_review_settings
for each row execute function public.touch_updated_at();

alter table public.ticket_review_settings enable row level security;

create policy "workspace members read review settings"
on public.ticket_review_settings for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins manage review settings"
on public.ticket_review_settings for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

-- notifications (009_toolkit_core.sql) only had a select policy. Writes for
-- ticket reviews go through the service-role admin client (bypasses RLS by
-- design, since one user is notifying another) — no insert policy needed
-- for authenticated users. Only add what's missing: marking your own as read.
create policy "users can update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- down migration:
-- drop policy if exists "users can update own notifications" on public.notifications;
-- drop policy if exists "admins manage review settings" on public.ticket_review_settings;
-- drop policy if exists "workspace members read review settings" on public.ticket_review_settings;
-- drop trigger if exists ticket_review_settings_touch_updated_at on public.ticket_review_settings;
-- drop table if exists public.ticket_review_settings;
-- drop index if exists tickets_reviewer_review_status_idx;
-- alter table public.tickets
--   drop column if exists review_notes,
--   drop column if exists reviewed_at,
--   drop column if exists reviewer_id,
--   drop column if exists review_status,
--   drop column if exists verified_progress_percent,
--   drop column if exists claimed_progress_percent;
-- drop type if exists public.ticket_review_status;
