-- `ended_reason` and its constraint were introduced in 024/025, but the
-- qa_attempts table had already been created on some environments outside the
-- migration system, so those never ran there. Written idempotently so it
-- reconciles either state: a database that already went through 024/025, and
-- one where the table exists without the column.
alter table public.qa_attempts add column if not exists ended_reason text;

alter table public.qa_attempts drop constraint if exists qa_attempts_ended_reason_check;

alter table public.qa_attempts
  add constraint qa_attempts_ended_reason_check
  check (ended_reason in ('violation', 'timeout'));

-- down migration:
-- alter table public.qa_attempts drop constraint if exists qa_attempts_ended_reason_check;
-- alter table public.qa_attempts drop column if exists ended_reason;
