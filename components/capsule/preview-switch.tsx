"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PreviewTarget = "website" | "medium" | "substack";

const TARGETS: { value: PreviewTarget; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "medium", label: "Medium" },
  { value: "substack", label: "Substack" },
];

// "Preview as": switches the preview between how the post looks on our website, on Medium and on Substack.
export function PreviewSwitch({
  value,
  onChange,
  warningCounts,
}: {
  value: PreviewTarget;
  onChange: (target: PreviewTarget) => void;
  warningCounts: Partial<Record<PreviewTarget, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-muted px-6 py-3 sm:px-8">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Preview as</span>
      <div className="flex border border-border" role="radiogroup" aria-label="Preview as">
        {TARGETS.map((target) => {
          const count = warningCounts[target.value] ?? 0;
          return (
            <button
              key={target.value}
              type="button"
              role="radio"
              aria-checked={value === target.value}
              onClick={() => onChange(target.value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium transition-colors",
                value === target.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {target.label}
              {count > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5 text-amber-500"
                  title={`${count} thing${count === 1 ? "" : "s"} to check`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
