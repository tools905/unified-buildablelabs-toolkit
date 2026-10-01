const EXTENSION_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

// Images are re-encoded when they are uploaded, so the stored file can differ from the
// name it was uploaded under. Make the saved name match what is actually inside the file.
export function downloadFileName(fileName: string | null, mimeType: string) {
  const extension = EXTENSION_BY_MIME[mimeType];
  const base = (fileName?.trim() || "attachment").replace(/\.[^./\\]+$/, "");
  return extension ? `${base}.${extension}` : fileName?.trim() || "attachment";
}

// The files live on another origin, where <a download> alone is ignored, so fetch the bytes
// and save them from a local object URL. If that is blocked, fall back to opening the file.
export async function downloadAttachment(url: string, fileName: string | null) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = downloadFileName(fileName, blob.type);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
