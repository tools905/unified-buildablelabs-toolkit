import { describe, expect, it } from "vitest";
import {
  coverCardUrl,
  coverImagePayload,
  coverImageStyle,
  coverScrimGradient,
  coverTreatment,
  MAX_TONE,
  MIN_TONE,
  isOwnNewsletterImageUrl,
  newsletterImagePath,
  unusedNewsletterFiles,
} from "@/lib/utils/newsletter-cover";

const SUPABASE = "https://abc.supabase.co";
const WS = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333.webp";
const url = `${SUPABASE}/storage/v1/object/public/newsletter-images/${WS}/${POST}/${FILE}`;

describe("coverTreatment", () => {
  it("fades dark images lightly and leaves their brightness alone", () => {
    const dark = coverTreatment(10);
    expect(dark.overlayOpacity).toBeCloseTo(0.55, 2);
    expect(dark.brightnessFactor).toBe(1);
  });

  it("fades bright images strongly and tones them down", () => {
    const bright = coverTreatment(90);
    expect(bright.overlayOpacity).toBeGreaterThan(0.85);
    expect(bright.brightnessFactor).toBeLessThan(0.8);
    expect(bright.brightnessFactor).toBeGreaterThanOrEqual(0.7);
  });

  it("gets steadily stronger as the image gets brighter and stays in range", () => {
    let previous = 0;
    for (let level = 0; level <= 100; level += 10) {
      const { overlayOpacity, brightnessFactor } = coverTreatment(level);
      expect(overlayOpacity).toBeGreaterThanOrEqual(previous);
      expect(overlayOpacity).toBeGreaterThanOrEqual(0.5);
      expect(overlayOpacity).toBeLessThanOrEqual(0.9);
      expect(brightnessFactor).toBeGreaterThanOrEqual(0.7);
      expect(brightnessFactor).toBeLessThanOrEqual(1);
      previous = overlayOpacity;
    }
  });

  it("uses a middle setting when brightness is unknown", () => {
    expect(coverTreatment(null)).toEqual(coverTreatment(50));
  });
});

describe("coverTreatment manual tone", () => {
  it("uses the chosen percentage instead of the automatic fade", () => {
    expect(coverTreatment(60, 30).overlayOpacity).toBe(0.3);
    expect(coverTreatment(60, 85).overlayOpacity).toBe(0.85);
    expect(coverTreatment(10, 85).overlayOpacity).toBe(0.85);
  });

  it("keeps the picture's own brightness adjustment automatic", () => {
    expect(coverTreatment(90, 30).brightnessFactor).toBe(coverTreatment(90, null).brightnessFactor);
    expect(coverTreatment(90, 95).brightnessFactor).toBe(coverTreatment(90).brightnessFactor);
  });

  it("stays within the safe limits however extreme the choice", () => {
    expect(coverTreatment(50, 0).overlayOpacity).toBe(MIN_TONE / 100);
    expect(coverTreatment(50, 100).overlayOpacity).toBe(MAX_TONE / 100);
    expect(coverTreatment(50, -40).overlayOpacity).toBe(MIN_TONE / 100);
  });

  it("no manual choice equals the automatic result", () => {
    expect(coverTreatment(70, null)).toEqual(coverTreatment(70));
  });
});

