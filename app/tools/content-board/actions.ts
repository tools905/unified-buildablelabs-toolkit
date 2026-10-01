"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as contentIdeaService from "@/lib/services/content-idea-service";
import * as attachmentService from "@/lib/services/content-attachment-service";
import * as reviewService from "@/lib/services/content-review-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { toEmbedUrl } from "@/lib/utils/design-links";
import {
  addLinkAttachmentSchema,
  addReviewPointSchema,
  addStoredAttachmentSchema,
} from "@/lib/validation/content-idea-schema";
import { ZodError } from "zod";
import type { ContentIdeaStatus } from "@/lib/db/types";
import type { IdeaPanelData } from "@/components/content-board/types";

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

async function toResult<T extends object = object>(run: () => Promise<T | void>): Promise<ActionResult<T>> {
  try {
    const data = await run();
    refreshContentBoard();
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
      platform: formData.get("platform") as any,
      scheduledFor: (formData.get("scheduledFor") as string) ?? null,
      referenceLinks: formData.getAll("referenceLinks").map(String),
    });
    // The dialog uses these to attach any files that were chosen before the idea existed.
    return { ideaId: idea.id as string, workspaceId: workspace.id };
  });
}

export async function updateIdeaStatusAction(ideaId: string, status: ContentIdeaStatus) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, { status });
  refreshContentBoard();
}

export async function updateIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const ideaId = String(formData.get("ideaId"));

  return toResult(async () => {
    await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, {
      title: (formData.get("title") as string) || undefined,
      description: (formData.get("description") as string) ?? null,
      platform: (formData.get("platform") as any) || undefined,
      status: (formData.get("status") as ContentIdeaStatus) || undefined,
      scheduledFor: (formData.get("scheduledFor") as string) ?? null,
      referenceLinks: formData.getAll("referenceLinks").map(String),
      // Only sent for posted ideas; leave the saved link alone when the field isn't on the form.
      postUrl: formData.has("postUrl") ? String(formData.get("postUrl")) : undefined,
    });
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

export async function getIdeaPanelAction(ideaId: string): Promise<IdeaPanelData> {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const [attachments, points, admin, ideaResult] = await Promise.all([
    attachmentService.listAttachments(supabase, ideaId),
    reviewService.listReviewPoints(supabase, ideaId),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
    supabase
      .from("content_ideas")
      .select("created_at, created_by, posted_at, reviewed_at, reviewed_by")
      .eq("id", ideaId)
      .single(),
  ]);
  if (ideaResult.error) throw ideaResult.error;
  const idea = ideaResult.data;

  const personIds = [
    ...new Set([idea.created_by, idea.reviewed_by, ...attachments.map((item) => item.created_by)].filter(Boolean)),
  ] as string[];
  const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", personIds);
  const nameOf = (id: string | null | undefined) => {
    const person = people?.find((candidate) => candidate.id === id);
    return person?.full_name || person?.email || "Unknown";
  };
  const signed = await attachmentService.signPaths(
    supabase,
    attachments.map((item) => item.storage_path).filter((path): path is string => Boolean(path)),
  );

  return {
    workspaceId: workspace.id,
    currentUserId: user.id,
    isAdmin: admin,
    history: {
      createdAt: idea.created_at,
      creatorName: nameOf(idea.created_by),
      postedAt: idea.posted_at,
      reviewedAt: idea.reviewed_at,
      reviewerName: idea.reviewed_by ? nameOf(idea.reviewed_by) : null,
    },
    attachments: attachments.map((item) => ({
      id: item.id,
      kind: item.kind,
      fileName: item.file_name,
      url: item.kind === "link" ? item.url : item.storage_path ? (signed.get(item.storage_path) ?? null) : null,
      embedUrl: item.kind === "link" && item.url ? toEmbedUrl(item.url) : null,
      createdAt: item.created_at,
      uploaderName: nameOf(item.created_by),
    })),
    points: points.map((point) => {
      const author = Array.isArray(point.author) ? point.author[0] : point.author;
      return {
        id: point.id,
        body: point.body,
        isResolved: point.is_resolved,
        createdAt: point.created_at,
        resolvedAt: point.resolved_at,
        authorId: point.created_by,
        authorName: author?.full_name || author?.email || "Unknown",
      };
    }),
  };
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
  });
}

export async function addLinkAttachmentAction(input: { ideaId: string; url: string }) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    const parsed = addLinkAttachmentSchema.parse(input);
    await attachmentService.addLinkAttachment(supabase, { workspaceId: workspace.id, userId: user.id, ...parsed });
  });
}

export async function removeAttachmentAction(attachmentId: string) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => attachmentService.removeAttachment(supabase, attachmentId));
}

export async function setIdeaReviewedAction(ideaId: string, reviewed: boolean) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    await contentIdeaService.setIdeaReviewed(supabase, workspace.id, ideaId, user.id, reviewed);
  });
}

export async function addReviewPointAction(input: { ideaId: string; body: string }) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  return toResult(async () => {
    const parsed = addReviewPointSchema.parse(input);
    await reviewService.addReviewPoint(supabase, { workspaceId: workspace.id, userId: user.id, ...parsed });
  });
}

export async function setReviewPointResolvedAction(pointId: string, resolved: boolean) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => reviewService.setReviewPointResolved(supabase, pointId, resolved));
}

export async function deleteReviewPointAction(pointId: string) {
  const { supabase } = await requireContentBoardContext();
  return toResult(() => reviewService.deleteReviewPoint(supabase, pointId));
}
