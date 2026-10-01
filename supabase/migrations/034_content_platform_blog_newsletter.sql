-- Adds "blog" and "newsletter" as Content Board platforms.
-- Run this file on its own (new enum values can't be used in the same transaction that adds them).
alter type public.content_platform add value if not exists 'blog';
alter type public.content_platform add value if not exists 'newsletter';

-- Rollback: Postgres cannot drop a single enum value. Move any ideas off these platforms
-- first; the values themselves can stay unused.
