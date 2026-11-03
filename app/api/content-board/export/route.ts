import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { ExportProblem, exportBoardPdf } from "@/lib/services/board-export-service";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { EXPORT_COLUMNS } from "@/lib/utils/board-export";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// A month of carousels takes a while to put together.
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Exports the board's posts as one PDF: ?from=2026-11-01&to=2026-11-30&columns=approved,posted.
// Like the single-post download, the Export button is a plain link and the answer is a redirect to
// the file, which works on phones and in in-app browsers too.
export async function GET(request: Request) {
  await requireEnabledTool("content-board");
  const { supabase, user } = await getUserSession();
  if (!user) return new NextResponse("Please sign in again, then export.", { status: 401 });
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) return new NextResponse("No workspace found.", { status: 404 });

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const columns = (params.get("columns") ?? "")
    .split(",")
    .filter((column): column is ContentIdeaStatus => (EXPORT_COLUMNS as string[]).includes(column));
  if (!DAY.test(from) || !DAY.test(to) || from > to) return new NextResponse("Pick a start and end date (start first).", { status: 400 });
  if (columns.length === 0) return new NextResponse("Pick at least one column.", { status: 400 });

  try {
    const url = await exportBoardPdf(supabase, { workspaceId: workspace.id, from, to, columns });
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ExportProblem) return new NextResponse(error.message, { status: 400 });
    console.error("content-board board export failed", error);
    return new NextResponse("Couldn't prepare the export. Please try again.", { status: 500 });
  }
}
