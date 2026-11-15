-- Posting slots: each day takes up to 2 Instagram and 2 LinkedIn posts (Shortlisted, In Progress
-- and Posted ideas count). An idea shortlisted without a posting day goes on the first day from
-- `p_from` with room for its platforms; one for both takes a slot of each on the same day. Ideas for
-- other platforms get no automatic day (the person shortlisting picks one).
alter type public.notification_type add value if not exists 'content_idea_over_limit';

create or replace function public.auto_schedule_idea(p_idea uuid, p_from date)
returns date
language plpgsql
as $$
declare
  v_workspace uuid;
  v_platforms text[];
  v_current date;
  v_instagram boolean;
  v_linkedin boolean;
  v_day date := p_from;
  v_instagram_count int;
  v_linkedin_count int;
begin
  select workspace_id, coalesce(nullif(platforms::text[], '{}'), array[platform::text]), scheduled_for
    into v_workspace, v_platforms, v_current
    from public.content_ideas
    where id = p_idea;
  if v_workspace is null then return null; end if;
  if v_current is not null then return v_current; end if;
  v_instagram := 'instagram' = any(v_platforms);
  v_linkedin := 'linkedin' = any(v_platforms);
  if not (v_instagram or v_linkedin) then return null; end if;

  -- One at a time per workspace, so two ideas shortlisted together can't take the same last slot.
  perform pg_advisory_xact_lock(hashtextextended('posting-slots:' || v_workspace::text, 0));

  loop
    select
      count(*) filter (where 'instagram' = any(coalesce(nullif(platforms::text[], '{}'), array[platform::text]))),
      count(*) filter (where 'linkedin' = any(coalesce(nullif(platforms::text[], '{}'), array[platform::text])))
      into v_instagram_count, v_linkedin_count
      from public.content_ideas
      where workspace_id = v_workspace
        and scheduled_for = v_day
        and status in ('approved', 'in_progress', 'posted')
        and id <> p_idea;
    exit when (not v_instagram or v_instagram_count < 2) and (not v_linkedin or v_linkedin_count < 2);
    v_day := v_day + 1;
    if v_day > p_from + 730 then return null; end if;
  end loop;

  update public.content_ideas set scheduled_for = v_day where id = p_idea and scheduled_for is null;
  return v_day;
end;
$$;

revoke all on function public.auto_schedule_idea(uuid, date) from public, anon;
grant execute on function public.auto_schedule_idea(uuid, date) to authenticated, service_role;
