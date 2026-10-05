import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { getIdeaPanelData } from "@/lib/services/content-panel-service";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// The idea side panel loads through a plain GET rather than a server action: Next.js runs a page's
// server actions one after another, so warming panels on hover used to hold up real clicks
// (moving a card, adding a point) behind them. GET requests run side by side.
export async function GET(_request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  await requireEnabledTool("content-board");
  const { ideaId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace found." }, { status: 404 });

  try {
    const data = await getIdeaPanelData(supabase, user, workspace, ideaId);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load this idea." }, { status: 500 });
  }
}
