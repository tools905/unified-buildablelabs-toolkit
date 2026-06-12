create table if not exists public.linkedin_tracked_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  member_role text not null default 'other' check (member_role in ('founder', 'marketer', 'developer', 'designer', 'intern', 'content_creator', 'other')),
  linkedin_profile_url text not null,
  monthly_post_target integer not null default 12 check (monthly_post_target > 0),
  volume_weight numeric not null default 0.45,
  quality_weight numeric not null default 0.55,
  tracking_status text not null default 'pending' check (tracking_status in ('pending', 'active', 'paused', 'fetch_failed', 'profile_private', 'invalid_url')),
  connector_preference text not null default 'mock' check (connector_preference in ('linkedin_oauth', 'fallback', 'third_party_api', 'mock')),
  last_sync_at timestamptz,
  last_sync_error text,
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, linkedin_profile_url),
  unique(workspace_id, profile_id),
  constraint linkedin_tracked_members_weights_sum check (abs((volume_weight + quality_weight) - 1) < 0.001)
);

create table if not exists public.linkedin_analysis_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint linkedin_analysis_windows_valid_dates check (end_date > start_date)
);

create table if not exists public.linkedin_activities (
  id uuid primary key default gen_random_uuid(),
  tracked_member_id uuid not null references public.linkedin_tracked_members(id) on delete cascade,
  external_id text,
  linkedin_url text,
  activity_type text not null check (activity_type in ('original_post', 'repost', 'comment', 'reaction', 'unknown')),
  text_content text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw_payload jsonb,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  unique(tracked_member_id, external_id)
);

create table if not exists public.linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  tracked_member_id uuid not null references public.linkedin_tracked_members(id) on delete cascade,
  activity_id uuid references public.linkedin_activities(id) on delete set null,
  external_post_id text,
  post_url text,
  post_text text not null,
  posted_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique(tracked_member_id, external_post_id)
);

create unique index if not exists linkedin_posts_member_url_idx
on public.linkedin_posts(tracked_member_id, post_url)
where post_url is not null;

create table if not exists public.linkedin_post_scores (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.linkedin_posts(id) on delete cascade,
  total_score numeric not null,
  hook_score numeric not null,
  clarity_score numeric not null,
  specificity_score numeric not null,
  originality_score numeric not null,
  reader_value_score numeric not null,
  depth_score numeric not null,
  relevance_score numeric not null,
  storytelling_score numeric not null,
  authority_score numeric not null,
  engagement_score numeric not null,
  writing_quality_score numeric not null,
  archetype text not null,
  ai_summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  improvement_suggestions jsonb not null default '[]'::jsonb,
  raw_ai_response jsonb,
  provider text,
  model_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.linkedin_score_overrides (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.linkedin_posts(id) on delete cascade,
  overridden_by uuid references public.profiles(id) on delete set null,
  total_score numeric,
  archetype text,
  admin_notes text,
  exclude_from_quality_average boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.linkedin_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  start_date timestamptz not null,
  end_date timestamptz not null,
  report_json jsonb not null default '{}'::jsonb,
  report_summary text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id, start_date, end_date)
);

create table if not exists public.linkedin_sync_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tracked_member_id uuid references public.linkedin_tracked_members(id) on delete set null,
  job_type text not null,
  status text not null check (status in ('started', 'success', 'failed', 'partial')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.linkedin_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  default_monthly_post_target integer not null default 12 check (default_monthly_post_target > 0),
  default_volume_weight numeric not null default 0.45,
  default_quality_weight numeric not null default 0.55,
  connector_preference text not null default 'mock' check (connector_preference in ('linkedin_oauth', 'fallback', 'third_party_api', 'mock')),
  weekly_reports_enabled boolean not null default true,
  member_insights_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint linkedin_settings_weights_sum check (abs((default_volume_weight + default_quality_weight) - 1) < 0.001)
);

create index if not exists linkedin_tracked_members_workspace_idx on public.linkedin_tracked_members(workspace_id, is_active);
create index if not exists linkedin_posts_member_date_idx on public.linkedin_posts(tracked_member_id, posted_at desc);
create index if not exists linkedin_sync_logs_workspace_date_idx on public.linkedin_sync_logs(workspace_id, created_at desc);

create trigger linkedin_tracked_members_touch_updated_at before update on public.linkedin_tracked_members
for each row execute function public.touch_updated_at();
create trigger linkedin_settings_touch_updated_at before update on public.linkedin_settings
for each row execute function public.touch_updated_at();

alter table public.linkedin_tracked_members enable row level security;
alter table public.linkedin_analysis_windows enable row level security;
alter table public.linkedin_activities enable row level security;
alter table public.linkedin_posts enable row level security;
alter table public.linkedin_post_scores enable row level security;
alter table public.linkedin_score_overrides enable row level security;
alter table public.linkedin_weekly_reports enable row level security;
alter table public.linkedin_sync_logs enable row level security;
alter table public.linkedin_settings enable row level security;

create policy "linkedin admins manage tracked members" on public.linkedin_tracked_members for all to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));
create policy "linkedin members read own tracking" on public.linkedin_tracked_members for select to authenticated
using (profile_id = auth.uid() and public.is_workspace_member(workspace_id, auth.uid()));

create policy "linkedin admins manage windows" on public.linkedin_analysis_windows for all to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "linkedin users read permitted activities" on public.linkedin_activities for select to authenticated
using (exists (select 1 from public.linkedin_tracked_members tm where tm.id = tracked_member_id and (public.is_workspace_admin(tm.workspace_id, auth.uid()) or tm.profile_id = auth.uid())));
create policy "linkedin users read permitted posts" on public.linkedin_posts for select to authenticated
using (exists (select 1 from public.linkedin_tracked_members tm where tm.id = tracked_member_id and (public.is_workspace_admin(tm.workspace_id, auth.uid()) or tm.profile_id = auth.uid())));
create policy "linkedin users read permitted scores" on public.linkedin_post_scores for select to authenticated
using (exists (select 1 from public.linkedin_posts p join public.linkedin_tracked_members tm on tm.id = p.tracked_member_id where p.id = post_id and (public.is_workspace_admin(tm.workspace_id, auth.uid()) or tm.profile_id = auth.uid())));

create policy "linkedin admins manage overrides" on public.linkedin_score_overrides for all to authenticated
using (exists (select 1 from public.linkedin_posts p join public.linkedin_tracked_members tm on tm.id = p.tracked_member_id where p.id = post_id and public.is_workspace_admin(tm.workspace_id, auth.uid())))
with check (exists (select 1 from public.linkedin_posts p join public.linkedin_tracked_members tm on tm.id = p.tracked_member_id where p.id = post_id and public.is_workspace_admin(tm.workspace_id, auth.uid())));

create policy "linkedin admins read reports" on public.linkedin_weekly_reports for select to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));
create policy "linkedin admins read sync logs" on public.linkedin_sync_logs for select to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));
create policy "linkedin admins manage settings" on public.linkedin_settings for all to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));
create policy "linkedin members read settings" on public.linkedin_settings for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
