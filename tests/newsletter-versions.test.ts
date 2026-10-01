import { describe, expect, it } from "vitest";
import {
  isBlankNewsletterContent,
  NEWSLETTER_SESSION_GAP_MS,
  newsletterVersionReferences,
  pickNewsletterContent,
  sameNewsletterContent,
  startsNewSession,
} from "@/lib/utils/newsletter-versions";

const ME = "11111111-1111-4111-8111-111111111111";
const YOU = "22222222-2222-4222-8222-222222222222";

describe("pickNewsletterContent", () => {
  it("normalises empty text and the zoom Postgres returns as a string", () => {
    const content = pickNewsletterContent({ title: "Hi", deck: "", tag: null, body: "x", cover_zoom: "1.50" });
    expect(content.deck).toBeNull();
    expect(content.tag).toBeNull();
    expect(content.cover_zoom).toBe(1.5);
    expect(content.author_ids).toEqual([]);
  });
});

describe("sameNewsletterContent", () => {
  const base = pickNewsletterContent({ title: "Hi", body: "Story", author_ids: [ME, YOU] });

  it("ignores fields that are not content", () => {
    expect(sameNewsletterContent(base, pickNewsletterContent({ ...base, status: "published", updated_at: "x" }))).toBe(true);
  });

  it("notices a changed word, author order or framing", () => {
    expect(sameNewsletterContent(base, { ...base, body: "Story!" })).toBe(false);
    expect(sameNewsletterContent(base, { ...base, author_ids: [YOU, ME] })).toBe(false);
    expect(sameNewsletterContent(base, { ...base, cover_zoom: 2 })).toBe(false);
  });
});

describe("isBlankNewsletterContent", () => {
  it("treats a fresh draft as blank and anything written as not", () => {
    expect(isBlankNewsletterContent(pickNewsletterContent({ body: "  " }))).toBe(true);
    expect(isBlankNewsletterContent(pickNewsletterContent({ title: "Headline" }))).toBe(false);
  });
});

describe("startsNewSession", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const savedAt = (msAgo: number) => new Date(now - msAgo).toISOString();

  it("continues the session for the same person saving again soon", () => {
    expect(startsNewSession({ updated_at: savedAt(60_000), updated_by: ME }, ME, now)).toBe(false);
  });

  it("starts a new one after a long pause", () => {
    expect(startsNewSession({ updated_at: savedAt(NEWSLETTER_SESSION_GAP_MS), updated_by: ME }, ME, now)).toBe(true);
  });

  it("starts a new one when someone else edits, or nobody is recorded", () => {
    expect(startsNewSession({ updated_at: savedAt(1_000), updated_by: YOU }, ME, now)).toBe(true);
    expect(startsNewSession({ updated_at: savedAt(1_000), updated_by: null }, ME, now)).toBe(true);
  });
});

describe("newsletterVersionReferences", () => {
  it("includes every version's story and preview image", () => {
    const refs = newsletterVersionReferences([
      { body: "![a](https://x/a.webp)", cover_image_url: null },
      { body: null, cover_image_url: "https://x/cover.webp" },
    ]);
    expect(refs).toContain("a.webp");
    expect(refs).toContain("cover.webp");
  });
});