describe("coverScrimGradient", () => {
  it("is strongest at the bottom and eases off towards the top", () => {
    const gradient = coverScrimGradient(0.8);
    const alphas = [...gradient.matchAll(/rgba\(10,11,14,([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(alphas[0]).toBeCloseTo(0.8);
    expect([...alphas].sort((a, b) => b - a)).toEqual(alphas);
    expect(alphas[alphas.length - 1]).toBeLessThan(0.2);
  });

  it("keeps the whole text block well covered, not just the very bottom", () => {
    const alphas = [...coverScrimGradient(0.6).matchAll(/rgba\(10,11,14,([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(alphas[1]).toBeGreaterThanOrEqual(0.5);
  });
});

describe("coverImagePayload", () => {
  it("is null without an image", () => {
    expect(coverImagePayload(null, 40)).toBeNull();
  });

  it("centres and does not zoom unless told to", () => {
    expect(coverImagePayload(url, 40)).toEqual({ url, ...coverTreatment(40), focusX: 50, focusY: 50, zoom: 1 });
  });

  it("carries the framing and the tone choice, kept within range", () => {
    const payload = coverImagePayload(url, 40, { focusX: 20, focusY: 130, zoom: 9, tone: 80 });
    expect(payload).toMatchObject({ focusX: 20, focusY: 100, zoom: 3, ...coverTreatment(40, 80) });
  });
});

describe("coverImageStyle", () => {
  it("turns the framing into CSS", () => {
    expect(coverImageStyle({ focusX: 30, focusY: 70, zoom: 1.5 }, 0.8)).toEqual({
      objectFit: "cover",
      objectPosition: "30% 70%",
      transform: "scale(1.5)",
      transformOrigin: "30% 70%",
      filter: "brightness(0.8)",
    });
  });
});

describe("newsletter image addresses", () => {
  it("finds the storage path from a public address", () => {
    expect(newsletterImagePath(url)).toBe(`${WS}/${POST}/${FILE}`);
    expect(newsletterImagePath("https://example.com/cat.png")).toBeNull();
  });

  it("only accepts files uploaded for that same post", () => {
    expect(isOwnNewsletterImageUrl(url, SUPABASE, POST)).toBe(true);
    expect(isOwnNewsletterImageUrl(url, SUPABASE, "44444444-4444-4444-8444-444444444444")).toBe(false);
    expect(isOwnNewsletterImageUrl("https://evil.example.com/x.png", SUPABASE, POST)).toBe(false);
    expect(isOwnNewsletterImageUrl(url.replace("newsletter-images", "content-attachments"), SUPABASE, POST)).toBe(false);
  });
});

describe("unusedNewsletterFiles", () => {
  it("keeps files used by the story or the preview image and flags the rest", () => {
    const body = "Intro ![a](https://x/b/a1.webp) and ![b](https://x/b/b2.webp)";
    const cover = "https://x/b/c3.webp";
    expect(unusedNewsletterFiles(["a1.webp", "b2.webp", "c3.webp", "old4.webp"], body, cover)).toEqual(["old4.webp"]);
  });

  it("flags everything when nothing references the files", () => {
    expect(unusedNewsletterFiles(["a.webp", "b.webp"], "", null)).toEqual(["a.webp", "b.webp"]);
  });

  it("keeps a cover's card copy while its full image is the cover, and flags it once it is not", () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const files = [`${id}-full.webp`, `${id}-card.webp`, "other-card.webp"];
    expect(unusedNewsletterFiles(files, "", `https://x/b/${id}-full.webp`)).toEqual(["other-card.webp"]);
    expect(unusedNewsletterFiles(files, "", "https://x/b/new.webp")).toEqual(files);
  });
});

describe("coverCardUrl", () => {
  const id = "55555555-5555-4555-8555-555555555555";
  const base = `${SUPABASE}/storage/v1/object/public/newsletter-images/${WS}/${POST}`;

  it("derives the card copy's address from a cover stored with the -full suffix", () => {
    expect(coverCardUrl(`${base}/${id}-full.webp`)).toBe(`${base}/${id}-card.webp`);
    expect(coverCardUrl(`${base}/${id}-full.png`)).toBe(`${base}/${id}-card.webp`);
  });

  it("gives nothing for covers uploaded without a card copy", () => {
    expect(coverCardUrl(url)).toBeNull();
    expect(coverCardUrl(null)).toBeNull();
    expect(coverCardUrl(`${base}/${id}-card.webp`)).toBeNull();
  });

  it("is exposed on the payload only when it exists", () => {
    expect(coverImagePayload(url, 40)).not.toHaveProperty("cardUrl");
    expect(coverImagePayload(`${base}/${id}-full.webp`, 40)).toMatchObject({ cardUrl: `${base}/${id}-card.webp` });
    expect(isOwnNewsletterImageUrl(`${base}/${id}-full.webp`, SUPABASE, POST)).toBe(true);
  });
});
