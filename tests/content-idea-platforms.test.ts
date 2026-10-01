import { describe, expect, it } from "vitest";
import { createContentIdeaSchema, platformsSchema, updateContentIdeaSchema } from "@/lib/validation/content-idea-schema";
import { ideaPlatforms } from "@/components/content-board/types";

describe("platformsSchema", () => {
  it("accepts several platforms and drops repeats", () => {
    expect(platformsSchema.parse(["linkedin", "instagram", "linkedin"])).toEqual(["linkedin", "instagram"]);
  });

  it("needs at least one platform", () => {
    const result = platformsSchema.safeParse([]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Pick at least one platform.");
  });

  it("rejects unknown platforms", () => {
    expect(platformsSchema.safeParse(["linkedin", "tiktok"]).success).toBe(false);
  });

  it("is required when creating, optional when editing", () => {
    expect(createContentIdeaSchema.safeParse({ title: "Hello" }).success).toBe(false);
    expect(createContentIdeaSchema.safeParse({ title: "Hello", platforms: ["blog", "newsletter"] }).success).toBe(true);
    expect(updateContentIdeaSchema.safeParse({ title: "Hello" }).success).toBe(true);
    expect(updateContentIdeaSchema.safeParse({ platforms: [] }).success).toBe(false);
  });
});

describe("ideaPlatforms", () => {
  it("lists the chosen platforms in the usual order", () => {
    expect(ideaPlatforms({ platform: "newsletter", platforms: ["newsletter", "instagram", "blog"] })).toEqual([
      "instagram",
      "blog",
      "newsletter",
    ]);
  });

  it("falls back to the single platform for older ideas", () => {
    expect(ideaPlatforms({ platform: "x", platforms: [] })).toEqual(["x"]);
    expect(ideaPlatforms({ platform: "x" })).toEqual(["x"]);
  });

  it("keeps a platform this build doesn't know about", () => {
    expect(ideaPlatforms({ platform: "threads", platforms: ["linkedin", "threads"] })).toEqual(["linkedin", "threads"]);
  });
});
