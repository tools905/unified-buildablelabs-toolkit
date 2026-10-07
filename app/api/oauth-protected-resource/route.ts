import { requestOrigin, MCP_ENDPOINT_PATH } from "@/lib/mcp/urls";

// Tells an app which sign-in server protects the connector (RFC 9728). The app learns the address of this
// page from the 401 answer of /api/mcp, then asks that server how to sign the person in.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return Response.json(
    {
      resource: `${requestOrigin(request)}${MCP_ENDPOINT_PATH}`,
      authorization_servers: [`${supabaseUrl}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "BuildableLabs Content Board",
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
