import { describe, expect, it } from "vitest";
import {
  checkPost,
  clampRatio,
  countHashtags,
  foldCaption,
  frameRatio,
  ratioLabel,
  tokenizeCaption,
  type PreviewSlide,
} from "@/lib/utils/social-preview";

const slide = (width: number, height: number, source: "image" | "pdf" = "image", id = `${width}x${height}`): PreviewSlide => ({
  id,
  source,
  width,
  height,
  label: id,
});
const codes = (result: ReturnType<typeof checkPost>) => result.map((w) => w.code);

describe("ratios", () => {
  it("names the common shapes and describes the odd ones", () => {
    expect(ratioLabel(1)).toBe("1:1");
    expect(ratioLabel(1080 / 1350)).toBe("4:5");
    expect(ratioLabel(1.91)).toBe("1.91:1");
    expect(ratioLabel(2.4)).toBe("2.40:1");
    expect(ratioLabel(0.5)).toBe("1:2.00");
  });

  it("holds the frame inside what the app allows", () => {
    expect(clampRatio(0.5, "instagram")).toBeCloseTo(0.8);
    expect(clampRatio(3, "instagram")).toBeCloseTo(1.91);
    expect(clampRatio(1, "linkedin")).toBe(1);
  });

  it("uses the first slide's shape for the frame, and a square when it isn't known yet", () => {
    expect(frameRatio([slide(1080, 1350), slide(1080, 1080)], "instagram")).toBeCloseTo(0.8);
    expect(frameRatio([slide(0, 0)], "instagram")).toBe(1);
    expect(frameRatio([], "linkedin")).toBe(1);
  });
});

describe("foldCaption", () => {
  it("shows everything when the caption is short", () => {
    expect(foldCaption("Short and sweet", "instagram")).toEqual({ visible: "Short and sweet", hidden: "", truncated: false });
  });

  it("cuts a long caption near the limit without splitting a word", () => {
    const text = `${"word ".repeat(60)}end`;
    const result = foldCaption(text, "instagram");
    expect(result.truncated).toBe(true);
    expect(result.visible.length).toBeLessThanOrEqual(125);
    expect(result.visible.endsWith("word")).toBe(true);
    expect(`${result.visible} ${result.hidden}`).toBe(text);
  });

  it("cuts after the first lines when there are many line breaks", () => {
    const text = "one\ntwo\nthree\nfour";
    expect(foldCaption(text, "instagram")).toMatchObject({ visible: "one\ntwo", hidden: "three\nfour", truncated: true });
    expect(foldCaption(text, "linkedin")).toMatchObject({ visible: "one\ntwo\nthree", hidden: "four", truncated: true });
  });

  it("copes with empty text and Windows line endings", () => {
    expect(foldCaption(null, "linkedin")).toEqual({ visible: "", hidden: "", truncated: false });
    expect(foldCaption("a\r\nb", "linkedin").visible).toBe("a\nb");
  });
});

describe("tokenizeCaption", () => {
  it("picks out hashtags, mentions and links", () => {
    expect(tokenizeCaption("Hi #AI and #build_in_public with @buildable https://x.com/a?b=1 done")).toEqual([
      { kind: "text", value: "Hi " },
      { kind: "hashtag", value: "#AI" },
      { kind: "text", value: " and " },
      { kind: "hashtag", value: "#build_in_public" },
      { kind: "text", value: " with " },
      { kind: "mention", value: "@buildable" },
      { kind: "text", value: " " },
      { kind: "link", value: "https://x.com/a?b=1" },
      { kind: "text", value: " done" },
    ]);
  });

  it("counts hashtags", () => {
    expect(countHashtags("#a #b text #c")).toBe(3);
    expect(countHashtags("no tags # here")).toBe(0);
    expect(countHashtags(undefined)).toBe(0);
  });
});

