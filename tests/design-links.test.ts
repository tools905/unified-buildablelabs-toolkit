import { describe, expect, it } from "vitest";
import { isHttpsUrl, toEmbedUrl } from "@/lib/utils/design-links";

describe("toEmbedUrl", () => {
  it("wraps Figma links in the Figma embed endpoint", () => {
    const url = "https://www.figma.com/design/AbC123/Carousel?node-id=1-2";
    expect(toEmbedUrl(url)).toBe(`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`);
  });

  it("adds ?embed to Canva view links and drops tracking params", () => {
    expect(toEmbedUrl("https://www.canva.com/design/DAF1/abc123/view?utm_content=x&utm_source=y")).toBe(
      "https://www.canva.com/design/DAF1/abc123/view?embed",
    );
    expect(toEmbedUrl("https://canva.com/design/DAF1/watch")).toBe("https://www.canva.com/design/DAF1/watch?embed");
  });

  it("does not embed Canva edit links", () => {
    expect(toEmbedUrl("https://www.canva.com/design/DAF1/abc123/edit")).toBeNull();
  });

  it("turns Google Drive files and Slides into preview/embed URLs", () => {
    expect(toEmbedUrl("https://drive.google.com/file/d/FILE_ID/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/FILE_ID/preview",
    );
    expect(toEmbedUrl("https://docs.google.com/presentation/d/DECK_ID/edit#slide=id.p")).toBe(
      "https://docs.google.com/presentation/d/DECK_ID/embed",
    );
    expect(toEmbedUrl("https://docs.google.com/document/d/DOC_ID/edit")).toBe(
      "https://docs.google.com/document/d/DOC_ID/preview",
    );
  });

  it("rejects unknown hosts, non-https and junk", () => {
    expect(toEmbedUrl("https://example.com/carousel")).toBeNull();
    expect(toEmbedUrl("http://www.figma.com/design/x/y")).toBeNull();
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(toEmbedUrl("not a url")).toBeNull();
    expect(toEmbedUrl("https://figma.com.evil.com/design/x/y")).toBeNull();
  });
});

describe("isHttpsUrl", () => {
  it("only accepts https", () => {
    expect(isHttpsUrl("https://example.com/a")).toBe(true);
    expect(isHttpsUrl("http://example.com/a")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("nope")).toBe(false);
  });
});
