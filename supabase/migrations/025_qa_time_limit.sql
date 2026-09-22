-- Q&A attempts are now time-boxed (see QA_TIME_LIMIT_SECONDS in
-- lib/validation/qa-schema.ts), so an attempt can also be force-completed by
-- running out of time, not just by an anti-cheat violation.
alter table public.qa_attempts drop constraint if exists qa_attempts_ended_reason_check;

alter table public.qa_attempts
  add constraint qa_attempts_ended_reason_check
  check (ended_reason in ('violation', 'timeout'));

-- down migration:
-- alter table public.qa_attempts drop constraint if exists qa_attempts_ended_reason_check;
-- alter table public.qa_attempts
--   add constraint qa_attempts_ended_reason_check
--   check (ended_reason in ('violation'));
