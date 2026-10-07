import { describe, expect, it, vi } from "vitest";
import { McpAuthError, bearerToken, getMcpCaller, type CallerDeps } from "@/lib/mcp/caller";

const ISSUER = "https://project.supabase.co/auth/v1";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const goodClaims = { sub: USER, role: "authenticated", iss: ISSUER, client_id: "client-1" };

function setup(options: { claims?: Record<string, unknown> | null; claimsError?: boolean; workspace?: string | null } = {}) {
  const getClaims = vi.fn(async () => ({
    data: options.claims === null ? null : { claims: options.claims ?? goodClaims },
    error: options.claimsError ? new Error("bad token") : null,
  }));
  const client = { auth: { getClaims } } as never;
  const makeClient = vi.fn(() => client);
  const deps: CallerDeps = {
    issuer: ISSUER,
    makeClient,
    findWorkspaceId: async () => (options.workspace === undefined ? WORKSPACE : options.workspace),
  };
  return { deps, getClaims, makeClient, client };
}

const request = (authorization?: string) =>
  new Request("https://example.test/teams/api/mcp", { method: "POST", headers: authorization ? { authorization } : {} });

async function reasonOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof McpAuthError) return error.reason;
    throw error;
  }
  return "no error";
}

describe("bearerToken", () => {
  it("reads the token from an Authorization header, in any letter case of Bearer", () => {
    expect(bearerToken(request("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(bearerToken(request("bearer abc"))).toBe("abc");
  });

  it("finds nothing when there is no header or it is another kind", () => {
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request("Basic abc"))).toBeNull();
    expect(bearerToken(request("Bearer"))).toBeNull();
    expect(bearerToken(request("Bearer a b"))).toBeNull();
  });
});

describe("getMcpCaller", () => {
  it("returns the person, their workspace and the app, with a client that carries the same token", async () => {
    const { deps, makeClient, getClaims, client } = setup();
    const caller = await getMcpCaller(request("Bearer tok-123"), deps);
    expect(caller).toEqual({ userId: USER, workspaceId: WORKSPACE, clientId: "client-1", supabase: client });
    expect(makeClient).toHaveBeenCalledWith("tok-123");
    expect(getClaims).toHaveBeenCalledWith("tok-123");
  });

  it("asks for sign-in when there is no token", async () => {
    const { deps, makeClient } = setup();
    expect(await reasonOf(getMcpCaller(request(), deps))).toBe("missing");
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("refuses a token that doesn't check out or has no claims", async () => {
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claimsError: true, claims: null }).deps))).toBe("invalid");
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: null }).deps))).toBe("invalid");
  });

  it("refuses a token that wasn't issued to an app (no client_id), like a browser session", async () => {
    const sessionClaims: Record<string, unknown> = { ...goodClaims };
    delete sessionClaims.client_id;
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: sessionClaims }).deps))).toBe("invalid");
  });

  it("refuses the wrong role, a foreign issuer, or no person in the token", async () => {
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: { ...goodClaims, role: "anon" } }).deps))).toBe("invalid");
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: { ...goodClaims, iss: "https://evil.test/auth/v1" } }).deps))).toBe("invalid");
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: { ...goodClaims, sub: undefined } }).deps))).toBe("invalid");
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ claims: { ...goodClaims, client_id: "" } }).deps))).toBe("invalid");
  });

  it("says so when the person isn't in any workspace", async () => {
    expect(await reasonOf(getMcpCaller(request("Bearer x"), setup({ workspace: null }).deps))).toBe("no_workspace");
  });
});
