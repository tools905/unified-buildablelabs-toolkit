const MAX_SIDE = 1600;
const THUMB_SIDE = 360;

export type PreparedImage = {
  full: { blob: Blob; ext: string; contentType: string };
  thumb: { blob: Blob; ext: string; contentType: string };
};

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function render(bitmap: ImageBitmap, maxSide: number, quality: number, original: File, keepOriginalIfSmaller: boolean) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process this image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let blob = await toBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new Error("Could not process this image.");

  if (keepOriginalIfSmaller && scale === 1 && original.size <= blob.size) {
    const ext = original.type === "image/png" ? "png" : original.type === "image/webp" ? "webp" : "jpg";
    return { blob: original as Blob, ext, contentType: original.type };
  }
  const isWebp = blob.type === "image/webp";
  return { blob, ext: isWebp ? "webp" : "jpg", contentType: blob.type };
}

// Shrinks an image to at most 1600px and makes a 360px thumbnail for board cards.
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const full = await render(bitmap, MAX_SIDE, 0.82, file, true);
    const thumb = await render(bitmap, THUMB_SIDE, 0.75, file, false);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}
