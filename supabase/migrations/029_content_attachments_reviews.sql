-- Content Board: previews (images / PDF / design links) and review points per idea.

-- When an idea moves into "posted", remember when. Its uploaded files are
-- cleaned up 30 days later by /api/cron/content-cleanup.
alter table public.content_ideas add column if not exists posted_at timestamptz;

update public.content_ideas
set posted_at = updated_at
where status = 'posted' and posted_at is null;

create or replace function public.content_ideas_set_posted_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'posted' and old.status is distinct from 'posted' then
    new.posted_at := now();
  elsif new.status <> 'posted' then
    new.posted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists content_ideas_posted_at on public.content_ideas;
create trigger content_ideas_posted_at
before update on public.content_ideas
for each row execute function public.content_ideas_set_posted_at();

create type public.content_attachment_kind as enum ('image', 'pdf', 'link');

create table public.content_idea_attachments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.content_attachment_kind not null,
  storage_path text,
  thumb_path text,
  url text,
  file_name text,
  size_bytes integer,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint content_attachment_source check (
    (kind = 'link' and url is not null and storage_path is null)
    or (kind <> 'link' and storage_path is not null and url is null)
  )
);

create index content_idea_attachments_idea_idx on public.content_idea_attachments(idea_id, sort_order);

create table public.content_idea_review_points (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  body text not null check (char_length(body) between 2 and 500),
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index content_idea_review_points_idea_idx on public.content_idea_review_points(idea_id, created_at);

alter table public.content_idea_attachments enable row level security;
alter table public.content_idea_review_points enable row level security;

create policy "workspace members read content attachments"
on public.content_idea_attachments for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members add content attachments"
on public.content_idea_attachments for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "workspace members delete content attachments"
on public.content_idea_attachments for delete
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members read review points"
on public.content_idea_review_points for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members add review points"
on public.content_idea_review_points for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "workspace members resolve review points"
on public.content_idea_review_points for update
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));

create policy "author or admin delete review points"
on public.content_idea_review_points for delete
to authenticated
using (
  created_by = auth.uid()
  or public.is_workspace_admin(workspace_id, auth.uid())
);

-- Private storage bucket. Files live at <workspace_id>/<idea_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-attachments',
  'content-attachments',
  false,
  15728640,
  array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "content attachments storage read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'content-attachments'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

create policy "content attachments storage upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'content-attachments'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

create policy "content attachments storage delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'content-attachments'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Daily cleanup of files for ideas posted more than 30 days ago.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'toolkit-content-cleanup'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'toolkit-content-cleanup',
  '30 2 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/content-cleanup');$$
);

-- down migration:
-- select cron.unschedule('toolkit-content-cleanup');
-- drop policy if exists "content attachments storage delete" on storage.objects;
-- drop policy if exists "content attachments storage upload" on storage.objects;
-- drop policy if exists "content attachments storage read" on storage.objects;
-- delete from storage.buckets where id = 'content-attachments';
-- drop table if exists public.content_idea_review_points;
-- drop table if exists public.content_idea_attachments;
-- drop type if exists public.content_attachment_kind;
-- drop trigger if exists content_ideas_posted_at on public.content_ideas;
-- drop function if exists public.content_ideas_set_posted_at();
-- alter table public.content_ideas drop column if exists posted_at;
