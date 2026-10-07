import { createAuditStore } from "@/lib/mcp/audit";
import { McpAuthError, getMcpCaller } from "@/lib/mcp/caller";
import { handleBody, parseErrorResponse } from "@/lib/mcp/server";
import { MCP_TOOL_HANDLERS } from "@/lib/mcp/tools";
import { requestOrigin, resourceMetadataUrl } from "@/lib/mcp/urls";

// The connector's address: <site>/teams/api/mcp. An app posts MCP messages here (Streamable HTTP, answered
// as plain JSON). It needs no session cookie: the app's own access token is the credential, and without
// one the answer is a 401 that points to how to sign in, which is how the app starts the sign-in.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized(request: Request, error: McpAuthError) {
  const challenge =
    error.reason === "missing"
      ? `Bearer resource_metadata="${resourceMetadataUrl(requestOrigin(request))}"`
      : `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl(requestOrigin(request))}"`;
  return Response.json(
    { error: error.reason === "missing" ? "unauthorized" : "invalid_token", error_description: error.message },
    { status: 401, headers: { "WWW-Authenticate": challenge } },
  );
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await getMcpCaller(request);
  } catch (error) {
    if (error instanceof McpAuthError) {
      if (error.reason === "no_workspace") {
        return Response.json({ error: "forbidden", error_description: error.message }, { status: 403 });
      }
      return unauthorized(request, error);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(parseErrorResponse(), { status: 400 });
  }

  const answer = await handleBody(body, {
    caller,
    handlers: MCP_TOOL_HANDLERS,
    audit: createAuditStore(),
    context: { origin: requestOrigin(request) },
  });
  if (answer === null) return new Response(null, { status: 202 });
  return Response.json(answer);
}

// This server never starts a stream of its own and keeps no session, so these are not allowed.
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
