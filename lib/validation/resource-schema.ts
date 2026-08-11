import { z } from "zod";

export const RESOURCE_CATEGORIES = ["tutorial", "guide", "tool", "reference"] as const;

export const createResourceSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters."),
  description: z.string().optional(),
  url: z.string().url("Must be a valid URL."),
  category: z.enum(RESOURCE_CATEGORIES).default("reference"),
  tags: z.array(z.string().min(1)).default([]),
  roadmapIds: z.array(z.string().uuid()).default([]),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = createResourceSchema.partial();
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const createRoadmapSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  description: z.string().optional(),
});

export type CreateRoadmapInput = z.infer<typeof createRoadmapSchema>;
