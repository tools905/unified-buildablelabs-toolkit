import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getUserSession } from "@/lib/auth/require-user";
import { deleteMarkupReview, getMarkupReview } from "@/lib/services/content-markup-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// One Pencil review with its strokes, for showing the marks on the pages.
export async function GET(_request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  await requireEnabledTool("content-board");
  const { reviewId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const review = await getMarkupReview(supabase, reviewId).catch(() => null);
  if (!review) return NextResponse.json({ error: "This review no longer exists." }, { status: 404 });
  return NextResponse.json(review, { headers: { "Cache-Control": "private, no-store" } });
}

// Removes a review (its author or an admin).
export async function DELETE(_request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  await requireEnabledTool("content-board");
  const { reviewId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    await deleteMarkupReview(supabase, reviewId);
    revalidatePath("/tools/content-board");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't remove the review." }, { status: 400 });
  }
}
