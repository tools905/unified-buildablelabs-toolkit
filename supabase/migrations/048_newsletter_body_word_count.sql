-- The public feed shows a reading time on every card. Until now it loaded the whole story text
-- of every listed post just to count its words. Postgres now keeps the count up to date itself,
-- so the feed can read a small number instead of the text.
alter table public.newsletter_posts
  add column if not exists body_word_count integer
    generated always as (
      case
        when btrim(body) = '' then 0
        else coalesce(array_length(regexp_split_to_array(btrim(body), '\s+'), 1), 0)
      end
    ) stored;

-- down migration:
-- alter table public.newsletter_posts drop column if exists body_word_count;
