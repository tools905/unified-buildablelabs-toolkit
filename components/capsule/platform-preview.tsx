"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PreviewAtom } from "@/lib/capsule/preview";

// What the writer should check before pasting. Lives next to the preview so nothing is a surprise.
export function WarningsList({ warnings }: { warnings: PreviewAtom["warnings"] }) {
  if (warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-500" role="status">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Nothing to check. This post converts cleanly.
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Things to check">
      {warnings.map((warning) => (
        <li key={warning.code} className="flex items-start gap-2 text-sm text-amber-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

// A look-alike of how the post will appear on Medium or Substack, built from the same atom that gets
// sealed. It is an approximation of their styling, not a copy: the point is structure and warnings.
export function PlatformPreview({ atom }: { atom: PreviewAtom }) {
  const isMedium = atom.platform === "medium";
  return (
    <div className="flex flex-1 justify-center overflow-y-auto py-9">
      <div className="w-full max-w-[760px] space-y-6 px-4 sm:px-0">
        <div
          className={isMedium ? "medium-preview" : "substack-preview"}
          style={{ boxShadow: "0 24px 70px rgba(0,0,0,.4)", padding: "48px 56px", background: "#fff" }}
        >
          {isMedium ? (
            // Medium reads the title from the top of what is pasted, so it is part of the html.
            <div className="medium-preview-body" dangerouslySetInnerHTML={{ __html: atom.html || "<p>Nothing written yet.</p>" }} />
          ) : (
            <>
              <h1 className="substack-preview-title">{atom.title || "Headline"}</h1>
              {atom.subtitle ? <p className="substack-preview-subtitle">{atom.subtitle}</p> : null}
              <div className="substack-preview-body" dangerouslySetInnerHTML={{ __html: atom.html || "<p>Nothing written yet.</p>" }} />
            </>
          )}
          {atom.tags.length > 0 ? (
            <div className="mt-10 flex flex-wrap gap-2">
              {atom.tags.map((tag) => (
                <span key={tag} className="rounded-full px-3 py-1 text-xs" style={{ background: "#F2F2F2", color: "#242424" }}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Things to check for {isMedium ? "Medium" : "Substack"}
          </h2>
          <WarningsList warnings={atom.warnings} />
        </div>
      </div>
    </div>
  );
}
