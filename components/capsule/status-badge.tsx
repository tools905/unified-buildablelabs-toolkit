"use client";

import { Check } from "lucide-react";
import type { AtomStatus } from "@/lib/capsule/types";
import { cn } from "@/lib/utils/cn";

const STATUS_LABEL: Record<AtomStatus, string> = { sealed: "Ready", opened: "Opened", posted: "Posted" };
const STATUS_STYLE: Record<AtomStatus, string> = {
  sealed: "bg-muted text-muted-foreground",
  opened: "bg-primary/15 text-primary",
  posted: "bg-emerald-500/15 text-emerald-500",
};

export function StatusBadge({ status }: { status: AtomStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status])}>
      {status === "posted" ? <Check className="h-3 w-3" /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}
