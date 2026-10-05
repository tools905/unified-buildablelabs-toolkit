"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as contentIdeaService from "@/lib/services/content-idea-service";
import * as attachmentService from "@/lib/services/content-attachment-service";
import * as reviewService from "@/lib/services/content-review-service";
import {
  addLinkAttachmentSchema,
  addReviewPointSchema,
  addStoredAttachmentSchema,
} from "@/lib/validation/content-idea-schema";
import { ZodError } from "zod";
import type { ContentIdeaStatus } from "@/lib/db/types";

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

function friendlyMessage(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "That doesn't look right.";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (/row-level security/i.test(message)) return "You don't have permission to do that.";
    return message;
  }
  return "Something went wrong. Please try again.";
}

// `revalidate: false` is for the small edits made inside an idea's side panel. They already show
// on screen straight away, so re-rendering the whole board in the same request only makes the
// click wait longer; the panel refreshes the board counts quietly afterwards.
async function toResult<T extends object = object>(
  run: () => Promise<T | void>,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const data = await run();
    if (options.revalidate !== false) refreshContentBoard();
    return { ok: true, ...(data ?? {}) } as ActionResult<T>;
  } catch (error) {
    return { ok: false, error: friendlyMessage(error) };
  }
}

async function requireContentBoardContext() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  return { supabase, user, workspace };
}

function refreshContentBoard() {
  revalidatePath("/tools/content-board");
  revalidatePath("/tools/content-board/calendar");
}

export async function createIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();

  return toResult(async () => {
    const idea = await contentIdeaService.createContentIdea(supabase, workspace.id, user.id, {
      title: String(formData.get("title") ?? ""),
      description: (formData.get("description") as string) || undefined,
      caption: (formData.get("caption") as string) || undefined,
      platforms: formData.getAll("platforms").map(String) as any,
      scheduledFor: (formData.get("scheduledFor") as string) ?? null,
      referenceLinks: formData.getAll("referenceLinks").map(String),
      // Only admins see the picker; the service refuses anyone else who sends assignees anyway.
      assigneeIds: formData.getAll("assigneeIds").map(String),
    });
    // The dialog uses these to attach any files that were chosen before the idea existed.
    return { ideaId: idea.id as string, workspaceId: workspace.id };
  });
}

// Moves a card to another column. Who may make which move is checked on the server (canMoveIdea):
// admins anywhere, the assigned people from Shortlisted through to Posted.
export async function moveIdeaAction(ideaId: string, status: ContentIdeaStatus, options: { scheduledFor?: string | null } = {}) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.moveContentIdea(supabase, workspace.id, ideaId, user.id, status, options);
  });
}

export async function setIdeaAssigneesAction(ideaId: string, assigneeIds: string[]) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.setIdeaAssignees(supabase, workspace.id, ideaId, user.id, assigneeIds);
  });
}

// Puts an idea on the calendar (or takes it off with an empty date).
export async function scheduleIdeaAction(ideaId: string, scheduledFor: string | null) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, { scheduledFor: scheduledFor || null });
  });
}

export async function updateIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const ideaId = String(formData.get("ideaId"));

  return toResult(async () => {
    await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, {
      title: (formData.get("title") as string) || undefined,
      description: (formData.get("description") as string) ?? null,
      // Only sent by forms that have the caption box; other updates leave the saved caption alone.
      caption: formData.has("caption") ? String(formData.get("caption")) : undefined,
      platforms: formData.has("platformsField") ? (formData.getAll("platforms").map(String) as any) : undefined,
      scheduledFor: (formData.get("scheduledFor") as string) ?? null,
      referenceLinks: formData.getAll("referenceLinks").map(String),
      // Only sent for posted ideas; leave the saved link alone when the field isn't on the form.
      postUrl: formData.has("postUrl") ? String(formData.get("postUrl")) : undefined,
    });
    // The assignee picker marks itself with `assigneesField`, so an empty list means "take everyone
    // off" while a form without the picker (non-admins) leaves the assignees alone.
    if (formData.get("assigneesField") === "1") {
      await contentIdeaService.setIdeaAssignees(
        supabase,
        workspace.id,
        ideaId,
        user.id,
        formData.getAll("assigneeIds").map(String),
      );
    }
  });
}

export async function setPostUrlAction(ideaId: string, postUrl: string) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, { postUrl });
  });
}

export async function deleteIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const ideaId = String(formData.get("ideaId"));
  await contentIdeaService.deleteContentIdea(supabase, workspace.id, ideaId, user.id);
  refreshContentBoard();
}

export async function addStoredAttachmentAction(input: {
  ideaId: string;
  kind: "image" | "pdf";
  storagePath: string;
  thumbPath?: string | null;
  fileName: string;
  sizeBytes: number;
}) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    const parsed = addStoredAttachmentSchema.parse(input);
    await attachmentService.addStoredAttachment(supabase, { workspaceId: workspace.id, userId: user.id, ...parsed });
  }, { revalidate: false });
}

export async function addLinkAttachmentAction(input: { ideaId: string; url: string }) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    const parsed = addLinkAttachmentSchema.parse(input);
    await attachmentService.addLinkAttachment(supabase, { workspaceId: workspace.id, userId: user.id, ...parsed });
  }, { revalidate: false });
}

export async function removeAttachmentAction(attachmentId: string) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => attachmentService.removeAttachment(supabase, attachmentId), { revalidate: false });
}

export async function setIdeaReviewedAction(ideaId: string, reviewed: boolean) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.setIdeaReviewed(supabase, workspace.id, ideaId, user.id, reviewed);
  }, { revalidate: false });
}

export async function addReviewPointAction(input: { ideaId: string; body: string }) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    const parsed = addReviewPointSchema.parse(input);
    await reviewService.addReviewPoint(supabase, { workspaceId: workspace.id, userId: user.id, ...parsed });
  }, { revalidate: false });
}

export async function setReviewPointResolvedAction(pointId: string, resolved: boolean) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => reviewService.setReviewPointResolved(supabase, pointId, resolved), { revalidate: false });
}

export async function deleteReviewPointAction(pointId: string) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => reviewService.deleteReviewPoint(supabase, pointId), { revalidate: false });
}
