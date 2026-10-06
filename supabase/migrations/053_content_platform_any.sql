-- Content Board: "Any" as a platform, for ideas not tied to one platform yet. A new idea saved with no
-- platform picked is stored as "any".
alter type public.content_platform add value if not exists 'any';

-- Rollback: enum values can't be dropped without recreating the type; an unused value is harmless.
