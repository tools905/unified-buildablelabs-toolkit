import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
// import { requestIntelligenceJson } from "@/modules/shared/ai"; // AI-based Tier 2 — commented out, see judgeSemanticMatch below
import { writeAuditLog } from "@/lib/services/audit-service";
import { getIssueByIdentifier, isLinearConfigured, searchIssues, type LinearIssue } from "@/lib/services/linear-client";
import { scoreSimilarity, tokenize } from "@/lib/utils/text-similarity";
import { linearSettingsSchema, type LinearSettingsInput } from "@/lib/validation/linear-schema";

export async function getLinearSettings(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase
    .from("linear_integration_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setLinearSettings(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  actorId: string,
  rawInput: LinearSettingsInput,
) {
  const input = linearSettingsSchema.parse(rawInput);

  const { data, error } = await supabase
    .from("linear_integration_settings")
    .upsert(
      {
        workspace_id: workspaceId,
        linear_team_ids: input.linearTeamIds,
        suggest_threshold: input.suggestThreshold,
      },
      { onConflict: "workspace_id" },
    )
    .select()
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "linear_settings.updated",
    entityType: "linear_integration_settings",
    entityId: workspaceId,
    metadata: input,
  });

  return data;
}

/**
 * Free-text Linear search for the manual link picker, scoped to the
 * workspace's configured teams (empty = search all teams the API key can
 * see). Never called from the client directly — always behind a server
 * action, since LINEAR_API_KEY must stay server-side.
 */
export async function searchLinearIssuesForWorkspace(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  query: string,
): Promise<LinearIssue[]> {
  if (!query.trim()) return [];
  const settings = await getLinearSettings(supabase, workspaceId);
  const teamIds = settings?.linear_team_ids ?? [];
  return searchIssues(query, { teamIds: teamIds.length ? teamIds : undefined, limit: 20 });
}

/**
 * Links a ticket to a Linear issue. Multiple tickets are currently allowed
 * to link to the same Linear issue (no uniqueness enforced) — a deliberate
 * relaxation for now, revisit if duplicate-tracking across tickets becomes
 * a real problem.
 */
export async function linkTicketToIssue(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  actorId: string,
  issue: LinearIssue,
  source: "manual" | "auto_identifier" | "auto_semantic",
  confidence?: number,
) {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .update({
      linear_issue_id: issue.id,
      linear_issue_identifier: issue.identifier,
      linear_issue_url: issue.url,
      linear_link_source: source,
      linear_link_confidence: confidence ?? null,
      linear_linked_at: new Date().toISOString(),
      linear_linked_by: actorId,
    })
    .eq("id", ticketId)
    .select("*, assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)")
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.linear_linked",
    entityType: "ticket",
    entityId: ticketId,
    metadata: { linearIssueId: issue.id, linearIssueIdentifier: issue.identifier, source },
  });

  return ticket;
}

export async function unlinkTicketFromLinear(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  actorId: string,
) {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .update({
      linear_issue_id: null,
      linear_issue_identifier: null,
      linear_issue_url: null,
      linear_link_source: null,
      linear_link_confidence: null,
      linear_linked_at: null,
      linear_linked_by: null,
    })
    .eq("id", ticketId)
    .select("*, assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)")
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.linear_unlinked",
    entityType: "ticket",
    entityId: ticketId,
  });

  return ticket;
}

const LINEAR_KEY_PATTERN = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i;
const LINEAR_URL_PATTERN = /linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]{1,9}-\d+)/i;

/**
 * Pure text extraction for Tier 1 (deterministic) matching — pulls a Linear
 * issue key out of a ticket's title/description, either typed directly
 * ("ENG-214") or pasted as a Linear URL. Does not call the Linear API; the
 * caller is responsible for verifying the key actually resolves to a real
 * issue before treating it as a match.
 */
export function extractLinearIdentifier(text: string): string | null {
  const urlMatch = text.match(LINEAR_URL_PATTERN);
  if (urlMatch) return urlMatch[1].toUpperCase();

  const keyMatch = text.match(LINEAR_KEY_PATTERN);
  if (keyMatch) return keyMatch[1].toUpperCase();

  return null;
}

/**
 * Tier 1 auto-link: if a ticket's title/description contains a Linear key
 * (e.g. "ENG-214") or a Linear issue URL, and that key resolves to a real
 * issue not already linked to a different ticket, link it automatically —
 * no confirmation needed, since an explicit identifier has no false-positive
 * risk (unlike semantic/title matching, which only ever produces a
 * suggestion — see docs/PRD_LINEAR_INTEGRATION.md §5, §12 Q3).
 *
 * Never throws: a missing/invalid key, an unresolvable identifier, a
 * conflict with an existing link, or a Linear API error all just mean "no
 * auto-link happened" — ticket creation/update must never fail because of
 * this. Only acts when the ticket isn't already linked, so it never
 * overwrites an existing manual or auto link.
 */
