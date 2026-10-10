-- Content Board: a PDF carousel is also kept as one picture per page, drawn once on the server. Phones
-- show these pictures (a few hundred KB) instead of downloading the whole PDF (often 3-4 MB) and
-- drawing every page themselves, which was the slowest part of opening a card.

alter table public.content_idea_attachments
  -- [{ path, width, height }] for the pages drawn so far, in page order.
  add column if not exists page_images jsonb,
  -- How many pages the PDF has (the pictures are complete when there is one per page, up to 30).
  add column if not exists page_count integer,
  -- While the pages are being drawn, so two people opening the card don't both draw them.
  add column if not exists pages_rendering_at timestamptz;

-- Rollback:
-- alter table public.content_idea_attachments drop column if exists page_images, drop column if exists page_count, drop column if exists pages_rendering_at;
