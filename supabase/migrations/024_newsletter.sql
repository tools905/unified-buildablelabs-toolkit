create table public.newsletter_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  deck text,
  body text not null default '',
  author_ids uuid[] not null default '{}'::uuid[],
  slug text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index newsletter_posts_workspace_slug_idx
  on public.newsletter_posts(workspace_id, slug)
  where slug is not null;

create index newsletter_posts_workspace_status_idx
  on public.newsletter_posts(workspace_id, status, published_at desc);

create index newsletter_posts_created_at_idx on public.newsletter_posts(created_at desc);

create trigger newsletter_posts_touch_updated_at
before update on public.newsletter_posts
for each row execute function public.touch_updated_at();

alter table public.newsletter_posts enable row level security;

create policy "workspace members read newsletter posts"
on public.newsletter_posts for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create newsletter posts"
on public.newsletter_posts for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "workspace members update newsletter posts"
on public.newsletter_posts for update
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));

create policy "admins delete newsletter posts"
on public.newsletter_posts for delete
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

insert into public.tools (name, slug, description, enabled)
values ('Newsletter', 'newsletter', 'Write and publish newsletter issues for the agency website.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- down migration:
-- delete from public.tools where slug = 'newsletter';
-- drop policy if exists "admins delete newsletter posts" on public.newsletter_posts;
-- drop policy if exists "workspace members update newsletter posts" on public.newsletter_posts;
-- drop policy if exists "workspace members create newsletter posts" on public.newsletter_posts;
-- drop policy if exists "workspace members read newsletter posts" on public.newsletter_posts;
-- drop trigger if exists newsletter_posts_touch_updated_at on public.newsletter_posts;
-- drop table if exists public.newsletter_posts;
