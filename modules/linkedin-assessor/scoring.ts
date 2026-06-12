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
});

export async function scoreLinkedInPost(input: { postText: string; memberRole: string | null }) {
  try {
    const result = await generateStructuredAnalysis<LinkedInPostScore>({
      system: "You score original LinkedIn posts for an internal coaching dashboard. Return JSON only. Be candid, practical, and consistent. Scores must match the requested ranges.",
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
