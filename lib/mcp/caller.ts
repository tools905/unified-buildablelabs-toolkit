import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { McpCaller } from "@/lib/mcp/contract";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";

// Works out who is calling from the access token an app sends with each request, so no tool has to.
// The token is one Supabase issued after the person approved the app on the consent screen. Its signature
// is checked against Supabase's public keys, and the database client it hands back carries the same token,
// so every query runs as that person under the same row rules as the app itself.

export type McpAuthFailure = "missing" | "invalid" | "no_workspace";

export class McpAuthError extends Error {
  readonly reason: McpAuthFailure;

  constructor(reason: McpAuthFailure, message: string) {
    super(message);
    this.name = "McpAuthError";
    this.reason = reason;
  }
}

export type CallerDeps = {
  // The address Supabase puts in the token as its issuer: <project address>/auth/v1.
  issuer: string;
  // A database client that sends the token with every query.
  makeClient: (token: string) => SupabaseClient<any>;
  findWorkspaceId: (client: SupabaseClient<any>, userId: string) => Promise<string | null>;
};

function defaultDeps(): CallerDeps {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase is not configured.");
  return {
    issuer: `${url.replace(/\/$/, "")}/auth/v1`,
    makeClient: (token) =>
      createClient<any>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    findWorkspaceId: async (client, userId) => (await getCurrentWorkspace(client, userId))?.id ?? null,
  };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function getMcpCaller(request: Request, deps: CallerDeps = defaultDeps()): Promise<McpCaller> {
  const token = bearerToken(request);
  if (!token) throw new McpAuthError("missing", "Sign in is required.");

  const supabase = deps.makeClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (error || !claims) throw new McpAuthError("invalid", "The sign-in is not valid or has expired.");

  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  // A token for the person's own browser session carries no client_id: only tokens issued to an app are
  // accepted here, so every call can be traced to the app it came through.
  if (!userId || !clientId || claims.role !== "authenticated" || claims.iss !== deps.issuer) {
    throw new McpAuthError("invalid", "The sign-in is not valid for this connector.");
  }

  const workspaceId = await deps.findWorkspaceId(supabase, userId);
  if (!workspaceId) throw new McpAuthError("no_workspace", "This account is not part of a workspace.");

  return { userId, workspaceId, clientId, supabase };
}
