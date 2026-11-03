"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ListFilter, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeRange, type DateRange, type RangeKey } from "@/lib/utils/date-range";
import { cn } from "@/lib/utils/cn";

const OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "3months", label: "Last 3 months" },
  { key: "custom", label: "Custom dates" },
];

// Above a list of notifications or logs: the dustbin and, right next to it, the filter (all time, this
// month, last 3 months or custom dates). The tick boxes stay hidden until the dustbin is pressed; then
// "Select all", the count, "Delete N" (after a confirm) and Cancel show, and the list shows its boxes.
export function ListToolbar({
  range,
  shownCount,
  selectedCount,
  allSelected,
  onToggleAll,
  onDelete,
  deleting,
  selecting,
  onSelectingChange,
  leading,
}: {
  range: DateRange;
  shownCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
  deleting: boolean;
  selecting: boolean;
  onSelectingChange: (selecting: boolean) => void;
  // Shown on the left when not choosing what to delete, such as "Mark all read".
  leading?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [custom, setCustom] = useState({ from: range.from ?? "", to: range.to ?? "" });
  const boxRef = useRef<HTMLDivElement>(null);

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

  function choose(key: RangeKey) {
    if (key === "custom") return;
    setOpen(false);
    router.push(key === "all" ? pathname : `${pathname}?range=${key}`);
  }

  function applyCustom() {
    const params = new URLSearchParams({ range: "custom" });
    if (custom.from) params.set("from", custom.from);
    if (custom.to) params.set("to", custom.to);
    setOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-2">
      {selecting ? (
        <label className={cn("flex items-center gap-2 text-sm", shownCount === 0 && "pointer-events-none opacity-50")}>
          <input type="checkbox" checked={allSelected && shownCount > 0} onChange={onToggleAll} className="h-4 w-4 accent-primary" />
          Select all
          <span className="text-xs text-muted-foreground">({selectedCount} selected)</span>
        </label>
      ) : (
        <div>{leading}</div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {range.key !== "all" ? <span className="hidden text-xs text-muted-foreground sm:inline">{describeRange(range)}</span> : null}
        {!selecting ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Delete items"
            title={shownCount ? "Choose items to delete" : "Nothing to delete"}
            disabled={shownCount === 0}
            onClick={() => onSelectingChange(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : confirming ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs">Delete {selectedCount}? This can&apos;t be undone.</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                onDelete();
                setConfirming(false);
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Button type="button" size="sm" variant="destructive" className="gap-1.5" disabled={selectedCount === 0 || deleting} onClick={() => setConfirming(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : selectedCount ? `Delete ${selectedCount}` : "Tick items to delete"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => onSelectingChange(false)}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </span>
        )}
        <div ref={boxRef} className="relative">
          <Button
            type="button"
            size="icon"
            variant={range.key === "all" ? "outline" : "default"}
            aria-label={`Filter by date: ${describeRange(range)}`}
            aria-expanded={open}
            title="Filter by date"
            onClick={() => setOpen((value) => !value)}
          >
            <ListFilter className="h-4 w-4" />
          </Button>
          {open ? (
            <div className="popover-shadow absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-card p-1.5" role="menu">
              {OPTIONS.map((option) => {
                const on = range.key === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => choose(option.key)}
                    className={cn("flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-sm hover:bg-muted", on && "font-medium")}
                  >
                    {option.label}
                    {on ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                );
              })}
              <div className="mt-1 space-y-2 border-t border-border px-2.5 pb-1.5 pt-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted-foreground">
                    From
                    <Input type="date" value={custom.from} onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} className="mt-0.5 h-9 px-2 text-xs" />
                  </label>
                  <label className="text-[11px] text-muted-foreground">
                    To
                    <Input type="date" value={custom.to} onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} className="mt-0.5 h-9 px-2 text-xs" />
                  </label>
                </div>
                <Button type="button" size="sm" className="w-full" disabled={!custom.from && !custom.to} onClick={applyCustom}>
                  Show these dates
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
