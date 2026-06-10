"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TextField({
  name,
  label,
  defaultValue,
  optional,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  optional?: boolean;
}) {
  // If defaultValue is explicitly null, it means it was previously saved as N/A.
  const [isNA, setIsNA] = useState(defaultValue === null);
  const [text, setText] = useState(defaultValue ?? "");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
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

      {/* Hidden input to submit the actual value to the form */}
      <input
        type="hidden"
        name={name}
        value={isNA ? "" : text}
      />

      <Textarea
        id={name}
        disabled={isNA}
        required={!isNA && !optional}
        minLength={isNA || optional ? undefined : 10}
        value={isNA ? "N/A" : text}
        onChange={(e) => {
          setText(e.target.value);
          setIsNA(false);
        }}
        className={`transition-opacity ${isNA ? "opacity-30 bg-muted cursor-not-allowed" : ""}`}
      />
    </div>
  );
}
