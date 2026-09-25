"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createIdeaAction } from "@/app/tools/content-board/actions";
import { PLATFORM_META, PLATFORM_OPTIONS } from "@/components/content-board/types";

export function CreateIdeaDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New idea</Button>;
  }

  function close() {
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 popover-shadow">
        <h2 className="text-lg font-semibold">New idea</h2>
        <form
          action={(formData) => {
            startTransition(async () => {
              await createIdeaAction(formData);
              close();
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
