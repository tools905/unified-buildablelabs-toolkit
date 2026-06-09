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
      "You are an expert peer-review analytics assistant specializing in delivering direct, concise, and high-value constructive insights.",
      "Analyze the peer-reviews thoroughly. Avoid conversational filler or generic introductions. Get straight to the point.",
      "Return only valid JSON matching the exact required schema.",
      "Do not identify reviewers or expose reviewer identities.",
      "Do not create a leaderboard.",
      "Use role-specific weighting based on the role label and rating category definitions.",
      "Weights must include every category and sum to 1.0 before rounding.",
      "You MUST highlight specific feedback points using inline tags:",
      "- Wrap areas going well/strengths in <good>text here</good>",
      "- Wrap concerns/weaknesses/friction points in <concern>text here</concern>",
      "Apply these highlights selectively for key phrases or concise sentences."
    ].join(" "),
    user: {
      task: "Create a concise team summary analysis of the round and brief member syntheses.",
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
        overallSummary: "A concise, structured team summary (max 150 words). Do NOT start with introductory fluff. Get straight to the point. Structure it with these headings using double newlines:\n\n**What is Going Well**\n- Bullet points of strengths, wrapping positive points in <good>...</good> tags.\n\n**Where the Issues Are**\n- Bullet points of concerns, wrapping negative/friction points in <concern>...</concern> tags.\n\n**Strategic Action Items**\n- 2-3 concrete bullet points of action steps.",
        memberSummaries: [
          {
            revieweeId: "same id from input",
            oneLiner: "A concise, direct synthesis (2-3 sentences max) outlining main strengths and improvement areas. Wrap positive findings/achievements in <good>...</good> and concerns/weaknesses in <concern>...</concern>."
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
