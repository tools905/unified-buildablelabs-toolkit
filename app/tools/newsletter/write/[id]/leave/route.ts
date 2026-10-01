import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as newsletterService from "@/lib/services/newsletter-service";

// The editor calls this as it closes (leaving the page, closing the tab, reloading) with the
// post as it stands, so the last edits are saved and a version is kept. It is a route rather
// than a server action because only a plain `fetch(..., { keepalive: true })` is guaranteed to
// finish after the page has gone.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const input = await request.json().catch(() => null);
  if (!input) return NextResponse.json({ error: "Missing post content" }, { status: 400 });

  try {
    await newsletterService.keepVersionOnLeave(supabase, id, input, user.id);
  } catch {
    // Most often the post was just deleted, which also closes the editor. Nothing to keep.
    return NextResponse.json({ error: "Could not keep a version" }, { status: 409 });
  }
  return new NextResponse(null, { status: 204 });
}
