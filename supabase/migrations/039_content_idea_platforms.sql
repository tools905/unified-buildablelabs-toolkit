-- An idea can now be planned for several platforms (e.g. LinkedIn + Instagram).
-- `platforms` holds all of them; `platform` stays as the first one so older code keeps working.
alter table public.content_ideas
  add column if not exists platforms public.content_platform[] not null default '{}';

update public.content_ideas
set platforms = array[platform]
where cardinality(platforms) = 0;

-- Rollback: alter table public.content_ideas drop column platforms;
