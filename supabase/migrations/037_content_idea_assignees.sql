-- Who an idea is assigned to. An idea can have several people; only workspace admins can assign.
create table if not exists public.content_idea_assignees (
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

-- "Assigned to me" looks ideas up by person.
create index if not exists content_idea_assignees_user_idx on public.content_idea_assignees(user_id);

alter table public.content_idea_assignees enable row level security;

create policy "workspace members read idea assignees"
on public.content_idea_assignees for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- Only admins assign, and only to people who are members of the same workspace.
create policy "admins assign ideas"
on public.content_idea_assignees for insert
to authenticated
with check (
  public.is_workspace_admin(workspace_id, auth.uid())
  and public.is_workspace_member(workspace_id, user_id)
);

create policy "admins unassign ideas"
on public.content_idea_assignees for delete
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

-- Rollback:
-- drop table if exists public.content_idea_assignees;
