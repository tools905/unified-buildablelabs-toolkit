-- Content Board: when an admin reviews an idea in Ideas or Feedback, they choose what happens once the
-- team has made the changes: the team moves it on to Shortlisted themselves ('shortlist'), or it comes
-- back to the admin for another look ('review'), in which case a team member marks the changes done.

alter table public.content_ideas
  add column if not exists after_changes text check (after_changes in ('shortlist', 'review')),
  add column if not exists changes_done_at timestamptz,
  add column if not exists changes_done_by uuid references public.profiles(id) on delete set null;

-- Bell notifications for a Pencil review (to the people assigned) and for "changes done" (to admins).
alter type public.notification_type add value if not exists 'content_idea_markup';
alter type public.notification_type add value if not exists 'content_idea_changes_done';

-- Rollback:
-- alter table public.content_ideas drop column if exists after_changes, drop column if exists changes_done_at, drop column if exists changes_done_by;
-- (Enum values can't be dropped; they are harmless if unused.)
