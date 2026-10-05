"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BASE_PATH } from "@/lib/utils/app-url";

// Shown when a confirmation link has expired or been replaced: the reader asks for a new one.
export function ResendConfirmationForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch(`${BASE_PATH}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setState("sent");
        return;
      }
      const body = await response.json().catch(() => null);
      setMessage(body?.error ?? "Something went wrong. Please try again.");
      setState("error");
    } catch {
      setMessage("Something went wrong. Please try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-foreground">
        Check your inbox: we sent a new confirmation link to <strong>{email}</strong>.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="resend-email" className="block text-sm font-medium text-foreground">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="resend-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" disabled={state === "sending"} className="shrink-0">
          {state === "sending" ? "Sending…" : "Send a new link"}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-destructive">
        {state === "error" ? message : ""}
      </p>
    </form>
  );
}
