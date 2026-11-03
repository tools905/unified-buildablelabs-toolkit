-- Everything made with an Export button (the board's PDF, the tickets CSV), listed under
-- Settings → Downloads for the whole workspace. The file stays in storage for 30 days, then the
-- daily cleanup removes it and the row stays as history ("Expired"). Deleting a download removes
-- the row and the file for good.
create table if not exists public.downloads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('board_pdf', 'tickets_csv')),
  name text not null,
  file_name text not null,
  storage_path text,
  size_bytes bigint not null default 0,
  -- What was exported: dates, columns, how many posts/pages/tickets.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists downloads_workspace_created_idx on public.downloads (workspace_id, created_at desc);
create index if not exists downloads_expiry_idx on public.downloads (expires_at) where storage_path is not null;

alter table public.downloads enable row level security;

drop policy if exists "members read downloads" on public.downloads;
create policy "members read downloads" on public.downloads
for select using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "members add own downloads" on public.downloads;
create policy "members add own downloads" on public.downloads
for insert with check (created_by = auth.uid() and public.is_workspace_member(workspace_id, auth.uid()));

-- The person who made it, or an admin.
drop policy if exists "owner or admin deletes downloads" on public.downloads;
create policy "owner or admin deletes downloads" on public.downloads
for delete using (
  public.is_workspace_member(workspace_id, auth.uid())
  and (created_by = auth.uid() or public.is_workspace_admin(workspace_id, auth.uid()))
);
