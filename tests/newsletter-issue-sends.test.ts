import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { issueEmail, type IssueEmailContent } from "@/lib/utils/newsletter-email-templates";
import { issueExcerpt, issueUrl } from "@/lib/utils/newsletter-issue";
import { deliveryChangesForEvent, isTrackedEvent, type DeliveryState } from "@/lib/utils/newsletter-tracking";

beforeAll(() => {
  process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-that-is-long-enough-for-hmac-0123456789";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

afterEach(() => {
  delete process.env.NEWSLETTER_SITE_URL;
  delete process.env.NEWSLETTER_POST_PATH;
});

describe("issue links", () => {
  it("point at the post on the website, tagged as newsletter traffic", () => {
    process.env.NEWSLETTER_SITE_URL = "https://buildablelabs.test/";
    expect(issueUrl("why-mvps-fail")).toBe(
      "https://buildablelabs.test/times/why-mvps-fail?utm_source=newsletter&utm_medium=email&utm_campaign=why-mvps-fail",
    );
  });

  it("fall back to the app's own origin and accept a different post path", () => {
    process.env.NEWSLETTER_POST_PATH = "/news/{slug}";
    expect(issueUrl("a")).toMatch(/^https:\/\/example\.test\/news\/a\?utm_source=newsletter/);
  });
});

describe("issue excerpt", () => {
  it("takes the opening paragraphs as plain text", () => {
    const body = "First **bold** line with a [link](https://x.test).\n\nSecond _quiet_ line.";
    expect(issueExcerpt(body)).toEqual(["First bold line with a link.", "Second quiet line."]);
  });

  it("skips pictures, quotes and lists", () => {
    const body = "![cover](https://x.test/a.png)\n> a quote\n- a list item\n1. numbered\nThe real opening.";
    expect(issueExcerpt(body)).toEqual(["The real opening."]);
  });

  it("stops at about 60 words and marks the cut", () => {
    const body = `${Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ")}\n${Array.from({ length: 30 }, (_, i) => `x${i}`).join(" ")}.`;
    const excerpt = issueExcerpt(body);
    expect(excerpt).toHaveLength(2);
    expect(excerpt[1].endsWith("…")).toBe(true);
    expect(excerpt.join(" ").split(" ")).toHaveLength(60);
  });

  it("is empty for an issue with no text paragraphs", () => {
    expect(issueExcerpt("![only](https://x.test/a.png)")).toEqual([]);
  });
});

const content: IssueEmailContent = {
  subject: "Why MVPs fail",
  previewText: "And what to build instead",
  title: "Why MVPs <fail>",
  deck: "A founder's guide",
  tag: "Teardown",
  coverImageUrl: "https://cdn.test/cover.png",
  excerpt: ["One manual process retired."],
  authors: ["Vatsal", "Ananya"],
  url: "https://buildablelabs.test/times/why-mvps-fail?utm_source=newsletter",
};

describe("issue email", () => {
  it("is a teaser that links to the full issue", () => {
    const email = issueEmail(content, "sub-1");
    expect(email.subject).toBe("Why MVPs fail");
    expect(email.html).toContain("Read the full issue");
    expect(email.html).toContain(content.url.replaceAll("&", "&amp;"));
    expect(email.html).toContain("https://cdn.test/cover.png");
    expect(email.html).toContain("And what to build instead");
    expect(email.text).toContain(`Read the full issue: ${content.url}`);
    expect(email.text).toContain("By Vatsal, Ananya");
  });

  it("escapes the post's own text", () => {
    const email = issueEmail(content, "sub-1");
    expect(email.html).toContain("Why MVPs &lt;fail&gt;");
    expect(email.html).not.toContain("<fail>");
  });

  it("carries the subscriber's own unsubscribe link and one-click headers", () => {
    const email = issueEmail(content, "sub-1");
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.headers?.["List-Unsubscribe"]).toContain("s=sub-1");
    expect(email.text).toMatch(/newsletter\/unsubscribe\?s=sub-1&t=/);
  });

  it("marks a test send's unsubscribe link as a stand-in and sends no unsubscribe headers", () => {
    const email = issueEmail(content, null);
    expect(email.headers).toBeUndefined();
    expect(email.text).toContain("This is a test");
  });
});

describe("Resend events", () => {
  const sent: DeliveryState = { status: "sent", delivered_at: null, first_opened_at: null, first_clicked_at: null };
  const at = "2026-10-04T10:00:00Z";

  it("only handles the events the newsletter tracks", () => {
    expect(isTrackedEvent("email.opened")).toBe(true);
    expect(isTrackedEvent("email.sent")).toBe(false);
    expect(isTrackedEvent("contact.created")).toBe(false);
  });

  it("records delivery", () => {
    expect(deliveryChangesForEvent(sent, { type: "email.delivered", occurredAt: at })).toEqual({
      patch: { delivered_at: at, status: "delivered" },
      subscriberStatus: null,
    });
  });

  it("records only the first open and click, and treats them as proof of delivery", () => {
    const opened = deliveryChangesForEvent(sent, { type: "email.opened", occurredAt: at });
    expect(opened.patch).toEqual({ delivered_at: at, status: "delivered", first_opened_at: at });

    const again = deliveryChangesForEvent(
      { status: "delivered", delivered_at: at, first_opened_at: at, first_clicked_at: null },
      { type: "email.opened", occurredAt: "2026-10-05T10:00:00Z" },
    );
    expect(again.patch).toEqual({});

    const clicked = deliveryChangesForEvent(
      { status: "delivered", delivered_at: at, first_opened_at: at, first_clicked_at: null },
      { type: "email.clicked", occurredAt: at },
    );
    expect(clicked.patch).toEqual({ first_clicked_at: at });
  });

  it("stops emailing a subscriber after a permanent bounce or a spam complaint", () => {
    expect(deliveryChangesForEvent(sent, { type: "email.bounced", occurredAt: at, bounceType: "Permanent" })).toEqual({
      patch: { status: "bounced" },
      subscriberStatus: "bounced",
    });
    expect(deliveryChangesForEvent(sent, { type: "email.complained", occurredAt: at })).toEqual({
      patch: { status: "complained" },
      subscriberStatus: "complained",
    });
  });

  it("ignores a temporary bounce, which Resend retries", () => {
    expect(deliveryChangesForEvent(sent, { type: "email.bounced", occurredAt: at, bounceType: "Transient" })).toEqual({
      patch: {},
      subscriberStatus: null,
    });
  });
});
