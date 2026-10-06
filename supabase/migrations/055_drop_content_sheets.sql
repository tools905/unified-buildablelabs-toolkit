-- The Calendar page's "Creators, Profiles and ideas" tab now embeds the team's real Google Sheet, so
-- the separate in-app copy added in 054 is removed: one source of truth.
alter publication supabase_realtime drop table public.content_sheet_tabs, public.content_sheet_columns, public.content_sheet_rows;
drop function if exists public.set_content_sheet_cell(uuid, uuid, text);
drop table if exists public.content_sheet_rows;
drop table if exists public.content_sheet_columns;
drop table if exists public.content_sheet_tabs;

-- Rollback: re-run 054_content_sheets.sql.
