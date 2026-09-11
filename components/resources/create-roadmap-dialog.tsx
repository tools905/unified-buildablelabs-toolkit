"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoadmapAction } from "@/app/tools/resources/actions";

export function CreateRoadmapDialog({ label = "Add topic" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="popover-shadow w-full max-w-lg rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Add topic</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a learning roadmap that members can start a Q&amp;A session on. Add resources to it afterward from
          the Resources tab so the AI has content to quiz on.
        </p>
        <form
          action={(formData) => {
            startTransition(async () => {
              await createRoadmapAction(formData);
              setOpen(false);
            });
          }}
          className="mt-4 space-y-3"
        >
          <div>
            <Label htmlFor="new-roadmap-name">Topic name</Label>
            <Input id="new-roadmap-name" name="name" required minLength={2} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="new-roadmap-description">Description</Label>
            <Textarea id="new-roadmap-description" name="description" rows={2} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add topic"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
