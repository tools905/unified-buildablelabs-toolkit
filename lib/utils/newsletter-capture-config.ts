// What the website's newsletter capture points say and when they appear. Served to the website
// by GET /api/newsletter/capture-config, so wording and timing can change without a website
// deploy. A later step moves these values into the Newsletter tool's Settings tab.

export const CAPTURE_LAYERS = ["cta_block", "inline_prompt", "side_rail", "popup"] as const;
export type CaptureLayer = (typeof CAPTURE_LAYERS)[number];

export type CaptureLayerCopy = {
  enabled: boolean;
  headline: string;
  subtext: string;
  buttonLabel: string;
};

export type CaptureConfig = {
  // Set once the lead magnet is chosen; until then the capture points carry no free resource.
  leadMagnet: { title: string; description: string } | null;
  layers: Record<CaptureLayer, CaptureLayerCopy>;
  triggers: {
    // Where the in-article prompt sits, as a share of the article's length.
    inlinePromptDepth: number;
    // How far through the article the reader must be before the popup opens.
    popupScrollDepth: number;
    // Also open the popup when the cursor leaves through the top of the window (desktop only).
    popupExitIntent: boolean;
    // After the reader closes the popup, it stays away this many days.
    popupCooldownDays: number;
  };
  // The consent wording shown under every form. Its version is stored with each signup, so a
  // change to the text must come with a new version.
  consent: { text: string; version: string };
};

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  leadMagnet: null,
  layers: {
    // The subscribe box on the website's /times page.
    cta_block: {
      enabled: true,
      headline: "Subscribe to The Times.",
      subtext: "Delivered Tuesdays & Fridays. Free, forever. Unsubscribe in one click.",
      buttonLabel: "Subscribe",
    },
    inline_prompt: {
      enabled: true,
      headline: "You're a third of the way in.",
      subtext: "Get the next issue in your inbox. One manual process retired every issue, no theory, just what to build next.",
      buttonLabel: "Subscribe",
    },
    side_rail: {
      enabled: true,
      headline: "For more updates, drop your email here.",
      subtext: "The Buildable Labs Times, every Tuesday and Friday.",
      buttonLabel: "Subscribe",
    },
    popup: {
      enabled: true,
      headline: "Get the next issue in your inbox.",
      subtext: "One manual process retired every issue. No theory, just what to build next.",
      buttonLabel: "Subscribe",
    },
  },
  triggers: {
    inlinePromptDepth: 0.3,
    popupScrollDepth: 0.55,
    popupExitIntent: true,
    popupCooldownDays: 14,
  },
  consent: {
    text: "Delivered Tuesdays & Fridays. Free, forever. Unsubscribe in one click.",
    version: "2026-10-v1",
  },
};
