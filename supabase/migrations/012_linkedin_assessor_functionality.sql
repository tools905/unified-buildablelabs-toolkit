alter table public.linkedin_settings
add column if not exists analysis_window_days integer not null default 30
check (analysis_window_days between 7 and 365);

alter table public.linkedin_settings
add column if not exists member_submissions_enabled boolean not null default true;

alter table public.linkedin_activities
drop constraint if exists linkedin_activities_activity_type_check;

alter table public.linkedin_activities
add constraint linkedin_activities_activity_type_check
check (activity_type in ('original_post', 'collaborative_post', 'repost', 'comment', 'reaction', 'unknown'));

alter table public.linkedin_posts
add column if not exists post_kind text not null default 'original_post'
check (post_kind in ('original_post', 'collaborative_post'));

alter table public.linkedin_posts
add column if not exists ingestion_source text not null default 'connector'
check (ingestion_source in ('connector', 'manual', 'browser_extension'));

alter table public.linkedin_posts
add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

alter table public.linkedin_posts
add column if not exists collaboration_context text;

alter table public.linkedin_post_scores
add column if not exists scoring_version text not null default 'linkedin-rubric-v1';

create index if not exists linkedin_posts_ingestion_source_idx
on public.linkedin_posts(ingestion_source, created_at desc);

drop policy if exists "linkedin users read permitted activities" on public.linkedin_activities;
create policy "linkedin users read permitted activities" on public.linkedin_activities for select to authenticated
using (exists (
  select 1
  from public.linkedin_tracked_members tm
  left join public.linkedin_settings settings on settings.workspace_id = tm.workspace_id
  where tm.id = tracked_member_id
    and (
      public.is_workspace_admin(tm.workspace_id, auth.uid())
      or (tm.profile_id = auth.uid() and coalesce(settings.member_insights_enabled, true))
    )
));

drop policy if exists "linkedin users read permitted posts" on public.linkedin_posts;
create policy "linkedin users read permitted posts" on public.linkedin_posts for select to authenticated
using (exists (
  select 1
  from public.linkedin_tracked_members tm
  left join public.linkedin_settings settings on settings.workspace_id = tm.workspace_id
  where tm.id = tracked_member_id
    and (
      public.is_workspace_admin(tm.workspace_id, auth.uid())
      or (tm.profile_id = auth.uid() and coalesce(settings.member_insights_enabled, true))
    )
));

drop policy if exists "linkedin users read permitted scores" on public.linkedin_post_scores;
create policy "linkedin users read permitted scores" on public.linkedin_post_scores for select to authenticated
using (exists (
  select 1
  from public.linkedin_posts p
  join public.linkedin_tracked_members tm on tm.id = p.tracked_member_id
  left join public.linkedin_settings settings on settings.workspace_id = tm.workspace_id
  where p.id = post_id
    and (
      public.is_workspace_admin(tm.workspace_id, auth.uid())
      or (tm.profile_id = auth.uid() and coalesce(settings.member_insights_enabled, true))
    )
));

drop policy if exists "linkedin members read permitted overrides" on public.linkedin_score_overrides;
create policy "linkedin members read permitted overrides" on public.linkedin_score_overrides for select to authenticated
using (exists (
  select 1
  from public.linkedin_posts p
  join public.linkedin_tracked_members tm on tm.id = p.tracked_member_id
  left join public.linkedin_settings settings on settings.workspace_id = tm.workspace_id
  where p.id = post_id
    and tm.profile_id = auth.uid()
    and coalesce(settings.member_insights_enabled, true)
));
