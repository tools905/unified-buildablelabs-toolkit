// The link to the finished post on Medium or Substack, pasted back by the writer after publishing.
// Optional: blank means "no link". Anything else must be a real web address.
export type LiveUrlResult = { ok: true; url: string | null } | { ok: false; error: string };

export function parseLiveUrl(value: string): LiveUrlResult {
  const text = value.trim();
  if (!text) return { ok: true, url: null };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: "That doesn't look like a web address. Paste the full link, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "The link must start with https://" };
  }
  return { ok: true, url: parsed.toString() };
}

// Where each platform keeps the setting that tells search engines which copy is the original.
// Medium's is documented; Substack's has not been confirmed yet, so the wording stays careful.
export const CANONICAL_HINT = {
  medium: "On Medium, open the story's ••• menu, choose More settings, then Customize canonical link, and paste this address.",
  substack: "On Substack, look in the post's settings for an original-link (canonical) option and paste this address. This hasn't been confirmed yet.",
} as const;
