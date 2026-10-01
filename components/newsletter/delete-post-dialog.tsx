"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/dashboard/submit-button";
import { deletePostAction } from "@/app/tools/newsletter/actions";

// What has to be typed to delete a post: its headline, or a fixed phrase when it has none.
export function deleteConfirmationText(headline: string) {
  return headline.trim() || "Delete Draft";
}

// Asks for the post's headline to be typed before it is deleted for good, so a post is never
// removed by a stray click.
export function DeletePostDialog({
  postId,
  headline,
  published,
  onCancel,
  onDelete,
}: {
  postId: string;
  headline: string;
  published: boolean;
  onCancel: () => void;
  // Runs just before the post is deleted.
  onDelete?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const expected = deleteConfirmationText(headline);
  const confirmed = typed.trim() === expected;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-post-title"
    >
      <form
        action={deletePostAction}
        onSubmit={(event) => {
          if (!confirmed) {
            event.preventDefault();
            return;
          }
          onDelete?.();
        }}
        className="popover-shadow w-full max-w-md border border-border bg-card"
      >
        <input type="hidden" name="postId" value={postId} />
        <div className="border-b border-border px-6 py-4">
          <h2 id="delete-post-title" className="text-base font-semibold">
            {published ? "Delete this post?" : "Delete this draft?"}
          </h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          <p className="text-muted-foreground">
            This permanently deletes{" "}
            <span className="font-semibold text-foreground">{headline.trim() || "this untitled draft"}</span>, its
            version history and its images. It can&apos;t be undone.
          </p>
          {published ? (
            <p className="border-l-2 border-destructive pl-3 text-muted-foreground">
              It&apos;s published, so it will also disappear from the Times page on the website.
            </p>
          ) : null}
          <label className="block pt-1">
            <span className="mb-1.5 block text-muted-foreground">
              To confirm, type <span className="select-all font-semibold text-foreground">{expected}</span>
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full border border-border bg-transparent px-3 outline-none focus:border-destructive"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <SubmitButton variant="destructive" disabled={!confirmed}>
            {published ? "Delete post" : "Delete draft"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
