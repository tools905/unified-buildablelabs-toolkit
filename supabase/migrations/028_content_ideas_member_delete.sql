drop policy if exists "admins delete content ideas" on public.content_ideas;

create policy "workspace members delete content ideas"
on public.content_ideas for delete
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- down migration:
-- drop policy if exists "workspace members delete content ideas" on public.content_ideas;
-- create policy "admins delete content ideas"
-- on public.content_ideas for delete
-- to authenticated
-- using (public.is_workspace_admin(workspace_id, auth.uid()));
