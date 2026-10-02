import type { Draft } from "@/lib/capsule/types";

// A short code that changes whenever the writer changes anything a capsule is built from. A capsule
// remembers the code from the moment it was sealed, so the app can tell when the draft has moved on.
// (FNV-1a over the fields; not a security hash.)
export function draftVersion(draft: Draft): string {
  const text = JSON.stringify([draft.title, draft.subtitle, draft.tags, draft.body, draft.canonicalUrl]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
