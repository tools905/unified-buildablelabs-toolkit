import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { renderPageImages } from "@/lib/services/content-page-images-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Drawing a long PDF's pages takes a while; each call draws for up to ~40 seconds and the board calls
// again until they are all done.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Draws the page pictures of a PDF carousel (see content-page-images-service.ts). The board asks for
// this when it shows a PDF that doesn't have them yet; anyone who can see the idea can ask.
export async function POST(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  await requireEnabledTool("content-board");
  const { attachmentId } = await params;
  if (!UUID.test(attachmentId)) return NextResponse.json({ error: "Unknown file." }, { status: 400 });
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  // Checked as the person asking: only someone who can see the file gets its pages drawn.
  const { data: visible } = await supabase.from("content_idea_attachments").select("id").eq("id", attachmentId).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Unknown file." }, { status: 404 });

  try {
    return NextResponse.json(await renderPageImages(createAdminClient(), attachmentId));
  } catch {
    return NextResponse.json({ error: "Couldn't draw the pages of this PDF." }, { status: 500 });
  }
}
