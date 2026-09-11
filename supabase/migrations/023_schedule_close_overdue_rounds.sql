-- /api/cron/close-overdue-rounds has existed since the peer-review core
-- schema but was never actually scheduled, so overdue rounds never got
-- marked overdue, summarized to admins, or auto-closed in production.
select cron.schedule(
  'toolkit-close-overdue-rounds',
  '0 4 * * *',
  $$select public.invoke_toolkit_cron('/api/cron/close-overdue-rounds');$$
);

-- down migration:
-- select cron.unschedule('toolkit-close-overdue-rounds');
