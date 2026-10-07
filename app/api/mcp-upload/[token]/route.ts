import { getUploadState } from "@/lib/mcp/upload-flow";
import { createAdminClient } from "@/lib/supabase/admin";

// What state an upload link is in. The link's token is the only credential, so nothing here asks for a sign-in.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getUploadState(createAdminClient(), token);
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
