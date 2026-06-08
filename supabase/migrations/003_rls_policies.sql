alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.review_rounds enable row level security;
alter table public.review_assignments enable row level security;
alter table public.review_responses enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or workspace peers"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members peer on peer.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and peer.user_id = profiles.id
  )
);

create policy "profiles update own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles insert own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "workspace members can read workspace"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id, auth.uid()));

create policy "users can create workspace"
on public.workspaces for insert
to authenticated
with check (created_by = auth.uid());

create policy "admins update workspace"
on public.workspaces for update
to authenticated
using (public.is_workspace_admin(id, auth.uid()))
with check (public.is_workspace_admin(id, auth.uid()));

create policy "workspace members read memberships"
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins manage memberships"
on public.workspace_members for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "self admin bootstrap membership"
on public.workspace_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'admin'
  and exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.created_by = auth.uid()
  )
);

create policy "admins manage invites"
on public.invites for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "invited users can read pending invite by email"
on public.invites for select
to authenticated
using (
  status = 'pending'
  and lower(email) = lower((select email from public.profiles where id = auth.uid()))
);

create policy "members read projects"
on public.projects for select
to authenticated
using (
  public.is_workspace_member(workspace_id, auth.uid())
  and (
    public.is_workspace_admin(workspace_id, auth.uid())
    or public.is_project_member(id, auth.uid())
  )
);

create policy "admins manage projects"
on public.projects for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "members read project members"
on public.project_members for select
to authenticated
using (
  public.is_project_member(project_id, auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
);

create policy "admins manage project members"
on public.project_members for all
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
);

create policy "members read relevant rounds"
on public.review_rounds for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = review_rounds.project_id
      and (
        public.is_workspace_admin(p.workspace_id, auth.uid())
        or public.is_project_member(p.id, auth.uid())
      )
  )
);

create policy "admins manage rounds"
on public.review_rounds for all
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = review_rounds.project_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = review_rounds.project_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
);

create policy "reviewers read own assignments"
on public.review_assignments for select
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1
    from public.review_rounds rr
    join public.projects p on p.id = rr.project_id
    where rr.id = review_assignments.round_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
);

create policy "service and admins manage assignments"
on public.review_assignments for all
to authenticated
using (
  exists (
    select 1
    from public.review_rounds rr
    join public.projects p on p.id = rr.project_id
    where rr.id = review_assignments.round_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.review_rounds rr
    join public.projects p on p.id = rr.project_id
    where rr.id = review_assignments.round_id
      and public.is_workspace_admin(p.workspace_id, auth.uid())
  )
);

create policy "reviewer owns response"
on public.review_responses for select
to authenticated
using (
  exists (
    select 1 from public.review_assignments ra
    where ra.id = review_responses.assignment_id
      and (
        ra.reviewer_id = auth.uid()
        or exists (
          select 1
          from public.review_rounds rr
          join public.projects p on p.id = rr.project_id
          where rr.id = ra.round_id
            and public.is_workspace_admin(p.workspace_id, auth.uid())
        )
      )
  )
);

create policy "reviewer writes own response"
on public.review_responses for all
to authenticated
using (
  exists (
    select 1 from public.review_assignments ra
    where ra.id = review_responses.assignment_id
      and ra.reviewer_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.review_assignments ra
    where ra.id = review_responses.assignment_id
      and ra.reviewer_id = auth.uid()
  )
);

create policy "admins read notification logs"
on public.notification_logs for select
to authenticated
using (workspace_id is not null and public.is_workspace_admin(workspace_id, auth.uid()));

create policy "admins read audit logs"
on public.audit_logs for select
to authenticated
using (workspace_id is not null and public.is_workspace_admin(workspace_id, auth.uid()));
