drop index if exists public.content_ideas_assigned_to_idx;
alter table public.content_ideas drop column if exists assigned_to;

-- down migration:
-- alter table public.content_ideas add column assigned_to uuid references public.profiles(id) on delete set null;
-- create index content_ideas_assigned_to_idx on public.content_ideas(assigned_to, workspace_id);
