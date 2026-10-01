-- A "Feedback" column for the Content Board: ideas that have been reviewed wait here while the
-- feedback is dealt with. It sits between "idea" and "approved" (Shortlisted).
-- Run this on its own: a new enum value can't be used until the statement that adds it has finished.
alter type public.content_idea_status add value if not exists 'feedback' before 'approved';

-- Postgres can't remove a single enum value. To undo, move any ideas out of 'feedback' first;
-- the value itself can stay unused.
