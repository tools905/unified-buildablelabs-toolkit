"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteIdeaAction, updateIdeaAction } from "@/app/tools/content-board/actions";
import {
  CONTENT_COLUMNS,
  PLATFORM_META,
  PLATFORM_OPTIONS,
  type ContentIdeaWithRelations,
} from "@/components/content-board/types";

export function IdeaDetail({
  idea,
  onClose,
}: {
  idea: ContentIdeaWithRelations;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const statusLabel = CONTENT_COLUMNS.find((c) => c.status === idea.status)?.label ?? idea.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="popover-shadow flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div
          className="flex items-start justify-between gap-3 border-b border-border px-6 py-4"
          style={{ backgroundColor: `${PLATFORM_META[idea.platform].color}14` }}
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
            action={(formData) => {
              formData.set("ideaId", idea.id);
              startTransition(() => updateIdeaAction(formData));
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="platform">Platform</Label>
                <select
                  id="platform"
                  name="platform"
                  defaultValue={idea.platform}
                  className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm"
                >
                  {PLATFORM_OPTIONS.map((platform) => (
                    <option key={platform} value={platform}>
                      {PLATFORM_META[platform].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={idea.status}
                  className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm"
                >
                  {CONTENT_COLUMNS.map((column) => (
                    <option key={column.status} value={column.status}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
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
            <div>
              <Label>Proposed by</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {idea.creator?.full_name || idea.creator?.email || "Unknown"}
              </p>
            </div>
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
            <div className="flex items-center justify-between border-t border-border pt-4">
              <ConfirmButton
                type="button"
                variant="destructive"
                size="sm"
                message="Delete this idea? This cannot be undone."
                onClick={() => {
                  const formData = new FormData();
                  formData.set("ideaId", idea.id);
                  startTransition(async () => {
                    await deleteIdeaAction(formData);
                    onClose();
                  });
                }}
              >
                Delete
              </ConfirmButton>
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
