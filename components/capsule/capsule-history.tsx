"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/capsule/status-badge";
import { CAPSULE_PLATFORMS } from "@/lib/capsule/preview";
import type { CapsuleApi } from "@/lib/capsule/api";
import type { Capsule } from "@/lib/capsule/types";

// Every time this post was prepared for Medium and Substack, newest first: what happened to each
// version and the live links the writer pasted back. The app can't see inside the platforms, so
// statuses are what the writer reported.
export function CapsuleHistory({ api, draftId, onClose }: { api: CapsuleApi; draftId: string; onClose: () => void }) {
  const [capsules, setCapsules] = useState<Capsule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .history({ draftId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setCapsules(result.data.capsules);
        else setError(result.error);
      })
      .catch(() => !cancelled && setError("Could not load the cross-post history."));
    return () => {
      cancelled = true;
    };
  }, [api, draftId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cross-post history"
    >
      <div className="popover-shadow flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Cross-post history</h2>
            <p className="text-xs text-muted-foreground">
              Each time the post was prepared for Medium and Substack. Statuses are what you marked; the app can&apos;t see
              inside the platforms.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="px-6 py-8 text-sm text-destructive">{error}</p>
          ) : capsules === null ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>
          ) : capsules.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Not cross-posted yet. Use Cross-post to prepare a Medium and a Substack version.
            </p>
          ) : (
            <ul>
              {capsules.map((capsule, index) => (
                <li key={capsule.id} className="border-b border-border px-6 py-4 last:border-b-0">
                  <p className="text-sm font-medium">
                    Prepared {format(new Date(capsule.sealedAt), "d MMM yyyy, HH:mm")}
                    {index === 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">Latest</span> : null}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {CAPSULE_PLATFORMS.map(({ value, label }) => {
                      const atom = capsule.atoms[value];
                      return (
                        <li key={value} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="w-20 text-muted-foreground">{label}</span>
                          <StatusBadge status={atom.status} />
                          {atom.postedAt ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(atom.postedAt), { addSuffix: true })}
                            </span>
                          ) : null}
                          {atom.platformUrl ? (
                            <a
                              href={atom.platformUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Live post <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
