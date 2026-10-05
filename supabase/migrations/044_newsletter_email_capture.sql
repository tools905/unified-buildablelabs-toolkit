-- Newsletter email capture, step 1: double opt-in subscribers, a record of every email sent
-- to them, and rate limits for the public subscribe endpoint.

-- Subscribers ------------------------------------------------------------------------------

alter table public.newsletter_subscribers
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column status text not null default 'pending'
    check (status in ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
  add column source text
    check (source in ('cta_block', 'inline_prompt', 'side_rail', 'popup', 'legacy', 'unknown')),
  add column source_path text,
  add column source_post_slug text,
  add column consent_at timestamptz,
  add column consent_version text,
  add column confirmed_at timestamptz,
  add column unsubscribed_at timestamptz,
  add column confirm_token_hash text,
  add column confirm_token_expires_at timestamptz,
  add column confirmation_sent_at timestamptz,
  add column confirmation_attempts smallint not null default 0,
  add column updated_at timestamptz not null default now();

-- Everyone who signed up through the old single opt-in form must confirm again before they
-- receive anything (they get one re-confirmation email in a later step).
update public.newsletter_subscribers
set source = 'legacy', consent_at = created_at
where source is null;

update public.newsletter_subscribers s
set workspace_id = w.id
from (select id from public.workspaces where name = 'BuildableLabs' limit 1) w
where s.workspace_id is null;

alter table public.newsletter_subscribers
  alter column workspace_id set not null,
  alter column source set default 'unknown',
  alter column source set not null,
  alter column consent_at set default now(),
  alter column consent_at set not null;

create unique index newsletter_subscribers_confirm_token_idx
  on public.newsletter_subscribers(confirm_token_hash)
  where confirm_token_hash is not null;

create index newsletter_subscribers_workspace_status_idx
  on public.newsletter_subscribers(workspace_id, status);

create trigger newsletter_subscribers_touch_updated_at
before update on public.newsletter_subscribers
for each row execute function public.touch_updated_at();

-- Subscribers are written only by the public endpoints (service role); admins can read them.
create policy "workspace admins read newsletter subscribers"
on public.newsletter_subscribers for select
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

-- Deliveries: one row per email sent to a subscriber ----------------------------------------

create table public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reconfirmation', 'lead_magnet', 'welcome', 'sequence', 'issue')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  provider_message_id text unique,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index newsletter_deliveries_subscriber_idx
  on public.newsletter_deliveries(subscriber_id, created_at desc);

alter table public.newsletter_deliveries enable row level security;

create policy "workspace admins read newsletter deliveries"
on public.newsletter_deliveries for select
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

-- Rate limits for the public subscribe endpoint ---------------------------------------------

create table public.newsletter_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.newsletter_rate_limits enable row level security;
-- No policies: only the security definer function below touches this table.

-- Counts one hit against a fixed time window and says whether it is still within the limit.
-- Buckets are hashed by the app, so no raw IP or email address is stored here.
create or replace function public.newsletter_hit_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.newsletter_rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set hits = public.newsletter_rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

revoke all on function public.newsletter_hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.newsletter_hit_rate_limit(text, integer, integer) to service_role;

-- Scheduled jobs ----------------------------------------------------------------------------

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname in ('toolkit-newsletter-queue', 'toolkit-newsletter-cleanup')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

-- Retries confirmation emails that failed to send (later steps add the follow-up sequence and
-- issue sends to the same job).
select cron.schedule(
  'toolkit-newsletter-queue',
  '*/5 * * * *',
  $$select public.invoke_toolkit_cron('/api/cron/newsletter');$$
);

-- Deletes subscribers who never confirmed and old rate-limit counters.
select cron.schedule(
  'toolkit-newsletter-cleanup',
  '45 2 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/newsletter?task=cleanup');$$
);

-- down migration:
-- select cron.unschedule('toolkit-newsletter-cleanup');
-- select cron.unschedule('toolkit-newsletter-queue');
-- drop function if exists public.newsletter_hit_rate_limit(text, integer, integer);
-- drop table if exists public.newsletter_rate_limits;
-- drop table if exists public.newsletter_deliveries;
-- drop policy if exists "workspace admins read newsletter subscribers" on public.newsletter_subscribers;
-- drop trigger if exists newsletter_subscribers_touch_updated_at on public.newsletter_subscribers;
-- drop index if exists public.newsletter_subscribers_workspace_status_idx;
-- drop index if exists public.newsletter_subscribers_confirm_token_idx;
-- alter table public.newsletter_subscribers
--   drop column if exists updated_at,
--   drop column if exists confirmation_attempts,
--   drop column if exists confirmation_sent_at,
--   drop column if exists confirm_token_expires_at,
--   drop column if exists confirm_token_hash,
--   drop column if exists unsubscribed_at,
--   drop column if exists confirmed_at,
--   drop column if exists consent_version,
--   drop column if exists consent_at,
--   drop column if exists source_post_slug,
--   drop column if exists source_path,
--   drop column if exists source,
--   drop column if exists status,
--   drop column if exists workspace_id;
