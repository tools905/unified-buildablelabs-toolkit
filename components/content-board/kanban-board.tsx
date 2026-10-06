"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { AssignDialog } from "@/components/content-board/assign-dialog";
import { CreateIdeaDialog } from "@/components/content-board/create-idea-dialog";
import { IdeaCard } from "@/components/content-board/idea-card";
import { IdeaDetail } from "@/components/content-board/idea-detail";
import { IdeaPanel } from "@/components/content-board/idea-panel";
import { useIdeaMoves } from "@/components/content-board/use-idea-moves";
import { useUrlState } from "@/components/dashboard/use-url-state";
import {
  CONTENT_COLUMNS,
  PLATFORM_META,
  PLATFORM_OPTIONS,
  matchesPlatform,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";
import { columnOrderNote, sortColumnIdeas } from "@/lib/utils/content-board";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

const URL_KEYS = ["idea", "view"] as const;

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
  const { ideas, moveIdea, setOptimisticStatus, moveError, clearMoveError } = useIdeaMoves(initialIdeas);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [proposerFilter, setProposerFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
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
      if (!matchesPlatform(idea, platformFilter)) return false;
      if (proposerFilter === "me" && idea.created_by !== currentUserId) return false;
      if (proposerFilter && proposerFilter !== "me" && idea.created_by !== proposerFilter) return false;
      const assignedIds = (idea.assignees ?? []).map((assignee) => assignee.user_id);
      if (assigneeFilter === "me" && !assignedIds.includes(currentUserId)) return false;
      if (assigneeFilter === "none" && assignedIds.length > 0) return false;
      if (assigneeFilter && assigneeFilter !== "me" && assigneeFilter !== "none" && !assignedIds.includes(assigneeFilter)) return false;
      if (search) {
        const query = search.toLowerCase();
        const matches =
          idea.title.toLowerCase().includes(query) || (idea.description ?? "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [ideas, search, platformFilter, proposerFilter, assigneeFilter, currentUserId]);

  const columns = useMemo(
    () =>
      CONTENT_COLUMNS.map((column) => ({
        ...column,
        ideas: sortColumnIdeas(
          column.status,
          filtered.filter((idea) => idea.status === column.status),
        ),
      })),
    [filtered],
  );

  function handleDrop(status: ContentIdeaStatus) {
    if (!draggingId) return;
    void moveIdea(draggingId, status);
    setDraggingId(null);
    setDragOverStatus(null);
  }

  // Phones show one column at a time; the tabs jump to a column and follow the swipe.
  function showColumn(index: number) {
    const target = columnsRef.current?.children[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  function trackVisibleColumn() {
    const container = columnsRef.current;
    const first = container?.children[0] as HTMLElement | undefined;
    if (!container || !first) return;
    const step = first.offsetWidth + 12;
    setVisibleColumn(Math.min(CONTENT_COLUMNS.length - 1, Math.max(0, Math.round(container.scrollLeft / step))));
  }

  const selectClass = "h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            placeholder="Search ideas…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search ideas"
            className="col-span-2 sm:max-w-xs"
          />
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            aria-label="Filter by platform"
            className={selectClass}
          >
            <option value="">Every platform</option>
            {PLATFORM_OPTIONS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_META[platform].label}
              </option>
            ))}
          </select>
          <select
            value={proposerFilter}
            onChange={(event) => setProposerFilter(event.target.value)}
            aria-label="Filter by who proposed it"
            className={selectClass}
          >
            <option value="">Everyone</option>
            <option value="me">Posted by me</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            aria-label="Filter by who it is assigned to"
            className={cn(selectClass, "col-span-2 sm:col-span-1")}
          >
            <option value="">Anyone assigned</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                Assigned to {member.label}
              </option>
            ))}
          </select>
        </div>
        <CreateIdeaDialog members={members} isAdmin={isAdmin} currentUserId={currentUserId} />
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
                if (!isAdmin) return;
                event.preventDefault();
                if (dragOverStatus !== column.status) setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((prev) => (prev === column.status ? null : prev))}
              onDrop={() => handleDrop(column.status)}
              className={cn(
                "flex h-[calc(100dvh-17rem)] min-h-[22rem] w-[86vw] max-w-[24rem] shrink-0 snap-start flex-col rounded-lg border bg-muted/40 p-3 transition-colors sm:w-[22rem] lg:h-[calc(100vh-260px)] lg:w-auto lg:max-w-none",
                isDragOver ? "border-primary/60 bg-primary/5" : "border-border",
              )}
            >
              <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  {/* Ideas and the other columns are ordered differently, so each says how. */}
                  <p className="text-[11px] text-muted-foreground">{columnOrderNote(column.status)}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{column.ideas.length}</span>
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
                    canDrag={isAdmin}
                    isDragging={draggingId === idea.id}
                    onOpen={() => push({ idea: idea.id, view: null })}
                    onEdit={() => push({ idea: idea.id, view: "edit" })}
                    onAssign={() => push({ idea: idea.id, view: "assign" })}
                    onMove={(status) => void moveIdea(idea.id, status)}
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
                    No ideas
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
      {panelIdea && view === "assign" && isAdmin ? (
        <AssignDialog idea={panelIdea} members={members} currentUserId={currentUserId} onClose={() => pop({ view: null })} />
      ) : null}
    </div>
  );
}
