-- Make communication_rating, reliability_rating, and ownership_rating nullable
alter table public.review_responses
  alter column communication_rating drop not null,
  alter column reliability_rating drop not null,
  alter column ownership_rating drop not null;
