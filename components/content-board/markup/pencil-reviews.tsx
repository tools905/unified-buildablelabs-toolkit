"use client";

import { useState } from "react";
import { Download, Eye, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { formatWhen, type UploadGroup } from "@/components/content-board/activity";
import { ideaPdfUrl } from "@/components/content-board/idea-pdf";
import { MarkupReviewer } from "@/components/content-board/markup/markup-reviewer";
import type { PanelAttachment } from "@/components/content-board/types";
import { useUrlState } from "@/components/dashboard/use-url-state";
import { BASE_PATH } from "@/lib/utils/app-url";
import type { MarkupReviewSummary } from "@/lib/utils/markup";

const URL_KEYS = ["markup"] as const;

// "Review with Pencil" for the draft on screen, and the reviews already submitted. The review screen
// lives in the address (?markup=draw, or ?markup=<review id> to look at one), so Back closes it.
export function PencilReviews({
  ideaId,
  attachments,
  drafts,
  currentDraft,
  reviews,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  ideaId: string;
  attachments: PanelAttachment[];
  drafts: UploadGroup[];
  currentDraft: UploadGroup | null;
  reviews: MarkupReviewSummary[];
  currentUserId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { values, push, pop } = useUrlState(URL_KEYS);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const draftFiles = (currentDraft?.items ?? []).map((item) => item.attachment).filter((item) => item.kind !== "link");
  const draftName = (draft: UploadGroup | null) => (draft ? (drafts.length > 1 ? `draft ${draft.number}` : "the draft") : "the draft");
  const draftOfReview = (review: MarkupReviewSummary) =>
    drafts.find((draft) => draft.items.some((item) => review.fileIds.includes(item.attachment.id))) ?? null;

  // Pages of a review, counted the way the draft is shown (1 = its first page).
  const filesOf = (fileIds: string[]) =>
    fileIds.map((id) => attachments.find((item) => item.id === id)).filter((item): item is PanelAttachment => Boolean(item));

  const open = values.markup;
  const openReview = open && open !== "draw" ? reviews.find((review) => review.id === open) ?? null : null;
  const openReviewDraft = openReview ? draftOfReview(openReview) : null;

  async function remove(review: MarkupReviewSummary) {
    setRemoveError(null);
    setRemoving(review.id);
    try {
      const response = await fetch(`${BASE_PATH}/api/content-board/reviews/${encodeURIComponent(review.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn't remove the review.");
      onChanged();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Couldn't remove the review.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-3">
      {draftFiles.length > 0 ? (
        <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={() => push({ markup: "draw" })}>
          <PenLine className="h-4 w-4" />
          Review {draftName(currentDraft)} with Pencil
        </Button>
      ) : null}

      {reviews.length > 0 ? (
        <section aria-label="Pencil reviews" className="space-y-2">
          <h4 className="text-xs font-semibold">Pencil reviews ({reviews.length})</h4>
          <ul className="divide-y divide-border border border-border">
            {reviews.map((review) => {
              const draft = draftOfReview(review);
              const canRemove = isAdmin || review.createdBy === currentUserId;
              return (
                <li key={review.id} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-sm">
                      <span className="font-semibold">{review.authorName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        marked up {review.pages.length} {review.pages.length === 1 ? "page" : "pages"} of {draftName(draft)}
                      </span>
                    </p>
                    <span className="text-[11px] text-muted-foreground">{formatWhen(review.createdAt)}</span>
                  </div>
                  {review.note ? <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{review.note}</p> : null}
                  <div className="flex flex-wrap items-center gap-1">
                    <Button type="button" size="sm" variant="secondary" onClick={() => push({ markup: review.id })}>
                      <Eye className="h-3.5 w-3.5" />
                      View marks
                    </Button>
                    <a
                      href={ideaPdfUrl(ideaId, [], { review: review.id })}
                      rel="noopener"
                      className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </a>
                    {canRemove ? (
                      <InlineConfirmButton
                        label="Remove"
                        question="Remove this review?"
                        confirmLabel="Yes, remove"
                        pendingLabel="Removing…"
                        pending={removing === review.id}
                        onConfirm={() => void remove(review)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {removeError ? (
            <p role="alert" className="text-xs text-destructive">
              {removeError}
            </p>
          ) : null}
        </section>
      ) : null}

      {open === "draw" && draftFiles.length > 0 ? (
        <MarkupReviewer
          mode="draw"
          ideaId={ideaId}
          draftLabel={drafts.length > 1 && currentDraft ? `Draft ${currentDraft.number}` : "Draft"}
          attachments={draftFiles}
          onClose={() => pop({ markup: null })}
          onSubmitted={() => {
            pop({ markup: null });
            onChanged();
          }}
        />
      ) : null}
      {openReview ? (
        <MarkupReviewer
          mode="view"
          ideaId={ideaId}
          reviewId={openReview.id}
          reviewTitle={`Review by ${openReview.authorName} · ${formatWhen(openReview.createdAt)}`}
          draftLabel={drafts.length > 1 && openReviewDraft ? `Draft ${openReviewDraft.number}` : "Draft"}
          attachments={filesOf(openReview.fileIds)}
          onClose={() => pop({ markup: null })}
        />
      ) : null}
    </div>
  );
}
