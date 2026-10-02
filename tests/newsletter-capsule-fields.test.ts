import { describe, expect, it } from "vitest";
import { updateNewsletterPostSchema } from "@/lib/validation/newsletter-schema";
import { normalizeTags } from "@/lib/utils/newsletter-tags";
import { toDraft } from "@/lib/capsule/draft";

describe("normalizeTags", () => {
  it("drops #, blanks and repeats and keeps the order", () => {
    expect(normalizeTags(["#AI", " ai ", "", "Writing", "  Build  in   public "])).toEqual(["AI", "Writing", "Build in public"]);
  });

  it("keeps at most five and cuts long tags", () => {
    expect(normalizeTags(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d", "e"]);
    expect(normalizeTags(["x".repeat(40)])[0]).toHaveLength(25);
  });
});

describe("post fields for capsule publishing", () => {
  it("accepts tags and an https original link", () => {
    const parsed = updateNewsletterPostSchema.parse({ tags: ["#a", "b", "a"], originalUrl: " https://buildablelabs.com/times/x " });
    expect(parsed.tags).toEqual(["a", "b"]);
    expect(parsed.originalUrl).toBe("https://buildablelabs.com/times/x");
  });

  it("treats a blank link as none and leaves both alone when not sent", () => {
    expect(updateNewsletterPostSchema.parse({ originalUrl: "  " }).originalUrl).toBeNull();
    const untouched = updateNewsletterPostSchema.parse({});
    expect(untouched.tags).toBeUndefined();
    expect(untouched.originalUrl).toBeUndefined();
  });

  it("rejects a link that is not https", () => {
    expect(updateNewsletterPostSchema.safeParse({ originalUrl: "http://example.com" }).success).toBe(false);
    expect(updateNewsletterPostSchema.safeParse({ originalUrl: "not a link" }).success).toBe(false);
  });
});

describe("toDraft", () => {
  it("maps a post to the capsule draft", () => {
    expect(
      toDraft({ id: "p1", title: "T", deck: "Sub", tags: ["a"], body: "Body", original_url: "https://x.com/p" }),
    ).toEqual({ id: "p1", title: "T", subtitle: "Sub", tags: ["a"], body: "Body", canonicalUrl: "https://x.com/p" });
  });

  it("uses empty text where the post has none", () => {
    expect(toDraft({ id: "p1", title: "", deck: null, tags: [], body: "", original_url: null })).toEqual({
      id: "p1",
      title: "",
      subtitle: "",
      tags: [],
      body: "",
      canonicalUrl: "",
    });
  });
});

describe("changesCapsuleDetails", () => {
  it("sees a changed tag list or original link, so a save that only changes those still happens", async () => {
    const { changesCapsuleDetails } = await import("@/lib/services/newsletter-service");
    const previous = { tags: ["a", "b"], original_url: "https://x.com/p" };
    expect(changesCapsuleDetails(previous, { tags: ["a", "b", "c"] })).toBe(true);
    expect(changesCapsuleDetails(previous, { tags: ["b", "a"] })).toBe(true);
    expect(changesCapsuleDetails(previous, { original_url: "https://x.com/q" })).toBe(true);
    expect(changesCapsuleDetails(previous, { original_url: null })).toBe(true);
    expect(changesCapsuleDetails({ tags: [], original_url: null }, { tags: ["a"] })).toBe(true);
  });

  it("sees nothing when they are the same or not sent", async () => {
    const { changesCapsuleDetails } = await import("@/lib/services/newsletter-service");
    const previous = { tags: ["a", "b"], original_url: "https://x.com/p" };
    expect(changesCapsuleDetails(previous, {})).toBe(false);
    expect(changesCapsuleDetails(previous, { tags: ["a", "b"], original_url: "https://x.com/p" })).toBe(false);
    expect(changesCapsuleDetails({ tags: null, original_url: null }, { tags: [], original_url: null })).toBe(false);
  });
});
