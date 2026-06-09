import "server-only";

import {
  defaultWeights,
  normalizeWeightMap,
  ratingCategories,
  type RatingMap,
  type WeightMap,
} from "@/lib/services/scoring-service";
import {
  isOpenRouterConfigured,
  requestOpenRouterJson,
  OPENROUTER_MODEL,
} from "@/lib/services/openrouter-service";

export type AiReportMemberInput = {
  revieweeId: string;
  revieweeName: string;
  roleLabel: string;
  reviewCount: number;
  rawCategoryAverages: RatingMap;
  strengths: string[];
  improvements: string[];
  examples: string[];
};

export type AiReportEnhancements = {
  overallSummary: string;
  memberSummaries: Record<string, string>;
  roleWeights: Record<string, WeightMap>;
  model: string;
  unavailableReason?: string;
};

type AiReportResponse = {
  overallSummary?: string;
  memberSummaries?: Array<{
    revieweeId: string;
    oneLiner: string;
  }>;
  roleWeights?: Array<{
    roleLabel: string;
    rationale?: string;
    weights: Partial<Record<(typeof ratingCategories)[number], number>>;
  }>;
};

export async function generateAiReportEnhancements(input: {
  projectName: string;
  roundTitle: string;
  members: AiReportMemberInput[];
}): Promise<AiReportEnhancements | null> {
  if (!isOpenRouterConfigured() || input.members.length === 0) return null;

  const result = await requestOpenRouterJson<AiReportResponse>({
    temperature: 0.1,
    system: [
      "You are an expert peer-review analytics assistant specializing in delivering deep, high-value, constructive organizational insights.",
      "Analyze the peer-reviews thoroughly. Identify hidden patterns, team dynamic trends, and operational insights.",
      "Return only valid JSON matching the exact required schema.",
      "Do not identify reviewers or expose reviewer identities.",
      "Do not create a leaderboard.",
      "Use role-specific weighting based on the role label and rating category definitions.",
      "Weights must include every category and sum to 1.0 before rounding.",
      "Provide actionable, evidence-based, professional, and detailed summaries of feedback."
    ].join(" "),
    user: {
      task: "Create a detailed report-level AI summary analysis of the team and comprehensive, role-specific member syntheses.",
      projectName: input.projectName,
      roundTitle: input.roundTitle,
      ratingCategories,
      defaultWeights,
      members: input.members.map((member) => ({
        revieweeId: member.revieweeId,
        roleLabel: member.roleLabel,
        reviewCount: member.reviewCount,
        rawCategoryAverages: member.rawCategoryAverages,
        strengths: member.strengths.slice(0, 8),
        improvements: member.improvements.slice(0, 8),
        examples: member.examples.slice(0, 8),
      })),
      requiredJsonShape: {
        overallSummary: "A comprehensive, analytical overview of the review round. Discuss team collaboration, overall performance, key alignment strengths, common friction areas, and a bulleted list of 2-3 strategic team-wide action items.",
        memberSummaries: [
          {
            revieweeId: "same id from input",
            oneLiner: "A detailed, evidence-based synthesis paragraph of this member's feedback (3-5 sentences). Outline their main strengths, constructive areas for improvement, specific accomplishments mentioned, and concrete action steps for growth."
          },
        ],
        roleWeights: [
          {
            roleLabel: "role label from input",
            rationale: "short rationale",
            weights: Object.fromEntries(
              ratingCategories.map((category) => [category, 0.1]),
            ),
          },
        ],
      },
    },
  });

  if (!result) return null;

  const memberSummaries = Object.fromEntries(
    (result.memberSummaries ?? [])
      .filter((summary) => summary.revieweeId && summary.oneLiner)
      .map((summary) => [summary.revieweeId, summary.oneLiner]),
  );

  const roleWeights = Object.fromEntries(
    (result.roleWeights ?? [])
      .filter((item) => item.roleLabel && item.weights)
      .map((item) => [item.roleLabel, normalizeWeightMap(item.weights)]),
  );

  return {
    overallSummary: result.overallSummary ?? "",
    memberSummaries,
    roleWeights,
    model: OPENROUTER_MODEL,
  };
}
