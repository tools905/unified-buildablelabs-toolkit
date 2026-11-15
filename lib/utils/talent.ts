// Talent Bank: the shelves candidates sit on, how long rejected people are kept, which files are
// accepted, and reading contact details out of a resume's text. Shared by the admin screens, the
// public application form and the server.

export type TalentShelf = "new" | "later" | "in_process" | "rejected";

export const SHELVES: { key: TalentShelf; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "Just added, not looked at yet" },
  { key: "later", label: "Keep for later", hint: "Good people, not hiring for them now" },
  { key: "in_process", label: "In process", hint: "Talking to them now" },
  { key: "rejected", label: "Rejected", hint: "Deleted for good 60 days after rejecting" },
];
export const SHELF_LABELS = Object.fromEntries(SHELVES.map((shelf) => [shelf.key, shelf.label])) as Record<TalentShelf, string>;

export const REJECTED_KEEP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// The day a rejected candidate is deleted for good.
export function purgeDate(rejectedAt: string) {
  return new Date(new Date(rejectedAt).getTime() + REJECTED_KEEP_DAYS * DAY_MS);
}

export function daysUntilPurge(rejectedAt: string, now = new Date()) {
  return Math.max(0, Math.ceil((purgeDate(rejectedAt).getTime() - now.getTime()) / DAY_MS));
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_WORK_FILES = 5;
export const MAX_LINKS = 6;
export const ACCEPTED_FILES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "image/png": "Image",
  "image/jpeg": "Image",
  "image/webp": "Image",
  "application/zip": "ZIP",
};
export const RESUME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export const ACCEPT_ATTRIBUTE = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.zip";
export const RESUME_ACCEPT_ATTRIBUTE = ".pdf,.doc,.docx";

// A file name safe for storage: letters, numbers, dots and dashes.
export function storageName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";
  return ext ? `${base}.${ext}` : base;
}

// "https://linkedin.com/in/x" from "linkedin.com/in/x/" or "www.linkedin.com/in/x?utm=..".
export function normalizeUrl(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// What a resume's text says about how to reach the person.
export function contactsFromText(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const linkedin = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0] ?? null;
  // A phone number: optional +country code, then 10 or more digits with spaces or dashes between.
  const phoneMatch = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?){2,4}\d{2,5}/g)?.find((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 13;
  });
  return {
    email: email?.toLowerCase() ?? null,
    phone: phoneMatch?.trim() ?? null,
    linkedin_url: linkedin ? normalizeUrl(linkedin) : null,
  };
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
