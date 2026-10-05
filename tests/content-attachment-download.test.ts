import { describe, expect, it, vi } from "vitest";
import { signDownload } from "@/lib/services/content-attachment-service";

// A stand-in for the database and storage that records what was asked of storage.
function fakeSupabase(row: Record<string, unknown> | null, sign: { url?: string; error?: Error } = { url: "https://storage/signed?download=x" }) {
  const createSignedUrl = vi.fn(async () => (sign.error ? { data: null, error: sign.error } : { data: { signedUrl: sign.url }, error: null }));
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    }),
    storage: { from: () => ({ createSignedUrl }) },
  };
  return { client: client as never, createSignedUrl };
}

describe("signDownload", () => {
  it("asks storage for a save-as link named after the upload, with the real extension", async () => {
    const { client, createSignedUrl } = fakeSupabase({ id: "a1", kind: "image", storage_path: "ws/idea/abc.webp", file_name: "1st slide.png" });
    const result = await signDownload(client, "a1");
    expect(result).toEqual({ url: "https://storage/signed?download=x" });
    expect(createSignedUrl).toHaveBeenCalledWith("ws/idea/abc.webp", 3600, { download: "1st slide.webp" });
  });

  it("names a PDF after the uploaded file", async () => {
    const { client, createSignedUrl } = fakeSupabase({ id: "a2", kind: "pdf", storage_path: "ws/idea/x.pdf", file_name: "Carousel.pdf" });
    await signDownload(client, "a2");
    expect(createSignedUrl).toHaveBeenCalledWith("ws/idea/x.pdf", 3600, { download: "Carousel.pdf" });
  });

  it("refuses links, missing attachments and files without a stored copy", async () => {
    await expect(signDownload(fakeSupabase({ id: "l", kind: "link", storage_path: null, file_name: null }).client, "l")).rejects.toThrow("can't be downloaded");
    await expect(signDownload(fakeSupabase(null).client, "gone")).rejects.toThrow("can't be downloaded");
  });

  it("passes on a storage failure", async () => {
    const { client } = fakeSupabase({ id: "a1", kind: "image", storage_path: "p.webp", file_name: "x" }, { error: new Error("storage down") });
    await expect(signDownload(client, "a1")).rejects.toThrow("storage down");
  });
});
