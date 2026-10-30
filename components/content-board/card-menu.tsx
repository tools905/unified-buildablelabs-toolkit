"use client";

import { ArchiveX, ArrowRight, Download, Eye, MoreVertical, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTENT_COLUMNS, type ContentIdeaWithRelations } from "@/components/content-board/types";
import { canDiscard, canMoveIdea, COLUMN_LABELS } from "@/lib/utils/content-board";
import { ideaPdfUrl } from "@/components/content-board/idea-pdf";
import type { ContentIdeaStatus } from "@/lib/db/types";

// The ⋮ menu on a board card: open, edit, assign (admins), move to another column (whoever may make
// that move), download the post as a PDF, and discard (Ideas and Feedback) / restore / delete for good.
export function CardMenu({
  idea,
  isAdmin,
  onOpen,
  onEdit,
  onAssign,
  onMove,
  onDiscard,
  onRestore,
  onDeleteForGood,
}: {
  idea: ContentIdeaWithRelations;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onMove: (status: ContentIdeaStatus) => void;
  onDiscard: () => void;
  onRestore: () => void;
  onDeleteForGood: () => void;
}) {
  const discarded = idea.status === "discarded";
  const moves = CONTENT_COLUMNS.filter((column) =>
    canMoveIdea({ from: idea.status, to: column.status, isAdmin, openReviewCount: idea.open_review_count, afterChanges: idea.after_changes }),
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`More actions for ${idea.title}`}
        // The card itself opens on click and can be dragged: keep both out of the menu button.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        draggable={false}
        className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      {/* React passes events from the menu up to the card even though the menu is drawn elsewhere
          on the page, so stop them here or every choice would also open the card. */}
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>
          <Eye />
          Open preview &amp; feedback
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit details
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem onSelect={onAssign}>
            <UserPlus />
            Assign people…
          </DropdownMenuItem>
        ) : null}
        {idea.file_count > 0 ? (
          <DropdownMenuItem asChild>
            <a href={ideaPdfUrl(idea.id)} rel="noopener">
              <Download />
              Download latest draft (PDF)
            </a>
          </DropdownMenuItem>
        ) : null}
        {discarded ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRestore}>
              <RotateCcw />
              Restore to {COLUMN_LABELS[idea.discarded_from === "feedback" ? "feedback" : "idea"]}
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem onSelect={onDeleteForGood} className="text-destructive focus:text-destructive">
                <Trash2 />
                Delete for good…
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {canDiscard(idea.status) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDiscard} className="text-destructive focus:text-destructive">
              <ArchiveX />
              Discard…
            </DropdownMenuItem>
          </>
        ) : null}
        {moves.length > 0 && !discarded ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {moves.map((column) => (
              <DropdownMenuItem key={column.status} onSelect={() => onMove(column.status)}>
                <ArrowRight />
                {column.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
