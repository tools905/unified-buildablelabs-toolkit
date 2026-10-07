import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { MCP_LIMITS } from "@/lib/mcp/contract";
import { McpToolFailure } from "@/lib/mcp/errors";
import type { McpImage } from "@/lib/mcp/tool-result";

// Draws the pages of a PDF as pictures, so the app can look at a design the way a person would. The PDF
// reader and its drawing surface come from pdfjs-dist, which is also what the board uses in the browser
// to make a card's thumbnail. Pages come out as JPEG with the longest side at most pdfPageMaxPixels.

const JPEG_QUALITY = 80;

// Found by its place under node_modules instead of by resolving its name: a bundler turns a resolve call into a
// module number, which is not a path.
function pdfjsFolder() {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist");
}

// The PDF reader is opened from its own file at run time instead of being bundled: it finds its worker by its own
// path, which a bundle would move, and the board's browser code bundles the same package for its own use. The
// ignore comments keep both builds (webpack and Turbopack) from touching this import, and next.config.ts makes
// sure the file ships with the routes that draw or open PDFs.
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
async function loadPdfjs(): Promise<Pdfjs> {
  const file = path.join(pdfjsFolder(), "legacy", "build", "pdf.mjs");
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(file).href);
}

// The fonts and character maps pdfjs needs for PDFs that don't carry their own (a server has no system fonts to
// fall back on). They sit inside the pdfjs-dist package, and next.config.ts makes sure they ship with the routes.
function pdfjsFiles() {
  const folder = pdfjsFolder();
  return {
    standardFontDataUrl: path.join(folder, "standard_fonts") + path.sep,
    cMapUrl: path.join(folder, "cmaps") + path.sep,
    cMapPacked: true,
  };
}

// pdfjs loads its drawing surface from @napi-rs/canvas by itself, at run time, where the build can't see it. Loading it
// here, by name, makes the build ship the package (and its file for the server's platform) with every route that
// draws pages. It is loaded when a page is drawn, not when this file is read, so a problem with it can never
// stop the connector's other tools from starting.
const loadDrawingSurface = () => import("@napi-rs/canvas");

const openOptions = (pdf: Uint8Array) => ({ data: pdf.slice(), ...pdfjsFiles() });

const THUMBNAIL_PIXELS = 640;

type DrawingSurface = { create: (width: number, height: number) => { canvas: { toBuffer: (type: string, quality: number) => Uint8Array }; context: unknown } };
type OpenedPdf = { getPage: (number: number) => Promise<any>; canvasFactory: unknown };

// The PDF reader takes over the bytes it is given (the caller's copy ends up empty), so each function here
// hands it a copy and leaves the caller's bytes alone.

// One page as JPEG bytes, scaled so its longest side is `longestSide` pixels.
async function drawPage(doc: OpenedPdf, number: number, longestSide: number): Promise<Uint8Array> {
  const page = await doc.getPage(number);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: longestSide / Math.max(base.width, base.height) });
    const { canvas, context } = (doc.canvasFactory as DrawingSurface).create(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    return canvas.toBuffer("image/jpeg", JPEG_QUALITY);
  } finally {
    page.cleanup();
  }
}


// How many pages a PDF has, or null when it can't be opened. Used to check a stored file really is a PDF.
export async function countPdfPages(pdf: Uint8Array): Promise<number | null> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument(openOptions(pdf));
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

// A small JPEG of the first page, for the board card, when the browser did not send one.
export async function renderPdfThumbnail(pdf: Uint8Array): Promise<Uint8Array | null> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument(openOptions(pdf));
  try {
    await loadDrawingSurface();
    return await drawPage(await task.promise, 1, THUMBNAIL_PIXELS);
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

export type RenderedPages = { pageCount: number; firstPage: number; lastPage: number; images: McpImage[] };

export async function renderPdfPages(pdf: Uint8Array, firstPage: number, lastPage: number | undefined): Promise<RenderedPages> {
  await loadDrawingSurface();
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument(openOptions(pdf));
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (error) {
      const locked = (error as { name?: string })?.name === "PasswordException";
      throw new McpToolFailure(
        "invalid_input",
        locked ? "This PDF is password protected, so its pages can't be shown." : "This PDF could not be read. It may be damaged.",
      );
    }

    const pageCount = doc.numPages;
    if (firstPage > pageCount) {
      throw new McpToolFailure("invalid_input", `This PDF has ${pageCount} ${pageCount === 1 ? "page" : "pages"}, so it has no page ${firstPage}.`);
    }
    const last = Math.min(lastPage ?? firstPage + MCP_LIMITS.pdfPagesPerCall - 1, pageCount, firstPage + MCP_LIMITS.pdfPagesPerCall - 1);

    const images: McpImage[] = [];
    for (let number = firstPage; number <= last; number++) {
      const jpeg = await drawPage(doc, number, MCP_LIMITS.pdfPageMaxPixels);
      images.push({ mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") });
    }
    return { pageCount, firstPage, lastPage: last, images };
  } finally {
    await task.destroy();
  }
}
