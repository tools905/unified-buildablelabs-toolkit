"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

export function AnalysisWindowPicker({ defaultValue }: { defaultValue: number }) {
  const [custom, setCustom] = useState(!PRESETS.some((preset) => preset.days === defaultValue));
  const [days, setDays] = useState(String(defaultValue));

  return (
    <div className="space-y-3">
      <Label>Rolling analysis duration</Label>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active = !custom && Number(days) === preset.days;
          return (
            <button
              key={preset.days}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom(false);
                setDays(String(preset.days));
              }}
              className={optionClass(active)}
            >
              {preset.label}
            </button>
          );
        })}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={optionClass(custom)}>
          Custom
        </button>
      </div>

      {custom ? (
        <div className="flex items-center gap-2">
          <Input
            name="analysisWindowDays"
            type="number"
            min={7}
            max={365}
            step={1}
            required
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="w-28"
            aria-label="Number of days"
          />
          <span className="text-sm text-muted-foreground">days (7 to 365)</span>
        </div>
      ) : (
        <input type="hidden" name="analysisWindowDays" value={days} />
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        The dashboard looks at posts from the last {days || "…"} days. Older posts stay stored but no longer show.
      </p>
    </div>
  );
}

function optionClass(active: boolean) {
  return cn(
    "h-10 border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "border-primary bg-primary/15 text-foreground"
      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}
