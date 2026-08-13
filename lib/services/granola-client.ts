import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const GRANOLA_API_BASE = "https://public-api.granola.ai/v1";
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type GranolaUser = {
  name: string | null;
  email: string;
};

export type GranolaCalendarEvent = {
  event_title: string | null;
  invitees: GranolaUser[];
  organiser: string | null;
  calendar_event_id: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
};

export type GranolaNote = {
  id: string;
  object: "note";
  title: string | null;
  owner: GranolaUser;
  created_at: string;
  updated_at: string;
  web_url: string;
  calendar_event: GranolaCalendarEvent | null;
  attendees: GranolaUser[];
  summary_text: string;
  summary_markdown: string | null;
};

/**
 * Fetches a single note (with its calendar event + summary) from Granola's
 * public API. Notes only exist here once Granola has generated a summary —
 * there is no "upcoming meeting" endpoint.
 */
export async function fetchGranolaNote(noteId: string): Promise<GranolaNote> {
  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) {
    throw new Error("GRANOLA_API_KEY is not configured.");
  }

  const response = await fetch(`${GRANOLA_API_BASE}/notes/${noteId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable>");
    console.error("[granola-client] fetchGranolaNote failed", {
      noteId,
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
    });
    throw new Error(`Granola API error fetching note ${noteId}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Verifies a Granola webhook delivery per the Standard Webhooks spec
 * (https://www.standardwebhooks.com/) — HMAC-SHA256 over
 * "{id}.{timestamp}.{rawBody}", keyed by the base64-decoded signing secret
 * (after stripping its "whsec_" prefix). Granola's docs confirm this scheme
 * but don't restate the algorithm, so this follows the public standard.
 */
export function verifyGranolaWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): boolean {
  const LOG_PREFIX = "[granola-webhook-signature]";
  const secret = process.env.GRANOLA_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} rejected: GRANOLA_WEBHOOK_SIGNING_SECRET is not configured`);
    return false;
  }
  if (!headers.id || !headers.timestamp || !headers.signature) {
    console.error(`${LOG_PREFIX} rejected: missing webhook-id/timestamp/signature header`, headers);
    return false;
  }

  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    console.error(`${LOG_PREFIX} rejected: non-numeric webhook-timestamp`, { timestamp: headers.timestamp });
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const driftSeconds = Math.abs(nowSeconds - timestampSeconds);
  if (driftSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    console.error(`${LOG_PREFIX} rejected: timestamp outside tolerance`, { driftSeconds, toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS });
    return false;
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuffer = Buffer.from(expected);

  const matched = headers.signature.split(" ").some((candidate) => {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) return false;
    const candidateBuffer = Buffer.from(value);
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  });
  if (!matched) {
    console.error(`${LOG_PREFIX} rejected: no signature candidate matched expected HMAC`, {
      receivedSignature: headers.signature,
    });
  }
  return matched;
}
