create table public.learning_roadmaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  url text not null,
  category text not null default 'reference',
  tags text[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resource_roadmap_mapping (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  roadmap_id uuid not null references public.learning_roadmaps(id) on delete cascade,
  sort_order integer not null default 0,
  unique (resource_id, roadmap_id)
);

create index resources_workspace_category_idx on public.resources(workspace_id, category);
create index resources_workspace_created_at_idx on public.resources(workspace_id, created_at desc);
create index resource_roadmap_mapping_roadmap_idx on public.resource_roadmap_mapping(roadmap_id, sort_order);
create index learning_roadmaps_workspace_idx on public.learning_roadmaps(workspace_id);

create trigger resources_touch_updated_at
before update on public.resources
for each row execute function public.touch_updated_at();

alter table public.learning_roadmaps enable row level security;
alter table public.resources enable row level security;
alter table public.resource_roadmap_mapping enable row level security;

create policy "workspace members read roadmaps"
on public.learning_roadmaps for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins manage roadmaps"
on public.learning_roadmaps for all
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "workspace members read resources"
on public.resources for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create resources"
on public.resources for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "creator or admin manage resources"
on public.resources for update
to authenticated
using (created_by = auth.uid() or public.is_workspace_admin(workspace_id, auth.uid()))
with check (created_by = auth.uid() or public.is_workspace_admin(workspace_id, auth.uid()));

create policy "creator or admin delete resources"
on public.resources for delete
to authenticated
using (created_by = auth.uid() or public.is_workspace_admin(workspace_id, auth.uid()));

create policy "workspace members read roadmap mapping"
on public.resource_roadmap_mapping for select
to authenticated
using (
  exists (
    select 1 from public.learning_roadmaps r
    where r.id = resource_roadmap_mapping.roadmap_id
      and public.is_workspace_member(r.workspace_id, auth.uid())
  )
);

create policy "admins manage roadmap mapping"
on public.resource_roadmap_mapping for all
to authenticated
using (
  exists (
    select 1 from public.learning_roadmaps r
    where r.id = resource_roadmap_mapping.roadmap_id
      and public.is_workspace_admin(r.workspace_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.learning_roadmaps r
    where r.id = resource_roadmap_mapping.roadmap_id
      and public.is_workspace_admin(r.workspace_id, auth.uid())
  )
);

insert into public.tools (name, slug, description, enabled)
values ('Resources', 'resources', 'Browse a shared catalog of guides, tools, and learning roadmaps.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- down migration:
-- delete from public.tools where slug = 'resources';
-- drop policy if exists "admins manage roadmap mapping" on public.resource_roadmap_mapping;
-- drop policy if exists "workspace members read roadmap mapping" on public.resource_roadmap_mapping;
-- drop policy if exists "creator or admin delete resources" on public.resources;
-- drop policy if exists "creator or admin manage resources" on public.resources;
-- drop policy if exists "workspace members create resources" on public.resources;
-- drop policy if exists "workspace members read resources" on public.resources;
-- drop policy if exists "admins manage roadmaps" on public.learning_roadmaps;
-- drop policy if exists "workspace members read roadmaps" on public.learning_roadmaps;
-- drop trigger if exists resources_touch_updated_at on public.resources;
-- drop table if exists public.resource_roadmap_mapping;
-- drop table if exists public.resources;
-- drop table if exists public.learning_roadmaps;
