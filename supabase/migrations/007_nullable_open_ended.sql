-- Make strengths, improvements, and specific_example nullable in review_responses
alter table public.review_responses
  alter column strengths drop not null,
  alter column improvements drop not null,
  alter column specific_example drop not null;
