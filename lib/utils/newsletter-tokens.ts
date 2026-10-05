import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// A confirmation link carries a random token; only its hash is stored, so a leaked database
// row cannot be turned back into a working link.
export const CONFIRM_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createConfirmToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

function newsletterSecret(secret = process.env.NEWSLETTER_TOKEN_SECRET) {
  if (!secret) throw new Error("NEWSLETTER_TOKEN_SECRET is not configured.");
  return secret;
}

// Unsubscribe links must keep working for as long as someone has an old email, so they are
// signed instead of stored: the signature proves the link came from us and never expires.
export function signSubscriberId(subscriberId: string, secret?: string) {
  return createHmac("sha256", newsletterSecret(secret)).update(`unsubscribe:${subscriberId}`).digest("base64url");
}

export function verifySubscriberSignature(subscriberId: string, signature: string, secret?: string) {
  const expected = Buffer.from(signSubscriberId(subscriberId, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Rate-limit buckets are keyed by a keyed hash, so neither IP addresses nor email addresses
// are written to the rate-limit table.
export function rateLimitBucket(kind: string, value: string, secret?: string) {
  const digest = createHmac("sha256", newsletterSecret(secret)).update(`${kind}:${value}`).digest("hex");
  return `${kind}:${digest.slice(0, 32)}`;
}
