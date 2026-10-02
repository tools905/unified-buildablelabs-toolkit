"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatWhen } from "@/components/content-board/activity";
import { CopyButton } from "@/components/capsule/copy-button";
import { WarningsList } from "@/components/capsule/platform-preview";
import { StatusBadge } from "@/components/capsule/status-badge";
import { CANONICAL_HINT, parseLiveUrl } from "@/lib/capsule/live-url";
import type { Atom, CapsulePlatform } from "@/lib/capsule/types";
import { cn } from "@/lib/utils/cn";

// What happened when the writer chose a platform, so a blocked tab or failed copy is never silent.
export type Outcome = { kind: "done" | "blocked" | "copy-failed"; message: string };

const PLATFORM_LABEL: Record<CapsulePlatform, string> = { medium: "Medium", substack: "Substack" };

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{label}</h3>
        <CopyButton text={value} label={label.toLowerCase()} />
      </div>
      <p className={cn("break-words rounded-sm border border-border bg-background px-2.5 py-2 text-sm", !value && "text-muted-foreground")}>
        {value || "Nothing set"}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// Everything the writer still needs while the platform's editor is open in the other tab.
export function SidePanel({
  platform,
  atom,
  canonicalUrl,
  outcome,
  onClose,
  onCopyAgain,
  onOpenEditor,
  onMarkPosted,
}: {
  platform: CapsulePlatform;
  atom: Atom;
  canonicalUrl: string;
  outcome: Outcome | null;
  onClose: () => void;
  onCopyAgain: () => void;
  onOpenEditor: () => void;
  // Returns an error message to show, or null when it worked.
  onMarkPosted: (liveUrl: string | null) => Promise<string | null>;
}) {
  const label = PLATFORM_LABEL[platform];
  const [liveUrl, setLiveUrl] = useState(atom.platformUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const posted = atom.status === "posted";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function markPosted() {
    const parsed = parseLiveUrl(liveUrl);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    const failure = await onMarkPosted(parsed.url);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <aside
      aria-label={`Posting to ${label}`}
      className="panel-slide-in popover-shadow fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-border bg-background sm:w-[420px]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Posting to {label}</p>
          <div className="flex items-center gap-2">
            <StatusBadge status={atom.status} />
            {posted && atom.postedAt ? <span className="text-xs text-muted-foreground">{formatWhen(atom.postedAt)}</span> : null}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {outcome && !posted ? (
          <div
            role={outcome.kind === "done" ? "status" : "alert"}
            className={cn(
              "rounded-md border p-3 text-sm",
              outcome.kind === "done"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500",
            )}
          >
            {outcome.message}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCopyAgain}>
            Copy the post again
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpenEditor}>
            Open {label}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Paste the post into {label}, then use the pieces below. Copy it again if something else replaced your clipboard.
        </p>

        <Field
          label="Title"
          value={atom.title}
          hint={platform === "substack" ? "Substack has its own title field, so it is not in the pasted text." : "Medium also reads this from the top of the pasted text."}
        />
        {atom.subtitle ? (
          <Field label="Subtitle" value={atom.subtitle} hint={platform === "substack" ? "Goes in Substack's subtitle field." : undefined} />
        ) : null}

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Tags</h3>
            <CopyButton text={atom.tags.join(", ")} label="tags" />
          </div>
          {atom.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {atom.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tags set.</p>
          )}
        </div>

        <Field
          label="Original link"
          value={canonicalUrl}
          hint={canonicalUrl ? CANONICAL_HINT[platform] : "Add the original link in the editor, under “For Medium & Substack”."}
        />

        <div>
          <h3 className="mb-2 text-xs font-semibold">Things to check</h3>
          <WarningsList warnings={atom.warnings} />
        </div>
      </div>

      <div className="space-y-3 border-t border-border px-5 py-4">
        {posted ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-emerald-500">Marked as posted on {label}.</p>
            {atom.platformUrl ? (
              <a
                href={atom.platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View the live post <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="live-post-url" className="mb-1 block text-xs font-semibold">
                Link to the live post <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="live-post-url"
                value={liveUrl}
                onChange={(event) => {
                  setLiveUrl(event.target.value);
                  setError(null);
                }}
                placeholder="https://…"
                inputMode="url"
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <Button type="button" onClick={() => void markPosted()} disabled={saving} className="w-full">
              {saving ? "Saving…" : `I published it on ${label}`}
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
