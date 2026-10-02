import { describe, expect, it } from "vitest";
import { CANONICAL_HINT, parseLiveUrl } from "@/lib/capsule/live-url";

describe("parseLiveUrl", () => {
  it("treats blank as no link", () => {
    expect(parseLiveUrl("")).toEqual({ ok: true, url: null });
    expect(parseLiveUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("accepts a web address and trims it", () => {
    expect(parseLiveUrl("  https://medium.com/@me/my-post-123  ")).toEqual({ ok: true, url: "https://medium.com/@me/my-post-123" });
    expect(parseLiveUrl("http://example.com/a")).toEqual({ ok: true, url: "http://example.com/a" });
  });

  it("refuses text that is not an address, and other kinds of link", () => {
    expect(parseLiveUrl("my post").ok).toBe(false);
    expect(parseLiveUrl("medium.com/p/1").ok).toBe(false);
    expect(parseLiveUrl("javascript:alert(1)").ok).toBe(false);
    expect(parseLiveUrl("ftp://example.com/file").ok).toBe(false);
  });
});

describe("CANONICAL_HINT", () => {
  it("has a reminder for each platform", () => {
    expect(CANONICAL_HINT.medium).toMatch(/canonical/i);
    expect(CANONICAL_HINT.substack).toMatch(/canonical/i);
  });
});
