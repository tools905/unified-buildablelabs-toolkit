-- The caption of a content idea: the actual text of the post, as it would be written under the
-- images on Instagram or LinkedIn. Separate from `description`, which is internal notes.
alter table public.content_ideas
  add column if not exists caption text;

-- Rollback: alter table public.content_ideas drop column caption;
