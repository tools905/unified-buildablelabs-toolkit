"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { CaptionField } from "@/components/content-board/caption-field";
import { AssigneePicker } from "@/components/content-board/assignee-picker";
import { PlatformPicker } from "@/components/content-board/platform-picker";
import { ReferenceLinksField } from "@/components/content-board/reference-links-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteIdeaAction, updateIdeaAction } from "@/app/tools/content-board/actions";
import {
  CONTENT_COLUMNS,
  ideaPlatforms,
  platformMeta,
  assigneeLabel,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";

export function IdeaDetail({
  idea,
  members,
  isAdmin,
  currentUserId,
  onClose,
}: {
  idea: ContentIdeaWithRelations;
  members: ContentMemberOption[];
  isAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const statusLabel = CONTENT_COLUMNS.find((c) => c.status === idea.status)?.label ?? idea.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="popover-shadow flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div
          className="flex items-start justify-between gap-3 border-b border-border px-6 py-4"
          style={{ backgroundColor: `${platformMeta(ideaPlatforms(idea)[0]).color}14` }}
        >
          <div>
            <p className="eyebrow mb-1">{statusLabel}</p>
            <h2 className="text-lg font-semibold leading-snug">{idea.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <form
            onSubmit={(event) => {
              // Not a form `action`: React would reset every field after a failed save.
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              formData.set("ideaId", idea.id);
              if (formData.getAll("platforms").length === 0) {
                setError("Pick at least one platform.");
                return;
              }
              setError(null);
              startTransition(async () => {
                const result = await updateIdeaAction(formData);
                if (result.ok) onClose();
                else setError(result.error);
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Platforms</Label>
              <PlatformPicker defaultValue={ideaPlatforms(idea)} />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={idea.title} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="description">Details</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={idea.description ?? ""}
                rows={3}
                className="mt-1"
              />
            </div>
            <CaptionField defaultValue={idea.caption ?? ""} />
            <div>
              <Label htmlFor="scheduledFor">Post on</Label>
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="date"
                defaultValue={idea.scheduled_for ?? ""}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">Clear the date to take it off the calendar.</p>
            </div>
            <ReferenceLinksField initial={idea.reference_links ?? []} />
            {isAdmin ? (
              <AssigneePicker
                members={members}
                currentUserId={currentUserId}
                initial={(idea.assignees ?? []).map((assignee) => ({ id: assignee.user_id, label: assigneeLabel(assignee) }))}
              />
            ) : null}
            <div>
              <Label>Proposed by</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {idea.creator?.full_name || idea.creator?.email || "Unknown"}
              </p>
            </div>
            {idea.status === "posted" ? (
              <div>
                <Label htmlFor="postUrl">Final post URL</Label>
                <Input
                  id="postUrl"
                  name="postUrl"
                  type="url"
                  placeholder="https://…"
                  defaultValue={idea.post_url ?? ""}
                  className="mt-1"
                />
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <InlineConfirmButton
                label="Delete"
                question="Delete this idea for good?"
                confirmLabel="Yes, delete"
                pendingLabel="Deleting…"
                pending={pending}
                variant="destructive"
                onConfirm={() => {
                  const formData = new FormData();
                  formData.set("ideaId", idea.id);
                  startTransition(async () => {
                    await deleteIdeaAction(formData);
                    onClose();
                  });
                }}
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
