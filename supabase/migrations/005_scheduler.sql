-- Enable pg_cron and pg_net extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Create system_settings table to store App URL and Cron Secret safely
create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS (Row Level Security) on system_settings
alter table public.system_settings enable row level security;

-- Do NOT create any policies. This leaves the table completely inaccessible
-- via the PostgREST API (anonymous and authenticated client users),
-- but fully accessible to postgres / security definer functions.

-- Add updated_at trigger
create trigger system_settings_touch_updated_at
before update on public.system_settings
for each row execute function public.touch_updated_at();

-- Insert default placeholder values
insert into public.system_settings (key, value, description) values
  ('app_url', 'http://localhost:3000', 'The base URL of the Next.js application'),
  ('cron_secret', '', 'The secret key to authorize cron request triggers')
on conflict (key) do nothing;

-- Create function to trigger the daily cron
create or replace function public.trigger_daily_cron()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_url text;
  secret text;
  request_id text;
begin
  select value into target_url from public.system_settings where key = 'app_url';
  select value into secret from public.system_settings where key = 'cron_secret';
  
  if target_url is null or target_url = '' or secret is null or secret = '' then
    raise warning 'app_url or cron_secret is not configured in system_settings';
    return null;
  end if;

  -- Trim trailing slash if present
  target_url := rtrim(target_url, '/');

  -- Trigger the HTTP GET request asynchronously via pg_net
  select net.http_get(
    url := target_url || '/api/cron/daily',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret)
  )::text into request_id;

  return request_id;
end;
$$;

-- Schedule the cron job to run every day at 3:30 AM
-- Note: 'cron.schedule' runs as the superuser, triggering trigger_daily_cron.
-- We safely unschedule first if it already exists to allow re-applying migrations.
select cron.unschedule('daily-review-cron') where exists (
  select 1 from cron.job where jobname = 'daily-review-cron'
);

select cron.schedule(
  'daily-review-cron',
  '30 3 * * *',
  'select public.trigger_daily_cron();'
);
