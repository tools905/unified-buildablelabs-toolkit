import { z } from "zod";

const optionalRating = z.coerce.number().int().min(1).max(5).optional();

export const reviewSchema = z.object({
  strengths: z.string().min(10),
  improvements: z.string().min(10),
  communicationRating: z.coerce.number().int().min(1).max(5),
  reliabilityRating: z.coerce.number().int().min(1).max(5),
  ownershipRating: z.coerce.number().int().min(1).max(5),
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
