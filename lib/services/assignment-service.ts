import type { SupabaseClient } from "@supabase/supabase-js";
import { generateFullPeerAssignments } from "@/lib/utils/assignment-generator";
import { allowSmallTestTeams } from "@/lib/utils/team-size";

export async function generateAssignments(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data: round, error: roundError } = await supabase
    .from("review_rounds")
    .select("id, project_id")
    .eq("id", roundId)
    .single();
  if (roundError) throw roundError;

  const { data: members, error: memberError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", round.project_id)
    .eq("is_active", true);
  if (memberError) throw memberError;

  const generated = generateFullPeerAssignments(
    (members ?? []).map((member) => ({ userId: member.user_id })),
    { allowSmallTeam: allowSmallTestTeams() },
  );

  const { data, error } = await supabase
    .from("review_assignments")
    .upsert(
      generated.map((assignment) => ({
        round_id: roundId,
        reviewer_id: assignment.reviewerId,
        reviewee_id: assignment.revieweeId,
      })),
      { onConflict: "round_id,reviewer_id,reviewee_id", ignoreDuplicates: true },
    )
    .select();

  if (error) throw error;
  return data ?? [];
}

export async function getMyAssignments(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("review_assignments")
    .select("*, review_rounds(*, projects(*)), reviewee:profiles!review_assignments_reviewee_id_fkey(*)")
    .eq("reviewer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAssignmentForReview(
  supabase: SupabaseClient<any>,
  assignmentId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("review_assignments")
    .select("*, review_rounds(*, projects(*)), reviewee:profiles!review_assignments_reviewee_id_fkey(*), review_responses(*)")
    .eq("id", assignmentId)
    .eq("reviewer_id", userId)
    .single();
  if (error) throw error;
  return data;
}
