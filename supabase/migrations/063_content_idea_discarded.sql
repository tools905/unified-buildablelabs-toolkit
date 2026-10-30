-- Content Board: anyone on the team can discard an idea that is in Ideas or Feedback. Discarded ideas
-- sit in a "Discarded" column (hidden until opened, between Ideas and Feedback) and can be restored to
-- the column they came from. Admins can delete them for good.

alter type public.content_idea_status add value if not exists 'discarded';

alter table public.content_ideas
  add column if not exists discarded_at timestamptz,
  add column if not exists discarded_by uuid references public.profiles(id) on delete set null,
  add column if not exists discard_reason text check (discard_reason is null or char_length(discard_reason) <= 500),
  -- Where it was when discarded ('idea' or 'feedback'), so Restore puts it back there.
  add column if not exists discarded_from text check (discarded_from is null or discarded_from in ('idea', 'feedback'));

-- Rollback:
-- alter table public.content_ideas drop column if exists discarded_at, drop column if exists discarded_by,
--   drop column if exists discard_reason, drop column if exists discarded_from;
-- (The 'discarded' enum value can't be dropped; move any discarded ideas back first.)
