create type public.ticket_status as enum (
  'backlog',
  'assigned',
  'in_progress',
  'in_review',
  'done'
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.ticket_status not null default 'backlog',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  due_date timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index tickets_workspace_status_idx on public.tickets(workspace_id, status);
create index tickets_assigned_to_idx on public.tickets(assigned_to, workspace_id);
create index tickets_due_date_idx on public.tickets(due_date);
create index tickets_created_at_idx on public.tickets(created_at desc);
create index ticket_comments_ticket_id_idx on public.ticket_comments(ticket_id, created_at desc);

create trigger tickets_touch_updated_at
before update on public.tickets
for each row execute function public.touch_updated_at();

alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;

create policy "workspace members read tickets"
on public.tickets for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create tickets"
on public.tickets for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and created_by = auth.uid()
);

create policy "assignee or admin update tickets"
on public.tickets for update
to authenticated
using (
  assigned_to = auth.uid()
  or public.is_workspace_admin(workspace_id, auth.uid())
)
with check (
  assigned_to = auth.uid()
  or public.is_workspace_admin(workspace_id, auth.uid())
);

create policy "admins delete tickets"
on public.tickets for delete
to authenticated
using (public.is_workspace_admin(workspace_id, auth.uid()));

create policy "workspace members read ticket comments"
on public.ticket_comments for select
to authenticated
using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_comments.ticket_id
      and public.is_workspace_member(t.workspace_id, auth.uid())
  )
);

create policy "workspace members write own ticket comments"
on public.ticket_comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_comments.ticket_id
      and public.is_workspace_member(t.workspace_id, auth.uid())
  )
);

insert into public.tools (name, slug, description, enabled)
values ('Tickets', 'tickets', 'Track work as tickets across backlog, in progress, and done.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- down migration:
-- drop policy if exists "workspace members write own ticket comments" on public.ticket_comments;
-- drop policy if exists "workspace members read ticket comments" on public.ticket_comments;
-- drop policy if exists "admins delete tickets" on public.tickets;
-- drop policy if exists "assignee or admin update tickets" on public.tickets;
-- drop policy if exists "workspace members create tickets" on public.tickets;
-- drop policy if exists "workspace members read tickets" on public.tickets;
-- drop trigger if exists tickets_touch_updated_at on public.tickets;
-- delete from public.tools where slug = 'tickets';
-- drop table if exists public.ticket_comments;
-- drop table if exists public.tickets;
-- drop type if exists public.ticket_status;
