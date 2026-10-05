"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BASE_PATH } from "@/lib/utils/app-url";

// Needs a button press on purpose: a link scanner opening the page must not unsubscribe anyone.
export function UnsubscribeForm({ subscriberId, signature }: { subscriberId: string; signature: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "invalid" | "error">(
    subscriberId && signature ? "idle" : "invalid",
  );

  async function unsubscribe() {
    setState("working");
    try {
      const query = new URLSearchParams({ s: subscriberId, t: signature });
      const response = await fetch(`${BASE_PATH}/api/newsletter/unsubscribe?${query}`, { method: "POST" });
      setState(response.ok ? "done" : response.status === 400 ? "invalid" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div role="status">
        <h1 className="font-serif text-3xl text-foreground">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-sm text-muted-foreground">You won&apos;t receive the Buildable Labs newsletter any more.</p>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div role="status">
        <h1 className="font-serif text-3xl text-foreground">This link isn&apos;t valid</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the unsubscribe link at the bottom of any newsletter email, or your mail app&apos;s own unsubscribe button.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl text-foreground">Unsubscribe?</h1>
      <p className="mt-3 mb-6 text-sm text-muted-foreground">
        You&apos;ll stop receiving the Buildable Labs newsletter. You can subscribe again at any time.
      </p>
      <Button onClick={unsubscribe} disabled={state === "working"}>
        {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
      <p aria-live="polite" className="mt-3 text-sm text-destructive">
        {state === "error" ? "Something went wrong. Please try again." : ""}
      </p>
    </div>
  );
}
