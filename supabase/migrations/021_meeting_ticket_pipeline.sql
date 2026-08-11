-- Links tickets back to the meeting they were auto-extracted from, and
-- tracks which meetings have already been scanned for action items so the
-- daily cron doesn't reprocess them.
alter table public.tickets
  add column linked_meeting_id uuid references public.meetings(id) on delete set null;

create index tickets_linked_meeting_idx on public.tickets(linked_meeting_id);

alter table public.meetings
  add column tickets_extracted_at timestamptz,
  add column extracted_tickets_count integer not null default 0;

select cron.schedule(
  'toolkit-process-new-meetings',
  '30 1 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/process-new-meetings');$$
);

-- down migration:
-- select cron.unschedule('toolkit-process-new-meetings');
-- alter table public.meetings
--   drop column if exists extracted_tickets_count,
--   drop column if exists tickets_extracted_at;
-- drop index if exists tickets_linked_meeting_idx;
-- alter table public.tickets drop column if exists linked_meeting_id;
