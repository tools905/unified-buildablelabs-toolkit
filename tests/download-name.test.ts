import { describe, expect, it } from "vitest";
import { downloadFileName } from "@/lib/utils/download-name";

describe("downloadFileName", () => {
  it("keeps the name and matches the extension to the real file type", () => {
    expect(downloadFileName("carousel.pdf", "application/pdf")).toBe("carousel.pdf");
    expect(downloadFileName("slide-1.png", "image/webp")).toBe("slide-1.webp");
    expect(downloadFileName("photo.JPEG", "image/jpeg")).toBe("photo.jpg");
  });

  it("adds an extension when the name has none", () => {
    expect(downloadFileName("cover", "image/png")).toBe("cover.png");
  });

  it("falls back to a generic name and leaves unknown types alone", () => {
    expect(downloadFileName(null, "application/pdf")).toBe("attachment.pdf");
    expect(downloadFileName("clip.mp4", "video/mp4")).toBe("clip.mp4");
  });
});

describe("mimeTypeFromPath", () => {
  it("reads the real type from the stored file's extension", async () => {
    const { mimeTypeFromPath } = await import("@/lib/utils/download-name");
    expect(mimeTypeFromPath("ws/idea/abc.webp")).toBe("image/webp");
    expect(mimeTypeFromPath("ws/idea/abc.PDF")).toBe("application/pdf");
    expect(mimeTypeFromPath("ws/idea/abc.jpeg?token=x")).toBe("image/jpeg");
    expect(mimeTypeFromPath("ws/idea/abc")).toBe("application/octet-stream");
  });
});
