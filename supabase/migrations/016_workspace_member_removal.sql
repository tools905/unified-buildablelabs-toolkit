create or replace function public.is_project_member(
  target_project_id uuid,
  target_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = target_project_id
      and pm.user_id = target_user_id
      and pm.is_active
      and public.is_workspace_member(p.workspace_id, target_user_id)
  );
$$;

drop policy if exists "profiles read own or workspace peers" on public.profiles;
create policy "profiles read own or active workspace peers"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members peer on peer.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and peer.user_id = profiles.id
      and peer.status = 'active'
  )
);
