-- Talent Bank: an admin-only place for candidates. People come in two ways: an admin adds them (a
-- resume and a few details), or they apply through the shared application link. Each sits on a shelf:
-- new, later (good, not hiring now), in_process, or rejected. Rejected people, with their files, are
-- deleted for good 60 days later by the daily cleanup. Only admins can see or change any of it; the
-- application link writes through the server (service role) after checking the link is on.
alter type public.notification_type add value if not exists 'talent_application';

create table if not exists public.talent_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email text,
  phone text,
  role text,
  location text,
  linkedin_url text,
  source text,
  notes text,
  -- Portfolio, GitHub, Behance, live work: [{ "url": "...", "label": "..." }]
  links jsonb not null default '[]'::jsonb,
  -- Answers to the application form's open questions: { "built": "...", "why": "..." }
  answers jsonb not null default '{}'::jsonb,
  shelf text not null default 'new' check (shelf in ('new', 'later', 'in_process', 'rejected')),
  added_via text not null default 'manual' check (added_via in ('manual', 'form')),
  reference_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  rejected_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_candidates_workspace_idx on public.talent_candidates (workspace_id, shelf, created_at desc);
create index if not exists talent_candidates_rejected_idx on public.talent_candidates (rejected_at) where shelf = 'rejected';

create table if not exists public.talent_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.talent_candidates(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('resume', 'work')),
  storage_path text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists talent_files_candidate_idx on public.talent_files (candidate_id);

-- The shared application link: one per workspace, switched on or off; a new token replaces the old.
create table if not exists public.talent_form_links (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token text not null unique,
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.talent_candidates enable row level security;
alter table public.talent_files enable row level security;
alter table public.talent_form_links enable row level security;

drop policy if exists "admins manage candidates" on public.talent_candidates;
create policy "admins manage candidates" on public.talent_candidates
for all using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

drop policy if exists "admins manage candidate files" on public.talent_files;
create policy "admins manage candidate files" on public.talent_files
for all using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

drop policy if exists "admins manage the application link" on public.talent_form_links;
create policy "admins manage the application link" on public.talent_form_links
for all using (public.is_workspace_admin(workspace_id, auth.uid()))
with check (public.is_workspace_admin(workspace_id, auth.uid()));

-- Resumes and work files: private, admins only. Files sit under <workspace id>/<candidate id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-files',
  'talent-files',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg', 'image/webp',
    'application/zip'
  ]
)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "talent files admin read" on storage.objects;
create policy "talent files admin read" on storage.objects for select to authenticated
using (bucket_id = 'talent-files' and public.is_workspace_admin(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists "talent files admin upload" on storage.objects;
create policy "talent files admin upload" on storage.objects for insert to authenticated
with check (bucket_id = 'talent-files' and public.is_workspace_admin(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists "talent files admin delete" on storage.objects;
create policy "talent files admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'talent-files' and public.is_workspace_admin(((storage.foldername(name))[1])::uuid, auth.uid()));
