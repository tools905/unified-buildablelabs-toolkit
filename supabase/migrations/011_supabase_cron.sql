create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_toolkit_cron(endpoint_path text)
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  app_url text;
  cron_token text;
  request_id bigint;
begin
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'toolkit_app_url'
  limit 1;

  select decrypted_secret into cron_token
  from vault.decrypted_secrets
  where name = 'toolkit_cron_secret'
  limit 1;

  if app_url is null or cron_token is null then
    raise warning 'Toolkit cron skipped: configure toolkit_app_url and toolkit_cron_secret in Supabase Vault.';
    return null;
  end if;

  select net.http_post(
    url := rtrim(app_url, '/') || endpoint_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_token,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_toolkit_cron(text) from public, anon, authenticated;
grant execute on function public.invoke_toolkit_cron(text) to postgres, service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in ('toolkit-daily', 'toolkit-linkedin-daily', 'toolkit-linkedin-weekly')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'toolkit-daily',
  '0 1 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/daily');$$
);

select cron.schedule(
  'toolkit-linkedin-daily',
  '0 2 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/linkedin-daily');$$
);

select cron.schedule(
  'toolkit-linkedin-weekly',
  '0 3 * * 1',
  $$select public.invoke_toolkit_cron('/api/cron/linkedin-weekly');$$
);
