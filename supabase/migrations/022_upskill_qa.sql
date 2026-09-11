create table public.qa_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  roadmap_id uuid not null references public.learning_roadmaps(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  total_questions integer not null default 6,
  turns jsonb not null default '[]'::jsonb,
  score integer,
  summary jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one in-progress session per user per roadmap, so a refresh resumes
-- the existing session instead of starting (and AI-generating) a duplicate one.
create unique index qa_attempts_one_in_progress_idx
  on public.qa_attempts(user_id, roadmap_id)
  where status = 'in_progress';

create index qa_attempts_user_history_idx
  on public.qa_attempts(user_id, roadmap_id, created_at desc);

create trigger qa_attempts_touch_updated_at
before update on public.qa_attempts
for each row execute function public.touch_updated_at();

alter table public.qa_attempts enable row level security;

-- Owner-only by design: Q&A results are private, no admin/manager visibility.
create policy "owner reads own qa attempts"
on public.qa_attempts for select
to authenticated
using (user_id = auth.uid());

create policy "owner starts own qa attempts"
on public.qa_attempts for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id, auth.uid())
);

create policy "owner updates own qa attempts"
on public.qa_attempts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

update public.tools set name = 'Upskill', updated_at = now() where slug = 'resources';

-- down migration:
-- update public.tools set name = 'Resources', updated_at = now() where slug = 'resources';
-- drop policy if exists "owner updates own qa attempts" on public.qa_attempts;
-- drop policy if exists "owner starts own qa attempts" on public.qa_attempts;
-- drop policy if exists "owner reads own qa attempts" on public.qa_attempts;
-- drop trigger if exists qa_attempts_touch_updated_at on public.qa_attempts;
-- drop index if exists public.qa_attempts_user_history_idx;
-- drop index if exists public.qa_attempts_one_in_progress_idx;
-- drop table if exists public.qa_attempts;
