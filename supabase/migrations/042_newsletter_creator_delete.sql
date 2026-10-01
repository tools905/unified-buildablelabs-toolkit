-- Only the person who created a newsletter post may delete it, whether it is a draft or
-- already published. This replaces the earlier rule that let any workspace admin delete.
drop policy if exists "admins delete newsletter posts" on public.newsletter_posts;

create policy "creators delete their newsletter posts"
on public.newsletter_posts for delete
to authenticated
using (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

-- down migration:
-- drop policy if exists "creators delete their newsletter posts" on public.newsletter_posts;
-- create policy "admins delete newsletter posts"
-- on public.newsletter_posts for delete
-- to authenticated
-- using (public.is_workspace_admin(workspace_id, auth.uid()));
