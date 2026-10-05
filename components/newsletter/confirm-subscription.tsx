"use client";

import { useEffect, useRef, useState } from "react";
import { ResendConfirmationForm } from "@/components/newsletter/resend-confirmation-form";
import { BASE_PATH } from "@/lib/utils/app-url";

type State = "confirming" | "confirmed" | "expired" | "invalid" | "error";

// Confirms from the reader's browser rather than when the page is requested, so email security
// scanners that open the link ahead of the reader do not confirm anyone.
export function ConfirmSubscription({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? "confirming" : "invalid");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    fetch(`${BASE_PATH}/api/newsletter/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const status = body?.status;
        setState(status === "confirmed" || status === "expired" || status === "invalid" ? status : "error");
      })
      .catch(() => setState("error"));
  }, [token]);

  return (
    <div aria-live="polite">
      {state === "confirming" && <p className="text-sm text-muted-foreground">Confirming your subscription…</p>}

      {state === "confirmed" && (
        <>
          <h1 className="font-serif text-3xl text-foreground">You&apos;re in</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your subscription is confirmed. A welcome email is on its way, and the newsletter will arrive twice a week.
          </p>
        </>
      )}

      {(state === "expired" || state === "invalid") && (
        <>
          <h1 className="font-serif text-3xl text-foreground">
            {state === "expired" ? "This link has expired" : "This link is no longer valid"}
          </h1>
          <p className="mt-3 mb-5 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a new confirmation link.
          </p>
          <ResendConfirmationForm />
        </>
      )}

      {state === "error" && (
        <>
          <h1 className="font-serif text-3xl text-foreground">Something went wrong</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We couldn&apos;t confirm your subscription just now. Reload this page to try again.
          </p>
        </>
      )}
    </div>
  );
}
