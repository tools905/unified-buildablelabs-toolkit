import { completeUpload } from "@/lib/mcp/upload-flow";
import { createAdminClient } from "@/lib/supabase/admin";

// Step two of an upload: the file is in storage; check it and put it on the idea.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // an empty or broken body is refused by completeUpload below
  }
  try {
    return Response.json(await completeUpload(createAdminClient(), token, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("MCP upload: complete failed:", error);
    return Response.json({ ok: false, code: "invalid_input", message: "Something went wrong on the server. Please try again." }, { status: 500 });
  }
}
