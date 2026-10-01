export const CONTENT_BUCKET = "content-attachments";
export const MAX_ATTACHMENTS_PER_IDEA = 12;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const MAX_REFERENCE_LINKS = 10;

// Matches the database check on content_idea_review_points.body.
export const MIN_REVIEW_POINT_LENGTH = 2;
export const MAX_REVIEW_POINT_LENGTH = 500;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

// A cheap check that can run before anything is uploaded (or before an idea is created).
export function checkAttachmentFile(file: { type: string; size: number }): string | null {
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(file.type)) return "Use PNG, JPG, WebP or PDF files.";
  if (isPdf && file.size > MAX_ATTACHMENT_BYTES) return "PDFs can be up to 15 MB.";
  return null;
}
