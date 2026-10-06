"use client";

import { useState, useTransition } from "react";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { disconnectAppAction } from "@/app/connected-apps/actions";

export function DisconnectButton({ clientId, name }: { clientId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <InlineConfirmButton
        label="Disconnect"
        question={`Disconnect ${name}?`}
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        pending={pending}
        variant="outline"
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const result = await disconnectAppAction(clientId);
            if (result.error) setError(result.error);
          });
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
