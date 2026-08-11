-- Meetings ingested from Granola (via webhook, see app/api/webhooks/granola).
-- Granola's API only exposes notes once they have a generated summary/transcript,
-- so this is a recap of meetings that already happened, not an upcoming-events feed.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granola_note_id text not null unique,
  title text,
  event_title text,
  summary_text text,
  summary_markdown text,
  attendees jsonb not null default '[]'::jsonb,
  organiser_email text,
  web_url text,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meetings_workspace_start_time_idx on public.meetings(workspace_id, start_time desc);

create trigger meetings_touch_updated_at
before update on public.meetings
for each row execute function public.touch_updated_at();

alter table public.meetings enable row level security;

create policy "workspace members read meetings"
on public.meetings for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- Writes happen only via the Granola webhook handler, using the service-role
-- admin client (bypasses RLS) — no authenticated insert/update policy needed.

select cron.schedule(
  'toolkit-meeting-digest-daily',
  '0 8 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/meeting-digests?type=daily');$$
);

select cron.schedule(
  'toolkit-meeting-digest-weekly',
  '0 17 * * 5',
  $$select public.invoke_toolkit_cron('/api/cron/meeting-digests?type=weekly');$$
);

insert into public.tools (name, slug, description, enabled)
values ('Meetings', 'meetings', 'Recap of past meetings ingested from Granola, with summaries.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- down migration:
-- select cron.unschedule('toolkit-meeting-digest-weekly');
-- select cron.unschedule('toolkit-meeting-digest-daily');
-- drop policy if exists "workspace members read meetings" on public.meetings;
-- drop trigger if exists meetings_touch_updated_at on public.meetings;
-- drop table if exists public.meetings;
