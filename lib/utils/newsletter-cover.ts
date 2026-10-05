export const NEWSLETTER_BUCKET = "newsletter-images";
export const MAX_NEWSLETTER_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
export const NEWSLETTER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// A cover uploaded with a small copy for the website's cards is stored as two files that share
// one id: <id>-full.<ext> (the picture) and <id>-card.webp (the ~800px copy). Only the full
// address is saved on the post; the card's follows from it. Older covers have neither suffix.
export const NEWSLETTER_FULL_SUFFIX = "-full";
export const NEWSLETTER_CARD_SUFFIX = "-card.webp";

// The address of a cover's small card copy, or null for a cover uploaded without one.
export function coverCardUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^(.*\/[0-9a-f-]{36})-full\.(?:webp|jpe?g|png)$/i);
  return match ? `${match[1]}${NEWSLETTER_CARD_SUFFIX}` : null;
}

// Manual tone: how strongly the picture is darkened under the card text, in percent. Below the
// minimum the text is no longer readable on most pictures; above the maximum the picture vanishes.
export const MIN_TONE = 20;
export const MAX_TONE = 95;

// How the preview image is framed. The original file is never cut: the page shows a window
// onto it, centred on the focus point (0 to 100 across and down) and zoomed in from 1x to 3x.
export type CoverAdjust = {
  focusX: number;
  focusY: number;
  zoom: number;
  // null = Auto (from the picture's brightness), otherwise the darkening percentage a person chose.
  tone: number | null;
};

export const DEFAULT_COVER_ADJUST: CoverAdjust = { focusX: 50, focusY: 50, zoom: 1, tone: null };

export type CoverTreatment = {
  // How strong the dark fade under the card text is (0 to 1).
  overlayOpacity: number;
  // Multiplier for the image's own brightness (1 = unchanged, lower = darker).
  brightnessFactor: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

// Turns the measured brightness of a cover image (0 = black, 100 = white) into how
// much the page should darken it so light text on top stays readable on the dark theme.
// Brighter images get a stronger fade and are toned down a little. The original file
// is never changed; the website applies these two numbers when it draws the card.
// A manual `tone` (percent) replaces the automatic fade strength; the picture's own
// brightness adjustment stays automatic.
export function coverTreatment(brightness: number | null | undefined, tone: number | null = null): CoverTreatment {
  const level = clamp((brightness ?? 50) / 100, 0, 1);
  const factor = round2(level > 0.55 ? clamp(1 - (level - 0.55) * 0.9, 0.7, 1) : 1);
  if (tone === null) {
    return { overlayOpacity: round2(clamp(0.5 + 0.45 * level, 0.5, 0.9)), brightnessFactor: factor };
  }
  return { overlayOpacity: round2(clamp(tone, MIN_TONE, MAX_TONE) / 100), brightnessFactor: factor };
}

// The dark fade drawn over the picture. It stays strong across the whole block of text
// (headline, summary, byline and link) and only eases off near the top of the card.
export function coverScrimGradient(overlayOpacity: number) {
  const o = overlayOpacity;
  const at = (factor: number) => `rgba(10,11,14,${(o * factor).toFixed(2)})`;
  return `linear-gradient(to top, ${at(1)} 0%, ${at(0.92)} 40%, ${at(0.68)} 65%, ${at(0.34)} 85%, ${at(0.12)} 100%)`;
}

export type CoverImagePayload = CoverTreatment & {
  url: string;
  // A smaller (~800px) copy for list cards; missing for covers uploaded before it existed.
  cardUrl?: string;
  focusX: number;
  focusY: number;
  zoom: number;
};

export function coverImagePayload(
  url: string | null | undefined,
  brightness: number | null | undefined,
  adjust: Partial<CoverAdjust> = {},
): CoverImagePayload | null {
  if (!url) return null;
  const { focusX, focusY, zoom, tone } = { ...DEFAULT_COVER_ADJUST, ...adjust };
  const cardUrl = coverCardUrl(url);
  return {
    url,
    ...(cardUrl ? { cardUrl } : {}),
    ...coverTreatment(brightness, tone),
    focusX: clamp(Math.round(focusX), 0, 100),
    focusY: clamp(Math.round(focusY), 0, 100),
    zoom: round2(clamp(zoom, 1, 3)),
  };
}

// CSS that frames the image inside its box. The toolkit preview and the website use the
// same values, so what is set in the editor is what the page shows.
export function coverImageStyle(
  adjust: { focusX: number; focusY: number; zoom: number },
  brightnessFactor: number,
) {
  return {
    objectFit: "cover" as const,
    objectPosition: `${adjust.focusX}% ${adjust.focusY}%`,
    transform: `scale(${adjust.zoom})`,
    transformOrigin: `${adjust.focusX}% ${adjust.focusY}%`,
    filter: `brightness(${brightnessFactor})`,
  };
}

// Where an uploaded file lives inside the bucket, taken from its public address.
export function newsletterImagePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${NEWSLETTER_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  const path = decodeURIComponent(publicUrl.slice(index + marker.length).split("?")[0]);
  return path || null;
}

// Files in a post's folder that neither the story text nor the preview image use any more.
// A cover's card copy (<id>-card.webp) counts as used while its full image (<id>-full.*) is.
export function unusedNewsletterFiles(fileNames: string[], body: string, coverUrl: string | null | undefined) {
  const cover = coverUrl ?? "";
  const cardInUse = (name: string) =>
    name.endsWith(NEWSLETTER_CARD_SUFFIX) && cover.includes(`${name.slice(0, -NEWSLETTER_CARD_SUFFIX.length)}${NEWSLETTER_FULL_SUFFIX}.`);
  return fileNames.filter((name) => !body.includes(name) && !cover.includes(name) && !cardInUse(name));
}

// The only addresses a post may use for its cover image: files this post uploaded itself.
export function isOwnNewsletterImageUrl(url: string, supabaseUrl: string, postId: string) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${NEWSLETTER_BUCKET}/`;
  if (!url.startsWith(base)) return false;
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]+$/i.test(url.slice(base.length)) && url.slice(base.length).split("/")[1] === postId;
}
