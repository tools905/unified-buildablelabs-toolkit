// Pure token-overlap similarity — no AI, no network call. Shared by
// duplicate-ticket-service.ts (comparing a new ticket against existing
// tickets) and linear-link-service.ts (comparing a ticket against Linear
// issue titles) so both use identical, independently-tested scoring.

// Common words that carry no task-identifying meaning on their own — so
// "Implement Patient APIs" vs "Implement Patient APIs with tenant isolation"
// compares on {implement, patient, apis, tenant, isolation}, not diluted by
// "with".
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "with", "in", "on", "at",
  "by", "from", "is", "are", "be", "this", "that", "into", "via", "using",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

export type SimilarityScore = { jaccard: number; containment: number };

/**
 * `containment`: what fraction of the SMALLER token set also appears in the
 * other — catches "same thing, more detail" (one title is a superset of the
 * other's words). `jaccard`: overlap relative to the combined vocabulary of
 * both — catches same-length text reworded differently. Callers typically
 * treat `Math.max(jaccard, containment)` as a single confidence score.
 */
export function scoreSimilarity(a: Set<string>, b: Set<string>): SimilarityScore {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0 };
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return { jaccard: shared / union, containment: shared / Math.min(a.size, b.size) };
}
