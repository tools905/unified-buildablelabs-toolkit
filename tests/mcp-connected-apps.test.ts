import { describe, expect, it } from "vitest";
import type { OAuthGrant } from "@supabase/supabase-js";
import { latestUseByClient, toConnectedApps } from "@/lib/mcp/connected-apps";

const grant = (id: string, name: string, grantedAt: string, over: Partial<OAuthGrant["client"]> = {}, scopes = ["openid", "email"]) =>
  ({
    client: { id, name, uri: "https://app.example", logo_uri: "", ...over },
    scopes,
    granted_at: grantedAt,
  }) as OAuthGrant;

describe("latestUseByClient", () => {
  it("keeps the newest call of each app, whatever order the rows come in", () => {
    const latest = latestUseByClient([
      { client_id: "a", created_at: "2026-10-01T10:00:00Z" },
      { client_id: "a", created_at: "2026-10-03T10:00:00Z" },
      { client_id: "b", created_at: "2026-10-02T10:00:00Z" },
      { client_id: "a", created_at: "2026-10-02T10:00:00Z" },
    ]);
    expect(latest.get("a")).toBe("2026-10-03T10:00:00Z");
    expect(latest.get("b")).toBe("2026-10-02T10:00:00Z");
    expect(latest.size).toBe(2);
  });

  it("is empty when nothing has been called", () => {
    expect(latestUseByClient([]).size).toBe(0);
  });
});

describe("toConnectedApps", () => {
  it("lists the most recently connected app first, with when it was last used", () => {
    const apps = toConnectedApps(
      [grant("a", "Old app", "2026-09-01T00:00:00Z"), grant("b", "New app", "2026-10-01T00:00:00Z")],
      new Map([["a", "2026-10-02T00:00:00Z"]]),
    );
    expect(apps.map((app) => app.name)).toEqual(["New app", "Old app"]);
    expect(apps[0].lastUsedAt).toBeNull();
    expect(apps[1].lastUsedAt).toBe("2026-10-02T00:00:00Z");
  });

  it("turns the sign-in details into plain sentences", () => {
    const [app] = toConnectedApps([grant("a", "App", "2026-10-01T00:00:00Z", {}, ["openid", "email", "offline_access"])], new Map());
    expect(app.permissions).toEqual([
      "Confirm who you are",
      "See your email address",
      "Stay connected without asking you to sign in again",
    ]);
  });

  it("copes with a blank name or website", () => {
    const [app] = toConnectedApps([grant("a", "  ", "2026-10-01T00:00:00Z", { uri: "" })], new Map());
    expect(app.name).toBe("Unnamed app");
    expect(app.website).toBeNull();
  });

  it("is empty with no grants", () => {
    expect(toConnectedApps([], new Map())).toEqual([]);
  });
});
