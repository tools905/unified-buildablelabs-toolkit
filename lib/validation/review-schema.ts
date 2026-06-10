import { z } from "zod";

const optionalRating = z.coerce.number().int().min(1).max(5).optional();

const optionalOpenEnded = z.preprocess(
  (val) => (val === "N/A" || val === "" ? undefined : val),
  z.string().min(10).optional()
);

export const reviewSchema = z.object({
  strengths: optionalOpenEnded,
  improvements: optionalOpenEnded,
  communicationRating: optionalRating,
  reliabilityRating: optionalRating,
  ownershipRating: optionalRating,
  executionQualityRating: optionalRating,
  collaborationRating: optionalRating,
  technicalQualityRating: optionalRating,
  problemSolvingRating: optionalRating,
  leadershipRating: optionalRating,
  systemDesignRating: optionalRating,
  learningGrowthRating: optionalRating,
  specificExample: optionalOpenEnded,
  privateNote: z.string().optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
