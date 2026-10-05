// Draws the first page of a PDF as a small picture for the board card. Returns null if the PDF
// can't be read; the card then just says "PDF carousel".
const THUMB_SIDE = 640;

export async function renderPdfThumbnail(file: Blob): Promise<Blob | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas, viewport }).promise;
      const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
      const webp = await toBlob("image/webp");
      return webp && webp.type === "image/webp" ? webp : await toBlob("image/jpeg");
    } finally {
      await task.destroy();
    }
  } catch {
    return null;
  }
}
