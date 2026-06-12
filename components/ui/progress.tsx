import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Progress({
  className,
  value = 0,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value?: number | null }) {
  const percentage = Math.max(0, Math.min(100, Number(value ?? 0)));

  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      {...props}
    >
      <div
        className="h-full bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  );
}
