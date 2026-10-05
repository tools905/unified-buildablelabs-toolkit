import { beforeEach, describe, expect, it } from "vitest";
import { getPublicWorkspace, resetPublicWorkspaceCache } from "@/lib/services/newsletter-service";
import {
  PUBLIC_FEED_CACHE_CONTROL,
  PUBLIC_NOT_FOUND_CACHE_CONTROL,
  publicFeedHeaders,
} from "@/lib/utils/public-cache";

// A stand-in for the Supabase client that counts how often the workspace is looked up.
function fakeSupabase(workspace: { id: string; name: string } | null) {
  const calls = { count: 0 };
  const client = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => {
                calls.count += 1;
                return { data: workspace, error: null };
              },
            }),
          }),
        }),
      };
    },
  };
  return { client: client as never, calls };
}

describe("getPublicWorkspace", () => {
  beforeEach(() => resetPublicWorkspaceCache());

  it("looks the workspace up once and then reuses it", async () => {
    const { client, calls } = fakeSupabase({ id: "w1", name: "BuildableLabs" });
    const first = await getPublicWorkspace(client, 1_000);
    const second = await getPublicWorkspace(client, 2_000);
    expect(first).toEqual(second);
    expect(calls.count).toBe(1);
  });

  it("looks it up again after the cache has expired", async () => {
    const { client, calls } = fakeSupabase({ id: "w1", name: "BuildableLabs" });
    await getPublicWorkspace(client, 0);
    await getPublicWorkspace(client, 10 * 60_000 + 1);
    expect(calls.count).toBe(2);
  });

  it("does not remember a missing workspace, so the feed recovers once it exists", async () => {
    const missing = fakeSupabase(null);
    expect(await getPublicWorkspace(missing.client, 0)).toBeNull();
    expect(await getPublicWorkspace(missing.client, 1)).toBeNull();
    expect(missing.calls.count).toBe(2);

    const present = fakeSupabase({ id: "w1", name: "BuildableLabs" });
    expect(await getPublicWorkspace(present.client, 2)).toMatchObject({ id: "w1" });
  });
});

describe("public cache headers", () => {
  it("lets a CDN reuse a good answer for five minutes and serve a stale one for a day while refreshing", () => {
    expect(PUBLIC_FEED_CACHE_CONTROL).toMatch(/public/);
    expect(PUBLIC_FEED_CACHE_CONTROL).toMatch(/s-maxage=300/);
    expect(PUBLIC_FEED_CACHE_CONTROL).toMatch(/max-age=30,/);
    expect(PUBLIC_FEED_CACHE_CONTROL).toMatch(/stale-while-revalidate=\d+/);
  });

  it("caches a missing post only very briefly", () => {
    expect(PUBLIC_NOT_FOUND_CACHE_CONTROL).toMatch(/s-maxage=15/);
    expect(PUBLIC_NOT_FOUND_CACHE_CONTROL).not.toMatch(/stale-while-revalidate/);
  });

  it("keeps the cross-origin permission the website relies on", () => {
    expect(publicFeedHeaders(PUBLIC_FEED_CACHE_CONTROL)).toMatchObject({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": PUBLIC_FEED_CACHE_CONTROL,
    });
  });
});
