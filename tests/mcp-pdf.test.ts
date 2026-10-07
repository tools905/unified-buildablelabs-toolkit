import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { download, storageFrom } = vi.hoisted(() => {
  const download = vi.fn();
  return { download, storageFrom: vi.fn(() => ({ download })) };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: storageFrom } }) }));

import { renderPdfPages } from "@/lib/mcp/pdf-pages";
import { getPdfPagesTool } from "@/lib/mcp/tools/pdf";
import { isMcpToolFailure } from "@/lib/mcp/errors";
import { isWithImages } from "@/lib/mcp/tool-result";
import type { McpCaller } from "@/lib/mcp/contract";
import { fakeBoardDb, type Row } from "./helpers/fake-board-db";

const pdfBytes = () => new Uint8Array(readFileSync(join(__dirname, "fixtures", "three-page-carousel.pdf")));

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const FILE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const PICTURE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const FOREIGN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";

function jpegSize(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]); // starts like a JPEG file
  for (let i = 2; i < bytes.length - 8; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] >= 0xc0 && bytes[i + 1] <= 0xc2) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
  }
  throw new Error("no size in the picture");
}

describe("PDFs that don't carry their fonts", () => {
  it("are drawn with pdfjs's own font files, without asking for ones the server doesn't have", async () => {
    const warnings: string[] = [];
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn")].map((spy) => spy.mockImplementation((...args) => void warnings.push(args.join(" "))));
    try {
      const bytes = new Uint8Array(readFileSync(join(__dirname, "fixtures", "standard-font.pdf")));
      const result = await renderPdfPages(bytes, 1, undefined);
      expect(result.pageCount).toBe(1);
      expect(result.images).toHaveLength(1);
      expect(warnings.filter((line) => /standardFontDataUrl|font/i.test(line))).toEqual([]);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

describe("renderPdfPages", () => {
  it("draws each page as a JPEG no larger than 1200 pixels on its longest side", async () => {
    const result = await renderPdfPages(pdfBytes(), 1, undefined);
    expect(result).toMatchObject({ pageCount: 3, firstPage: 1, lastPage: 3 });
    expect(result.images).toHaveLength(3);
    for (const image of result.images) {
      expect(image.mimeType).toBe("image/jpeg");
      const { width, height } = jpegSize(image.data);
      expect(Math.max(width, height)).toBe(1200);
      expect(Math.min(width, height)).toBeGreaterThan(900);
    }
  });

  it("draws only the pages asked for", async () => {
    const middle = await renderPdfPages(pdfBytes(), 2, 2);
    expect(middle).toMatchObject({ firstPage: 2, lastPage: 2 });
    expect(middle.images).toHaveLength(1);
    const tail = await renderPdfPages(pdfBytes(), 2, 99);
    expect(tail).toMatchObject({ firstPage: 2, lastPage: 3 }); // stops at the last page of the file
  });

  it("refuses a page that isn't in the file", async () => {
    await expect(renderPdfPages(pdfBytes(), 4, undefined)).rejects.toMatchObject({ code: "invalid_input", message: expect.stringContaining("3 pages") });
  });

  it("says so when the file isn't a readable PDF", async () => {
    await expect(renderPdfPages(new TextEncoder().encode("this is not a pdf"), 1, undefined)).rejects.toMatchObject({
      code: "invalid_input",
      message: expect.stringContaining("could not be read"),
    });
  });
});

describe("get_pdf_pages", () => {
  const attachment = (id: string, over: Row = {}): Row => ({
    id,
    idea_id: "i1",
    workspace_id: WORKSPACE,
    kind: "pdf",
    storage_path: `${WORKSPACE}/i1/${id}.pdf`,
    ...over,
  });
  const caller = (client: never): McpCaller => ({ userId: "u", workspaceId: WORKSPACE, clientId: "c", supabase: client });
  const setup = () =>
    fakeBoardDb({
      content_idea_attachments: [
        attachment(FILE),
        attachment(PICTURE, { kind: "image", storage_path: `${WORKSPACE}/i1/p.png` }),
        attachment(FOREIGN, { workspace_id: OTHER_WORKSPACE, storage_path: `${OTHER_WORKSPACE}/i1/x.pdf` }),
      ],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
  async function failureCode(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (isMcpToolFailure(error)) return error.code;
      throw error;
    }
    return "no failure";
  }

  beforeEach(() => {
    download.mockReset();
    storageFrom.mockClear();
    download.mockResolvedValue({ data: new Blob([pdfBytes()]), error: null });
  });

  it("reads the stored file and answers with the page count and the pictures", async () => {
    const result = await getPdfPagesTool(caller(setup().client), { attachment_id: FILE, first_page: 2, last_page: 3 });
    expect(isWithImages(result)).toBe(true);
    expect(result.value).toEqual({ attachment_id: FILE, page_count: 3, first_page: 2, last_page: 3 });
    expect(result.images).toHaveLength(2);
    expect(storageFrom).toHaveBeenCalledWith("content-attachments");
    expect(download).toHaveBeenCalledWith(`${WORKSPACE}/i1/${FILE}.pdf`);
  });

  it("starts at the first page by default", async () => {
    const result = await getPdfPagesTool(caller(setup().client), { attachment_id: FILE });
    expect(result.value).toMatchObject({ first_page: 1, last_page: 3 });
  });

  it("refuses a file that isn't there, belongs to another workspace, or isn't a PDF, without reading storage", async () => {
    const { client } = setup();
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: "99999999-9999-4999-8999-999999999999" }))).toBe("not_found");
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: FOREIGN }))).toBe("not_found");
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: PICTURE }))).toBe("invalid_input");
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a stored path that points outside the workspace", async () => {
    const { client, tables } = setup();
    tables.content_idea_attachments[0].storage_path = `${OTHER_WORKSPACE}/i1/sneaky.pdf`;
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: FILE }))).toBe("not_found");
    expect(download).not.toHaveBeenCalled();
  });

  it("says so when the stored file is missing, and checks the page range", async () => {
    const { client } = setup();
    download.mockResolvedValue({ data: null, error: new Error("not found") });
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: FILE }))).toBe("not_found");
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: FILE, first_page: 5, last_page: 2 }))).toBe("invalid_input");
    expect(await failureCode(getPdfPagesTool(caller(client), { attachment_id: FILE, first_page: 1, last_page: 12 }))).toBe("invalid_input");
  });
});
