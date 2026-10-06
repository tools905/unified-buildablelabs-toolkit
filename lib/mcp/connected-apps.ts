import type { OAuthGrant } from "@supabase/supabase-js";
import { describeScopes } from "@/lib/mcp/consent";

// One app a person has allowed to use the toolkit as them, ready to show on the Connected apps page.
export type ConnectedApp = {
  clientId: string;
  name: string;
  website: string | null;
  connectedAt: string;
  lastUsedAt: string | null; // null until the app has made a call
  permissions: string[]; // plain sentences, from the sign-in details the app was given
};

// The newest call of each app, from rows of the audit record (any order).
export function latestUseByClient(rows: { client_id: string; created_at: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const seen = latest.get(row.client_id);
    if (!seen || new Date(row.created_at).getTime() > new Date(seen).getTime()) latest.set(row.client_id, row.created_at);
  }
  return latest;
}

// The person's grants as a list, most recently connected first.
export function toConnectedApps(grants: OAuthGrant[], lastUsed: Map<string, string>): ConnectedApp[] {
  return grants
    .map((grant) => ({
      clientId: grant.client.id,
      name: grant.client.name?.trim() || "Unnamed app",
      website: grant.client.uri?.trim() || null,
      connectedAt: grant.granted_at,
      lastUsedAt: lastUsed.get(grant.client.id) ?? null,
      permissions: describeScopes(grant.scopes.join(" ")),
    }))
    .sort((a, b) => new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime());
}
