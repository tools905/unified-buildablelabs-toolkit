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

// Average lightness of an image on a 0 (black) to 100 (white) scale, read from a tiny copy.
function measureBrightness(bitmap: ImageBitmap) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 50;
  context.drawImage(bitmap, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return Math.round((total / (size * size) / 255) * 100);
}

// Shrinks one image for the newsletter and reports how bright it is.
export async function prepareNewsletterImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const image = await render(bitmap, MAX_SIDE, 0.82, file, true);
    return { image, brightness: measureBrightness(bitmap) };
  } finally {
    bitmap.close();
  }
}
