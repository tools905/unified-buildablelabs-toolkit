"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFormLinkAction } from "@/app/tools/talent-bank/actions";
import { cn } from "@/lib/utils/cn";

// The shared application link: copy it, open the form, switch it on or off, or replace it (the old
// one stops working).
export function FormLinkDialog({ link, applyBase, onClose }: { link: { token: string; active: boolean } | null; applyBase: string; onClose: () => void }) {
  const [current, setCurrent] = useState(link);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const url = current ? `${applyBase}${current.token}` : null;

  const change = (next: { active?: boolean; fresh?: boolean }) => {
    setError(null);
    startTransition(async () => {
      const result = await setFormLinkAction(next);
      if (!result.ok) return setError(result.error);
      setCurrent({ token: result.token, active: result.active });
      setConfirmNew(false);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Application link" className="popover-shadow w-full border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Talent Bank</p>
            <h2 className="mt-1 text-lg font-semibold">Application link</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share it anywhere. People fill in the form themselves and land on the New shelf; admins get an email.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!current ? (
          <Button type="button" className="mt-5 w-full" disabled={pending} onClick={() => change({ active: true })}>
            {pending ? "Making the link…" : "Make the link"}
          </Button>
        ) : (
          <>
            <div className={cn("mt-5 flex items-center gap-2 border p-2", current.active ? "border-primary/50 bg-primary/5" : "border-border opacity-60")}>
              <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">{url}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={async () => {
                  await navigator.clipboard.writeText(url!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button asChild size="sm" variant="ghost" className="gap-1.5">
                <a href={url!} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
              </Button>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border border-border px-3 py-2.5">
              <span>
                <span className="block text-sm">{current.active ? "Taking applications" : "Switched off"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {current.active ? "Anyone with the link can apply." : "The link shows that applications are closed."}
                </span>
              </span>
              <input type="checkbox" role="switch" checked={current.active} disabled={pending} onChange={(event) => change({ active: event.target.checked })} className="h-5 w-5 accent-primary" />
            </label>

            <div className="mt-4 flex items-center justify-between gap-2">
              {confirmNew ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  The current link will stop working.
                  <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => change({ fresh: true })}>
                    Make a new link
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>
                    Keep this one
                  </Button>
                </span>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setConfirmNew(true)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Replace the link
                </Button>
              )}
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
