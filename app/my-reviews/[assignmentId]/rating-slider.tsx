"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

export function RatingSlider({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  required?: boolean;
}) {
  const initialValue = defaultValue ?? 3;
  const [value, setValue] = useState(initialValue);

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 text-sm font-medium">
          {value}
        </span>
      </div>
      <input
        id={name}
        name={name}
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        required={required}
        onChange={(event) => setValue(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1</span>
        <span>3</span>
        <span>5</span>
      </div>
    </div>
  );
}
