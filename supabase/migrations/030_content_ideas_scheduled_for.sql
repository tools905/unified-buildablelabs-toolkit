-- Planned posting day for a Content Board idea (date only, no time).
alter table public.content_ideas add column if not exists scheduled_for date;

create index if not exists content_ideas_scheduled_for_idx
  on public.content_ideas(workspace_id, scheduled_for)
  where scheduled_for is not null;

-- Rollback:
-- drop index if exists public.content_ideas_scheduled_for_idx;
-- alter table public.content_ideas drop column if exists scheduled_for;
