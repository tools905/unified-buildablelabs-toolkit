import { describe, expect, it } from "vitest";
import { describeScopes, isRecognisedRedirect, redirectHostLabel } from "@/lib/mcp/consent";

describe("isRecognisedRedirect", () => {
  it("recognises the hosted app's fixed return address", () => {
    expect(isRecognisedRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  it("recognises a local return address on any port, for the command-line tool", () => {
    expect(isRecognisedRedirect("http://localhost:3118/callback")).toBe(true);
    expect(isRecognisedRedirect("http://127.0.0.1:54321/callback")).toBe(true);
    expect(isRecognisedRedirect("http://localhost/callback")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isRecognisedRedirect("https://evil.example/api/mcp/auth_callback")).toBe(false);
    expect(isRecognisedRedirect("https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(isRecognisedRedirect("https://evil.example/?x=https://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isRecognisedRedirect("https://claude.ai/somewhere/else")).toBe(false);
  });

  it("refuses the wrong scheme for a known host", () => {
    expect(isRecognisedRedirect("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isRecognisedRedirect("https://localhost/callback")).toBe(false);
  });

  it("refuses text that is not an address", () => {
    expect(isRecognisedRedirect("")).toBe(false);
    expect(isRecognisedRedirect("not a url")).toBe(false);
    expect(isRecognisedRedirect("javascript:alert(1)")).toBe(false);
  });
});

describe("redirectHostLabel", () => {
  it("shows the host a person can check, with the port when there is one", () => {
    expect(redirectHostLabel("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHostLabel("http://localhost:3118/callback")).toBe("localhost:3118");
  });

  it("falls back to the raw text for something that is not an address", () => {
    expect(redirectHostLabel("nonsense")).toBe("nonsense");
  });
});

describe("describeScopes", () => {
  it("turns known scopes into plain sentences, once each", () => {
    expect(describeScopes("openid email email offline_access")).toEqual([
      "Confirm who you are",
      "See your email address",
      "Stay connected without asking you to sign in again",
    ]);
  });

  it("shows a scope it has no wording for as it is", () => {
    expect(describeScopes("openid custom:thing")).toEqual(["Confirm who you are", "custom:thing"]);
  });

  it("copes with an empty scope", () => {
    expect(describeScopes("")).toEqual([]);
    expect(describeScopes("   ")).toEqual([]);
  });
});
