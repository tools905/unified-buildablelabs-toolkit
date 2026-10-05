"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CAPTION_LENGTH } from "@/lib/utils/content-board";
import { cn } from "@/lib/utils/cn";

// The post text, as it would be written under the images. Shown in the Instagram and LinkedIn previews.
export function CaptionField({ defaultValue = "" }: { defaultValue?: string }) {
  const [length, setLength] = useState(defaultValue.length);
  const over = length > MAX_CAPTION_LENGTH;

  return (
    <div>
      <Label htmlFor="caption">Caption (the post text)</Label>
      <Textarea
        id="caption"
        name="caption"
        defaultValue={defaultValue}
        rows={5}
        onChange={(event) => setLength(event.target.value.length)}
        placeholder="What goes under the images when this is posted. Shown in the Instagram and LinkedIn preview."
        aria-invalid={over || undefined}
        className="mt-1"
      />
      <p className={cn("mt-1 text-xs", over ? "text-destructive" : "text-muted-foreground")}>
        {length.toLocaleString()} / {MAX_CAPTION_LENGTH.toLocaleString()} characters. Instagram allows 2,200.
      </p>
    </div>
  );
}
