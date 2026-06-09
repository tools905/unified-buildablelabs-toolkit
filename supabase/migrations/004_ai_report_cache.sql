-- Add AI caching columns to review_rounds
alter table public.review_rounds
  add column ai_overall_summary text,
  add column ai_member_summaries jsonb,
  add column ai_role_weights jsonb;
