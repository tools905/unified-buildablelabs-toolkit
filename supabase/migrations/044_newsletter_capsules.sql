-- Capsule publishing: a sealed snapshot of a newsletter post, made when the writer chooses to
-- cross-post, holding one ready-to-paste version ("atom") per platform. See lib/capsule/types.ts.
--   newsletter_capsules        one row per seal
--   newsletter_capsule_atoms   one row per platform in a capsule, with what the writer reported doing

create table public.newsletter_capsules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null references public.newsletter_posts(id) on delete cascade,
  -- Hash of the post at the moment of sealing (lib/capsule/version.ts), to tell when it went stale.
  draft_version text not null,
  canonical_url text not null default '',
  sealed_by uuid not null references public.profiles(id),
  sealed_at timestamptz not null default now()
);

create index newsletter_capsules_post_idx
  on public.newsletter_capsules(post_id, sealed_at desc);

create table public.newsletter_capsule_atoms (
  capsule_id uuid not null references public.newsletter_capsules(id) on delete cascade,
  platform text not null check (platform in ('medium', 'substack')),
  -- Copied from the capsule so the row's own policies can check membership without a join.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  html text not null,
  title text not null default '',
  subtitle text not null default '',
  tags text[] not null default '{}',
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'sealed' check (status in ('sealed', 'opened', 'posted')),
  platform_url text check (platform_url is null or platform_url ~ '^https?://'),
  opened_at timestamptz,
  posted_at timestamptz,
  primary key (capsule_id, platform)
);

alter table public.newsletter_capsules enable row level security;
alter table public.newsletter_capsule_atoms enable row level security;

create policy "workspace members read newsletter capsules"
on public.newsletter_capsules for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members seal newsletter capsules"
on public.newsletter_capsules for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and sealed_by = auth.uid()
);

create policy "workspace members read newsletter capsule atoms"
on public.newsletter_capsule_atoms for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members create newsletter capsule atoms"
on public.newsletter_capsule_atoms for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and exists (
    select 1 from public.newsletter_capsules c
    where c.id = capsule_id and c.workspace_id = newsletter_capsule_atoms.workspace_id
  )
);

create policy "workspace members update newsletter capsule atom status"
on public.newsletter_capsule_atoms for update
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));

-- A sealed atom is what was previewed; only what the writer reports may change afterwards.
revoke update on public.newsletter_capsule_atoms from authenticated;
grant update (status, platform_url, opened_at, posted_at) on public.newsletter_capsule_atoms to authenticated;

-- Seals a capsule and its atoms in one go, so a capsule never exists without both atoms. It runs as
-- the caller (security invoker), so the policies above still decide who may seal which post. The
-- atoms are built by the app's converters and passed in as
-- [{ platform, html, title, subtitle, tags: [], warnings: [] }, ...].
create or replace function public.seal_newsletter_capsule(
  target_post_id uuid,
  target_draft_version text,
  target_canonical_url text,
  target_atoms jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  post_workspace uuid;
  new_capsule uuid;
begin
  select workspace_id into post_workspace from public.newsletter_posts where id = target_post_id;
  if post_workspace is null then
    raise exception 'newsletter post % not found', target_post_id using errcode = 'P0002';
  end if;

  insert into public.newsletter_capsules (workspace_id, post_id, draft_version, canonical_url, sealed_by)
  values (post_workspace, target_post_id, target_draft_version, coalesce(target_canonical_url, ''), auth.uid())
  returning id into new_capsule;

  insert into public.newsletter_capsule_atoms (capsule_id, platform, workspace_id, html, title, subtitle, tags, warnings)
  select
    new_capsule,
    atom->>'platform',
    post_workspace,
    atom->>'html',
    coalesce(atom->>'title', ''),
    coalesce(atom->>'subtitle', ''),
    coalesce(array(select jsonb_array_elements_text(atom->'tags')), '{}'),
    coalesce(atom->'warnings', '[]'::jsonb)
  from jsonb_array_elements(target_atoms) as atom;

  return new_capsule;
end;
$$;

revoke execute on function public.seal_newsletter_capsule(uuid, text, text, jsonb) from public, anon;
grant execute on function public.seal_newsletter_capsule(uuid, text, text, jsonb) to authenticated;

-- down migration:
-- drop function if exists public.seal_newsletter_capsule(uuid, text, text, jsonb);
-- drop policy if exists "workspace members update newsletter capsule atom status" on public.newsletter_capsule_atoms;
-- drop policy if exists "workspace members create newsletter capsule atoms" on public.newsletter_capsule_atoms;
-- drop policy if exists "workspace members read newsletter capsule atoms" on public.newsletter_capsule_atoms;
-- drop policy if exists "workspace members seal newsletter capsules" on public.newsletter_capsules;
-- drop policy if exists "workspace members read newsletter capsules" on public.newsletter_capsules;
-- drop table if exists public.newsletter_capsule_atoms;
-- drop table if exists public.newsletter_capsules;
