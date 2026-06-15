update public.linkedin_tracked_members
set connector_preference = 'fallback'
where connector_preference = 'linkedin_oauth';

update public.linkedin_settings
set connector_preference = 'fallback'
where connector_preference = 'linkedin_oauth';

alter table public.linkedin_tracked_members
drop constraint if exists linkedin_tracked_members_connector_preference_check;

alter table public.linkedin_tracked_members
add constraint linkedin_tracked_members_connector_preference_check
check (connector_preference in ('fallback', 'third_party_api', 'mock'));

alter table public.linkedin_settings
drop constraint if exists linkedin_settings_connector_preference_check;

alter table public.linkedin_settings
add constraint linkedin_settings_connector_preference_check
check (connector_preference in ('fallback', 'third_party_api', 'mock'));
