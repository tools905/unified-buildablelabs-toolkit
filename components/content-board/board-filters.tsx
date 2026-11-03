"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_META, PLATFORM_OPTIONS, type ContentMemberOption } from "@/components/content-board/types";
import { cn } from "@/lib/utils/cn";

export type BoardFilterValues = { platform: string; person: string; showDiscarded: boolean };
export const NO_FILTERS: BoardFilterValues = { platform: "", person: "", showDiscarded: false };

// The board's Filter button and its panel: platform and person ("All", or one of them), and whether
// the Discarded column shows. A badge on the button counts what's switched on. A dropdown on desktop,
// a sheet from the bottom on phones.
export function BoardFilters({
  values,
  members,
  onChange,
}: {
  values: BoardFilterValues;
  members: ContentMemberOption[];
  onChange: (next: BoardFilterValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const active = Number(Boolean(values.platform)) + Number(Boolean(values.person)) + Number(values.showDiscarded);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pill = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
    );

  return (
    <div ref={boxRef} className="relative">
      <Button type="button" variant={active ? "default" : "outline"} onClick={() => setOpen((value) => !value)} aria-expanded={open} className="gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Filter
        {active ? <span className="rounded-full bg-white/25 px-1.5 text-[11px] tabular-nums">{active}</span> : null}
      </Button>
      {open ? (
        <>
          {/* Phones: dim the board behind the sheet. */}
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Filter the board"
            className="popover-shadow fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-lg border border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80 sm:rounded-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filter</h2>
              <div className="flex items-center gap-1">
                {active ? (
                  <button type="button" onClick={() => onChange(NO_FILTERS)} className="rounded-sm px-2 py-1 text-xs text-primary hover:bg-muted">
                    Clear all
                  </button>
                ) : null}
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-sm hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Platform</legend>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={pill(!values.platform)} onClick={() => onChange({ ...values, platform: "" })}>
                  All
                </button>
                {PLATFORM_OPTIONS.map((platform) => (
                  <button key={platform} type="button" className={pill(values.platform === platform)} onClick={() => onChange({ ...values, platform })}>
                    {PLATFORM_META[platform].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Person (added it or assigned to it)</span>
              <select
                value={values.person}
                onChange={(event) => onChange({ ...values, person: event.target.value })}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
              <span>
                <span className="block text-sm">Show discarded ideas</span>
                <span className="block text-[11px] text-muted-foreground">Adds the Discarded column between Ideas and Feedback.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={values.showDiscarded}
                onChange={(event) => onChange({ ...values, showDiscarded: event.target.checked })}
                className="h-5 w-5 shrink-0 accent-primary"
              />
            </label>

            <Button type="button" className="mt-4 w-full sm:hidden" onClick={() => setOpen(false)}>
              Show results
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
