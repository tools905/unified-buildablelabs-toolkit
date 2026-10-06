import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { loadWorkbook } from "@/lib/services/content-sheet-service";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { buildXlsx } from "@/lib/utils/xlsx-writer";
import { WORKBOOK_TITLE } from "@/components/content-board/sheet/types";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Downloads the shared workbook as an .xlsx, every tab as a worksheet, exactly as it is right now.
// A plain link, so it works on phones and in in-app browsers too.
export async function GET() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await getUserSession();
  if (!user) return new NextResponse("Please sign in again, then try the download.", { status: 401 });
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) return new NextResponse("No workspace found.", { status: 404 });

  const workbook = await loadWorkbook(supabase, workspace.id);
  const file = buildXlsx(
    workbook.tabs.map((tab) => {
      const columns = workbook.columns.filter((column) => column.tab_id === tab.id);
      return {
        name: tab.name,
        columns: columns.map((column) => ({ name: column.name, width: column.width })),
        rows: workbook.rows
          .filter((row) => row.tab_id === tab.id)
          .map((row) => columns.map((column) => row.cells[column.id] ?? "")),
      };
    }),
  );

  return new NextResponse(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${WORKBOOK_TITLE}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
