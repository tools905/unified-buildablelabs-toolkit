"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AssignDialog } from "@/components/content-board/assign-dialog";
import { CreateIdeaDialog } from "@/components/content-board/create-idea-dialog";
import { DiscardDialog } from "@/components/content-board/discard-dialog";
import { BoardFilters, NO_FILTERS, type BoardFilterValues } from "@/components/content-board/board-filters";
import { ExportDialog } from "@/components/content-board/export-dialog";
import { restoreIdeaAction } from "@/app/tools/content-board/actions";
import { IdeaCard } from "@/components/content-board/idea-card";
import { IdeaDetail } from "@/components/content-board/idea-detail";
import { IdeaPanel } from "@/components/content-board/idea-panel";
import { useIdeaMoves } from "@/components/content-board/use-idea-moves";
import { useUrlState } from "@/components/dashboard/use-url-state";
import {
  CONTENT_COLUMNS,
  matchesPlatform,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";
import { canMoveIdea, canTeamMoveFrom, columnOrderNote, COLUMN_LABELS, sortColumnIdeas } from "@/lib/utils/content-board";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

const URL_KEYS = ["idea", "view"] as const;

// Discarded ideas sit in their own column between Ideas and Feedback, shown only when "Show discarded
// ideas" is switched on in the Filter. The filters are remembered on this device.
const FILTERS_KEY = "tc-board-filters";
const BOARD_COLUMNS: { status: ContentIdeaStatus; label: string }[] = [
  CONTENT_COLUMNS[0],
  { status: "discarded", label: COLUMN_LABELS.discarded },
  ...CONTENT_COLUMNS.slice(1),
];

export function KanbanBoard({
  initialIdeas,
  members,
  currentUserId,
  isAdmin,
}: {
  initialIdeas: ContentIdeaWithRelations[];
  members: ContentMemberOption[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const { ideas, moveIdea, runMove, setOptimisticStatus, moveError, clearMoveError } = useIdeaMoves(initialIdeas);
  const [filters, setFiltersState] = useState<BoardFilterValues>(NO_FILTERS);
  useEffect(() => {
    try {
      // Read after the first render, so the server and the browser draw the same board first.
      const saved = JSON.parse(window.localStorage.getItem(FILTERS_KEY) ?? "null") as Partial<BoardFilterValues> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setFiltersState({ ...NO_FILTERS, ...saved });
    } catch {
      // Storage unavailable: no filters.
    }
  }, []);
  // The filters are remembered on this device.
  const setFilters = (next: BoardFilterValues) => {
    setFiltersState(next);
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ContentIdeaStatus | null>(null);
  const [visibleColumn, setVisibleColumn] = useState(0);
  const columnsRef = useRef<HTMLDivElement>(null);

  // The open card and any dialog on it live in the address, so Back closes them (see useUrlState).
  const { values, push, pop } = useUrlState(URL_KEYS);
  const panelIdea = ideas.find((idea) => idea.id === values.idea) ?? null;
  const view = panelIdea ? values.view : null;

  const filtered = useMemo(() => {
    return ideas.filter((idea) => {
      if (!matchesPlatform(idea, filters.platform)) return false;
      // A person: ideas they added or are assigned to.
      if (filters.person && idea.created_by !== filters.person && !(idea.assignees ?? []).some((assignee) => assignee.user_id === filters.person)) {
        return false;
      }
      if (search) {
        const query = search.toLowerCase();
        const matches =
          idea.title.toLowerCase().includes(query) || (idea.description ?? "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [ideas, search, filters.platform, filters.person]);

  const columns = useMemo(
    () =>
      // The Discarded column only when "Show discarded ideas" is on in the filter.
      BOARD_COLUMNS.filter((column) => column.status !== "discarded" || filters.showDiscarded).map((column) => ({
        ...column,
        ideas: sortColumnIdeas(
          column.status,
          filtered.filter((idea) => idea.status === column.status),
        ),
      })),
    [filtered, filters.showDiscarded],
  );

  // A column takes the card being dragged only if this person may make that move (see canMoveIdea):
  // admins anywhere, everyone else between Feedback, Shortlisted, In Progress and Posted.
  const draggingIdea = draggingId ? (ideas.find((idea) => idea.id === draggingId) ?? null) : null;
  const canDropOn = (status: ContentIdeaStatus) =>
    draggingIdea !== null && (draggingIdea.status === status || canMoveIdea({
        from: draggingIdea.status,
        to: status,
        isAdmin,
        openReviewCount: draggingIdea.open_review_count,
        afterChanges: draggingIdea.after_changes,
      }));

  function handleDrop(status: ContentIdeaStatus) {
    if (!draggingId || !canDropOn(status)) {
      setDraggingId(null);
      setDragOverStatus(null);
      return;
    }
    void moveIdea(draggingId, status);
    setDraggingId(null);
    setDragOverStatus(null);
  }

  // Phones show one column at a time; the tabs jump to a column and follow the swipe.
  function showColumn(index: number) {
    const target = columnsRef.current?.children[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  // The column whose left edge is nearest the scroll position (columns differ in width: the folded
  // Discarded strip is narrow).
  function trackVisibleColumn() {
    const container = columnsRef.current;
    if (!container) return;
    const children = Array.from(container.children) as HTMLElement[];
    const left = container.scrollLeft + container.offsetLeft;
    let nearest = 0;
    children.forEach((child, index) => {
      if (Math.abs(child.offsetLeft - left) < Math.abs(children[nearest].offsetLeft - left)) nearest = index;
    });
    setVisibleColumn(nearest);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search ideas…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search ideas"
          className="min-w-0 flex-1 basis-full sm:max-w-xs sm:basis-auto"
        />
        <div className="ml-auto flex items-center gap-2">
          <BoardFilters values={filters} members={members} onChange={setFilters} />
          <ExportDialog ideas={ideas} />
          <CreateIdeaDialog members={members} isAdmin={isAdmin} currentUserId={currentUserId} />
        </div>
      </div>

      {moveError ? (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>{moveError}</span>
          <button type="button" onClick={clearMoveError} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Phones: tabs for the columns, which sit side by side and snap one at a time. */}
      <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Columns">
        {columns.map((column, index) => (
          <button
            key={column.status}
            type="button"
            role="tab"
            aria-selected={visibleColumn === index}
            onClick={() => showColumn(index)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              visibleColumn === index
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {column.label}
            <span className={cn("rounded-full px-1.5 text-[10px]", visibleColumn === index ? "bg-white/20" : "bg-muted")}>
              {column.ideas.length}
            </span>
          </button>
        ))}
      </div>

      {/* Below desktop width: one column per screen, swiped sideways. On desktop every column keeps a
          readable minimum width, and the board scrolls sideways if they do not all fit. */}
      <div
        ref={columnsRef}
        onScroll={trackVisibleColumn}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 lg:mx-0 lg:grid lg:snap-none lg:auto-cols-[minmax(13rem,1fr)] lg:grid-flow-col lg:gap-4 lg:px-0"
      >
        {columns.map((column) => {
          const isDragOver = dragOverStatus === column.status;
          return (
            <div
              key={column.status}
              aria-label={column.label}
              onDragOver={(event) => {
                if (!canDropOn(column.status)) return;
                event.preventDefault();
                if (dragOverStatus !== column.status) setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((prev) => (prev === column.status ? null : prev))}
              onDrop={() => handleDrop(column.status)}
              className={cn(
                "flex h-[calc(100dvh-17rem)] min-h-[22rem] w-[86vw] max-w-[24rem] shrink-0 snap-start flex-col rounded-lg border bg-muted/40 p-3 transition-colors sm:w-[22rem] lg:h-[calc(100vh-260px)] lg:w-auto lg:max-w-none",
                isDragOver ? "border-primary/60 bg-primary/5" : "border-border",
                // Discarded cards are shown faded: they're out of the flow.
                column.status === "discarded" && "border-dashed bg-muted/20 [&_[role=button]]:opacity-75",
              )}
            >
              <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    {column.status === "discarded" ? <ArchiveX className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    {column.label}
                  </h2>
                  {/* Ideas and the other columns are ordered differently, so each says how. */}
                  <p className="text-[11px] text-muted-foreground">{columnOrderNote(column.status)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{column.ideas.length}</span>
                  {column.status === "discarded" ? (
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, showDiscarded: false })}
                      aria-label="Hide discarded ideas"
                      title="Hide (or use Filter)"
                      className="grid h-7 w-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
              {/* A little room on every side so a card can grow on hover without being cut off. */}
              <div className="-mx-1.5 min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-1.5 py-1.5">
                {column.ideas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    active={panelIdea?.id === idea.id}
                    canDrag={isAdmin || canTeamMoveFrom(idea.status)}
                    isDragging={draggingId === idea.id}
                    onOpen={() => push({ idea: idea.id, view: null })}
                    onEdit={() => push({ idea: idea.id, view: "edit" })}
                    onAssign={() => push({ idea: idea.id, view: "assign" })}
                    onMove={(status) => void moveIdea(idea.id, status)}
                    onDiscard={() => push({ idea: idea.id, view: "discard" })}
                    onRestore={() =>
                      void runMove(idea.id, idea.discarded_from === "feedback" ? "feedback" : "idea", () => restoreIdeaAction(idea.id))
                    }
                    onDeleteForGood={() => push({ idea: idea.id, view: "delete" })}
                    onDragStart={(event) => {
                      setDraggingId(idea.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStatus(null);
                    }}
                  />
                ))}
                {column.ideas.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                    {column.status === "discarded" ? "Nothing discarded. Discard an idea from its ⋮ menu." : "No ideas"}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {panelIdea ? (
        <IdeaPanel
          key={panelIdea.id}
          idea={panelIdea}
          keyboardActive={!view}
          onClose={() => pop({ idea: null, view: null })}
          onEdit={() => push({ view: "edit" })}
          onMove={moveIdea}
          onOptimisticStatus={setOptimisticStatus}
        />
      ) : null}
      {panelIdea && view === "edit" ? (
        <IdeaDetail
          idea={panelIdea}
          members={members}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onClose={() => pop({ view: null })}
        />
      ) : null}
      {panelIdea && (view === "discard" || view === "delete") ? (
        <DiscardDialog
          idea={panelIdea}
          mode={view}
          onDone={() => {
            if (view === "discard") setOptimisticStatus(panelIdea.id, "discarded");
          }}
          // A deleted idea is gone, so its panel closes too.
          onClose={() => (view === "delete" ? pop({ idea: null, view: null }) : pop({ view: null }))}
        />
      ) : null}
      {panelIdea && view === "assign" && isAdmin ? (
        <AssignDialog idea={panelIdea} members={members} currentUserId={currentUserId} onClose={() => pop({ view: null })} />
      ) : null}
    </div>
  );
}
