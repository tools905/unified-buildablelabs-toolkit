"use client";

import { useEffect } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Clapperboard,
  Heart,
  House,
  MessageSquareText,
  Moon,
  Search,
  Send,
  SquarePlus,
  Sun,
  UsersRound,
  X,
} from "lucide-react";
import {
  Avatar,
  INSTAGRAM,
  INSTAGRAM_FONT,
  InstagramFrame,
  LINKEDIN,
  LINKEDIN_FONT,
  LinkedInFrame,
} from "@/components/content-board/post-preview/feed-frames";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { cn } from "@/lib/utils/cn";
import { PREVIEW_PLATFORMS, type PreviewPlatform } from "@/lib/utils/social-preview";

// LinkedIn's feed sits on a tinted page with each post on a white card.
const LINKEDIN_PAGE = { light: "#f4f2ee", dark: "#000000" };

// The post as it appears in the Instagram or LinkedIn app: the app's top bar, the post edge to edge,
// the start of the next post and the app's tab bar. On a phone it takes the whole screen, so the post
// is drawn at the phone's real width. On bigger screens it is a phone-shaped screen that grows or
// shrinks to fit the window, keeping a phone's proportions.
export function FeedAppView({
  platform,
  onPlatformChange,
  dark,
  onDarkChange,
  slides,
  caption,
  title,
  onClose,
}: {
  platform: PreviewPlatform;
  onPlatformChange: (platform: PreviewPlatform) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  slides: LoadedSlide[];
  caption: string;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    // Capture first, so Escape closes this preview rather than the idea panel underneath.
    window.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const instagram = platform === "instagram";
  const theme = instagram ? (dark ? INSTAGRAM.dark : INSTAGRAM.light) : dark ? LINKEDIN.dark : LINKEDIN.light;
  const pageBg = instagram ? theme.bg : dark ? LINKEDIN_PAGE.dark : LINKEDIN_PAGE.light;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${instagram ? "Instagram" : "LinkedIn"} app preview`}
      className="fixed inset-0 z-[60] flex flex-col bg-background sm:items-center sm:justify-center sm:bg-black/85 sm:p-4"
    >
      {/* Preview controls. On a phone they sit above the app screen; on bigger screens above the phone. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:mb-3 sm:w-[min(430px,calc((100dvh-6rem)*430/932))] sm:rounded-md sm:border">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the app preview"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 justify-center">
          <div className="flex border border-border" role="radiogroup" aria-label="App">
            {PREVIEW_PLATFORMS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={platform === option.value}
                onClick={() => onPlatformChange(option.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  platform === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDarkChange(!dark)}
          aria-pressed={dark}
          aria-label={dark ? "Show the light app" : "Show the dark app"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-muted"
        >
          {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      {/* The app screen. Phone: the rest of the screen. Bigger screens: a phone whose height fits the window. */}
      <div
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden sm:aspect-[430/932] sm:h-[min(932px,calc(100dvh-6rem))] sm:w-auto sm:flex-none sm:rounded-[2.25rem] sm:border-[10px] sm:border-neutral-800 sm:shadow-2xl"
        style={{ backgroundColor: pageBg, color: theme.text, fontFamily: instagram ? INSTAGRAM_FONT : LINKEDIN_FONT }}
      >
        {instagram ? <InstagramTopBar dark={dark} /> : <LinkedInTopBar dark={dark} />}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {instagram ? (
            <InstagramFrame slides={slides} caption={caption} dark={dark} variant="screen" />
          ) : (
            <div className="pt-2">
              <LinkedInFrame slides={slides} caption={caption} dark={dark} title={title} variant="screen" />
            </div>
          )}
          <NextPostHint instagram={instagram} dark={dark} />
        </div>

        {instagram ? <InstagramTabBar dark={dark} /> : <LinkedInTabBar dark={dark} />}
      </div>
    </div>
  );
}

function InstagramTopBar({ dark }: { dark: boolean }) {
  const theme = dark ? INSTAGRAM.dark : INSTAGRAM.light;
  return (
    <div
      className="flex h-11 shrink-0 items-center justify-between px-4"
      style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}
    >
      <span className="text-[26px] leading-none" style={{ fontFamily: '"Snell Roundhand", "Brush Script MT", cursive', fontWeight: 600 }}>
        Instagram
      </span>
      <span className="flex items-center gap-5">
        <Heart className="h-6 w-6" strokeWidth={1.8} />
        <Send className="h-6 w-6" strokeWidth={1.8} />
      </span>
    </div>
  );
}

function InstagramTabBar({ dark }: { dark: boolean }) {
  const theme = dark ? INSTAGRAM.dark : INSTAGRAM.light;
  return (
    <div
      className="flex shrink-0 items-center justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}
      aria-hidden="true"
    >
      <House className="h-6 w-6" strokeWidth={2.2} />
      <Search className="h-6 w-6" strokeWidth={1.8} />
      <SquarePlus className="h-6 w-6" strokeWidth={1.8} />
      <Clapperboard className="h-6 w-6" strokeWidth={1.8} />
      <Avatar size={26} rounded="full" />
    </div>
  );
}

function LinkedInTopBar({ dark }: { dark: boolean }) {
  const theme = dark ? LINKEDIN.dark : LINKEDIN.light;
  return (
    <div
      className="flex h-12 shrink-0 items-center gap-3 px-3"
      style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}
    >
      <Avatar size={30} rounded="full" />
      <span
        className="flex h-8 flex-1 items-center gap-2 rounded-sm px-2 text-sm"
        style={{ backgroundColor: dark ? "#38434f" : "#edf3f8", color: theme.muted }}
      >
        <Search className="h-4 w-4" />
        Search
      </span>
      <MessageSquareText className="h-6 w-6" style={{ color: theme.muted }} />
    </div>
  );
}

function LinkedInTabBar({ dark }: { dark: boolean }) {
  const theme = dark ? LINKEDIN.dark : LINKEDIN.light;
  const tabs = [
    { label: "Home", icon: House, active: true },
    { label: "My Network", icon: UsersRound },
    { label: "Post", icon: SquarePlus },
    { label: "Notifications", icon: Bell },
    { label: "Jobs", icon: BriefcaseBusiness },
  ];
  return (
    <div
      className="flex shrink-0 items-start justify-around px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}
      aria-hidden="true"
    >
      {tabs.map(({ label, icon: Icon, active }) => (
        <span key={label} className="flex min-w-0 flex-col items-center gap-0.5 text-[10px]" style={{ color: active ? theme.text : theme.muted }}>
          <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} />
          {label}
        </span>
      ))}
    </div>
  );
}

// The top of the next post in the feed, greyed out, so the post reads as one in a feed rather than alone.
function NextPostHint({ instagram, dark }: { instagram: boolean; dark: boolean }) {
  const block = dark ? "#262626" : "#efefef";
  return (
    <div aria-hidden="true" className={cn("opacity-60", instagram ? "pt-3" : "mt-2 pt-3")} style={{ backgroundColor: instagram ? undefined : dark ? LINKEDIN.dark.bg : LINKEDIN.light.bg }}>
      <div className="flex items-center gap-2.5 px-3 pb-2">
        <span className="h-8 w-8 rounded-full" style={{ backgroundColor: block }} />
        <span className="h-3 w-28 rounded" style={{ backgroundColor: block }} />
      </div>
      <div className="aspect-square w-full" style={{ backgroundColor: block }} />
    </div>
  );
}
