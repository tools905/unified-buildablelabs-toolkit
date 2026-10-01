import { describe, expect, it } from "vitest";
import {
  findStoryImageAt,
  formatStoryImage,
  parseStoryImageLine,
  splitImageSettings,
  storyImageStyle,
} from "@/lib/utils/newsletter-story-image";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";

const URL = "https://x.supabase.co/storage/v1/object/public/newsletter-images/a/b/c.webp";

describe("story image settings", () => {
  it("reads an image with no settings as full width and centred", () => {
    expect(parseStoryImageLine(`![cat](${URL})`)).toEqual({ alt: "cat", url: URL, size: "full", align: "center" });
  });

  it("reads and writes size and alignment", () => {
    const line = `![cat](${URL}#nl=small,left)`;
    const image = parseStoryImageLine(line)!;
    expect(image).toEqual({ alt: "cat", url: URL, size: "small", align: "left" });
    expect(formatStoryImage(image)).toBe(line);
  });

  it("writes the plain form for the default so old images stay untouched", () => {
    expect(formatStoryImage({ alt: "cat", url: URL, size: "full", align: "center" })).toBe(`![cat](${URL})`);
  });

  it("ignores lines that are not just an image", () => {
    expect(parseStoryImageLine("Some text ![cat](x)")).toBeNull();
    expect(parseStoryImageLine("plain text")).toBeNull();
  });

  it("splits the address from its settings", () => {
    expect(splitImageSettings(`${URL}#nl=medium,center`)).toEqual({ url: URL, size: "medium", align: "center" });
    expect(splitImageSettings(URL)).toEqual({ url: URL, size: "full", align: "center" });
  });

  it("finds the image line under the caret", () => {
    const body = `Intro.\n\n![cat](${URL})\n\nOutro.`;
    const inside = body.indexOf("![cat]") + 4;
    const found = findStoryImageAt(body, inside)!;
    expect(body.slice(found.start, found.end)).toBe(`![cat](${URL})`);
    expect(findStoryImageAt(body, 2)).toBeNull();
  });
});

describe("rendering story images", () => {
  it("draws an image with no settings full width", () => {
    const html = renderNewsletterMarkdown(`![cat](${URL})`);
    expect(html).toContain(`src="${URL}"`);
    expect(html).toContain("width:100%");
  });

  it("applies size and alignment without leaking the settings into the address", () => {
    const small = renderNewsletterMarkdown(`![cat](${URL}#nl=small,left)`);
    expect(small).toContain("width:40%");
    expect(small).toContain("margin-left:0");
    expect(small).not.toContain("#nl=");
    const medium = renderNewsletterMarkdown(`![cat](${URL}#nl=medium,center)`);
    expect(medium).toContain("width:65%");
    expect(medium).toContain("margin-left:auto");
  });

  it("cannot be broken out of the attribute by the alt text", () => {
    const html = renderNewsletterMarkdown(`![a" onerror="x](${URL})`);
    expect(html).not.toContain('onerror="x"');
  });

  it("uses only fixed style values", () => {
    expect(storyImageStyle("medium", "left")).toBe("display:block;width:65%;max-width:100%;margin-left:0;margin-right:auto");
  });
});
