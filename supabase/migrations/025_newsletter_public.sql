alter table public.newsletter_posts
  add column tag text;

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

-- No client-facing policies: the public subscribe/list endpoints run through
-- the service-role client from a Next.js API route, never the browser client.

-- down migration:
-- drop table if exists public.newsletter_subscribers;
-- alter table public.newsletter_posts drop column if exists tag;
