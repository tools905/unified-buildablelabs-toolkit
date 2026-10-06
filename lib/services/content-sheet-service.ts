import type { SupabaseClient } from "@supabase/supabase-js";
import { sortWorkbook, type Workbook } from "@/components/content-board/sheet/types";

// Every tab, column and row of the workspace's shared workbook. Uses the caller's client, so row-level
// security limits it to members of the workspace.
export async function loadWorkbook(supabase: SupabaseClient<any>, workspaceId: string): Promise<Workbook> {
  const [tabs, columns, rows] = await Promise.all([
    supabase.from("content_sheet_tabs").select("*").eq("workspace_id", workspaceId),
    supabase.from("content_sheet_columns").select("*").eq("workspace_id", workspaceId),
    supabase.from("content_sheet_rows").select("*").eq("workspace_id", workspaceId),
  ]);
  if (tabs.error) throw tabs.error;
  if (columns.error) throw columns.error;
  if (rows.error) throw rows.error;
  return sortWorkbook({ tabs: tabs.data ?? [], columns: columns.data ?? [], rows: rows.data ?? [] });
}
