-- Version history for newsletter posts. Each row is a full copy of a post's content at one
-- point in time, so any version can be compared with another.
--   session        the post as someone left it after changing it
--   published      the post as it was published
alter table public.newsletter_posts
  add column if not exists updated_by uuid references public.profiles(id);

create table public.newsletter_post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.newsletter_posts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('session', 'published')),
  title text not null default '',
  deck text,
  tag text,
  body text not null default '',
  author_ids uuid[] not null default '{}'::uuid[],
  cover_image_url text,
  cover_brightness smallint,
  cover_focus_x smallint not null default 50,
  cover_focus_y smallint not null default 50,
  cover_zoom numeric(3, 2) not null default 1,
  cover_fade text,
  -- Who wrote this content, and who caused the copy to be kept.
  edited_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index newsletter_post_versions_post_idx
  on public.newsletter_post_versions(post_id, created_at desc);

-- A session version is stamped with the time the post was last saved. Two saves racing at the
-- start of a new session would both try to keep the same copy; this lets only one of them in.
create unique index newsletter_post_versions_session_idx
  on public.newsletter_post_versions(post_id, created_at)
  where kind = 'session';

alter table public.newsletter_post_versions enable row level security;

create policy "workspace members read newsletter post versions"
on public.newsletter_post_versions for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create newsletter post versions"
on public.newsletter_post_versions for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

-- down migration:
-- drop policy if exists "workspace members create newsletter post versions" on public.newsletter_post_versions;
-- drop policy if exists "workspace members read newsletter post versions" on public.newsletter_post_versions;
-- drop table if exists public.newsletter_post_versions;
-- alter table public.newsletter_posts drop column if exists updated_by;
