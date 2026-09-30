-- Links to reference posts (inspiration, competitors, examples) attached to a Content Board idea.
alter table public.content_ideas
  add column if not exists reference_links text[] not null default '{}';

-- Rollback:
-- alter table public.content_ideas drop column if exists reference_links;
