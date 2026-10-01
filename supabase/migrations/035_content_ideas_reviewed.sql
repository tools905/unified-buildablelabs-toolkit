-- Records who marked a Content Board idea as reviewed, and when.
alter table public.content_ideas
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

-- Rollback:
-- alter table public.content_ideas drop column if exists reviewed_by;
-- alter table public.content_ideas drop column if exists reviewed_at;
