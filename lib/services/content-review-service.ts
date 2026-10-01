import type { SupabaseClient } from "@supabase/supabase-js";

const REVIEW_POINT_SELECT =
  "id, idea_id, body, is_resolved, resolved_at, created_by, created_at, author:profiles!content_idea_review_points_created_by_fkey(id, full_name, email)";

export async function listReviewPoints(supabase: SupabaseClient<any>, ideaId: string) {
  const { data, error } = await supabase
    .from("content_idea_review_points")
    .select(REVIEW_POINT_SELECT)
    .eq("idea_id", ideaId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function addReviewPoint(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; ideaId: string; userId: string; body: string },
) {
  const { error } = await supabase.from("content_idea_review_points").insert({
    workspace_id: input.workspaceId,
    idea_id: input.ideaId,
    body: input.body,
    created_by: input.userId,
  });
  if (error) throw error;

  // The first feedback on an idea moves it from Ideas to the Feedback column. Only an idea still in
  // Ideas moves: one that is already shortlisted, in progress or posted stays where it is. The
  // condition is part of the update itself, so two people reviewing at once can't undo each other.
  const { data: moved, error: moveError } = await supabase
    .from("content_ideas")
    .update({ status: "feedback" })
    .eq("id", input.ideaId)
    .eq("status", "idea")
    .select("id");
  if (moveError) throw moveError;
  return { movedToFeedback: (moved?.length ?? 0) > 0 };
}

export async function setReviewPointResolved(supabase: SupabaseClient<any>, pointId: string, resolved: boolean) {
  const { data, error } = await supabase
    .from("content_idea_review_points")
    .update({ is_resolved: resolved, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", pointId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Could not update this review point.");
}

export async function deleteReviewPoint(supabase: SupabaseClient<any>, pointId: string) {
  const { data, error } = await supabase.from("content_idea_review_points").delete().eq("id", pointId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You can only delete your own review points.");
}
