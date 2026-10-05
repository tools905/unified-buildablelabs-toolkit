"use client";

import { SubmitButton } from "@/components/dashboard/submit-button";
import { cancelIssueSendAction } from "@/app/tools/newsletter/actions";

// Cancels a scheduled issue before it starts; the post can then be scheduled again.
export function CancelSendButton({ sendId, title }: { sendId: string; title: string }) {
  return (
    <form
      action={cancelIssueSendAction}
      onSubmit={(event) => {
        if (!window.confirm(`Cancel the scheduled email for "${title}"?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="sendId" value={sendId} />
      <SubmitButton variant="ghost" size="sm">
        Cancel
      </SubmitButton>
    </form>
  );
}
