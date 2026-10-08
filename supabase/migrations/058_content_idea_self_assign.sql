-- Content Board: anyone on the team can start work on a shortlisted idea. When nobody is assigned yet,
-- whoever starts it is added as its assignee, so members may add themselves (assigning other people
-- stays with admins, under "admins assign ideas").
create policy "members assign themselves to ideas"
on public.content_idea_assignees for insert
to authenticated
with check (
  user_id = auth.uid()
  and assigned_by = auth.uid()
  and public.is_workspace_member(workspace_id, auth.uid())
  and exists (
    select 1 from public.content_ideas i
    where i.id = idea_id and i.workspace_id = content_idea_assignees.workspace_id
  )
);

-- Rollback: drop policy if exists "members assign themselves to ideas" on public.content_idea_assignees;
