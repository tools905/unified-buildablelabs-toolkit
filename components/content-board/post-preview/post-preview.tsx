"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2, Moon, Pencil, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstagramFrame, LinkedInFrame } from "@/components/content-board/post-preview/feed-frames";
import { ProfileGridPreview } from "@/components/content-board/post-preview/profile-grid";
import { MAX_PREVIEW_PAGES, usePostSlides } from "@/components/content-board/post-preview/use-post-slides";
import type { PanelAttachment } from "@/components/content-board/types";
import { cn } from "@/lib/utils/cn";
import { checkPost, coverGetsCropped, PREVIEW_PLATFORMS, type PreviewPlatform } from "@/lib/utils/social-preview";

// How the idea would look in the Instagram or LinkedIn feed, built from its uploaded files and caption.
export function PostPreview({
  attachments,
  caption,
  ideaPlatforms,
  title,
  onEditCaption,
}: {
  attachments: PanelAttachment[];
  caption: string | null;
  ideaPlatforms: string[];
  // The idea's title, shown as the document title under a LinkedIn carousel made of images.
  title?: string;
  onEditCaption?: () => void;
}) {
  // Open on the idea's own platform when it has one of these two.
  const [platform, setPlatform] = useState<PreviewPlatform>(
    () => (ideaPlatforms.find((value): value is PreviewPlatform => value === "instagram" || value === "linkedin") ?? "instagram"),
  );
  const [dark, setDark] = useState(false);
  const { slides, loading, skippedLinks, failed, cutPages } = usePostSlides(attachments);

  const warnings = useMemo(
    () => checkPost({ platform, slides, caption, skippedLinks }),
    [platform, slides, caption, skippedLinks],
  );
  const text = caption ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex border border-border" role="radiogroup" aria-label="Preview platform">
          {PREVIEW_PLATFORMS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={platform === option.value}
              onClick={() => setPlatform(option.value)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium transition-colors",
                platform === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDark((value) => !value)}
          aria-pressed={dark}
          className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {dark ? "Dark feed" : "Light feed"}
        </button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 sm:p-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building the preview…
          </p>
        ) : platform === "instagram" ? (
          <InstagramFrame slides={slides} caption={text} dark={dark} />
        ) : (
          <LinkedInFrame slides={slides} caption={text} dark={dark} title={title} />
        )}
      </div>

      {platform === "instagram" && !loading && coverGetsCropped(slides) ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">On your profile (the cover is cropped here)</h4>
          <div className="rounded-md border border-border bg-muted/30 p-3 sm:p-4">
            <ProfileGridPreview cover={slides[0]} multiple={slides.length > 1} dark={dark} />
          </div>
        </div>
      ) : null}

      {failed > 0 ? (
        <p role="alert" className="text-xs text-destructive">
          {failed === 1 ? "One file" : `${failed} files`} couldn&apos;t be loaded and {failed === 1 ? "is" : "are"} left out.
        </p>
      ) : null}
      {cutPages ? (
        <p className="text-xs text-muted-foreground">Only the first {MAX_PREVIEW_PAGES} pages of the PDF are shown in the preview.</p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold">Things to check</h4>
          {onEditCaption ? (
            <Button type="button" variant="ghost" size="sm" onClick={onEditCaption}>
              <Pencil className="h-3.5 w-3.5" />
              Edit caption
            </Button>
          ) : null}
        </div>
        {loading ? null : warnings.length === 0 ? (
          <p className="text-xs text-emerald-500" role="status">
            Nothing to check. This fits {platform === "instagram" ? "Instagram" : "LinkedIn"}.
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label="Things to check">
            {warnings.map((warning, index) => (
              <li
                key={`${warning.code}-${index}`}
                className={cn("flex items-start gap-1.5 text-xs", warning.level === "warning" ? "text-amber-500" : "text-muted-foreground")}
              >
                {warning.level === "warning" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> : <Info className="mt-0.5 h-3 w-3 shrink-0" />}
                {warning.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
