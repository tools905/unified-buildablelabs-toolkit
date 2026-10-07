import { prepareUpload } from "@/lib/mcp/upload-flow";
import { createAdminClient } from "@/lib/supabase/admin";

// Step one of an upload: where in storage the file may be put. See lib/mcp/contract.ts, "The upload page".

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // an empty or broken body is refused by prepareUpload below
  }
  try {
    return Response.json(await prepareUpload(createAdminClient(), token, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("MCP upload: prepare failed:", error);
    return Response.json({ ok: false, code: "invalid_input", message: "Something went wrong on the server. Please try again." }, { status: 500 });
  }
}
