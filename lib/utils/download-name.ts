const EXTENSION_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

// The file type of a stored file, read from its path. Images are re-encoded when they are uploaded, so
// the stored file's own extension is the truth about what is inside it.
export function mimeTypeFromPath(path: string): string {
  const extension = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

// The name a downloaded file is saved under: the name it was uploaded with, but with the extension
// matching what is actually inside the file.
export function downloadFileName(fileName: string | null, mimeType: string) {
  const extension = EXTENSION_BY_MIME[mimeType];
  const base = (fileName?.trim() || "attachment").replace(/\.[^./\\]+$/, "");
  return extension ? `${base}.${extension}` : fileName?.trim() || "attachment";
}
