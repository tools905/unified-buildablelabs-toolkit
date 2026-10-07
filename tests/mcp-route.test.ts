import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMcpCaller, recorded } = vi.hoisted(() => ({ getMcpCaller: vi.fn(), recorded: [] as unknown[] }));

vi.mock("@/lib/mcp/caller", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/mcp/caller")>()), getMcpCaller }));
vi.mock("@/lib/mcp/audit", () => ({
  createAuditStore: () => ({ record: async (entry: unknown) => void recorded.push(entry), callsInLastMinute: async () => 0 }),
}));

import { McpAuthError } from "@/lib/mcp/caller";
import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { GET as getMetadata } from "@/app/api/oauth-protected-resource/route";

const caller = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  clientId: "client-1",
  supabase: {},
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/teams/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", host: "tools.example.test", "x-forwarded-proto": "https", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  getMcpCaller.mockReset();
  recorded.length = 0;
});

describe("POST /api/mcp without a sign-in", () => {
  it("answers 401 and points to the sign-in details, on the address the app used", async () => {
    getMcpCaller.mockRejectedValue(new McpAuthError("missing", "Sign in is required."));
    const response = await POST(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://tools.example.test/teams/api/oauth-protected-resource"',
    );
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("answers 401 with invalid_token for a bad token", async () => {
    getMcpCaller.mockRejectedValue(new McpAuthError("invalid", "The sign-in is not valid or has expired."));
    const response = await POST(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("answers 403 for a person who is in no workspace", async () => {
    getMcpCaller.mockRejectedValue(new McpAuthError("no_workspace", "This account is not part of a workspace."));
    expect((await POST(post({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(403);
  });

  it("lets an unexpected failure of the sign-in check surface instead of looking like a bad token", async () => {
    getMcpCaller.mockRejectedValue(new Error("database down"));
    await expect(POST(post({ jsonrpc: "2.0", id: 1, method: "ping" }))).rejects.toThrow("database down");
  });
});

describe("POST /api/mcp when signed in", () => {
  beforeEach(() => getMcpCaller.mockResolvedValue(caller));

  it("lists the tools that are served", async () => {
    const response = await POST(post({ jsonrpc: "2.0", id: 7, method: "tools/list" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(7);
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("create_idea");
    expect(names).toContain("add_review_point");
    expect(names.sort()).toEqual([
      "add_review_point",
      "confirm_upload",
      "create_idea",
      "get_idea",
      "get_month_schedule",
      "get_pdf_pages",
      "list_ideas",
      "list_review_points",
      "resolve_review_point",
      "start_upload",
    ]);
  });

  it("answers 202 with no body for a notification", async () => {
    const response = await POST(post({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("answers 400 with a parse error for a body that isn't JSON", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32700);
  });

  it("refuses a call to a tool that doesn't exist, without a record", async () => {
    const response = await POST(post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_everything", arguments: {} } }));
    expect((await response.json()).error.code).toBe(-32602);
    expect(recorded).toHaveLength(0);
  });
});

describe("the other methods", () => {
  it("doesn't allow GET or DELETE", async () => {
    for (const handler of [GET, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });
});

describe("GET /api/oauth-protected-resource", () => {
  it("names the connector and the sign-in server that protects it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
    const response = getMetadata(
      new Request("http://localhost:3000/teams/api/oauth-protected-resource", {
        headers: { host: "tools.example.test", "x-forwarded-proto": "https" },
      }),
    );
    expect(await response.json()).toEqual({
      resource: "https://tools.example.test/teams/api/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "BuildableLabs Content Board",
    });
    vi.unstubAllEnvs();
  });
});
