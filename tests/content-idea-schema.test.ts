import { describe, expect, it } from "vitest";
import { checkAttachmentFile } from "@/lib/utils/content-board";
import { addReviewPointSchema, contentPlatformSchema, referenceLinksSchema, updateContentIdeaSchema } from "@/lib/validation/content-idea-schema";

describe("referenceLinksSchema", () => {
  it("drops blanks, trims and removes duplicates", () => {
    const parsed = referenceLinksSchema.parse([" https://example.com/a ", "", "  ", "https://example.com/a", "https://example.com/b"]);
    expect(parsed).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("accepts an empty list", () => {
    expect(referenceLinksSchema.parse(["", " "])).toEqual([]);
  });

  it("rejects links that are not https", () => {
    const result = referenceLinksSchema.safeParse(["http://example.com"]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Reference links must start with https://");
  });

  it("rejects things that are not web addresses", () => {
    expect(referenceLinksSchema.safeParse(["not a link"]).success).toBe(false);
  });

  it("allows at most 10 links", () => {
    const many = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
    expect(referenceLinksSchema.safeParse(many).success).toBe(false);
    expect(referenceLinksSchema.safeParse(many.slice(0, 10)).success).toBe(true);
  });
});

describe("post URL", () => {
  it("accepts http and https links and treats blank as no link", () => {
    expect(updateContentIdeaSchema.parse({ postUrl: "https://example.com/p" }).postUrl).toBe("https://example.com/p");
    expect(updateContentIdeaSchema.parse({ postUrl: "http://example.com/p" }).postUrl).toBe("http://example.com/p");
    expect(updateContentIdeaSchema.parse({ postUrl: "  " }).postUrl).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(updateContentIdeaSchema.safeParse({ postUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(updateContentIdeaSchema.safeParse({ postUrl: "ftp://example.com/file" }).success).toBe(false);
  });
});

describe("contentPlatformSchema", () => {
  it("accepts the written channels alongside the social platforms", () => {
    for (const platform of ["linkedin", "blog", "newsletter"]) {
      expect(contentPlatformSchema.safeParse(platform).success).toBe(true);
    }
  });

  it("rejects unknown platforms", () => {
    expect(contentPlatformSchema.safeParse("tiktok").success).toBe(false);
  });
});

describe("checkAttachmentFile", () => {
  it("accepts images and PDFs within the size limit", () => {
    expect(checkAttachmentFile({ type: "image/png", size: 40 * 1024 * 1024 })).toBeNull();
    expect(checkAttachmentFile({ type: "image/webp", size: 1000 })).toBeNull();
    expect(checkAttachmentFile({ type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
  });

  it("rejects other file types and oversized PDFs", () => {
    expect(checkAttachmentFile({ type: "text/plain", size: 10 })).toMatch(/PNG, JPG, WebP or PDF/);
    expect(checkAttachmentFile({ type: "video/mp4", size: 10 })).toMatch(/PNG, JPG, WebP or PDF/);
    expect(checkAttachmentFile({ type: "application/pdf", size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
  });
});

describe("addReviewPointSchema", () => {
  const ideaId = "5b0a4f6e-3c8e-4f0a-9a43-2f9d1c5e7b11";

  it("trims the text and accepts 2 to 500 characters", () => {
    expect(addReviewPointSchema.parse({ ideaId, body: "  Make the title bigger  " }).body).toBe("Make the title bigger");
    expect(addReviewPointSchema.safeParse({ ideaId, body: "a".repeat(500) }).success).toBe(true);
  });

  it("rejects text that is too short or too long with a clear message", () => {
    expect(addReviewPointSchema.safeParse({ ideaId, body: " a " }).success).toBe(false);
    const tooLong = addReviewPointSchema.safeParse({ ideaId, body: "a".repeat(501) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toMatch(/500/);
  });

  it("keeps line breaks inside a comment", () => {
    expect(addReviewPointSchema.parse({ ideaId, body: "Line one\nLine two" }).body).toBe("Line one\nLine two");
  });
});
