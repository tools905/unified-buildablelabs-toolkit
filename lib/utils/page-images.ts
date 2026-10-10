// Page pictures of a PDF carousel (see content-page-images-service.ts): shared by the server, which draws
// and lists them, and the board, which shows them.

export type PageImageInfo = { path: string; width: number; height: number };

// Longest side of a page picture, in pixels: sharp on a phone or iPad, with room to zoom in a little.
export const PAGE_IMAGE_SIDE = 1600;
// Pages beyond this are not drawn (the preview shows at most this many; see MAX_PREVIEW_PAGES).
export const MAX_PAGE_IMAGES = 30;

// Where a PDF's page pictures are stored: next to it, as "<file>_pages/1.webp", "<file>_pages/2.webp", ….
export function pageImagesPrefix(storagePath: string) {
  return `${storagePath.replace(/\.pdf$/i, "")}_pages/`;
}

// Whether every page (up to the limit) has its picture.
export function pageImagesReady(pages: unknown, pageCount: number | null | undefined) {
  return Array.isArray(pages) && typeof pageCount === "number" && pageCount > 0 && pages.length >= Math.min(pageCount, MAX_PAGE_IMAGES);
}
