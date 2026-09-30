"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

// A destructive button that asks "are you sure?" right next to itself instead of
// using the browser's confirm() popup, which some browsers block or auto-dismiss.
export function InlineConfirmButton({
  label,
  question,
  confirmLabel,
  pendingLabel,
  pending = false,
  onConfirm,
  variant = "ghost",
  size = "sm",
}: {
  label: string;
  question: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [asking, setAsking] = useState(false);

  if (pending) {
    return (
      <Button type="button" variant={variant} size={size} disabled>
        {pendingLabel}
      </Button>
    );
  }

  if (!asking) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={question}>
      <span className="whitespace-nowrap text-xs text-muted-foreground">{question}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="whitespace-nowrap"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}
