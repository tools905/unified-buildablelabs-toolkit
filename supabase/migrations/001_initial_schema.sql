create extension if not exists pgcrypto;

create type public.workspace_role as enum ('admin', 'member');
create type public.project_status as enum ('draft', 'active', 'completed', 'archived');
create type public.review_cadence as enum ('weekly', 'biweekly', 'final_only', 'custom');
create type public.review_round_status as enum ('planned', 'active', 'completed', 'closed', 'cancelled');
create type public.review_assignment_status as enum ('pending', 'submitted', 'overdue', 'skipped');
create type public.notification_type as enum (
  'invite',
  'round_started',
  'review_reminder',
  'overdue_reminder',
  'admin_overdue_summary',
  'report_ready'
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token text not null unique,
  status text not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete cascade,
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id, email, status)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status public.project_status not null default 'active',
  cadence public.review_cadence not null default 'weekly',
  reviews_per_person integer not null default 0,
  review_due_hours integer not null default 48,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_project_dates check (end_date >= start_date)
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  round_number integer not null,
  scheduled_start_at timestamptz not null,
  due_at timestamptz not null,
  status public.review_round_status not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id, round_number)
);

create table public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.review_rounds(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  status public.review_assignment_status not null default 'pending',
  reminder_count integer not null default 0,
  last_reminded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_review check (reviewer_id <> reviewee_id),
  unique(round_id, reviewer_id, reviewee_id)
);

create table public.review_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.review_assignments(id) on delete cascade,
  strengths text not null,
  improvements text not null,
  communication_rating integer not null check (communication_rating between 1 and 5),
  reliability_rating integer not null check (reliability_rating between 1 and 5),
  ownership_rating integer not null check (ownership_rating between 1 and 5),
  execution_quality_rating integer check (execution_quality_rating between 1 and 5),
  collaboration_rating integer check (collaboration_rating between 1 and 5),
  technical_quality_rating integer check (technical_quality_rating between 1 and 5),
  problem_solving_rating integer check (problem_solving_rating between 1 and 5),
  leadership_rating integer check (leadership_rating between 1 and 5),
  system_design_rating integer check (system_design_rating between 1 and 5),
  learning_growth_rating integer check (learning_growth_rating between 1 and 5),
  specific_example text not null,
  private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  round_id uuid references public.review_rounds(id) on delete cascade,
  assignment_id uuid references public.review_assignments(id) on delete cascade,
  recipient_email text not null,
  type public.notification_type not null,
  status text not null,
  provider_message_id text,
  error_message text,
  sent_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index invites_token_idx on public.invites(token);
create index projects_workspace_id_idx on public.projects(workspace_id);
create index project_members_project_id_idx on public.project_members(project_id);
create index review_rounds_project_status_idx on public.review_rounds(project_id, status);
create index review_assignments_reviewer_idx on public.review_assignments(reviewer_id, status);
create index review_assignments_round_idx on public.review_assignments(round_id, status);
