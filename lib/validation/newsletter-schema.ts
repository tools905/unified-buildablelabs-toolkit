import { z } from "zod";
import { MAX_TONE, MIN_TONE } from "@/lib/utils/newsletter-cover";
import { MAX_POST_TAGS, MAX_TAG_LENGTH, normalizeTags } from "@/lib/utils/newsletter-tags";

// The address of the original post on our own site. Blank means "not set"; anything else must be https.
export const originalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : typeof value === "string" ? value.trim() : value),
  z
    .string()
    .max(2000, "That address is too long.")
    .url("The original link must be a full web address.")
    .refine((value) => value.startsWith("https://"), "The original link must start with https://")
    .nullable(),
);

export const updateNewsletterPostSchema = z.object({
  title: z.string().max(200).default(""),
  deck: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
  body: z.string().default(""),
  // Topics for Medium and Substack: cleaned up and capped, never an error for a stray #, comma or repeat.
  tags: z
    .array(z.string())
    .transform((tags) => normalizeTags(tags))
    .pipe(z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_POST_TAGS))
    .optional(),
  originalUrl: originalUrlSchema.optional(),
  authorIds: z.array(z.string().uuid()).default([]),
  // The preview image: null removes it, undefined leaves it as it is.
  coverImageUrl: z.string().url().max(1000).nullable().optional(),
  // 0 (black) to 100 (white): how bright that image is, measured when it was uploaded.
  coverBrightness: z.number().int().min(0).max(100).nullable().optional(),
  // How the preview image is framed and faded (see lib/utils/newsletter-cover.ts).
  coverFocusX: z.number().int().min(0).max(100).optional(),
  coverFocusY: z.number().int().min(0).max(100).optional(),
  coverZoom: z.number().min(1).max(3).optional(),
  coverTone: z.number().int().min(MIN_TONE).max(MAX_TONE).nullable().optional(),
});

export type UpdateNewsletterPostInput = z.infer<typeof updateNewsletterPostSchema>;
