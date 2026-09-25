create type public.content_platform as enum (
  'instagram',
  'linkedin',
  'x',
  'youtube',
  'facebook'
);

create type public.content_idea_status as enum (
  'idea',
  'approved',
  'in_progress',
  'posted'
);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.content_platform not null,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.content_idea_status not null default 'idea',
  post_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_ideas_workspace_status_idx on public.content_ideas(workspace_id, status);
create index content_ideas_assigned_to_idx on public.content_ideas(assigned_to, workspace_id);
create index content_ideas_created_at_idx on public.content_ideas(created_at desc);

create trigger content_ideas_touch_updated_at
before update on public.content_ideas
for each row execute function public.touch_updated_at();

alter table public.content_ideas enable row level security;

create policy "workspace members read content ideas"
on public.content_ideas for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create content ideas"
on public.content_ideas for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "workspace members update content ideas"
on public.content_ideas for update
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins delete content ideas"
on public.content_ideas for delete
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

insert into public.tools (name, slug, description, enabled)
values ('Content Board', 'content-board', 'Plan social content from idea to posted across every platform.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- down migration:
-- delete from public.tools where slug = 'content-board';
-- drop policy if exists "admins delete content ideas" on public.content_ideas;
-- drop policy if exists "workspace members update content ideas" on public.content_ideas;
-- drop policy if exists "workspace members create content ideas" on public.content_ideas;
-- drop policy if exists "workspace members read content ideas" on public.content_ideas;
-- drop trigger if exists content_ideas_touch_updated_at on public.content_ideas;
-- drop table if exists public.content_ideas;
-- drop type if exists public.content_idea_status;
-- drop type if exists public.content_platform;
