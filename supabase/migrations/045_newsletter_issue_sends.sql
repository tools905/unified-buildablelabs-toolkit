-- Newsletter email capture, step 5: emailing a published Times post to confirmed subscribers,
-- and recording delivery, opens and clicks from Resend's webhooks.

-- Sends: one per emailed issue ------------------------------------------------------------

create table public.newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Kept when the post is later deleted, so the send's history and numbers survive.
  post_id uuid references public.newsletter_posts(id) on delete set null,
  post_title text not null,
  post_slug text not null,
  subject text not null,
  preview_text text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  recipient_count integer not null default 0,
  -- Whoever is sending this issue's batches holds it until this time, so two runs never send
  -- the same batch.
  locked_until timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A post is emailed once. A cancelled send does not count, so the post can be scheduled again.
create unique index newsletter_sends_post_idx
  on public.newsletter_sends(post_id)
  where post_id is not null and status <> 'cancelled';

create index newsletter_sends_status_idx on public.newsletter_sends(status, scheduled_at);

create trigger newsletter_sends_touch_updated_at
before update on public.newsletter_sends
for each row execute function public.touch_updated_at();

alter table public.newsletter_sends enable row level security;

-- Written only by the toolkit's server (after an admin check) and the cron, with the service role.
create policy "workspace members read newsletter sends"
on public.newsletter_sends for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- Deliveries: which send an email belongs to, and what Resend reported about it --------------

alter table public.newsletter_deliveries
  add column send_id uuid references public.newsletter_sends(id) on delete cascade,
  add column delivered_at timestamptz,
  add column first_opened_at timestamptz,
  add column first_clicked_at timestamptz;

-- One email per subscriber per issue. Emails that belong to no issue (confirmation, welcome)
-- have no send_id, and nulls never clash.
alter table public.newsletter_deliveries
  add constraint newsletter_deliveries_send_subscriber_key unique (send_id, subscriber_id);

create index newsletter_deliveries_send_status_idx
  on public.newsletter_deliveries(send_id, status)
  where send_id is not null;

-- Events: raw delivery/open/click/bounce/complaint events from Resend ------------------------

create table public.newsletter_email_events (
  id uuid primary key default gen_random_uuid(),
  -- Resend's webhook message id; a retried webhook is recorded once.
  provider_event_id text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delivery_id uuid not null references public.newsletter_deliveries(id) on delete cascade,
  type text not null,
  url text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index newsletter_email_events_delivery_idx on public.newsletter_email_events(delivery_id);
create index newsletter_email_events_created_at_idx on public.newsletter_email_events(created_at);

alter table public.newsletter_email_events enable row level security;

create policy "workspace admins read newsletter email events"
on public.newsletter_email_events for select
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

-- Starting a send ---------------------------------------------------------------------------

-- Moves a due send to 'sending' and fixes its recipient list in one step: everyone confirmed at
-- this moment gets a queued email. Returns the number of recipients, or null when the send was
-- not due or another run already started it.
create or replace function public.newsletter_start_send(p_send_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_count integer;
begin
  update public.newsletter_sends
  set status = 'sending', started_at = now()
  where id = p_send_id and status = 'scheduled' and scheduled_at <= now()
  returning workspace_id into v_workspace;

  if v_workspace is null then
    return null;
  end if;

  insert into public.newsletter_deliveries (workspace_id, subscriber_id, send_id, kind, status)
  select v_workspace, s.id, p_send_id, 'issue', 'queued'
  from public.newsletter_subscribers s
  where s.workspace_id = v_workspace and s.status = 'active';

  get diagnostics v_count = row_count;

  update public.newsletter_sends set recipient_count = v_count where id = p_send_id;
  return v_count;
end;
$$;

revoke all on function public.newsletter_start_send(uuid) from public, anon, authenticated;
grant execute on function public.newsletter_start_send(uuid) to service_role;

-- Per-send totals for the Sends page --------------------------------------------------------

create view public.newsletter_send_stats
with (security_invoker = true)
as
select
  d.send_id,
  count(*)::int as recipients,
  count(*) filter (where d.status in ('sent', 'delivered', 'bounced', 'complained'))::int as sent,
  count(d.delivered_at)::int as delivered,
  count(d.first_opened_at)::int as opened,
  count(d.first_clicked_at)::int as clicked,
  count(*) filter (where d.status = 'bounced')::int as bounced,
  count(*) filter (where d.status = 'complained')::int as complained,
  count(*) filter (where d.status = 'failed')::int as failed,
  count(*) filter (where d.status = 'skipped')::int as skipped,
  count(*) filter (where d.status = 'queued')::int as queued,
  count(*) filter (where s.status = 'unsubscribed' and s.unsubscribed_at >= ns.started_at)::int as unsubscribed
from public.newsletter_deliveries d
join public.newsletter_sends ns on ns.id = d.send_id
join public.newsletter_subscribers s on s.id = d.subscriber_id
where d.send_id is not null
group by d.send_id;

-- down migration:
-- drop view if exists public.newsletter_send_stats;
-- drop function if exists public.newsletter_start_send(uuid);
-- drop table if exists public.newsletter_email_events;
-- drop index if exists public.newsletter_deliveries_send_status_idx;
-- alter table public.newsletter_deliveries drop constraint if exists newsletter_deliveries_send_subscriber_key;
-- alter table public.newsletter_deliveries
--   drop column if exists first_clicked_at,
--   drop column if exists first_opened_at,
--   drop column if exists delivered_at,
--   drop column if exists send_id;
-- drop table if exists public.newsletter_sends;
