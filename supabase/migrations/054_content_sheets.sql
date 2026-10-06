-- Content Board: the shared "Creators Profiles Ideas" spreadsheet on the Calendar page. One tab per
-- person; any team member can edit any tab, and every change is pushed live to everyone who has the
-- sheet open (Supabase Realtime), so nobody downloads and re-uploads an Excel file.

create table if not exists public.content_sheet_tabs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_sheet_columns (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.content_sheet_tabs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  position double precision not null default 0,
  width integer not null default 180 check (width between 60 and 800),
  created_at timestamptz not null default now()
);

-- Each row keeps its cells as { "<column id>": "text" }, so one cell can change without touching the others.
create table if not exists public.content_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.content_sheet_tabs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position double precision not null default 0,
  cells jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_sheet_tabs_workspace_idx on public.content_sheet_tabs(workspace_id, position);
create index if not exists content_sheet_columns_tab_idx on public.content_sheet_columns(tab_id, position);
create index if not exists content_sheet_rows_tab_idx on public.content_sheet_rows(tab_id, position);
create index if not exists content_sheet_columns_workspace_idx on public.content_sheet_columns(workspace_id);
create index if not exists content_sheet_rows_workspace_idx on public.content_sheet_rows(workspace_id);

drop trigger if exists content_sheet_tabs_touch_updated_at on public.content_sheet_tabs;
create trigger content_sheet_tabs_touch_updated_at
before update on public.content_sheet_tabs
for each row execute function public.touch_updated_at();

drop trigger if exists content_sheet_rows_touch_updated_at on public.content_sheet_rows;
create trigger content_sheet_rows_touch_updated_at
before update on public.content_sheet_rows
for each row execute function public.touch_updated_at();

alter table public.content_sheet_tabs enable row level security;
alter table public.content_sheet_columns enable row level security;
alter table public.content_sheet_rows enable row level security;

-- Tabs: every member of the workspace can read, add, rename and remove them.
create policy "workspace members read sheet tabs" on public.content_sheet_tabs for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members add sheet tabs" on public.content_sheet_tabs for insert to authenticated
with check (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members change sheet tabs" on public.content_sheet_tabs for update to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members remove sheet tabs" on public.content_sheet_tabs for delete to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- Columns and rows: the same, and they must belong to a tab of the same workspace.
create policy "workspace members read sheet columns" on public.content_sheet_columns for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members add sheet columns" on public.content_sheet_columns for insert to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and exists (select 1 from public.content_sheet_tabs t where t.id = tab_id and t.workspace_id = content_sheet_columns.workspace_id)
);
create policy "workspace members change sheet columns" on public.content_sheet_columns for update to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members remove sheet columns" on public.content_sheet_columns for delete to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace members read sheet rows" on public.content_sheet_rows for select to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members add sheet rows" on public.content_sheet_rows for insert to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and exists (select 1 from public.content_sheet_tabs t where t.id = tab_id and t.workspace_id = content_sheet_rows.workspace_id)
);
create policy "workspace members change sheet rows" on public.content_sheet_rows for update to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()))
with check (public.is_workspace_member(workspace_id, auth.uid()));
create policy "workspace members remove sheet rows" on public.content_sheet_rows for delete to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

-- Changes one cell without touching the rest of the row, so two people editing different cells of
-- the same row at the same moment never overwrite each other. An empty value clears the cell.
-- Runs as the caller, so the row-level security above still decides who may change what.
create or replace function public.set_content_sheet_cell(p_row_id uuid, p_column_id uuid, p_value text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.content_sheet_rows
  set cells = case
        when p_value is null or p_value = '' then cells - p_column_id::text
        else jsonb_set(cells, array[p_column_id::text], to_jsonb(left(p_value, 5000)))
      end,
      updated_by = auth.uid()
  where id = p_row_id;
$$;

grant execute on function public.set_content_sheet_cell(uuid, uuid, text) to authenticated;

-- Live updates: send every change to everyone with the sheet open. Full row images so removals
-- carry enough to be applied on the other screens.
alter table public.content_sheet_tabs replica identity full;
alter table public.content_sheet_columns replica identity full;
alter table public.content_sheet_rows replica identity full;
alter publication supabase_realtime add table public.content_sheet_tabs, public.content_sheet_columns, public.content_sheet_rows;

-- Rollback:
-- alter publication supabase_realtime drop table public.content_sheet_tabs, public.content_sheet_columns, public.content_sheet_rows;
-- drop function if exists public.set_content_sheet_cell(uuid, uuid, text);
-- drop table if exists public.content_sheet_rows, public.content_sheet_columns, public.content_sheet_tabs;
