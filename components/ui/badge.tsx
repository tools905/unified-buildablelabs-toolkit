import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
