import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createNotification } from "@/lib/services/notification-service";
import { addReviewPoint } from "@/lib/services/content-review-service";
import { describePages, type MarkupStroke } from "@/lib/utils/markup";
import { MAX_REVIEW_POINT_LENGTH } from "@/lib/utils/content-board";
import { markupSubmissionSchema, type MarkupSubmissionInput } from "@/lib/validation/content-idea-schema";

import type { MarkupReviewPage, MarkupReviewSummary } from "@/lib/utils/markup";
export type { MarkupReviewPage, MarkupReviewSummary };

type PersonEmbed = { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
const nameOf = (person: PersonEmbed) => {
  const one = Array.isArray(person) ? person[0] : person;
  return one?.full_name || one?.email || "Unknown";
};

// Saves a Pencil review: the marks of every page drawn on, as a layer on the draft that was reviewed. It
// also adds a review point ("Marked up pages 2 and 5 …"), which shows in Activity and moves an idea still
// in Ideas to Feedback like any other feedback, and tells the people assigned to the idea.
export async function submitMarkupReview(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; userId: string; userName: string; submission: MarkupSubmissionInput },
) {
  const submission = markupSubmissionSchema.parse(input.submission);

  const { data: idea, error: ideaError } = await supabase
    .from("content_ideas")
    .select("id, title, workspace_id, attachments:content_idea_attachments(id), assignees:content_idea_assignees(user_id)")
    .eq("id", submission.ideaId)
    .maybeSingle();
  if (ideaError) throw ideaError;
  if (!idea || idea.workspace_id !== input.workspaceId) throw new Error("This idea no longer exists.");
  const known = new Set((idea.attachments ?? []).map((item: { id: string }) => item.id));
  if (submission.fileIds.some((id) => !known.has(id))) {
    throw new Error("Some of these files were removed while you were reviewing. Reopen the idea and try again.");
  }

  const { data: review, error } = await supabase
    .from("content_idea_reviews")
    .insert({
      idea_id: idea.id,
      workspace_id: input.workspaceId,
      file_ids: submission.fileIds,
      note: submission.note || null,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: pagesError } = await supabase.from("content_idea_review_pages").insert(
    submission.pages.map((page) => ({
      review_id: review.id,
      idea_id: idea.id,
      workspace_id: input.workspaceId,
      attachment_id: page.attachmentId,
      page_number: page.pageNumber,
      strokes: page.strokes,
    })),
  );
  if (pagesError) {
    await supabase.from("content_idea_reviews").delete().eq("id", review.id);
    throw pagesError;
  }

  const where = describePages(submission.pages.map((page) => page.position));
  const body = `Marked up ${where} with Pencil.${submission.note ? ` ${submission.note}` : ""}`.slice(0, MAX_REVIEW_POINT_LENGTH);
  await addReviewPoint(supabase, { workspaceId: input.workspaceId, ideaId: idea.id, userId: input.userId, body });

  await writeAuditLog(supabase, {
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: "content_idea.marked_up",
    entityType: "content_idea",
    entityId: idea.id,
    metadata: { review_id: review.id, pages: submission.pages.length },
  });

  // Telling people is best effort: the review is saved either way.
  const toNotify = (idea.assignees ?? [])
    .map((row: { user_id: string }) => row.user_id)
    .filter((userId: string) => userId !== input.userId);
  await Promise.allSettled(
    toNotify.map((userId: string) =>
      createNotification({
        userId,
        type: "content_idea_markup",
        title: "New Pencil review",
        message: `${input.userName} marked up ${where} of “${idea.title}”. Open the idea to see the marks.`,
      }),
    ),
  );

  return { reviewId: review.id as string };
}

// Every Pencil review of an idea, newest first, without the strokes (those load when a review is opened).
export async function listMarkupReviews(supabase: SupabaseClient<any>, ideaId: string): Promise<MarkupReviewSummary[]> {
  const { data, error } = await supabase
    .from("content_idea_reviews")
    .select(
      "id, created_at, created_by, note, file_ids, author:profiles!content_idea_reviews_created_by_fkey(full_name, email), pages:content_idea_review_pages(attachment_id, page_number)",
    )
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    authorName: nameOf(row.author),
    note: row.note,
    fileIds: row.file_ids ?? [],
    pages: (row.pages ?? []).map((page: { attachment_id: string; page_number: number }) => ({
      attachmentId: page.attachment_id,
      pageNumber: page.page_number,
    })),
  }));
}

// One review with all of its strokes.
export async function getMarkupReview(supabase: SupabaseClient<any>, reviewId: string) {
  const { data, error } = await supabase
    .from("content_idea_reviews")
    .select(
      "id, idea_id, created_at, created_by, note, file_ids, author:profiles!content_idea_reviews_created_by_fkey(full_name, email), pages:content_idea_review_pages(attachment_id, page_number, strokes)",
    )
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    ideaId: data.idea_id as string,
    createdAt: data.created_at as string,
    authorName: nameOf(data.author as PersonEmbed),
    note: (data.note as string | null) ?? null,
    fileIds: (data.file_ids as string[]) ?? [],
    pages: ((data.pages as { attachment_id: string; page_number: number; strokes: MarkupStroke[] }[]) ?? []).map((page) => ({
      attachmentId: page.attachment_id,
      pageNumber: page.page_number,
      strokes: page.strokes ?? [],
    })) as MarkupReviewPage[],
  };
}

export async function deleteMarkupReview(supabase: SupabaseClient<any>, reviewId: string) {
  const { data, error } = await supabase.from("content_idea_reviews").delete().eq("id", reviewId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Only the reviewer or an admin can remove this review.");
}
