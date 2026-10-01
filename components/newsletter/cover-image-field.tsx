"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { coverImageStyle, coverTreatment, type CoverAdjust } from "@/lib/utils/newsletter-cover";
import { isImageFile } from "@/components/newsletter/newsletter-images";

// The card exactly as the website draws it: image behind the text, with a dark fade
// whose strength follows how bright the image is, so the text stays readable. The
// picture is framed by the focus point and zoom saved with the post.
export function CoverCardPreview({
  url,
  brightness,
  adjust,
  tag,
  title,
  aspect = "wide",
}: {
  url: string;
  brightness: number | null;
  adjust: CoverAdjust;
  tag: string;
  title: string;
  // "card" is the story card on the Times page, "banner" the wide picture on an article.
  aspect?: "wide" | "card" | "banner";
}) {
  const { overlayOpacity, brightnessFactor } = coverTreatment(brightness, adjust.fade);
  const showText = Boolean(tag || title) || aspect !== "banner";
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        aspect === "card" ? "aspect-[350/380]" : aspect === "banner" ? "aspect-[16/9]" : "aspect-[16/9]",
      )}
      style={{ background: "#0A0B0E" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public Supabase storage address */}
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={coverImageStyle(adjust, brightnessFactor)}
      />
      {aspect === "banner" ? null : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, rgba(10,11,14,${overlayOpacity}) 0%, rgba(10,11,14,${(overlayOpacity * 0.6).toFixed(2)}) 55%, rgba(10,11,14,${(overlayOpacity * 0.3).toFixed(2)}) 100%)`,
          }}
        />
      )}
      {showText && aspect !== "banner" ? (
        <div className="pointer-events-none relative flex h-full flex-col justify-end gap-2 p-6">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ color: "#A9BAFF" }}>
            ■ {tag || "Dispatch"}
          </span>
          <span className="font-serif text-[26px] leading-tight" style={{ color: "#F5F6F8" }}>
            {title || "Headline"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function CoverImageField({
  url,
  brightness,
  adjust,
  tag,
  title,
  uploading,
  error,
  onFile,
  onAdjust,
  onRemove,
}: {
  url: string | null;
  brightness: number | null;
  adjust: CoverAdjust;
  tag: string;
  title: string;
  uploading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onAdjust: () => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | File[] | null) {
    const file = Array.from(files ?? []).find(isImageFile);
    if (file) onFile(file);
  }

  return (
    <div className="mb-6" style={{ color: "#6B6250" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: "#A79E86" }}>
          Preview image
        </span>
        {url && !uploading ? (
          <span className="flex items-center gap-3 text-xs">
            <button type="button" className="underline-offset-2 hover:underline" onClick={onAdjust}>
              Adjust
            </button>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => input.current?.click()}>
              Replace
            </button>
            <button type="button" className="underline-offset-2 hover:underline" onClick={onRemove}>
              Remove
            </button>
          </span>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files);
        }}
        className="relative"
        style={{ outline: dragging ? "2px dashed #0B3FDE" : "none", outlineOffset: 4 }}
      >
        {url ? (
          <CoverCardPreview url={url} brightness={brightness} adjust={adjust} tag={tag} title={title} />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 border border-dashed text-sm transition-colors hover:bg-black/5"
            style={{ borderColor: dragging ? "#0B3FDE" : "#C9C0A6", background: dragging ? "rgba(11,63,222,.06)" : "transparent" }}
          >
            <ImagePlus className="h-5 w-5" />
            <span>Drag an image here from your Downloads, or click to choose</span>
            <span className="text-xs opacity-70">Shown behind the headline on the website. PNG, JPG or WebP.</span>
          </button>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white" style={{ background: "rgba(10,11,14,.6)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        ) : null}
      </div>

      {url ? (
        <p className="mt-2 text-xs opacity-80">
          This is how it will look on the website. Use Adjust to move or zoom the picture. A dark fade is added
          automatically so the headline stays readable.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs" style={{ color: "#B3261E" }}>
          {error}
        </p>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
