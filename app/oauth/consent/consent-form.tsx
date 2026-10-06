"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { decideConsentAction, type ConsentState } from "@/app/oauth/consent/actions";

function Buttons({ canApprove }: { canApprove: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="submit" name="decision" value="deny" variant="outline" disabled={pending}>
        Cancel
      </Button>
      {canApprove ? (
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          {pending ? "Connecting…" : "Allow"}
        </Button>
      ) : null}
    </div>
  );
}

export function ConsentForm({ authorizationId, canApprove }: { authorizationId: string; canApprove: boolean }) {
  const [state, action] = useActionState<ConsentState, FormData>(decideConsentAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {state.error ? (
        <Alert className="border-destructive/40">
          <AlertDescription className="text-destructive">{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Buttons canApprove={canApprove} />
    </form>
  );
}
