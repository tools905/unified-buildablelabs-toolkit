-- Which app a file came through, when it was not added on the board itself (for example uploaded from a
-- connected AI app). Empty means it was added on the board. The board shows it as "uploaded by Name
-- through App" on the file and in the activity list.
alter table public.content_idea_attachments
  add column if not exists uploaded_via text
  check (uploaded_via is null or char_length(uploaded_via) between 1 and 60);

-- Rollback: alter table public.content_idea_attachments drop column uploaded_via;
