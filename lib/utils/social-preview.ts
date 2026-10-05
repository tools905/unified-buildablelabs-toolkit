// How a post looks and what it has to respect on Instagram and LinkedIn. Everything here is plain
// functions so it can be tested; the screens only draw what these return.
//
// The limits are the platforms' published ones as we last knew them, and they do change. They all
// live in PLATFORM_RULES so one edit updates every warning.

export type PreviewPlatform = "instagram" | "linkedin";

export const PREVIEW_PLATFORMS: { value: PreviewPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];

type Rules = {
  label: string;
  // Width divided by height. A slide outside this range is cropped by the app.
  minRatio: number;
  maxRatio: number;
  maxSlides: number;
  maxCaption: number;
  maxHashtags: number | null;
  // How much of a caption shows before "…more": whichever comes first of these.
  foldChars: number;
  foldLines: number;
  // Images narrower than this may look soft.
  recommendedWidth: number;
};

export const PLATFORM_RULES: Record<PreviewPlatform, Rules> = {
  instagram: {
    label: "Instagram",
    minRatio: 4 / 5,
    maxRatio: 1.91,
    maxSlides: 20,
    maxCaption: 2200,
    maxHashtags: 30,
    foldChars: 125,
    foldLines: 2,
    recommendedWidth: 1080,
  },
  linkedin: {
    label: "LinkedIn",
    minRatio: 4 / 5,
    maxRatio: 1.91,
    maxSlides: 20,
    maxCaption: 3000,
    maxHashtags: null,
    foldChars: 210,
    foldLines: 3,
    recommendedWidth: 1080,
  },
};

// Who the preview says posted it. Edit here to change the name shown in every preview.
export const PREVIEW_BRAND = {
  name: "BuildableLabs",
  handle: "buildablelabs",
  // The profile picture: the black mark on a white circle, as on the real Instagram and LinkedIn pages.
  // The file is in /public.
  markPath: "/brand/bl-mark-black.svg",
  color: "#FFFFFF",
};

// ---- slides -----------------------------------------------------------------------------------

// One picture in the post: an uploaded image, or one page of an uploaded PDF. Width and height are
// 0 until they are known (an image has to load first).
export type PreviewSlide = {
  id: string;
  source: "image" | "pdf";
  width: number;
  height: number;
  label: string;
};

export function slideRatio(slide: Pick<PreviewSlide, "width" | "height">): number | null {
  return slide.width > 0 && slide.height > 0 ? slide.width / slide.height : null;
}

export function clampRatio(ratio: number, platform: PreviewPlatform): number {
  const { minRatio, maxRatio } = PLATFORM_RULES[platform];
  return Math.min(maxRatio, Math.max(minRatio, ratio));
}

// The shape of the frame the slides are shown in: the first slide's shape, held inside what the app
// allows. Every other slide is fitted into it.
export function frameRatio(slides: Pick<PreviewSlide, "width" | "height">[], platform: PreviewPlatform): number {
  const first = slides.length ? slideRatio(slides[0]) : null;
  return clampRatio(first ?? 1, platform);
}

const NICE_RATIOS: [number, string][] = [
  [1, "1:1"],
  [4 / 5, "4:5"],
  [3 / 4, "3:4"],
  [9 / 16, "9:16"],
  [16 / 9, "16:9"],
  [1.91, "1.91:1"],
  [4 / 3, "4:3"],
  [5 / 4, "5:4"],
];

export function ratioLabel(ratio: number): string {
  const match = NICE_RATIOS.find(([value]) => Math.abs(value - ratio) < 0.02);
  if (match) return match[1];
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

// ---- caption ----------------------------------------------------------------------------------

export function normalizeCaption(caption: string | null | undefined): string {
  return (caption ?? "").replace(/\r\n?/g, "\n").trim();
}

// The part of the caption seen before "…more", and the rest. Cut where the app would: after the
// first few lines, or after a few characters, whichever comes first, without splitting a word.
export function foldCaption(
  caption: string | null | undefined,
  platform: PreviewPlatform,
): { visible: string; hidden: string; truncated: boolean } {
  const text = normalizeCaption(caption);
  const { foldChars, foldLines } = PLATFORM_RULES[platform];

  let cut = text.length;
  const lines = text.split("\n");
  if (lines.length > foldLines) cut = lines.slice(0, foldLines).join("\n").length;
  if (cut > foldChars) {
    cut = foldChars;
    // Step back to the end of a word, unless that would throw away most of the line.
    const space = text.lastIndexOf(" ", cut);
    if (space > cut - 25 && space > 0) cut = space;
  }

  if (cut >= text.length) return { visible: text, hidden: "", truncated: false };
  return { visible: text.slice(0, cut).trimEnd(), hidden: text.slice(cut).trimStart(), truncated: true };
}

// Finds where to cut a caption so that what is left (plus whatever the caller adds after it, such as
// "… more") still fits. `fits` says whether a candidate fits and must get harder as the text grows;
// the caller measures it in the real layout. Cuts at the end of a word when one is close.
export function findFoldIndex(text: string, fits: (candidate: string) => boolean): number {
  if (fits(text)) return text.length;
  let low = 0;
  let high = text.length;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(text.slice(0, middle))) low = middle;
    else high = middle;
  }
  const boundary = Math.max(text.lastIndexOf(" ", low), text.lastIndexOf("\n", low));
  return boundary > low - 25 && boundary > 0 ? boundary : low;
}

export type CaptionPart = { kind: "text" | "hashtag" | "mention" | "link"; value: string };

// Splits text so hashtags, mentions and links can be drawn in the platform's link colour.
export function tokenizeCaption(text: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  const pattern = /(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|@[\w.]+)/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: "text", value: text.slice(last, index) });
    const value = match[0];
    parts.push({ kind: value.startsWith("#") ? "hashtag" : value.startsWith("@") ? "mention" : "link", value });
    last = index + value.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

