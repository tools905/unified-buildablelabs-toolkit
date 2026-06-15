"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

export function AnalysisWindowSlider({ defaultValue }: { defaultValue: number }) {
  const [days, setDays] = useState(defaultValue);
  return <div className="space-y-2 sm:col-span-2">
    <div className="flex items-center justify-between gap-4"><Label htmlFor="analysisWindowDays">Rolling analysis duration</Label><span className="text-sm font-medium">{days} days</span></div>
    <input id="analysisWindowDays" name="analysisWindowDays" type="range" min="7" max="365" step="1" value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-full" />
    <div className="flex justify-between text-xs text-muted-foreground"><span>7 days</span><span>365 days</span></div>
  </div>;
}
