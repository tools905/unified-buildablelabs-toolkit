import { getAppLink } from "@/lib/utils/app-url";
import { signSubscriberId } from "@/lib/utils/newsletter-tokens";

export type NewsletterEmail = {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const BRAND = "Buildable Labs";
// The website's brand blue: readers meet these emails next to the website, not the toolkit.
const ACCENT = "#0b3fde";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function confirmLink(token: string) {
  return getAppLink(`/newsletter/confirm?token=${encodeURIComponent(token)}`);
}

function unsubscribeQuery(subscriberId: string) {
  return `s=${encodeURIComponent(subscriberId)}&t=${encodeURIComponent(signSubscriberId(subscriberId))}`;
}

// The page asks the reader to press a button, so a link scanner opening it unsubscribes no one.
export function unsubscribePageLink(subscriberId: string) {
  return getAppLink(`/newsletter/unsubscribe?${unsubscribeQuery(subscriberId)}`);
}

// Mail apps (Gmail, Outlook, Apple Mail) POST here directly from their own unsubscribe button.
export function unsubscribeApiLink(subscriberId: string) {
  return getAppLink(`/api/newsletter/unsubscribe?${unsubscribeQuery(subscriberId)}`);
}

// RFC 8058 one-click unsubscribe, required by Gmail and Yahoo for bulk senders.
export function unsubscribeHeaders(subscriberId: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeApiLink(subscriberId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="background:${ACCENT};border-radius:6px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-weight:600;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px">${escapeHtml(label)}</a></td></tr></table>`;
}

function layout(input: { preheader: string; bodyHtml: string; footerHtml: string }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:28px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111111">${BRAND}</td></tr>
<tr><td style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#222222">${input.bodyHtml}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#777777">${input.footerHtml}</td></tr></table>
</td></tr></table>
</body>
</html>`;
}

// A test send has no subscriber, so its unsubscribe link is only a stand-in.
function marketingFooter(subscriberId: string | null) {
  const link = subscriberId ? unsubscribePageLink(subscriberId) : getAppLink("/newsletter/unsubscribe");
  const testNote = subscriberId ? "" : " (This is a test: the link works only in the real issue.)";
  return {
    html: `You're receiving this because you subscribed to the ${BRAND} newsletter.<br><a href="${escapeHtml(link)}" style="color:#777777">Unsubscribe</a> at any time.${testNote}`,
    text: `You're receiving this because you subscribed to the ${BRAND} newsletter.\nUnsubscribe at any time: ${link}${testNote}`,
  };
}

export function confirmationEmail(input: { token: string }): NewsletterEmail {
  const link = confirmLink(input.token);
  const subject = `Confirm your subscription to the ${BRAND} newsletter`;
  const bodyHtml = [
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;margin:16px 0 8px;color:#111111">One click and you're in</h1>`,
    `<p style="margin:0 0 12px">Someone (hopefully you) asked to get the ${BRAND} newsletter: two short issues a week, written for founders.</p>`,
    `<p style="margin:0">Confirm your email address to start receiving it.</p>`,
    button(link, "Confirm subscription"),
    `<p style="margin:0;font-size:14px;color:#555555">This link expires in 7 days. If you didn't sign up, ignore this email and you won't hear from us.</p>`,
  ].join("");
  return {
    subject,
    html: layout({ preheader: "Confirm your email to start receiving the newsletter.", bodyHtml, footerHtml: `${BRAND}` }),
    text: [
      "One click and you're in",
      "",
      `Someone (hopefully you) asked to get the ${BRAND} newsletter: two short issues a week, written for founders.`,
      "Confirm your email address to start receiving it:",
      link,
      "",
      "This link expires in 7 days. If you didn't sign up, ignore this email and you won't hear from us.",
    ].join("\n"),
  };
}

// Sent once someone confirms. A later step replaces this with the lead magnet email (and keeps
// it as the fallback when no lead magnet is set up), with its copy editable in Settings.
export function welcomeEmail(input: { subscriberId: string }): NewsletterEmail {
  const footer = marketingFooter(input.subscriberId);
  const subject = `You're in: welcome to the ${BRAND} newsletter`;
  const bodyHtml = [
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;margin:16px 0 8px;color:#111111">You're on the list</h1>`,
    `<p style="margin:0 0 12px">Thanks for confirming. Twice a week you'll get a short, practical issue for founders from the ${BRAND} team.</p>`,
    `<p style="margin:0">If it ever stops being useful, you can unsubscribe with one click below.</p>`,
  ].join("");
  return {
    subject,
    html: layout({ preheader: "Thanks for confirming your subscription.", bodyHtml, footerHtml: footer.html }),
    text: [
      "You're on the list",
      "",
      `Thanks for confirming. Twice a week you'll get a short, practical issue for founders from the ${BRAND} team.`,
      "If it ever stops being useful, you can unsubscribe with one click below.",
      "",
      footer.text,
    ].join("\n"),
    headers: unsubscribeHeaders(input.subscriberId),
  };
}

export type IssueEmailContent = {
  subject: string;
  previewText: string | null;
  title: string;
  deck: string | null;
  tag: string | null;
  coverImageUrl: string | null;
  excerpt: string[];
  authors: string[];
  url: string;
};

// A Times issue as a teaser: cover, title, deck and the opening paragraphs, then a link to read
// the rest on the website. `subscriberId` is null for a test send.
export function issueEmail(content: IssueEmailContent, subscriberId: string | null): NewsletterEmail {
  const footer = marketingFooter(subscriberId);
  const byline = content.authors.length ? `By ${content.authors.join(", ")}` : "";
  const bodyHtml = [
    content.coverImageUrl
      ? `<img src="${escapeHtml(content.coverImageUrl)}" width="496" alt="" style="display:block;width:100%;max-width:496px;height:auto;border:0;margin:20px 0 4px">`
      : "",
    content.tag
      ? `<p style="margin:20px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${ACCENT}">${escapeHtml(content.tag)}</p>`
      : "",
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;margin:${content.tag ? "0" : "20px"} 0 8px;color:#111111">${escapeHtml(content.title)}</h1>`,
    content.deck
      ? `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:17px;line-height:1.5;color:#555555">${escapeHtml(content.deck)}</p>`
      : "",
    ...content.excerpt.map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph)}</p>`),
    button(content.url, "Read the full issue →"),
    byline ? `<p style="margin:0;font-size:13px;color:#777777">${escapeHtml(byline)}</p>` : "",
  ].join("");

  return {
    subject: content.subject,
    html: layout({ preheader: content.previewText || content.deck || "", bodyHtml, footerHtml: footer.html }),
    text: [
      content.tag ? content.tag.toUpperCase() : "",
      content.title,
      content.deck ?? "",
      "",
      ...content.excerpt,
      "",
      `Read the full issue: ${content.url}`,
      byline,
      "",
      footer.text,
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n")
      .trim(),
    headers: subscriberId ? unsubscribeHeaders(subscriberId) : undefined,
  };
}
