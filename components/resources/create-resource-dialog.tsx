"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createResourceAction } from "@/app/tools/resources/actions";
import { RESOURCE_CATEGORIES } from "@/lib/validation/resource-schema";

export function CreateResourceDialog({ roadmaps }: { roadmaps: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add resource
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="popover-shadow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Add resource</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share a guide, tool, or reference with the rest of the workspace.
        </p>
        <form
          action={(formData) => {
            startTransition(async () => {
              await createResourceAction(formData);
              setOpen(false);
            });
          }}
          className="mt-4 space-y-3"
        >
          <div>
            <Label htmlFor="new-resource-title">Title</Label>
            <Input id="new-resource-title" name="title" required minLength={2} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="new-resource-url">URL</Label>
            <Input id="new-resource-url" name="url" type="url" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="new-resource-description">Description</Label>
            <Textarea id="new-resource-description" name="description" rows={2} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-resource-category">Category</Label>
              <select
                id="new-resource-category"
                name="category"
                defaultValue="reference"
                className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm capitalize"
              >
                {RESOURCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="new-resource-tags">Tags (comma-separated)</Label>
              <Input id="new-resource-tags" name="tags" className="mt-1" />
            </div>
          </div>
          {roadmaps.length > 0 ? (
            <div>
              <Label>Roadmaps</Label>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {roadmaps.map((roadmap) => (
                  <label key={roadmap.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="roadmapIds" value={roadmap.id} />
                    {roadmap.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add resource"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
