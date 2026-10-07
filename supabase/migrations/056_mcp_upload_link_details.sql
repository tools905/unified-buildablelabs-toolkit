-- MCP connector: what an upload link remembers, and the daily clean-up.
--
-- uploaded_via : the name of the app that started the upload. The file that arrives is labelled
--                "uploaded by <person> through <app>" on the board.
-- result       : what the upload produced (the new file's id, name, kind, page count and the id of the file it
--                replaced), so that confirm_upload can report it, and report the same thing if asked twice.

alter table public.mcp_upload_links
  add column if not exists uploaded_via text
    check (uploaded_via is null or char_length(uploaded_via) between 1 and 60),
  add column if not exists result jsonb;

-- Every night: remove upload links that expired or were used a day ago, and call records older than 90 days.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'toolkit-mcp-cleanup'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'toolkit-mcp-cleanup',
  '45 2 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/mcp-cleanup');$$
);

-- Rollback:
-- select cron.unschedule('toolkit-mcp-cleanup');
-- alter table public.mcp_upload_links drop column if exists result, drop column if exists uploaded_via;
