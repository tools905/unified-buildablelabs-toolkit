import { z } from "zod";
import {
  MAX_ASSIGNEES,
  MAX_ATTACHMENT_BYTES,
  MAX_REFERENCE_LINKS,
  MAX_REVIEW_POINT_LENGTH,
  MIN_REVIEW_POINT_LENGTH,
} from "@/lib/utils/content-board";

export const contentPlatformSchema = z.enum(["instagram", "linkedin", "x", "youtube", "facebook", "blog", "newsletter"]);
// The platforms an idea is planned for: at least one, each only once.
export const platformsSchema = z
  .array(contentPlatformSchema)
  .transform((platforms) => [...new Set(platforms)])
  .pipe(z.array(contentPlatformSchema).min(1, "Pick at least one platform."));

export const contentIdeaStatusSchema = z.enum(["idea", "feedback", "approved", "in_progress", "posted"]);

// A calendar day like "2026-10-12"; an empty field means "not scheduled".
export const scheduledForSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.").nullable(),
);

// Pasted reference links: blanks are dropped, duplicates collapsed, https only.
export const referenceLinksSchema = z
  .array(z.string())
  .transform((links) => [...new Set(links.map((link) => link.trim()).filter(Boolean))])
  .pipe(
    z
      .array(
        z
          .string()
          .max(2000, "A reference link is too long.")
          .url("Reference links must be full web addresses.")
          .refine((value) => value.startsWith("https://"), "Reference links must start with https://"),
      )
      .max(MAX_REFERENCE_LINKS, `Add up to ${MAX_REFERENCE_LINKS} reference links.`),
  );

// The people an idea is assigned to: duplicates collapsed, blanks dropped, real user ids only.
export const assigneeIdsSchema = z
  .array(z.string())
  .transform((ids) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))])
  .pipe(z.array(z.string().uuid("That isn't a valid person.")).max(MAX_ASSIGNEES, `Assign up to ${MAX_ASSIGNEES} people.`));

export const createContentIdeaSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters."),
  description: z.string().optional(),
  platforms: platformsSchema,
  scheduledFor: scheduledForSchema.optional(),
  referenceLinks: referenceLinksSchema.optional(),
  assigneeIds: assigneeIdsSchema.optional(),
});

export type CreateContentIdeaInput = z.infer<typeof createContentIdeaSchema>;

export const updateContentIdeaSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters.").optional(),
  description: z.string().nullable().optional(),
  platforms: platformsSchema.optional(),
  status: contentIdeaStatusSchema.optional(),
  scheduledFor: scheduledForSchema.optional(),
  referenceLinks: referenceLinksSchema.optional(),
  postUrl: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z
        .string()
        .url("Enter a full web address for the post.")
        .refine((value) => /^https?:\/\//i.test(value), "The post link must start with http:// or https://")
        .nullable(),
    )
    .optional(),
});

export type UpdateContentIdeaInput = z.infer<typeof updateContentIdeaSchema>;

export const addStoredAttachmentSchema = z.object({
  ideaId: z.string().uuid(),
  kind: z.enum(["image", "pdf"]),
  storagePath: z.string().min(1).max(300),
  thumbPath: z.string().min(1).max(300).nullable().optional(),
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

export type AddStoredAttachmentInput = z.infer<typeof addStoredAttachmentSchema>;

export const addLinkAttachmentSchema = z.object({
  ideaId: z.string().uuid(),
  url: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => value.startsWith("https://"), "Links must start with https://"),
});

export const addReviewPointSchema = z.object({
  ideaId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(MIN_REVIEW_POINT_LENGTH, "Write at least a couple of words.")
    .max(MAX_REVIEW_POINT_LENGTH, `Keep it under ${MAX_REVIEW_POINT_LENGTH} characters.`),
});
