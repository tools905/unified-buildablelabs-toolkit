-- Update public.create_profile_for_new_user to automatically add new users to the default workspace
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_workspace_id uuid;
begin
  -- 1. Insert or update the user profile
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  -- 2. Find the default workspace "BuildableLabs"
  select id into default_workspace_id
  from public.workspaces
  where name = 'BuildableLabs'
  limit 1;

  if default_workspace_id is null then
    -- First user registers: create the default workspace and add them as admin
    insert into public.workspaces (name, created_by)
    values ('BuildableLabs', new.id)
    returning id into default_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role, status)
    values (default_workspace_id, new.id, 'admin', 'active')
    on conflict (workspace_id, user_id) do nothing;
  else
    -- Subsequent user registers: add them to the default workspace as a member
    insert into public.workspace_members (workspace_id, user_id, role, status)
    values (default_workspace_id, new.id, 'member', 'active')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return new;
end;
$$;
