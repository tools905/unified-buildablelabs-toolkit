-- Comments on a post (written review points and Pencil reviews) notify the people on it: whoever
-- added the idea, anyone who uploaded a draft, and its assignees. Each comment gets a bell
-- notification; emails are limited per person and post:
--   * in Ideas or Feedback, at most one an hour while comments keep coming;
--   * in Shortlisted, In Progress or Posted, one per stay in that column.
-- This table remembers when each person was last emailed about each post. Only the server (service
-- role) reads or writes it.
alter type public.notification_type add value if not exists 'content_idea_comment';

create table if not exists public.content_comment_emails (
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_sent_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

alter table public.content_comment_emails enable row level security;

-- True when an email may go out now (none sent since `p_since`), and records it in the same step, so
-- two comments at once can't both send one.
create or replace function public.claim_content_comment_email(p_idea uuid, p_user uuid, p_since timestamptz)
returns boolean
language sql
as $$
  with claimed as (
    insert into public.content_comment_emails as sent (idea_id, user_id, last_sent_at)
    values (p_idea, p_user, now())
    on conflict (idea_id, user_id) do update set last_sent_at = now()
    where sent.last_sent_at < p_since
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_content_comment_email(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_content_comment_email(uuid, uuid, timestamptz) to service_role;
