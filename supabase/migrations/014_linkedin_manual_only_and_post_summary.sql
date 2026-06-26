alter type public.notification_type add value if not exists 'linkedin_post_summary';

alter table public.linkedin_tracked_members
drop constraint if exists linkedin_tracked_members_connector_preference_check;

alter table public.linkedin_settings
drop constraint if exists linkedin_settings_connector_preference_check;

update public.linkedin_tracked_members
set connector_preference = 'manual'
where connector_preference is distinct from 'manual';

update public.linkedin_settings
set connector_preference = 'manual'
where connector_preference is distinct from 'manual';

alter table public.linkedin_tracked_members
alter column connector_preference set default 'manual';

alter table public.linkedin_settings
alter column connector_preference set default 'manual';

alter table public.linkedin_posts
alter column ingestion_source set default 'manual';

alter table public.linkedin_tracked_members
add constraint linkedin_tracked_members_connector_preference_check
check (connector_preference = 'manual');

alter table public.linkedin_settings
add constraint linkedin_settings_connector_preference_check
check (connector_preference = 'manual');

alter table public.linkedin_posts
drop constraint if exists linkedin_posts_ingestion_source_check;

alter table public.linkedin_posts
add constraint linkedin_posts_ingestion_source_check
check (ingestion_source = 'manual');
