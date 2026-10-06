// The three review tools: read the review points on an idea, add one, tick one off or back on.
// They act as the signed-in person (`caller.supabase`), so the same database rules as the app apply, and
// they reuse the app's own review code so a point added here behaves exactly like one added on the board.

import { randomUUID } from "node:crypto";
import {
  addReviewPointInput,
  listReviewPointsInput,
  resolveReviewPointInput,
  type AddReviewPointOutput,
  type ListReviewPointsOutput,
  type McpCaller,
  type ResolveReviewPointOutput,
  type ReviewPoint,
} from "@/lib/mcp/contract";
import { McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import {
  addReviewPoint,
  getReviewPoint,
  listReviewPoints,
  setReviewPointResolved,
} from "@/lib/services/content-review-service";

type Author = { full_name: string | null; email: string };
type PointRow = {
  id: string;
  body: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  author: Author | Author[] | null;
};

function toPoint(row: PointRow): ReviewPoint {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    text: row.body,
    by: author?.full_name || author?.email || "Unknown",
    created_at: row.created_at,
    done: row.is_resolved,
    done_at: row.resolved_at,
  };
}

// The idea has to be in the caller's workspace. The database rules alone would let a person who belongs
// to two workspaces reach an idea of the other one, so the workspace is checked here as well.
async function assertIdeaInWorkspace(caller: McpCaller, ideaId: string) {
  const { data, error } = await caller.supabase
    .from("content_ideas")
    .select("id")
    .eq("id", ideaId)
    .eq("workspace_id", caller.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new McpToolFailure("not_found", "There is no idea with that id in this workspace.");
}

const NO_SUCH_POINT = "There is no review point with that id in this workspace.";

export async function listReviewPointsTool(caller: McpCaller, rawInput: unknown): Promise<ListReviewPointsOutput> {
  const input = parseToolInput(listReviewPointsInput, rawInput);
  await assertIdeaInWorkspace(caller, input.idea_id);

  const rows = (await listReviewPoints(caller.supabase, input.idea_id)) as unknown as PointRow[];
  const points = rows.map(toPoint).filter((point) => input.include_done || !point.done);
  return { points };
}

export async function addReviewPointTool(caller: McpCaller, rawInput: unknown): Promise<AddReviewPointOutput> {
  const input = parseToolInput(addReviewPointInput, rawInput);
  await assertIdeaInWorkspace(caller, input.idea_id);

  // The id is chosen here so the point can be read back with the name of its author.
  const pointId = randomUUID();
  const { movedToFeedback } = await addReviewPoint(caller.supabase, {
    workspaceId: caller.workspaceId,
    ideaId: input.idea_id,
    userId: caller.userId,
    body: input.text,
    id: pointId,
  });

  const row = (await getReviewPoint(caller.supabase, pointId, caller.workspaceId)) as PointRow | null;
  if (!row) throw new Error("The review point was saved but could not be read back.");
  return { point: toPoint(row), moved_to_feedback: movedToFeedback };
}

export async function resolveReviewPointTool(caller: McpCaller, rawInput: unknown): Promise<ResolveReviewPointOutput> {
  const input = parseToolInput(resolveReviewPointInput, rawInput);

  const existing = (await getReviewPoint(caller.supabase, input.point_id, caller.workspaceId)) as PointRow | null;
  if (!existing) throw new McpToolFailure("not_found", NO_SUCH_POINT);
  // Already in the state asked for: leave it alone, so the time it was first ticked off is kept.
  if (existing.is_resolved === input.done) return { point: toPoint(existing) };

  await setReviewPointResolved(caller.supabase, input.point_id, input.done);

  const updated = (await getReviewPoint(caller.supabase, input.point_id, caller.workspaceId)) as PointRow | null;
  if (!updated) throw new McpToolFailure("not_found", NO_SUCH_POINT);
  return { point: toPoint(updated) };
}
