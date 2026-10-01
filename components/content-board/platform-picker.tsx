"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ContentPlatform } from "@/lib/db/types";
import { PLATFORM_META, PLATFORM_OPTIONS } from "@/components/content-board/types";

// Pick one or more platforms for an idea. Each chosen platform is posted as a hidden `platforms`
// field, so it works inside a plain <form> / FormData.
export function PlatformPicker({ defaultValue = [] }: { defaultValue?: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(platform: ContentPlatform) {
    setSelected((current) =>
      current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform],
    );
  }

  return (
    <div>
      <input type="hidden" name="platformsField" value="1" />
      {selected.map((platform) => (
        <input key={platform} type="hidden" name="platforms" value={platform} />
      ))}
      <div role="group" aria-label="Platforms" className="mt-1 flex flex-wrap gap-2">
        {PLATFORM_OPTIONS.map((platform) => {
          const meta = PLATFORM_META[platform];
          const Icon = meta.icon;
          const on = selected.includes(platform);
          return (
            <button
              key={platform}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(platform)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                on ? "border-transparent text-white" : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
              style={on ? { backgroundColor: meta.color } : undefined}
            >
              {on ? <Check className="h-3 w-3" /> : Icon ? <Icon className="h-3 w-3" /> : null}
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {selected.length === 0 ? "Pick at least one." : "You can pick more than one."}
      </p>
    </div>
  );
}
