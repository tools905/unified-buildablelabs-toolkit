"use client";

import { useState } from "react";
import { Globe, MessageSquare, MoreHorizontal, Repeat2, Send, ThumbsUp } from "lucide-react";
import { Carousel } from "@/components/content-board/post-preview/carousel";
import { FeedCaption } from "@/components/content-board/post-preview/feed-caption";
import { CommentIcon, HeartIcon, MoreIcon, SaveIcon, ShareIcon } from "@/components/content-board/post-preview/instagram-icons";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { BASE_PATH } from "@/lib/utils/app-url";
import { cn } from "@/lib/utils/cn";
import { frameRatio, PREVIEW_BRAND } from "@/lib/utils/social-preview";

// Colours of each app, light and dark. The preview's own dark mode is independent of the toolkit's.
const INSTAGRAM = {
  light: { bg: "#ffffff", text: "#262626", muted: "#737373", border: "#dbdbdb", link: "#00376b" },
  dark: { bg: "#000000", text: "#f5f5f5", muted: "#a8a8a8", border: "#262626", link: "#e0f1ff" },
};
const LINKEDIN = {
  light: { bg: "#ffffff", text: "rgba(0,0,0,0.9)", muted: "rgba(0,0,0,0.6)", border: "#e0dfdc", link: "#0a66c2" },
  dark: { bg: "#1b1f23", text: "rgba(255,255,255,0.9)", muted: "rgba(255,255,255,0.6)", border: "#38434f", link: "#71b7fb" },
};

// Each app uses the phone's own system font, so the previews do too rather than the toolkit's.
const INSTAGRAM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const LINKEDIN_FONT = '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Fira Sans", Ubuntu, sans-serif';

type FrameProps = { slides: LoadedSlide[]; caption: string; dark: boolean; title?: string };

function Avatar({ size, rounded }: { size: number; rounded: "full" | "sm" }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center ring-1 ring-black/10", rounded === "full" ? "rounded-full" : "rounded-sm")}
      style={{ width: size, height: size, backgroundColor: PREVIEW_BRAND.color }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small file from /public */}
      <img src={`${BASE_PATH}${PREVIEW_BRAND.markPath}`} alt="" style={{ height: size * 0.62 }} />
    </span>
  );
}

export function InstagramFrame({ slides, caption, dark }: FrameProps) {
  const theme = dark ? INSTAGRAM.dark : INSTAGRAM.light;
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, slides.length - 1));

  return (
    <article
      aria-label="Instagram post preview"
      className="mx-auto w-full max-w-[375px] overflow-hidden border"
      style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border, fontFamily: INSTAGRAM_FONT }}
    >
      <header className="flex items-center gap-2.5 px-3 py-2">
        <Avatar size={32} rounded="full" />
        <div className="min-w-0 flex-1 text-sm font-semibold leading-[18px]">{PREVIEW_BRAND.handle}</div>
        <MoreIcon size={24} />
      </header>

      <div className="relative">
        {slides.length > 0 ? (
          <Carousel slides={slides} ratio={frameRatio(slides, "instagram")} onIndexChange={setIndex} />
        ) : (
          <div className="grid aspect-square place-items-center text-sm" style={{ color: theme.muted }}>
            Nothing to show yet
          </div>
        )}
        {slides.length > 1 ? (
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            {current + 1}/{slides.length}
          </span>
        ) : null}
      </div>

      <div className="relative flex items-center gap-4 px-3 pb-1 pt-3">
        <HeartIcon />
        <CommentIcon />
        <ShareIcon />
        {slides.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center gap-1" aria-hidden="true">
            {slides.slice(0, 10).map((slide, i) => (
              <span
                key={slide.id}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === Math.min(current, 9) ? "#0095f6" : dark ? "#555555" : "#c7c7c7" }}
              />
            ))}
          </div>
        ) : null}
        <SaveIcon className="ml-auto" />
      </div>

      <div className="px-3 pb-3 pt-0.5">
        <p className="text-sm leading-[18px]">Be the first to like this</p>
        <div className="pt-1">
          <FeedCaption
            caption={caption}
            platform="instagram"
            linkColor={theme.link}
            mutedColor={theme.muted}
            lead={PREVIEW_BRAND.handle}
            lines={2}
            lineHeight={18}
          />
        </div>
        <p className="pt-2 text-[10px] uppercase leading-3 tracking-[0.2px]" style={{ color: theme.muted }}>
          Just now
        </p>
      </div>
    </article>
  );
}

export function LinkedInFrame({ slides, caption, dark, title }: FrameProps) {
  const theme = dark ? LINKEDIN.dark : LINKEDIN.light;
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, slides.length - 1));
  // LinkedIn carousels are documents: swipeable pages with a title and page counter underneath. The
  // preview shows them that way for a PDF and for separate images alike.
  const fromPdf = slides.some((slide) => slide.source === "pdf");
  const documentTitle = fromPdf ? slides[current]?.label.split(" · ")[0] : title;

  return (
    <article
      aria-label="LinkedIn post preview"
      className="@container mx-auto w-full max-w-[420px] overflow-hidden rounded-lg border"
      style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border, fontFamily: LINKEDIN_FONT }}
    >
      <header className="flex items-start gap-2 px-3 pb-2 pt-3">
        <Avatar size={48} rounded="full" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">BuildableLabs</div>
          <div className="flex items-center gap-1 text-xs leading-4" style={{ color: theme.muted }}>
            Just now · <Globe className="h-3 w-3" />
          </div>
        </div>
        <MoreHorizontal className="h-5 w-5" style={{ color: theme.muted }} />
      </header>

      <div className="px-3 pb-2">
        <FeedCaption caption={caption} platform="linkedin" linkColor={theme.link} mutedColor={theme.muted} lines={3} lineHeight={20} />
      </div>

      {slides.length > 0 ? (
        <div>
          <Carousel slides={slides} ratio={frameRatio(slides, "linkedin")} onIndexChange={setIndex} />
          {fromPdf || slides.length > 1 ? (
            <div
              className="flex items-center justify-between border-t px-3 py-2 text-xs"
              style={{ borderColor: theme.border, color: theme.muted }}
            >
              <span className="min-w-0 truncate">{documentTitle}</span>
              <span className="shrink-0 pl-3">
                {current + 1} / {slides.length}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid h-40 place-items-center text-sm" style={{ color: theme.muted }}>
          Nothing to show yet
        </div>
      )}

      <footer className="flex items-center justify-around border-t px-1 py-1" style={{ borderColor: theme.border, color: theme.muted }}>
        {[
          { label: "Like", icon: ThumbsUp },
          { label: "Comment", icon: MessageSquare },
          { label: "Repost", icon: Repeat2 },
          { label: "Send", icon: Send },
        ].map(({ label, icon: Icon }) => (
          <span key={label} className="flex items-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold" aria-label={label}>
            <Icon className="h-5 w-5" />
            {/* The labels go when the post is narrow, as in the app, so the four buttons always fit. */}
            <span className="hidden @min-[360px]:inline">{label}</span>
          </span>
        ))}
      </footer>
    </article>
  );
}
