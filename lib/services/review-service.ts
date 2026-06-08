import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSchema, type ReviewInput } from "@/lib/validation/review-schema";
import { completeRoundIfReady } from "@/lib/services/round-service";

function toDbReview(assignmentId: string, input: ReviewInput) {
  return {
    assignment_id: assignmentId,
    strengths: input.strengths,
    improvements: input.improvements,
    communication_rating: input.communicationRating,
    reliability_rating: input.reliabilityRating,
    ownership_rating: input.ownershipRating,
    execution_quality_rating: input.executionQualityRating ?? null,
    collaboration_rating: input.collaborationRating ?? null,
    technical_quality_rating: input.technicalQualityRating ?? null,
    problem_solving_rating: input.problemSolvingRating ?? null,
    leadership_rating: input.leadershipRating ?? null,
    system_design_rating: input.systemDesignRating ?? null,
    learning_growth_rating: input.learningGrowthRating ?? null,
    specific_example: input.specificExample,
    private_note: input.privateNote || null,
  };
}

export async function submitReview(
  supabase: SupabaseClient<any>,
  assignmentId: string,
  userId: string,
  rawInput: ReviewInput,
) {
  const input = reviewSchema.parse(rawInput);
  const { data: assignment, error } = await supabase
    .from("review_assignments")
    .select("*, review_rounds(*)")
    .eq("id", assignmentId)
    .eq("reviewer_id", userId)
    .single();
  if (error) throw error;
  if (assignment.review_rounds?.status !== "active") {
    throw new Error("Reviews can only be submitted while the round is active.");
  }

  const { data, error: responseError } = await supabase
    .from("review_responses")
    .upsert(toDbReview(assignmentId, input), { onConflict: "assignment_id" })
    .select()
    .single();
  if (responseError) throw responseError;

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("review_assignments")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("reviewer_id", userId);
  if (updateError) throw updateError;

  await completeRoundIfReady(admin, assignment.round_id);
  return data;
}

export const editReview = submitReview;