describe("checkPost", () => {
  const good = [slide(1080, 1350), slide(1080, 1350)];

  it("has nothing to say about a clean Instagram carousel with a caption", () => {
    expect(checkPost({ platform: "instagram", slides: good, caption: "Nice post #a" })).toEqual([]);
  });

  it("tells the writer when there is nothing to show yet", () => {
    expect(codes(checkPost({ platform: "instagram", slides: [], caption: "x" }))).toEqual(["no-slides"]);
    expect(codes(checkPost({ platform: "instagram", slides: good, caption: "" }))).toEqual(["no-caption"]);
  });

  it("explains skipped design links", () => {
    const warning = checkPost({ platform: "linkedin", slides: [], caption: "x", skippedLinks: 2 }).find((w) => w.code === "links-skipped");
    expect(warning?.message).toContain("2 design links");
  });

  it("warns about slides outside the allowed shapes", () => {
    expect(codes(checkPost({ platform: "instagram", slides: [slide(1080, 1920)], caption: "x" }))).toContain("too-tall");
    expect(codes(checkPost({ platform: "instagram", slides: [slide(2400, 1000)], caption: "x" }))).toContain("too-wide");
    expect(codes(checkPost({ platform: "instagram", slides: [slide(1080, 1350)], caption: "x" }))).not.toContain("too-tall");
  });

  it("warns about low resolution images, but never about PDF pages", () => {
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(600, 750)], caption: "x" }))).toContain("low-resolution");
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(600, 750, "pdf")], caption: "x" }))).not.toContain("low-resolution");
  });

  it("warns that Instagram crops mixed shapes to the first slide", () => {
    const warnings = checkPost({ platform: "instagram", slides: [slide(1080, 1350), slide(1080, 1080)], caption: "x" });
    const mixed = warnings.find((w) => w.code === "mixed-shapes");
    expect(mixed?.message).toContain("slide 2");
    expect(mixed?.message).toContain("4:5");
  });

  it("treats a PDF as unusable on Instagram and unmixable on LinkedIn", () => {
    expect(codes(checkPost({ platform: "instagram", slides: [slide(1080, 1350, "pdf")], caption: "x" }))).toContain("instagram-pdf");
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(1080, 1350, "pdf")], caption: "x" }))).not.toContain("instagram-pdf");
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(1080, 1350, "pdf"), slide(1080, 1350)], caption: "x" }))).toContain("linkedin-mixed");
  });

  it("reminds that a LinkedIn swipe carousel is a PDF when the files are separate images", () => {
    expect(codes(checkPost({ platform: "linkedin", slides: good, caption: "x" }))).toContain("linkedin-use-pdf");
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(1080, 1350, "pdf"), slide(1080, 1350, "pdf", "p2")], caption: "x" }))).not.toContain("linkedin-use-pdf");
    expect(codes(checkPost({ platform: "instagram", slides: good, caption: "x" }))).not.toContain("linkedin-use-pdf");
  });

  it("checks the number of slides, the caption length and the hashtag count", () => {
    const many = Array.from({ length: 21 }, (_, i) => slide(1080, 1350, "image", `s${i}`));
    expect(codes(checkPost({ platform: "instagram", slides: many, caption: "x" }))).toContain("too-many-slides");
    expect(codes(checkPost({ platform: "instagram", slides: good, caption: "a".repeat(2201) }))).toContain("caption-too-long");
    expect(codes(checkPost({ platform: "linkedin", slides: good, caption: "a".repeat(2201) }))).not.toContain("caption-too-long");
    expect(codes(checkPost({ platform: "instagram", slides: good, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }))).toContain("too-many-hashtags");
  });

  it("ignores shapes it doesn't know yet", () => {
    expect(checkPost({ platform: "instagram", slides: [slide(0, 0), slide(0, 0, "image", "b")], caption: "x" })).toEqual([]);
  });
});

describe("findFoldIndex", () => {
  it("returns the whole length when everything fits", async () => {
    const { findFoldIndex } = await import("@/lib/utils/social-preview");
    expect(findFoldIndex("short", () => true)).toBe(5);
  });

  it("finds the longest cut that still fits, ending at a word", async () => {
    const { findFoldIndex } = await import("@/lib/utils/social-preview");
    const text = "one two three four five six seven eight nine ten";
    const cut = findFoldIndex(text, (candidate) => candidate.length + 6 <= 24); // 6 = the "… more" suffix
    expect(cut).toBeLessThanOrEqual(18);
    expect(cut).toBeGreaterThan(10);
    expect(text[cut]).toBe(" ");
  });

  it("cuts mid-word only when there is no space nearby", async () => {
    const { findFoldIndex } = await import("@/lib/utils/social-preview");
    expect(findFoldIndex("x".repeat(100), (candidate) => candidate.length <= 30)).toBe(30);
  });

  it("copes with a candidate that never fits", async () => {
    const { findFoldIndex } = await import("@/lib/utils/social-preview");
    expect(findFoldIndex("text", () => false)).toBe(0);
  });
});

describe("profile grid note", () => {
  it("mentions the 3:4 crop for a square cover but not for a 4:5 one", () => {
    const square = checkPost({ platform: "instagram", slides: [slide(1080, 1080)], caption: "x" });
    expect(square.find((w) => w.code === "profile-crop")?.message).toContain("3:4");
    expect(codes(checkPost({ platform: "instagram", slides: [slide(1080, 1350)], caption: "x" }))).not.toContain("profile-crop");
    expect(codes(checkPost({ platform: "linkedin", slides: [slide(1080, 1080)], caption: "x" }))).not.toContain("profile-crop");
  });
});

describe("coverGetsCropped", () => {
  it("is true for a square or wide cover and false for 4:5, 3:4 or an unknown cover", async () => {
    const { coverGetsCropped } = await import("@/lib/utils/social-preview");
    expect(coverGetsCropped([slide(1080, 1080)])).toBe(true);
    expect(coverGetsCropped([slide(1600, 900)])).toBe(true);
    expect(coverGetsCropped([slide(1080, 1350)])).toBe(false);
    expect(coverGetsCropped([slide(1080, 1440)])).toBe(false);
    expect(coverGetsCropped([slide(0, 0)])).toBe(false);
    expect(coverGetsCropped([])).toBe(false);
  });

  it("only looks at the first slide", async () => {
    const { coverGetsCropped } = await import("@/lib/utils/social-preview");
    expect(coverGetsCropped([slide(1080, 1350), slide(1080, 1080)])).toBe(false);
    expect(coverGetsCropped([slide(1080, 1080), slide(1080, 1350)])).toBe(true);
  });
});
