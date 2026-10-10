import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as attachmentService from "@/lib/services/content-attachment-service";
import * as reviewService from "@/lib/services/content-review-service";
import { listMarkupReviews, listMySavedMarkupReviews } from "@/lib/services/content-markup-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { toEmbedUrl } from "@/lib/utils/design-links";
import { pageImagesReady } from "@/lib/utils/page-images";
import type { IdeaPanelData } from "@/components/content-board/types";

// Everything the idea side panel shows: files (with signed links), review points and history.
export async function getIdeaPanelData(
  supabase: SupabaseClient<any>,
  user: { id: string },
  workspace: { id: string },
  ideaId: string,
): Promise<IdeaPanelData> {
  const [attachments, points, admin, ideaResult, markupReviews, savedMarkupReviews] = await Promise.all([
    attachmentService.listAttachments(supabase, ideaId),
    reviewService.listReviewPoints(supabase, ideaId),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
    supabase
      .from("content_ideas")
      .select("status, created_at, created_by, posted_at, reviewed_at, reviewed_by")
      .eq("id", ideaId)
      .single(),
    listMarkupReviews(supabase, ideaId),
    // Only a nicety ("Continue your Pencil review"), so it never stops the panel opening.
    listMySavedMarkupReviews(supabase, ideaId, user.id).catch(() => []),
  ]);
  if (ideaResult.error) throw ideaResult.error;
  const idea = ideaResult.data;

  const personIds = [
    ...new Set([user.id, idea.created_by, idea.reviewed_by, ...attachments.map((item) => item.created_by)].filter(Boolean)),
  ] as string[];
  // Names and signed file links don't depend on each other, so fetch them together.
  const [{ data: people }, signed] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", personIds),
    attachmentService.signPaths(
      supabase,
      attachments
        .flatMap((item) => [
          item.storage_path,
          item.thumb_path,
          // A PDF's page pictures, once every page has one (until then the PDF itself is shown).
          ...(item.kind === "pdf" && pageImagesReady(item.page_images, item.page_count) ? (item.page_images ?? []).map((page) => page.path) : []),
        ])
        .filter((path): path is string => Boolean(path)),
    ),
  ]);
  const nameOf = (id: string | null | undefined) => {
    const person = people?.find((candidate) => candidate.id === id);
    return person?.full_name || person?.email || "Unknown";
  };

  return {
    workspaceId: workspace.id,
    currentUserId: user.id,
    currentUserName: nameOf(user.id),
    isAdmin: admin,
    status: idea.status,
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
      thumbUrl: item.thumb_path ? (signed.get(item.thumb_path) ?? null) : null,
      createdAt: item.created_at,
      uploaderName: nameOf(item.created_by),
      uploadedVia: item.uploaded_via ?? null,
      ...(item.kind === "pdf"
        ? pageImagesReady(item.page_images, item.page_count)
          ? {
              pages: (item.page_images ?? []).map((page) => ({ url: signed.get(page.path) ?? "", width: page.width, height: page.height })),
            }
          : { pagesPending: true }
        : {}),
    })),
    markupReviews,
    savedMarkupReviews,
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
