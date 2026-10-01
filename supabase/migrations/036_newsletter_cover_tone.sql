-- A manual tone for a newsletter post's preview image: how strongly the picture is darkened
-- under the card text, as a percentage. Null means "Auto" (worked out from the picture's brightness).
-- Replaces the old three-step cover_fade, which is left in place unused so the deployed app that
-- still reads it keeps working; drop it later once nothing uses it.
alter table public.newsletter_posts
  add column if not exists cover_tone smallint
    check (cover_tone is null or cover_tone between 20 and 95);

-- down migration:
-- alter table public.newsletter_posts drop column if exists cover_tone;
