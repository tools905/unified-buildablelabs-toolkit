import { z } from "zod";
import { generateStructuredAnalysis } from "@/modules/shared/ai";
import { createDeterministicLinkedInScore } from "./fallback-scoring";
import { linkedinArchetypes, type LinkedInPostScore } from "./types";

export const linkedinPostScoreSchema = z.object({
  total_score: z.number().min(0).max(100),
  hook_score: z.number().min(0).max(10),
  clarity_score: z.number().min(0).max(10),
  specificity_score: z.number().min(0).max(10),
  originality_score: z.number().min(0).max(10),
  reader_value_score: z.number().min(0).max(15),
  depth_score: z.number().min(0).max(10),
  relevance_score: z.number().min(0).max(10),
  storytelling_score: z.number().min(0).max(8),
  authority_score: z.number().min(0).max(7),
  engagement_score: z.number().min(0).max(5),
  writing_quality_score: z.number().min(0).max(5),
  archetype: z.enum(linkedinArchetypes),
  ai_summary: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  improvement_suggestions: z.array(z.string()).min(1),
}).superRefine((score, context) => {
  const componentTotal = score.hook_score + score.clarity_score + score.specificity_score + score.originality_score + score.reader_value_score + score.depth_score + score.relevance_score + score.storytelling_score + score.authority_score + score.engagement_score + score.writing_quality_score;
  if (Math.abs(componentTotal - score.total_score) > 1) context.addIssue({ code: "custom", path: ["total_score"], message: "Total score must equal the component score sum." });
});

export const LINKEDIN_SCORING_VERSION = "linkedin-rubric-v1";

export async function scoreLinkedInPost(input: { postText: string; memberRole: string | null }) {
  try {
    const result = await generateStructuredAnalysis<LinkedInPostScore>({
      system: "You score original and collaborative LinkedIn posts for an internal coaching dashboard. Return JSON only. Be candid, practical, and consistent. Use 85% common writing and reader-value criteria and 15% role-sensitive interpretation. Do not use public engagement counts as a proxy for quality. Scores must match the requested ranges, and total_score must equal the sum of the component scores.",
      user: {
        memberRole: input.memberRole ?? "unknown",
        postText: input.postText,
        criteria: {
          total_score: "0-100",
          hook_score: "0-10",
          clarity_score: "0-10",
          specificity_score: "0-10",
          originality_score: "0-10",
          reader_value_score: "0-15",
          depth_score: "0-10",
          relevance_score: "0-10",
          storytelling_score: "0-8",
          authority_score: "0-7",
          engagement_score: "0-5",
          writing_quality_score: "0-5",
          archetype: linkedinArchetypes,
          output: ["ai_summary", "strengths", "weaknesses", "improvement_suggestions"],
          role_guidance: {
            founder: "Credibility, strategic insight, lessons, and concrete decisions.",
            marketer: "Audience understanding, positioning, evidence, and actionable communication.",
            developer: "Technical clarity, useful explanation, tradeoffs, and concrete implementation detail.",
            designer: "Problem framing, user insight, process, and rationale behind decisions.",
            intern: "Learning clarity, reflection, initiative, and specific growth evidence.",
            content_creator: "Original perspective, reader value, structure, and memorable delivery.",
            other: "Professional relevance, specificity, credibility, and reader value.",
          },
        },
      },
      temperature: 0.15,
    });
    if (result) {
      return { score: linkedinPostScoreSchema.parse(result.data), provider: result.provider, model: result.model };
    }
  } catch {
    // The deterministic scorer keeps sync jobs useful when external AI is unavailable.
  }
  return { score: createDeterministicLinkedInScore(input), provider: "deterministic", model: "local-v1" };
}
