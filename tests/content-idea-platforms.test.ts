import { describe, expect, it } from "vitest";
import { createContentIdeaSchema, platformsSchema, updateContentIdeaSchema } from "@/lib/validation/content-idea-schema";
import { ideaPlatforms } from "@/components/content-board/types";

describe("platformsSchema", () => {
  it("accepts several platforms and drops repeats", () => {
    expect(platformsSchema.parse(["linkedin", "instagram", "linkedin"])).toEqual(["linkedin", "instagram"]);
  });

  it("counts no platform picked as Any", () => {
    expect(platformsSchema.parse([])).toEqual(["any"]);
  });

  it("rejects unknown platforms", () => {
    expect(platformsSchema.safeParse(["linkedin", "tiktok"]).success).toBe(false);
  });

  it("is sent when creating (empty means Any) and optional when editing", () => {
    expect(createContentIdeaSchema.safeParse({ title: "Hello" }).success).toBe(false);
    expect(createContentIdeaSchema.parse({ title: "Hello", platforms: [] }).platforms).toEqual(["any"]);
    expect(createContentIdeaSchema.safeParse({ title: "Hello", platforms: ["blog", "newsletter"] }).success).toBe(true);
    expect(updateContentIdeaSchema.safeParse({ title: "Hello" }).success).toBe(true);
    expect(updateContentIdeaSchema.parse({ platforms: [] }).platforms).toEqual(["any"]);
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
