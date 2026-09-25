import { z } from "zod";

export const contentPlatformSchema = z.enum(["instagram", "linkedin", "x", "youtube", "facebook"]);
export const contentIdeaStatusSchema = z.enum(["idea", "approved", "in_progress", "posted"]);

export const createContentIdeaSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters."),
  description: z.string().optional(),
  platform: contentPlatformSchema,
});

export type CreateContentIdeaInput = z.infer<typeof createContentIdeaSchema>;

export const updateContentIdeaSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  platform: contentPlatformSchema.optional(),
  status: contentIdeaStatusSchema.optional(),
  postUrl: z
    .preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().url().nullable())
    .optional(),
});

export type UpdateContentIdeaInput = z.infer<typeof updateContentIdeaSchema>;
