-- MCP connector: one-time upload links.
--
-- A tool can't carry a real file, so starting an upload (start_upload) creates a row here and hands
-- the person a link. They open it in their browser, drop the file, and the row is marked used. The
-- link's secret is never stored, only a hash of it, so a leaked database copy can't open a link.
--
-- Only the server reads and writes this table (with the service role, which skips row security).
-- Row security is on and there are deliberately no policies, so no signed-in user, and no token issued
-- to a connector, can touch it directly.

create table public.mcp_upload_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 200),
  -- When set, the new file takes the place of this attachment instead of being added next to it.
  replaces_attachment_id uuid references public.content_idea_attachments(id) on delete set null,
  token_hash text not null unique,
  -- Fifteen minutes after creation; the server sets it (lib/mcp/contract.ts, MCP_LIMITS).
  expires_at timestamptz not null,
  -- Empty until the link is used once. A used link never works again.
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_upload_links_expires_after_created check (expires_at > created_at)
);

-- The clean-up job removes links that expired or were used; this keeps that lookup fast.
create index mcp_upload_links_expires_idx on public.mcp_upload_links (expires_at);
create index mcp_upload_links_idea_idx on public.mcp_upload_links (idea_id);

alter table public.mcp_upload_links enable row level security;

-- Supabase hands every new table to the signed-in roles; take that back as well, as a second lock.
revoke all on table public.mcp_upload_links from anon, authenticated;

-- Rollback:
-- drop table if exists public.mcp_upload_links;
