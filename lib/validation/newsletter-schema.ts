import { z } from "zod";

export const updateNewsletterPostSchema = z.object({
  title: z.string().max(200).default(""),
  deck: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
  body: z.string().default(""),
  authorIds: z.array(z.string().uuid()).default([]),
});

export type UpdateNewsletterPostInput = z.infer<typeof updateNewsletterPostSchema>;
