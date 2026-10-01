import { describe, expect, it } from "vitest";
import {
  coverImagePayload,
  coverImageStyle,
  coverTreatment,
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

describe("coverTreatment manual fade", () => {
  it("lighter fades less and darker fades more than automatic", () => {
    const auto = coverTreatment(60);
    const lighter = coverTreatment(60, "lighter");
    const darker = coverTreatment(60, "darker");
    expect(lighter.overlayOpacity).toBeLessThan(auto.overlayOpacity);
    expect(darker.overlayOpacity).toBeGreaterThan(auto.overlayOpacity);
    expect(lighter.brightnessFactor).toBeGreaterThanOrEqual(auto.brightnessFactor);
    expect(darker.brightnessFactor).toBeLessThanOrEqual(auto.brightnessFactor);
  });

  it("stays within safe limits at the extremes", () => {
    for (const brightness of [0, 50, 100]) {
      for (const fade of ["lighter", "darker"] as const) {
        const { overlayOpacity, brightnessFactor } = coverTreatment(brightness, fade);
        expect(overlayOpacity).toBeGreaterThanOrEqual(0.3);
        expect(overlayOpacity).toBeLessThanOrEqual(0.95);
        expect(brightnessFactor).toBeGreaterThanOrEqual(0.6);
        expect(brightnessFactor).toBeLessThanOrEqual(1);
      }
    }
  });

  it("no manual choice equals the automatic result", () => {
    expect(coverTreatment(70, null)).toEqual(coverTreatment(70));
  });
});

describe("coverImagePayload", () => {
  it("is null without an image", () => {
    expect(coverImagePayload(null, 40)).toBeNull();
  });

  it("centres and does not zoom unless told to", () => {
    expect(coverImagePayload(url, 40)).toEqual({ url, ...coverTreatment(40), focusX: 50, focusY: 50, zoom: 1 });
  });

  it("carries the framing and the fade choice, kept within range", () => {
    const payload = coverImagePayload(url, 40, { focusX: 20, focusY: 130, zoom: 9, fade: "darker" });
    expect(payload).toMatchObject({ focusX: 20, focusY: 100, zoom: 3, ...coverTreatment(40, "darker") });
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
});
