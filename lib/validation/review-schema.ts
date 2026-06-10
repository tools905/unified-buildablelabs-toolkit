import { z } from "zod";

const optionalRating = z.coerce.number().int().min(1).max(5).optional();

export const reviewSchema = z.object({
  strengths: z.string().min(10),
  improvements: z.string().min(10),
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
  specificExample: z.string().min(10),
  privateNote: z.string().optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
