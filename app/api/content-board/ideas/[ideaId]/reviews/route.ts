import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getUserSession } from "@/lib/auth/require-user";
import { submitMarkupReview } from "@/lib/services/content-markup-service";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Submits a Pencil review. A plain POST rather than a server action: a review of many pages can be
// larger than a server action accepts, and it shouldn't wait behind other actions.
export async function POST(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  await requireEnabledTool("content-board");
  const { ideaId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return NextResponse.json({ error: "Please sign in again, then submit." }, { status: 401 });
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That review couldn't be read. Please try again." }, { status: 400 });
  }

  try {
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    const result = await submitMarkupReview(supabase, {
      workspaceId: workspace.id,
      userId: user.id,
      userName: profile?.full_name || profile?.email || "Someone",
      submission: { ...(body as object), ideaId } as never,
    });
    revalidatePath("/tools/content-board");
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? "That review doesn't look right.")
        : error instanceof Error
          ? /row-level security/i.test(error.message)
            ? "You don't have permission to review this idea."
            : error.message
          : "Couldn't save the review. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
