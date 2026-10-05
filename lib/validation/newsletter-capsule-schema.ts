import { z } from "zod";

// Inputs to the capsule endpoints (see lib/capsule/types.ts for the shapes they answer with).
export const capsulePlatformSchema = z.enum(["medium", "substack"], "Choose Medium or Substack.");

const id = (what: string) => z.string().uuid(`That ${what} doesn't exist.`);

export const draftIdSchema = z.object({ draftId: id("post") });

export const markAtomOpenedSchema = z.object({
  capsuleId: id("capsule"),
  platform: capsulePlatformSchema,
});

// The live link is checked again with parseLiveUrl in the service; this only caps the size.
export const markAtomPostedSchema = markAtomOpenedSchema.extend({
  platformUrl: z.string().max(2000, "That link is too long.").optional(),
});
