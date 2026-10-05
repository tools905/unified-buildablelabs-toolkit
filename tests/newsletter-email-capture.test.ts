import { beforeAll, describe, expect, it } from "vitest";
import { CAPTURE_LAYERS, DEFAULT_CAPTURE_CONFIG } from "@/lib/utils/newsletter-capture-config";
import {
  confirmationEmail,
  confirmLink,
  unsubscribeHeaders,
  unsubscribePageLink,
  welcomeEmail,
} from "@/lib/utils/newsletter-email-templates";
import {
  clientIp,
  decideConfirmOutcome,
  decideSubscribeAction,
  isHoneypotFilled,
  isValidEmail,
  normalizeEmail,
  subscribeCorsHeaders,
  subscribeRequestSchema,
} from "@/lib/utils/newsletter-subscription";
import {
  createConfirmToken,
  hashToken,
  rateLimitBucket,
  signSubscriberId,
  verifySubscriberSignature,
} from "@/lib/utils/newsletter-tokens";

const SECRET = "test-secret-that-is-long-enough-for-hmac-0123456789";

beforeAll(() => {
  process.env.NEWSLETTER_TOKEN_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

describe("confirmation tokens", () => {
  it("stores only a hash that matches the token in the link", () => {
    const { token, hash } = createConfirmToken();
    expect(token).not.toBe(hash);
    expect(hashToken(token)).toBe(hash);
  });

  it("creates a different token every time", () => {
    expect(createConfirmToken().token).not.toBe(createConfirmToken().token);
  });
});

describe("unsubscribe signatures", () => {
  it("accepts the signature we issued for that subscriber", () => {
    expect(verifySubscriberSignature("sub-1", signSubscriberId("sub-1"))).toBe(true);
  });

  it("rejects another subscriber's signature, a tampered one, or one from another secret", () => {
    const signature = signSubscriberId("sub-1");
    expect(verifySubscriberSignature("sub-2", signature)).toBe(false);
    expect(verifySubscriberSignature("sub-1", `${signature}x`)).toBe(false);
    expect(verifySubscriberSignature("sub-1", "")).toBe(false);
    expect(verifySubscriberSignature("sub-1", signSubscriberId("sub-1", "a-different-secret"))).toBe(false);
  });

  it("refuses to sign without a configured secret", () => {
    const saved = process.env.NEWSLETTER_TOKEN_SECRET;
    delete process.env.NEWSLETTER_TOKEN_SECRET;
    expect(() => signSubscriberId("sub-1")).toThrow(/NEWSLETTER_TOKEN_SECRET/);
    process.env.NEWSLETTER_TOKEN_SECRET = saved;
  });
});

describe("rate-limit buckets", () => {
  it("never contain the raw IP or email", () => {
    const bucket = rateLimitBucket("email-10m", "founder@startup.com");
    expect(bucket.startsWith("email-10m:")).toBe(true);
    expect(bucket).not.toContain("founder");
    expect(rateLimitBucket("email-10m", "founder@startup.com")).toBe(bucket);
  });
});

describe("signup input", () => {
  it("normalises and validates email addresses", () => {
    expect(normalizeEmail("  Founder@Startup.COM ")).toBe("founder@startup.com");
    expect(isValidEmail("founder@startup.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });

  it("still accepts the old { email } body and records an unknown source as unknown", () => {
    expect(subscribeRequestSchema.parse({ email: "a@b.co" })).toMatchObject({ email: "a@b.co" });
    expect(subscribeRequestSchema.parse({ email: "a@b.co", source: "banner" }).source).toBeUndefined();
    expect(subscribeRequestSchema.parse({ email: "a@b.co", source: "popup" }).source).toBe("popup");
  });

  it("spots a filled honeypot", () => {
    expect(isHoneypotFilled({ website: "" })).toBe(false);
    expect(isHoneypotFilled({})).toBe(false);
    expect(isHoneypotFilled({ website: "http://spam.example" })).toBe(true);
  });

  it("reads the visitor's IP from the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("what a signup does to an existing address", () => {
  it.each([
    [null, "create"],
    ["pending", "resend"],
    ["unsubscribed", "resubscribe"],
    ["active", "ignore"],
    ["bounced", "ignore"],
    ["complained", "ignore"],
  ] as const)("%s -> %s", (status, action) => {
    expect(decideSubscribeAction(status)).toBe(action);
  });
});

describe("confirming", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const later = "2026-10-05T12:00:00Z";

  it("confirms a pending subscriber with a live link", () => {
    expect(decideConfirmOutcome({ status: "pending", confirm_token_expires_at: later }, now)).toBe("confirm");
  });

  it("treats a second click as already confirmed", () => {
    expect(decideConfirmOutcome({ status: "active", confirm_token_expires_at: later }, now)).toBe("already_confirmed");
  });

  it("reports an expired link", () => {
    expect(decideConfirmOutcome({ status: "pending", confirm_token_expires_at: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
  });

  it("never brings back someone who unsubscribed, bounced or complained", () => {
    for (const status of ["unsubscribed", "bounced", "complained"] as const) {
      expect(decideConfirmOutcome({ status, confirm_token_expires_at: later }, now)).toBe("invalid");
    }
  });

  it("rejects an unknown link", () => {
    expect(decideConfirmOutcome(null, now)).toBe("invalid");
  });
});

describe("subscribe CORS", () => {
  it("allows any site until an allowlist is configured", () => {
    expect(subscribeCorsHeaders("https://anywhere.test", "")["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("allows only listed origins once configured", () => {
    const allowed = "https://site.test, http://localhost:3001/";
    expect(subscribeCorsHeaders("https://site.test", allowed)["Access-Control-Allow-Origin"]).toBe("https://site.test");
    expect(subscribeCorsHeaders("http://localhost:3001", allowed)["Access-Control-Allow-Origin"]).toBe("http://localhost:3001");
    expect(subscribeCorsHeaders("https://evil.test", allowed)).not.toHaveProperty("Access-Control-Allow-Origin");
  });
});

describe("capture config served to the website", () => {
  it("covers every capture point with wording", () => {
    for (const layer of CAPTURE_LAYERS) {
      const copy = DEFAULT_CAPTURE_CONFIG.layers[layer];
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.buttonLabel.length).toBeGreaterThan(0);
    }
  });

  it("keeps the triggers the plan asks for", () => {
    const { triggers } = DEFAULT_CAPTURE_CONFIG;
    expect(triggers.inlinePromptDepth).toBeCloseTo(0.3);
    expect(triggers.popupScrollDepth).toBeGreaterThanOrEqual(0.5);
    expect(triggers.popupScrollDepth).toBeLessThanOrEqual(0.6);
    expect(triggers.popupCooldownDays).toBe(14);
  });

  it("names a consent version the subscribe endpoint accepts", () => {
    expect(subscribeRequestSchema.parse({ email: "a@b.co", consentVersion: DEFAULT_CAPTURE_CONFIG.consent.version }).consentVersion)
      .toBe(DEFAULT_CAPTURE_CONFIG.consent.version);
  });
});

describe("newsletter emails", () => {
  it("links the confirmation email to the public confirm page under /teams", () => {
    const email = confirmationEmail({ token: "tok_123" });
    expect(confirmLink("tok_123")).toBe("https://example.test/teams/newsletter/confirm?token=tok_123");
    expect(email.html).toContain(confirmLink("tok_123"));
    expect(email.text).toContain(confirmLink("tok_123"));
    expect(email.headers).toBeUndefined();
  });

  it("gives every marketing email a footer unsubscribe link and one-click headers", () => {
    const email = welcomeEmail({ subscriberId: "sub-1" });
    const pageLink = unsubscribePageLink("sub-1");
    expect(pageLink).toMatch(/^https:\/\/example\.test\/teams\/newsletter\/unsubscribe\?s=sub-1&t=/);
    expect(email.html).toContain(pageLink.replaceAll("&", "&amp;"));
    expect(email.text).toContain(pageLink);
    expect(email.headers).toEqual(unsubscribeHeaders("sub-1"));
    expect(email.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/example\.test\/teams\/api\/newsletter\/unsubscribe\?s=sub-1&t=.+>$/);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
