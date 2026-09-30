import { describe, expect, it } from "vitest";
import { referenceLinksSchema, updateContentIdeaSchema } from "@/lib/validation/content-idea-schema";

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
