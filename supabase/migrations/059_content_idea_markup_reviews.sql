-- Content Board: Pencil reviews. A reviewer draws straight onto the pages of a draft (Apple Pencil on an
-- iPad, or a mouse) and submits; the marks are kept as a layer on that draft rather than as a new upload,
-- so the team's uploads stay the only drafts. Only pages that were drawn on are stored.

create table if not exists public.content_idea_reviews (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The files of the draft that was reviewed, in order.
  file_ids uuid[] not null default '{}',
  note text check (note is null or char_length(note) <= 3000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One page of a review: which file and page, and the strokes drawn on it. Points are stored relative to
-- the page (0 to 1 across and down), so the marks line up at any size, on screen or in the PDF.
create table if not exists public.content_idea_review_pages (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.content_idea_reviews(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attachment_id uuid not null references public.content_idea_attachments(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  strokes jsonb not null default '[]'::jsonb,
  unique (review_id, attachment_id, page_number)
);

create index if not exists content_idea_reviews_idea_idx on public.content_idea_reviews(idea_id, created_at desc);
create index if not exists content_idea_review_pages_review_idx on public.content_idea_review_pages(review_id);

alter table public.content_idea_reviews enable row level security;
alter table public.content_idea_review_pages enable row level security;

create policy "workspace members read pencil reviews" on public.content_idea_reviews for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members add pencil reviews" on public.content_idea_reviews for insert to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
  and exists (select 1 from public.content_ideas i where i.id = idea_id and i.workspace_id = content_idea_reviews.workspace_id)
);
create policy "author or admin remove pencil reviews" on public.content_idea_reviews for delete to authenticated
using (created_by = auth.uid() or public.is_workspace_admin(workspace_id, auth.uid()));

create policy "workspace members read pencil review pages" on public.content_idea_review_pages for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "reviewer adds pencil review pages" on public.content_idea_review_pages for insert to authenticated
with check (
  exists (
    select 1 from public.content_idea_reviews r
    where r.id = review_id and r.created_by = auth.uid() and r.workspace_id = content_idea_review_pages.workspace_id
  )
);

-- Like every other table outside the Content Board's own: closed to MCP connector tokens (see 057).
create policy "connector tokens blocked" on public.content_idea_reviews as restrictive for all to authenticated
using (not public.is_connector_token()) with check (not public.is_connector_token());
create policy "connector tokens blocked" on public.content_idea_review_pages as restrictive for all to authenticated
using (not public.is_connector_token()) with check (not public.is_connector_token());

-- Rollback:
-- drop table if exists public.content_idea_review_pages;
-- drop table if exists public.content_idea_reviews;
