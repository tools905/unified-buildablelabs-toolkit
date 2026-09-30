"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { CreateIdeaDialog } from "@/components/content-board/create-idea-dialog";
import { IdeaCard } from "@/components/content-board/idea-card";
import { IdeaDetail } from "@/components/content-board/idea-detail";
import { IdeaPanel } from "@/components/content-board/idea-panel";
import {
  CONTENT_COLUMNS,
  PLATFORM_META,
  PLATFORM_OPTIONS,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";
import { updateIdeaStatusAction } from "@/app/tools/content-board/actions";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

export function KanbanBoard({
  initialIdeas,
  members,
  currentUserId,
}: {
  initialIdeas: ContentIdeaWithRelations[];
  members: ContentMemberOption[];
  currentUserId: string;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, ContentIdeaStatus>>({});
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [proposerFilter, setProposerFilter] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ContentIdeaStatus | null>(null);
  const [panelIdeaId, setPanelIdeaId] = useState<string | null>(null);
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ideas = useMemo(() => {
    return initialIdeas.map((idea) => {
      const override = optimisticStatus[idea.id];
      return override && override !== idea.status ? { ...idea, status: override } : idea;
    });
  }, [initialIdeas, optimisticStatus]);

  const panelIdea = ideas.find((idea) => idea.id === panelIdeaId) ?? null;
  const editIdea = ideas.find((idea) => idea.id === editIdeaId) ?? null;

  const filtered = useMemo(() => {
    return ideas.filter((idea) => {
      if (platformFilter && idea.platform !== platformFilter) return false;
      if (proposerFilter === "me" && idea.created_by !== currentUserId) return false;
      if (proposerFilter && proposerFilter !== "me" && idea.created_by !== proposerFilter) return false;
      if (search) {
        const query = search.toLowerCase();
        const matches =
          idea.title.toLowerCase().includes(query) || (idea.description ?? "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [ideas, search, platformFilter, proposerFilter, currentUserId]);

  function moveIdea(ideaId: string, status: ContentIdeaStatus) {
    setOptimisticStatus((prev) => ({ ...prev, [ideaId]: status }));
    startTransition(() => updateIdeaStatusAction(ideaId, status));
  }

  function handleDrop(status: ContentIdeaStatus) {
    if (!draggingId) return;
    moveIdea(draggingId, status);
    setDraggingId(null);
    setDragOverStatus(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <Input
            placeholder="Search ideas…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
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
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Everyone</option>
            <option value="me">Posted by me</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </div>
        <CreateIdeaDialog />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-4">
        {CONTENT_COLUMNS.map((column) => {
          const columnIdeas = filtered.filter((idea) => idea.status === column.status);
          const isDragOver = dragOverStatus === column.status;
          return (
            <div
              key={column.status}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOverStatus !== column.status) setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((prev) => (prev === column.status ? null : prev))}
              onDrop={() => handleDrop(column.status)}
              className={cn(
                "flex max-h-[70vh] min-h-[8rem] flex-col rounded-lg border bg-muted/40 p-3 transition-colors lg:h-[calc(100vh-260px)] lg:max-h-none lg:min-h-[20rem]",
                isDragOver ? "border-primary/60 bg-primary/5" : "border-border",
              )}
            >
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <h2 className="text-sm font-semibold">{column.label}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {columnIdeas.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {columnIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    isDragging={draggingId === idea.id}
                    onOpen={() => setPanelIdeaId(idea.id)}
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
                {columnIdeas.length === 0 ? (
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
          keyboardActive={!editIdea}
          onClose={() => setPanelIdeaId(null)}
          onEdit={() => setEditIdeaId(panelIdea.id)}
        />
      ) : null}
      {editIdea ? <IdeaDetail idea={editIdea} onClose={() => setEditIdeaId(null)} /> : null}
    </div>
  );
}
