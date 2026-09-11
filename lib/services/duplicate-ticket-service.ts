import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreSimilarity, tokenize } from "@/lib/utils/text-similarity";

const MAX_CANDIDATES = 50;

// Containment: what fraction of the SHORTER title's words also appear in
// the longer one. High containment is the "same task, more detail" pattern
// — 0.85 tolerates one extra/missing word without over-matching.
const CONTAINMENT_THRESHOLD = 0.85;
// Jaccard: overlap relative to the combined vocabulary of both titles.
// Catches same-length titles worded differently, where containment alone
// wouldn't apply as cleanly.
const JACCARD_THRESHOLD = 0.6;

export type DuplicateTicketMatch = {
  ticketId: string;
  title: string;
  confidence: number;
  reasoning: string;
};

/**
 * Judges whether a new ticket's title already describes the same work as an
 * existing open ticket in the workspace — catches cases like "Implement
 * Patient APIs" vs "Implement Patient APIs with tenant isolation" that share
 * almost all wording but differ in detail. Pure token-overlap, no AI call:
 * containment (does the shorter title's whole vocabulary show up in the
 * longer one?) catches the "same task, more detail" pattern; Jaccard
 * similarity catches same-length titles reworded slightly differently.
 * Deliberately does NOT flag titles that merely share a couple of common
 * words (e.g. "Implement Patient APIs" vs "Write tests for Patient APIs" —
 * both mention "Patient APIs" but describe different work).
 *
 * Only compares against open tickets (not `done`) — finished work doesn't
 * block recreating something for a legitimate follow-up. Never throws — a
 * DB error just means "no duplicate found," never blocking ticket creation.
 */
export async function findDuplicateTicket(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  input: { title: string; description?: string | null },
  excludeTicketId?: string,
): Promise<DuplicateTicketMatch | null> {
  try {
    const newTokens = tokenize(input.title);
    if (newTokens.size === 0) return null;

    let query = supabase
      .from("tickets")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .neq("status", "done")
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);
    if (excludeTicketId) query = query.neq("id", excludeTicketId);

    const { data: candidates, error } = await query;
    if (error) throw error;
    if (!candidates?.length) return null;

    let best: DuplicateTicketMatch | null = null;
    for (const candidate of candidates as Array<{ id: string; title: string }>) {
      const { jaccard, containment } = scoreSimilarity(newTokens, tokenize(candidate.title));
      if (containment < CONTAINMENT_THRESHOLD && jaccard < JACCARD_THRESHOLD) continue;

      const confidence = Math.max(jaccard, containment);
      const reasoning =
        containment >= CONTAINMENT_THRESHOLD
          ? `Shares all its key words with "${candidate.title}".`
          : `Titles are ${Math.round(jaccard * 100)}% similar in wording.`;

      if (!best || confidence > best.confidence) {
        best = { ticketId: candidate.id, title: candidate.title, confidence, reasoning };
      }
    }
    return best;
  } catch {
    return null;
  }
}
