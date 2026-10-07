import "server-only";

// The name an app registered itself under (for example when it connected), looked up from the sign-in
// server by the client id in its token. It is what the board shows as "uploaded through <app>".

const KEEP_MS = 10 * 60_000;
const cache = new Map<string, { name: string | null; at: number }>();

export async function getClientName(clientId: string): Promise<string | null> {
  const seen = cache.get(clientId);
  if (seen && Date.now() - seen.at < KEEP_MS) return seen.name;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let name: string | null = null;
  if (url && key) {
    try {
      const response = await fetch(`${url}/auth/v1/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (response.ok) {
        const client = (await response.json()) as { client_name?: unknown };
        if (typeof client.client_name === "string" && client.client_name.trim()) name = client.client_name.trim().slice(0, 60);
      }
    } catch {
      name = null;
    }
  }
  cache.set(clientId, { name, at: Date.now() });
  return name;
}
