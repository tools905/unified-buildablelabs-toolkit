import { BASE_PATH } from "@/lib/utils/app-url";

// Where the connector and its sign-in details live, built from the address the app actually used, so the
// answer is right on the production domain, on a preview deployment and on a local server.

export const MCP_ENDPOINT_PATH = `${BASE_PATH}/api/mcp`;
export const PROTECTED_RESOURCE_PATH = `${BASE_PATH}/api/oauth-protected-resource`;

export function requestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.replace(":", "");
  return `${protocol}://${host.split(",")[0].trim()}`;
}

export const resourceMetadataUrl = (origin: string) => `${origin}${PROTECTED_RESOURCE_PATH}`;
