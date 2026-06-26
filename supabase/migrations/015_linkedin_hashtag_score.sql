alter table public.linkedin_post_scores
add column if not exists hashtag_score numeric not null default 0;
