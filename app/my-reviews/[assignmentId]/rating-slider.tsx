"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

export function RatingSlider({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
}) {
  const [isNA, setIsNA] = useState(defaultValue === undefined || defaultValue === null);
  const [value, setValue] = useState(defaultValue ?? 3);

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label htmlFor={name}>{label}</Label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isNA}
              onChange={(e) => setIsNA(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <span>N/A</span>
          </label>
        </div>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 text-sm font-medium">
          {isNA ? "N/A" : value}
        </span>
      </div>

      {/* Hidden input to submit the actual value to the form */}
      <input
        type="hidden"
        name={name}
        value={isNA ? "" : value}
      />

      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(event) => {
          setValue(Number(event.target.value));
          setIsNA(false);
        }}
        className={`h-2 w-full cursor-pointer accent-primary transition-opacity ${isNA ? "opacity-30" : ""}`}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1</span>
        <span>3</span>
        <span>5</span>
      </div>
    </div>
  );
}
