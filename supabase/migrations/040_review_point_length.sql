-- Review comments can now be up to 3000 characters (about 500 words) instead of 500 characters.
do $$
declare
  existing text;
begin
  select conname into existing
  from pg_constraint
  where conrelid = 'public.content_idea_review_points'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%char_length(body)%';
  if existing is not null then
    execute format('alter table public.content_idea_review_points drop constraint %I', existing);
  end if;
end $$;

alter table public.content_idea_review_points
  add constraint content_idea_review_points_body_length check (char_length(body) between 2 and 3000);

-- Rollback: drop the constraint above and re-add `check (char_length(body) between 2 and 500)`.
