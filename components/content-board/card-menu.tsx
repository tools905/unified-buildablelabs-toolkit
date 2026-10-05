"use client";

import { ArrowRight, Download, Eye, MoreVertical, Pencil, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTENT_COLUMNS, type ContentIdeaWithRelations } from "@/components/content-board/types";
import { canMoveIdea } from "@/lib/utils/content-board";
import { ideaPdfUrl } from "@/components/content-board/idea-pdf";
import type { ContentIdeaStatus } from "@/lib/db/types";

// The ⋮ menu on a board card: open, edit, assign (admins), move to another column (whoever may make
// that move) and download the post as a PDF.
export function CardMenu({
  idea,
  isAdmin,
  isAssignee,
  onOpen,
  onEdit,
  onAssign,
  onMove,
}: {
  idea: ContentIdeaWithRelations;
  isAdmin: boolean;
  isAssignee: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onMove: (status: ContentIdeaStatus) => void;
}) {
  const moves = CONTENT_COLUMNS.filter((column) =>
    canMoveIdea({ from: idea.status, to: column.status, isAdmin, isAssignee }),
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
              Download as PDF
            </a>
          </DropdownMenuItem>
        ) : null}
        {moves.length > 0 ? (
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
