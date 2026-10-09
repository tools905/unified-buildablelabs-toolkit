import { z } from "zod";
import {
  MAX_ASSIGNEES,
  MAX_ATTACHMENT_BYTES,
  MAX_CAPTION_LENGTH,
  MAX_REFERENCE_LINKS,
  MAX_REVIEW_POINT_LENGTH,
  MIN_REVIEW_POINT_LENGTH,
} from "@/lib/utils/content-board";

export const contentPlatformSchema = z.enum(["any", "instagram", "linkedin", "x", "youtube", "facebook", "blog", "newsletter"]);
// The platforms an idea is planned for, each only once. Nothing picked means "any" platform.
export const platformsSchema = z
  .array(contentPlatformSchema)
  .transform((platforms): z.infer<typeof contentPlatformSchema>[] => {
    const unique = [...new Set(platforms)];
    return unique.length ? unique : ["any"];
  });

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

// The post text. Kept exactly as typed (line breaks matter in a caption); blank is cleaned up by the service.
export const captionSchema = z.string().max(MAX_CAPTION_LENGTH, `Keep the caption under ${MAX_CAPTION_LENGTH} characters.`);

// Every text field of a new idea is optional; createContentIdea only needs one of them filled in.
export const createContentIdeaSchema = z.object({
  title: z.string().trim().max(300, "Keep the title under 300 characters.").optional(),
  description: z.string().optional(),
  caption: captionSchema.optional(),
  platforms: platformsSchema,
  scheduledFor: scheduledForSchema.optional(),
  referenceLinks: referenceLinksSchema.optional(),
  assigneeIds: assigneeIdsSchema.optional(),
});

export type CreateContentIdeaInput = z.infer<typeof createContentIdeaSchema>;

export const updateContentIdeaSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters.").optional(),
  description: z.string().nullable().optional(),
  caption: captionSchema.nullable().optional(),
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

// A Pencil review being submitted: the draft it is on, an optional note and the strokes of each page that
// was drawn on. Bounded so one review can't grow without limit.
const markupPointSchema = z.number().min(-0.2).max(1.2);
export const markupStrokeSchema = z.object({
  tool: z.enum(["pen", "highlighter"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().positive().max(0.1),
  points: z
    .array(markupPointSchema)
    .min(2)
    .max(8000)
    .refine((points) => points.length % 2 === 0, "Each point needs an x and a y."),
});

const markupPageSchema = z.object({
  attachmentId: z.string().uuid(),
  pageNumber: z.number().int().min(1).max(500),
  // Where the page sits in the draft (1 = first page), for "Marked up pages 2 and 5".
  position: z.number().int().min(1).max(1000),
  strokes: z.array(markupStrokeSchema).min(1).max(1500),
});
type MarkupPages = { fileIds: string[]; pages: z.infer<typeof markupPageSchema>[] };
const pagesOnDraft = (input: MarkupPages) => input.pages.every((page) => input.fileIds.includes(page.attachmentId));
const smallEnough = (input: MarkupPages) =>
  input.pages.reduce((total, page) => total + page.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0), 0) <= 400_000;

export const markupSubmissionSchema = z
  .object({
    ideaId: z.string().uuid(),
    fileIds: z.array(z.string().uuid()).min(1).max(12),
    note: z.string().trim().max(3000).optional(),
    pages: z.array(markupPageSchema).min(1, "Draw on at least one page first.").max(60),
  })
  .refine(pagesOnDraft, "Those pages aren't part of this draft.")
  .refine(smallEnough, "This review is too large to save. Split it into two reviews.");

// A review saved part-way through: like a submission, but it may have no marks yet (just a note, or
// everything erased).
export const markupDraftSchema = z
  .object({
    ideaId: z.string().uuid(),
    fileIds: z.array(z.string().uuid()).min(1).max(12),
    note: z.string().max(3000).optional(),
    pages: z.array(markupPageSchema).max(60),
  })
  .refine(pagesOnDraft, "Those pages aren't part of this draft.")
  .refine(smallEnough, "This review is too large to save. Split it into two reviews.");

export type MarkupSubmissionInput = z.infer<typeof markupSubmissionSchema>;
export type MarkupDraftInput = z.infer<typeof markupDraftSchema>;
