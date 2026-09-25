"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PLATFORM_META, type ContentIdeaWithRelations } from "@/components/content-board/types";

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name || email || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function IdeaCard({
  idea,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  idea: ContentIdeaWithRelations;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  isDragging: boolean;
}) {
  const meta = PLATFORM_META[idea.platform];
  const PlatformIcon = meta.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      className={cn(
        "card-shadow card-hover-effect flex min-h-[9rem] cursor-pointer flex-col rounded-lg border border-border bg-card p-3",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: meta.color }}
        >
          <PlatformIcon className="h-3 w-3" />
          {meta.label}
        </span>
        {idea.creator ? (
          <span
            title={`Proposed by ${idea.creator.full_name || idea.creator.email}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
          >
            {initials(idea.creator.full_name, idea.creator.email)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 flex-1 text-sm font-medium leading-snug">{idea.title}</p>
      {idea.post_url ? (
        <a
          href={idea.post_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View post <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
