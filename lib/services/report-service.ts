import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateAiReportEnhancements,
  type AiReportEnhancements,
} from "@/lib/services/ai-report-service";
import {
  calculateRawCategoryAverages,
  calculateRoleWeightedScore,
  highestWeightedCategories,
  type RatingMap,
  type WeightMap,
} from "@/lib/services/scoring-service";
import { getRoundProgress } from "@/lib/services/round-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { createAdminClient } from "@/lib/supabase/admin";

function responseToRatings(response: Record<string, number | null>): RatingMap {
  return {
    communication: response.communication_rating,
    reliability: response.reliability_rating,
    ownership: response.ownership_rating,
    executionQuality: response.execution_quality_rating,
    collaboration: response.collaboration_rating,
    technicalQuality: response.technical_quality_rating,
    problemSolving: response.problem_solving_rating,
    leadership: response.leadership_rating,
    systemDesign: response.system_design_rating,
    learningGrowth: response.learning_growth_rating,
  };
}

export async function generateRoundReport(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data: round, error: roundError } = await supabase
    .from("review_rounds")
    .select("*, projects(*)")
    .eq("id", roundId)
    .single();
  if (roundError) throw roundError;

  const { data: assignments, error } = await supabase
    .from("review_assignments")
    .select("*, reviewee:profiles!review_assignments_reviewee_id_fkey(*), review_responses(*)")
    .eq("round_id", roundId)
    .eq("status", "submitted");
  if (error) throw error;

  const { data: projectMembers } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", round.project_id);

  const byReviewee = new Map<string, typeof assignments>();
  for (const assignment of assignments ?? []) {
    byReviewee.set(assignment.reviewee_id, [
      ...(byReviewee.get(assignment.reviewee_id) ?? []),
      assignment,
    ]);
  }

  const revieweeInputs = [...byReviewee.entries()].map(([revieweeId, items]) => {
    const first = items[0];
    const roleLabel =
      projectMembers?.find((member) => member.user_id === revieweeId)?.role_label ??
      "Team member";
    const responses = items
      .flatMap((item) => item.review_responses ?? [])
      .filter(Boolean);
    const rawCategoryAverages = calculateRawCategoryAverages(
      responses.map((response) => responseToRatings(response)),
    );

    return {
      revieweeId,
      revieweeName:
        first.reviewee?.full_name ?? first.reviewee?.email ?? "Unknown member",
      roleLabel,
      reviewCount: responses.length,
      rawCategoryAverages,
      strengths: responses.map((response) => response.strengths),
      improvements: responses.map((response) => response.improvements),
      examples: responses.map((response) => response.specific_example),
      privateNotes: responses
        .map((response) => response.private_note)
        .filter((note): note is string => Boolean(note)),
    };
  });

  let ai: AiReportEnhancements | null = null;

  // Check if AI report is already cached in the database
  if (round.ai_overall_summary !== null) {
    ai = {
      overallSummary: round.ai_overall_summary,
      memberSummaries: (round.ai_member_summaries as Record<string, string>) ?? {},
      roleWeights: (round.ai_role_weights as Record<string, WeightMap>) ?? {},
      model: "cached",
    };
  } else {
    try {
      ai = await generateAiReportEnhancements({
        projectName: round.projects?.name ?? "Peer review project",
        roundTitle: round.title,
        members: revieweeInputs.map((reviewee) => ({
          revieweeId: reviewee.revieweeId,
          revieweeName: reviewee.revieweeName,
          roleLabel: reviewee.roleLabel,
          reviewCount: reviewee.reviewCount,
          rawCategoryAverages: reviewee.rawCategoryAverages,
          strengths: reviewee.strengths,
          improvements: reviewee.improvements,
          examples: reviewee.examples,
        })),
      });

      if (ai) {
        const admin = createAdminClient();
        await admin
          .from("review_rounds")
          .update({
            ai_overall_summary: ai.overallSummary,
            ai_member_summaries: ai.memberSummaries,
            ai_role_weights: ai.roleWeights,
          })
          .eq("id", roundId);
      }
    } catch (error) {
      ai = {
        overallSummary: "",
        memberSummaries: {},
        roleWeights: {},
        model: "deepseek/deepseek-v4-flash",
        unavailableReason:
          error instanceof Error ? error.message : "AI summary unavailable.",
      };
    }
  }

  const reviewees = revieweeInputs.map((reviewee) => {
    const aiWeights = ai?.roleWeights?.[reviewee.roleLabel];
    const score = calculateRoleWeightedScore(
      reviewee.rawCategoryAverages,
      reviewee.roleLabel,
      aiWeights,
    );

    return {
      ...reviewee,
      aiSummary: ai?.memberSummaries?.[reviewee.revieweeId] ?? null,
      roleWeights: score.roleWeights,
      highestWeightedCategories: highestWeightedCategories(score.roleWeights),
      weightedScore: score.weightedScore,
      scorePercentage: score.scorePercentage,
      scoringSource: aiWeights ? "ai" : "fallback",
    };
  });

  const progress = await getRoundProgress(supabase, roundId);
  return { round, progress, reviewees, ai };
}

export async function getRoundReport(
  supabase: SupabaseClient<any>,
  roundId: string,
  adminUserId: string,
) {
  const { data: round, error } = await supabase
    .from("review_rounds")
    .select("*, projects(*)")
    .eq("id", roundId)
    .single();
  if (error) throw error;

  const admin = await isWorkspaceAdmin(
    round.projects?.workspace_id ?? "",
    adminUserId,
    supabase,
  );
  if (!admin) throw new Error("Admin access required.");

  return generateRoundReport(supabase, roundId);
}
