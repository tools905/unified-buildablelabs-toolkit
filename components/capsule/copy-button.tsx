"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/components/capsule/decapsulate";
import { cn } from "@/lib/utils/cn";

// A small "Copy" button for one value. Says "Copied" for a moment, or "Couldn't copy" so a refusal
// is never silent.
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!text}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-sm border border-border px-2 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40",
        state === "copied" && "border-emerald-500/50 text-emerald-500",
        state === "failed" && "border-amber-500/50 text-amber-500",
        className,
      )}
    >
      {state === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}
    </button>
  );
}