export async function detectAndLinkByIdentifier(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticket: { id: string; title: string; description: string | null; linear_issue_id: string | null },
  actorId: string,
) {
  if (ticket.linear_issue_id || !isLinearConfigured()) return ticket;

  const identifier = extractLinearIdentifier(`${ticket.title} ${ticket.description ?? ""}`);
  if (!identifier) return ticket;

  try {
    const issue = await getIssueByIdentifier(identifier);
    if (!issue) return ticket;
    return await linkTicketToIssue(supabase, workspaceId, ticket.id, actorId, issue, "auto_identifier");
  } catch {
    return ticket;
  }
}

const MAX_CANDIDATES = 10;

// --- Original AI-based Tier 2 matching — commented out for now, kept for
// easy revert. Replaced below by a pure token-overlap comparison
// (lib/utils/text-similarity.ts), the same algorithm used by
// duplicate-ticket-service.ts, so Linear matching no longer makes any AI
// call at all. To restore AI-based matching: uncomment this block, the
// `requestIntelligenceJson` import above, and swap the scoring loop in
// detectSemanticMatch below for a call to judgeSemanticMatch().
//
// const MAX_TICKET_TEXT_CHARS = 500;
// type SemanticMatch = { issueId: string; confidence: number; reasoning: string };
//
// async function judgeSemanticMatch(
//   ticket: { title: string; description: string | null },
//   candidates: LinearIssue[],
// ): Promise<SemanticMatch | null> {
//   try {
//     const result = await requestIntelligenceJson<{ match: SemanticMatch | null }>({
//       temperature: 0.1,
//       system: [
//         "You compare a work ticket to a short list of candidate Linear issues and judge whether exactly one candidate describes the same underlying task.",
//         "Be conservative: issues that merely share keywords but describe a different action (e.g. 'obtain access to X' vs 'deploy using X') are NOT a match.",
//         "Return the single best match only if reasonably confident (confidence 0-1). If no candidate is a genuine match, return null for match.",
//       ].join(" "),
//       user: {
//         ticket: {
//           title: ticket.title.slice(0, MAX_TICKET_TEXT_CHARS),
//           description: ticket.description?.slice(0, MAX_TICKET_TEXT_CHARS),
//         },
//         candidates: candidates.map((c) => ({ issueId: c.id, identifier: c.identifier, title: c.title })),
//         requiredJsonShape: {
//           match: { issueId: "string", confidence: "0 to 1", reasoning: "one short sentence" },
//         },
//       },
//     });
//     return result?.data?.match ?? null;
//   } catch {
//     return null;
//   }
// }

/**
 * Tier 2: only runs when Tier 1 (identifier) found nothing. Fetches
 * candidates via Linear's own relevance-ranked search (full-text + vector,
 * server-side on Linear's end — see docs/PRD_LINEAR_INTEGRATION.md §5),
 * then scores each candidate's title against the ticket's title using the
 * same pure token-overlap algorithm as duplicate-ticket-service.ts
 * (`lib/utils/text-similarity.ts`) — no AI call. Links directly to the
 * highest-scoring candidate that clears the workspace's `suggest_threshold`,
 * tagged `linear_link_source = 'auto_semantic'` — distinct from
 * `auto_identifier` and `manual` so a wrong auto-link is always identifiable
 * and easy to audit/unlink later.
 *
 * Runs at most once per ticket (marks linear_match_checked_at regardless of
 * outcome) and never throws — a missing key, no candidates, or a Linear API
 * failure all just mean "no link made."
 */
export async function detectSemanticMatch(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticket: { id: string; title: string; description: string | null; linear_issue_id: string | null; linear_match_checked_at?: string | null },
  actorId: string,
) {
  if (ticket.linear_issue_id || ticket.linear_match_checked_at || !isLinearConfigured()) return;

  try {
    const settings = await getLinearSettings(supabase, workspaceId);
    const teamIds = settings?.linear_team_ids ?? [];
    const threshold = settings?.suggest_threshold ?? 0.5;

    const candidates = await searchIssues(ticket.title, {
      teamIds: teamIds.length ? teamIds : undefined,
      limit: MAX_CANDIDATES,
    });
    if (candidates.length === 0) return;

    const newTokens = tokenize(ticket.title);
    let best: { issue: LinearIssue; confidence: number } | null = null;
    for (const candidate of candidates) {
      const { jaccard, containment } = scoreSimilarity(newTokens, tokenize(candidate.title));
      const confidence = Math.max(jaccard, containment);
      if (confidence < threshold) continue;
      if (!best || confidence > best.confidence) {
        best = { issue: candidate, confidence };
      }
    }
    if (!best) return;

    await linkTicketToIssue(supabase, workspaceId, ticket.id, actorId, best.issue, "auto_semantic", best.confidence);
  } catch {
    // degrade silently — never block ticket creation/update
  } finally {
    await supabase.from("tickets").update({ linear_match_checked_at: new Date().toISOString() }).eq("id", ticket.id);
  }
}
