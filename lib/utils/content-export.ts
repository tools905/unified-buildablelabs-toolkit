import { createHash } from "node:crypto";

// The name the downloaded PDF is saved under: the idea's title, made safe for every file system.
export function ideaPdfFileName(title: string | null | undefined) {
  const base = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} _-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return `${base || "post"}.pdf`;
}

// Identifies one exact set of uploaded files. Uploads never change once stored, so the same set
// always makes the same PDF and a PDF made earlier can be handed out again instead of rebuilt.
export function exportKey(files: { id: string }[]) {
  return createHash("sha256")
    .update(files.map((file) => file.id).join(","))
    .digest("hex")
    .slice(0, 20);
}

// Pages are sized from the picture itself (one pixel becomes one point), but kept within what PDF
// readers handle comfortably.
const MAX_PAGE_SIDE = 2000;

export function pageSizeFor(width: number, height: number) {
  const scale = Math.min(1, MAX_PAGE_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
