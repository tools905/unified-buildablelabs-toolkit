"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createIdeaAction } from "@/app/tools/content-board/actions";
import { ReferenceLinksField } from "@/components/content-board/reference-links-field";
import { PLATFORM_META, PLATFORM_OPTIONS } from "@/components/content-board/types";

export function CreateIdeaDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New idea</Button>;
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-5 popover-shadow">
        <h2 className="text-lg font-semibold">New idea</h2>
        <form
          onSubmit={(event) => {
            // Not a form `action`: React would clear every field after a failed save.
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await createIdeaAction(formData);
              if (result.ok) close();
              else setError(result.error);
            });
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <Label htmlFor="platform">Platform</Label>
            <select
              id="platform"
              name="platform"
              required
              defaultValue=""
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Choose a platform
              </option>
              {PLATFORM_OPTIONS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_META[platform].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="title">What are we posting?</Label>
            <Input id="title" name="title" required minLength={2} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Details</Label>
            <Textarea id="description" name="description" className="mt-1" rows={3} />
          </div>
          <div>
            <Label htmlFor="scheduledFor">Post on (optional)</Label>
            <Input id="scheduledFor" name="scheduledFor" type="date" className="mt-1" />
          </div>
          <ReferenceLinksField />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create idea"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