export function countHashtags(caption: string | null | undefined): number {
  return tokenizeCaption(normalizeCaption(caption)).filter((part) => part.kind === "hashtag").length;
}

// ---- warnings ---------------------------------------------------------------------------------

export type PreviewWarning = {
  // Stable name for tests and screens.
  code: string;
  level: "warning" | "info";
  message: string;
};

const SHAPE_TOLERANCE = 0.02;

// Instagram's profile page shows every post as a 3:4 tile. A cover wider than about 9:10 loses enough
// of its sides there to be worth a note.
export const PROFILE_GRID_RATIO = 3 / 4;
const PROFILE_CROP_NOTE_RATIO = 0.9;

// True when the first slide is wide enough that Instagram's 3:4 profile tile trims its sides. Only
// then is a look at the profile grid worth showing.
export function coverGetsCropped(slides: Pick<PreviewSlide, "width" | "height">[]): boolean {
  const cover = slides.length ? slideRatio(slides[0]) : null;
  return cover !== null && cover >= PROFILE_CROP_NOTE_RATIO;
}

export function checkPost({
  platform,
  slides,
  caption,
  skippedLinks = 0,
}: {
  platform: PreviewPlatform;
  slides: PreviewSlide[];
  caption: string | null | undefined;
  // Design links among the attachments: they can't be shown in a feed preview.
  skippedLinks?: number;
}): PreviewWarning[] {
  const rules = PLATFORM_RULES[platform];
  const warnings: PreviewWarning[] = [];
  const add = (code: string, level: PreviewWarning["level"], message: string) => warnings.push({ code, level, message });

  const text = normalizeCaption(caption);

  if (slides.length === 0) {
    add("no-slides", "info", "No images or PDF yet. Add some under Files to see the post.");
  }
  if (skippedLinks > 0) {
    add(
      "links-skipped",
      "info",
      `${skippedLinks === 1 ? "A design link" : `${skippedLinks} design links`} can't be shown in the preview. Upload the images or a PDF instead.`,
    );
  }

  const hasPdf = slides.some((slide) => slide.source === "pdf");
  const hasImages = slides.some((slide) => slide.source === "image");
  if (platform === "instagram" && hasPdf) {
    add("instagram-pdf", "warning", "Instagram doesn't accept PDFs. Export each page as an image before posting.");
  }
  if (platform === "linkedin" && hasPdf && hasImages) {
    add("linkedin-mixed", "warning", "LinkedIn can't mix a PDF with images in one post. Use one or the other.");
  }
  if (platform === "linkedin" && !hasPdf && slides.length > 1) {
    add("linkedin-use-pdf", "info", "On LinkedIn a swipe carousel is a PDF. Combine these images into one PDF before posting, or they won't swipe in the feed.");
  }

  if (slides.length > rules.maxSlides) {
    add("too-many-slides", "warning", `${rules.label} allows up to ${rules.maxSlides} slides. This has ${slides.length}.`);
  }

  slides.forEach((slide, index) => {
    const ratio = slideRatio(slide);
    if (ratio === null) return;
    const position = `Slide ${index + 1}`;
    if (ratio < rules.minRatio - SHAPE_TOLERANCE) {
      add("too-tall", "warning", `${position} is taller than ${rules.label} allows (${ratioLabel(rules.minRatio)}), so the top and bottom get cut off.`);
    } else if (ratio > rules.maxRatio + SHAPE_TOLERANCE) {
      add("too-wide", "warning", `${position} is wider than ${rules.label} allows (${ratioLabel(rules.maxRatio)}), so the sides get cut off.`);
    }
    if (slide.source === "image" && slide.width < rules.recommendedWidth) {
      add("low-resolution", "warning", `${position} is ${slide.width} px wide. ${rules.label} looks best at ${rules.recommendedWidth} px or more.`);
    }
  });

  if (platform === "instagram" && slides.length > 1) {
    const first = slideRatio(slides[0]);
    if (first !== null) {
      const different = slides
        .map((slide, index) => ({ index, ratio: slideRatio(slide) }))
        .filter(({ ratio, index }) => index > 0 && ratio !== null && Math.abs((ratio as number) - first) > SHAPE_TOLERANCE);
      if (different.length > 0) {
        add(
          "mixed-shapes",
          "warning",
          `The slides are different shapes. Instagram shows every slide in the shape of the first one (${ratioLabel(first)}), so ${
            different.length === 1 ? `slide ${different[0].index + 1}` : "some slides"
          } will be cropped.`,
        );
      }
    }
  }

  if (platform === "instagram" && slides.length > 0) {
    const cover = slideRatio(slides[0]);
    if (cover !== null && coverGetsCropped(slides)) {
      add(
        "profile-crop",
        "info",
        `Your profile grid shows the cover cropped to ${ratioLabel(PROFILE_GRID_RATIO)}, so the sides of this ${ratioLabel(cover)} slide are trimmed. Keep the important parts in the middle.`,
      );
    }
  }

  if (!text) {
    add("no-caption", "info", "No caption yet. Add one in Edit to see how the text reads under the post.");
  } else if (text.length > rules.maxCaption) {
    add("caption-too-long", "warning", `The caption is ${text.length.toLocaleString()} characters. ${rules.label} allows ${rules.maxCaption.toLocaleString()}.`);
  }
  if (rules.maxHashtags !== null) {
    const tags = countHashtags(text);
    if (tags > rules.maxHashtags) {
      add("too-many-hashtags", "warning", `The caption has ${tags} hashtags. ${rules.label} allows ${rules.maxHashtags}.`);
    }
  }

  return warnings;
}
