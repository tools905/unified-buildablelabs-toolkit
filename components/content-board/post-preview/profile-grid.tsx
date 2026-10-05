"use client";

import { Layers } from "lucide-react";
import { SlideView } from "@/components/content-board/post-preview/slide-view";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { PROFILE_GRID_RATIO } from "@/lib/utils/social-preview";

const THEME = {
  light: { bg: "#ffffff", border: "#dbdbdb", text: "#262626", muted: "#737373", tiles: ["#efefef", "#e2e2e2"] },
  dark: { bg: "#000000", border: "#262626", text: "#f5f5f5", muted: "#a8a8a8", tiles: ["#1c1c1c", "#262626"] },
};

// How the post's cover looks on the Instagram profile page: every post is a 3:4 tile, so the first slide
// is cropped to that. The other tiles are plain placeholders.
export function ProfileGridPreview({ cover, multiple, dark }: { cover: LoadedSlide; multiple: boolean; dark: boolean }) {
  const theme = dark ? THEME.dark : THEME.light;
  return (
    <div className="mx-auto w-full max-w-[375px] border p-0.5" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className="grid grid-cols-3 gap-0.5" aria-label="Instagram profile grid preview">
        <div className="relative overflow-hidden" style={{ aspectRatio: String(PROFILE_GRID_RATIO) }}>
          <SlideView slide={cover} near />
          {multiple ? <Layers className="absolute right-1.5 top-1.5 h-4 w-4 text-white drop-shadow" aria-label="Carousel post" /> : null}
        </div>
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} style={{ aspectRatio: String(PROFILE_GRID_RATIO), backgroundColor: theme.tiles[index % 2] }} />
        ))}
      </div>
    </div>
  );
}
