import { z } from "zod";

export const updateNewsletterPostSchema = z.object({
  title: z.string().max(200).default(""),
  deck: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
  body: z.string().default(""),
  authorIds: z.array(z.string().uuid()).default([]),
  // The preview image: null removes it, undefined leaves it as it is.
  coverImageUrl: z.string().url().max(1000).nullable().optional(),
  // 0 (black) to 100 (white): how bright that image is, measured when it was uploaded.
  coverBrightness: z.number().int().min(0).max(100).nullable().optional(),
  // How the preview image is framed and faded (see lib/utils/newsletter-cover.ts).
  coverFocusX: z.number().int().min(0).max(100).optional(),
  coverFocusY: z.number().int().min(0).max(100).optional(),
  coverZoom: z.number().min(1).max(3).optional(),
  coverFade: z.enum(["lighter", "darker"]).nullable().optional(),
});

export type UpdateNewsletterPostInput = z.infer<typeof updateNewsletterPostSchema>;
