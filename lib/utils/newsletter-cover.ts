export const NEWSLETTER_BUCKET = "newsletter-images";
export const MAX_NEWSLETTER_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
export const NEWSLETTER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type CoverFade = "lighter" | "darker" | null;

// How the preview image is framed. The original file is never cut: the page shows a window
// onto it, centred on the focus point (0 to 100 across and down) and zoomed in from 1x to 3x.
export type CoverAdjust = {
  focusX: number;
  focusY: number;
  zoom: number;
  fade: CoverFade;
};

export const DEFAULT_COVER_ADJUST: CoverAdjust = { focusX: 50, focusY: 50, zoom: 1, fade: null };

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
// `fade` lets a person nudge the automatic result: "lighter" or "darker".
export function coverTreatment(brightness: number | null | undefined, fade: CoverFade = null): CoverTreatment {
  const level = clamp((brightness ?? 50) / 100, 0, 1);
  const overlay = 0.5 + 0.45 * level;
  const factor = level > 0.55 ? clamp(1 - (level - 0.55) * 0.9, 0.7, 1) : 1;
  if (fade === "lighter") {
    return { overlayOpacity: round2(clamp(overlay - 0.2, 0.3, 0.95)), brightnessFactor: round2(clamp(factor + 0.12, 0.7, 1)) };
  }
  if (fade === "darker") {
    return { overlayOpacity: round2(clamp(overlay + 0.2, 0.3, 0.95)), brightnessFactor: round2(clamp(factor - 0.12, 0.6, 1)) };
  }
  return { overlayOpacity: round2(clamp(overlay, 0.5, 0.9)), brightnessFactor: round2(factor) };
}

export type CoverImagePayload = CoverTreatment & { url: string; focusX: number; focusY: number; zoom: number };

export function coverImagePayload(
  url: string | null | undefined,
  brightness: number | null | undefined,
  adjust: Partial<CoverAdjust> = {},
): CoverImagePayload | null {
  if (!url) return null;
  const { focusX, focusY, zoom, fade } = { ...DEFAULT_COVER_ADJUST, ...adjust };
  return {
    url,
    ...coverTreatment(brightness, fade),
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
export function unusedNewsletterFiles(fileNames: string[], body: string, coverUrl: string | null | undefined) {
  return fileNames.filter((name) => !body.includes(name) && !(coverUrl ?? "").includes(name));
}

// The only addresses a post may use for its cover image: files this post uploaded itself.
export function isOwnNewsletterImageUrl(url: string, supabaseUrl: string, postId: string) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${NEWSLETTER_BUCKET}/`;
  if (!url.startsWith(base)) return false;
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]+$/i.test(url.slice(base.length)) && url.slice(base.length).split("/")[1] === postId;
}
