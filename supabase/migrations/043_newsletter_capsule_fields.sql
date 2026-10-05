-- Fields the writing box needs for capsule publishing (Medium and Substack copies of a post):
--   tags         topics to enter on the other platforms (up to 5), separate from the website's one-word "desk" tag
--   original_url the address of the original post on our own site, used as the canonical link on the copies
alter table public.newsletter_posts
  add column if not exists tags text[] not null default '{}',
  add column if not exists original_url text;

-- Rollback: alter table public.newsletter_posts drop column tags, drop column original_url;
