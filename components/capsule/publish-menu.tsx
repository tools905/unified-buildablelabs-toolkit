"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatWhen } from "@/components/content-board/activity";
import { SidePanel, type Outcome } from "@/components/capsule/side-panel";
import { StatusBadge } from "@/components/capsule/status-badge";
import { useCapsule } from "@/components/capsule/use-capsule";
import {
  copyAndOpen,
  copyAtom,
  DEFAULT_OPEN_STRATEGY,
  editorUrl,
  openEditor,
} from "@/components/capsule/decapsulate";
import type { CapsuleApi } from "@/lib/capsule/api";
import { CAPSULE_PLATFORMS } from "@/lib/capsule/preview";
import type { CapsulePlatform, Draft } from "@/lib/capsule/types";
import { cn } from "@/lib/utils/cn";

const SUBSTACK_KEY = "capsule-substack-publication";

export function PublishMenu({
  api,
  draft,
  beforeSeal,
}: {
  api: CapsuleApi;
  draft: Draft;
  beforeSeal?: () => Promise<void>;
}) {
  const { capsule, stale, state, prepare, markOpened, markPosted } = useCapsule({ api, draft, beforeSeal });
  const [open, setOpen] = useState(false);
  const [publication, setPublication] = useState("");
  // The side panel shows after a platform's editor was opened, for as long as the writer wants it.
  const [panel, setPanel] = useState<{ platform: CapsulePlatform; outcome: Outcome | null } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    try {
      setPublication(window.localStorage.getItem(SUBSTACK_KEY) ?? "");
    } catch {
      /* private mode: ask again next time */
    }
    void prepare();
  }

  function savePublication(value: string) {
    setPublication(value);
    try {
      window.localStorage.setItem(SUBSTACK_KEY, value);
    } catch {
      /* ignore */
    }
  }

  // Runs straight from the click: the browser only allows copying and opening a tab right after one.
  function choose(platform: CapsulePlatform) {
    if (!capsule) return;
    const atom = capsule.atoms[platform];
    void copyAndOpen(DEFAULT_OPEN_STRATEGY, { html: atom.html }, editorUrl(platform, publication)).then((result) => {
      if (result.copied) void markOpened(platform);
      setPanel({
        platform,
        outcome: !result.copied
          ? { kind: "copy-failed", message: `${result.error ?? "The browser would not copy the post."} Press “Copy the post again”.` }
          : result.opened
            ? { kind: "done", message: "Copied. Paste it into the new tab." }
            : { kind: "blocked", message: "Copied, but your browser blocked the new tab. Press “Open” below." },
      });
      setOpen(false);
    });
  }

  function copyAgain(platform: CapsulePlatform) {
    if (!capsule) return;
    void copyAtom({ html: capsule.atoms[platform].html }).then(
      () => setPanel({ platform, outcome: { kind: "done", message: "Copied again. Paste it into the editor." } }),
      (failure: unknown) =>
        setPanel({
          platform,
          outcome: { kind: "copy-failed", message: failure instanceof Error ? failure.message : "The browser would not copy the post." },
        }),
    );
  }

  const preparing = state.phase === "preparing" || state.phase === "idle";
  const panelAtom = panel && capsule ? capsule.atoms[panel.platform] : null;

  return (
    <div ref={root} className="relative">
      <Button type="button" variant="outline" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        Cross-post
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Publish on Medium or Substack"
          className="popover-shadow absolute right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-4 text-sm"
        >
          {preparing ? (
            <p className="flex items-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Getting your post ready…
            </p>
          ) : state.phase === "error" ? (
            <div className="space-y-3">
              <p role="alert" className="text-destructive">
                {state.message}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void prepare()}>
                Try again
              </Button>
            </div>
          ) : capsule ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Prepared {formatWhen(capsule.sealedAt)}. Pick where to post it: the text is copied and the editor opens in a new tab.
              </p>

              {stale ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">You edited the post after this was prepared. Prepare it again to copy the latest text.</span>
                  <button
                    type="button"
                    onClick={() => void prepare({ forceNew: true })}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Prepare again
                  </button>
                </div>
              ) : null}

              <ul className="space-y-2">
                {CAPSULE_PLATFORMS.map(({ value, label }) => {
                  const atom = capsule.atoms[value];
                  const needsPublication = value === "substack" && publication.trim() === "";
                  return (
                    <li key={value} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => choose(value)}
                          disabled={needsPublication || stale}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-inherit"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          <span className="truncate">Publish on {label}</span>
                        </button>
                        <StatusBadge status={atom.status} />
                      </div>

                      {value === "substack" ? (
                        <div className="mt-2">
                          <label htmlFor="menu-substack-publication" className="text-xs text-muted-foreground">
                            Your Substack name (the part before .substack.com)
                          </label>
                          <Input
                            id="menu-substack-publication"
                            value={publication}
                            onChange={(event) => savePublication(event.target.value)}
                            placeholder="e.g. buildablelabs"
                            className="mt-1 h-9"
                          />
                        </div>
                      ) : null}

                      {atom.warnings.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {atom.warnings.map((warning) => (
                            <li key={warning.code} className="flex items-start gap-1.5 text-xs text-amber-500">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {warning.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {atom.status !== "sealed" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPanel({ platform: value, outcome: null });
                            setOpen(false);
                          }}
                          className="mt-2 text-xs font-medium text-primary hover:underline"
                        >
                          {atom.status === "posted" ? "Show details" : "Show the steps again"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {panel && capsule && panelAtom ? (
        <SidePanel
          key={`${capsule.id}-${panel.platform}`}
          platform={panel.platform}
          atom={panelAtom}
          canonicalUrl={capsule.canonicalUrl}
          outcome={panel.outcome}
          onClose={() => setPanel(null)}
          onCopyAgain={() => copyAgain(panel.platform)}
          onOpenEditor={() => {
            const opened = openEditor(editorUrl(panel.platform, publication));
            if (!opened) {
              setPanel({
                platform: panel.platform,
                outcome: { kind: "blocked", message: "Your browser blocked the new tab. Allow pop-ups for this site, then press Open again." },
              });
            }
          }}
          onMarkPosted={(liveUrl) => markPosted(panel.platform, liveUrl ?? undefined)}
        />
      ) : null}
    </div>
  );
}
