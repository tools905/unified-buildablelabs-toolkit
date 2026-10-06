-- Content Board: remember when (and by whom) an idea last moved to another column, so every column
-- can show its most recent card first and say "Moved to Shortlisted by … · 2h ago".

alter table public.content_ideas
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null;

create or replace function public.content_ideas_set_status_changed()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    -- The signed-in person making the change; empty for background jobs.
    new.status_changed_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists content_ideas_status_changed on public.content_ideas;
create trigger content_ideas_status_changed
before update on public.content_ideas
for each row execute function public.content_ideas_set_status_changed();

-- Existing ideas: take the move from the audit log where it was recorded…
update public.content_ideas i
set status_changed_at = a.created_at,
    status_changed_by = a.actor_id
from (
  select distinct on (entity_id) entity_id, created_at, actor_id, metadata->>'status' as status
  from public.audit_logs
  where action = 'content_idea.updated' and metadata ? 'status'
  order by entity_id, created_at desc
) a
where a.entity_id = i.id
  and a.status = i.status::text
  and i.status_changed_at is null;

-- …otherwise from what is known: when it was posted, or when its first feedback came in.
update public.content_ideas
set status_changed_at = posted_at
where status = 'posted' and status_changed_at is null and posted_at is not null;

update public.content_ideas i
set status_changed_at = first_point.created_at,
    status_changed_by = first_point.created_by
from (
  select distinct on (idea_id) idea_id, created_at, created_by
  from public.content_idea_review_points
  order by idea_id, created_at
) first_point
where first_point.idea_id = i.id
  and i.status = 'feedback'
  and i.status_changed_at is null;

-- Rollback:
-- drop trigger if exists content_ideas_status_changed on public.content_ideas;
-- drop function if exists public.content_ideas_set_status_changed();
-- alter table public.content_ideas drop column if exists status_changed_by, drop column if exists status_changed_at;
