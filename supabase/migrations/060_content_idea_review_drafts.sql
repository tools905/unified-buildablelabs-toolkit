-- Content Board: Pencil reviews are saved as the reviewer goes, so a crash, a closed tab or a dead battery
-- doesn't lose the marks. A saved review is private to the person drawing it: nobody else sees it, nobody
-- is told, and the card doesn't move until they press Submit (which turns it into a content_idea_reviews
-- row and removes this one). One saved review per person per draft.

create table if not exists public.content_idea_review_drafts (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- The files of the draft being reviewed, in order.
  file_ids uuid[] not null,
  -- Marked pages: [{ attachmentId, pageNumber, position, strokes }], as they will be submitted.
  pages jsonb not null default '[]'::jsonb,
  note text check (note is null or char_length(note) <= 3000),
  updated_at timestamptz not null default now(),
  unique (idea_id, user_id, file_ids)
);

alter table public.content_idea_review_drafts enable row level security;

create policy "own saved pencil reviews" on public.content_idea_review_drafts for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id, auth.uid())
  and exists (select 1 from public.content_ideas i where i.id = idea_id and i.workspace_id = content_idea_review_drafts.workspace_id)
);

-- Like every other table outside the Content Board's own: closed to MCP connector tokens (see 057).
create policy "connector tokens blocked" on public.content_idea_review_drafts as restrictive for all to authenticated
using (not public.is_connector_token()) with check (not public.is_connector_token());

-- Rollback:
-- drop table if exists public.content_idea_review_drafts;
