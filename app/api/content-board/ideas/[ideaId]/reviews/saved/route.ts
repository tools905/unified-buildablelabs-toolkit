import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserSession } from "@/lib/auth/require-user";
import {
  discardSavedMarkupReview,
  getSavedMarkupReview,
  saveMarkupReview,
} from "@/lib/services/content-markup-service";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// The reviewer's own Pencil review, saved as they draw so nothing is lost if the iPad or the connection
// gives out. Private to them until they submit. GET ?files=<id,id> loads it, PUT saves it, DELETE drops it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const filesFrom = (request: Request) => {
  const ids = (new URL(request.url).searchParams.get("files") ?? "").split(",").filter(Boolean);
  return ids.length && ids.length <= 12 && ids.every((id) => UUID.test(id)) ? ids : null;
};

async function session() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await getUserSession();
  if (!user) return { error: NextResponse.json({ error: "Please sign in again. Your marks are kept on this device." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const auth = await session();
  if ("error" in auth) return auth.error;
  const fileIds = filesFrom(request);
  if (!fileIds || !UUID.test(ideaId)) return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
  try {
    const saved = await getSavedMarkupReview(auth.supabase, { ideaId, userId: auth.user.id, fileIds });
    return NextResponse.json({ saved }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load your saved review." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const auth = await session();
  if ("error" in auth) return auth.error;
  const workspace = await getCurrentWorkspace(auth.supabase, auth.user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace found." }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That save couldn't be read." }, { status: 400 });
  }
  try {
    const result = await saveMarkupReview(auth.supabase, {
      workspaceId: workspace.id,
      userId: auth.user.id,
      draft: { ...(body as object), ideaId } as never,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? "Those marks couldn't be saved.")
        : error instanceof Error && /row-level security/i.test(error.message)
          ? "You don't have permission to review this idea."
          : "Couldn't save just now.";
    return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const auth = await session();
  if ("error" in auth) return auth.error;
  const fileIds = filesFrom(request);
  if (!fileIds || !UUID.test(ideaId)) return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
  try {
    await discardSavedMarkupReview(auth.supabase, { ideaId, userId: auth.user.id, fileIds });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't remove your saved review." }, { status: 500 });
  }
}
