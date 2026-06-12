create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_settings (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tool_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tools (name, slug, description, enabled)
values
  ('Peer Review', 'peer-review', 'Create review cycles, collect peer feedback, and generate team reports.', true),
  ('LinkedIn Assessor', 'linkedin-assessor', 'Track LinkedIn posting quality, consistency, and improvement suggestions.', true),
  ('HR Bot', 'hr-bot', 'Answer approved HR, onboarding, policy, and team handbook questions.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  enabled = excluded.enabled,
  updated_at = now();

alter table public.tools enable row level security;
alter table public.tool_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.jobs enable row level security;

create policy "authenticated users can read enabled tools"
on public.tools for select
to authenticated
using (enabled = true);

create policy "users can read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());
