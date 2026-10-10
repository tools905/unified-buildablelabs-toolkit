import { describe, expect, it } from "vitest";
import { MAX_PAGE_IMAGES, pageImagesPrefix, pageImagesReady } from "@/lib/utils/page-images";

describe("PDF page pictures", () => {
  it("are stored next to the PDF", () => {
    expect(pageImagesPrefix("w/i/abc.pdf")).toBe("w/i/abc_pages/");
  });

  it("are used only once every page has one", () => {
    const page = { path: "p", width: 1280, height: 1600 };
    expect(pageImagesReady([page, page], 2)).toBe(true);
    expect(pageImagesReady([page], 2)).toBe(false);
    expect(pageImagesReady(null, 2)).toBe(false);
    expect(pageImagesReady([page], null)).toBe(false);
    // A very long PDF is drawn up to the preview's limit.
    expect(pageImagesReady(Array(MAX_PAGE_IMAGES).fill(page), 80)).toBe(true);
  });
});
