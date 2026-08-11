import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyGranolaWebhookSignature } from "@/lib/services/granola-client";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function sign(id: string, timestamp: string, body: string) {
  const secretBytes = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  return `v1,${createHmac("sha256", secretBytes).update(signedContent).digest("base64")}`;
}

describe("verifyGranolaWebhookSignature", () => {
  beforeEach(() => {
    process.env.GRANOLA_WEBHOOK_SIGNING_SECRET = SECRET;
  });

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ type: "note.generated", data: { id: "not_abc123" } });
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, body);

    expect(verifyGranolaWebhookSignature(body, { id, timestamp, signature })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ type: "note.generated", data: { id: "not_abc123" } });
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, body);

    const tamperedBody = JSON.stringify({ type: "note.generated", data: { id: "not_evil" } });
    expect(verifyGranolaWebhookSignature(tamperedBody, { id, timestamp, signature })).toBe(false);
  });

  it("rejects an expired timestamp", () => {
    const body = JSON.stringify({ type: "note.generated", data: { id: "not_abc123" } });
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const signature = sign(id, timestamp, body);

    expect(verifyGranolaWebhookSignature(body, { id, timestamp, signature })).toBe(false);
  });

  it("rejects when the signing secret isn't configured", () => {
    delete process.env.GRANOLA_WEBHOOK_SIGNING_SECRET;
    const body = "{}";
    expect(verifyGranolaWebhookSignature(body, { id: "msg_1", timestamp: "123", signature: "v1,abc" })).toBe(false);
  });

  it("rejects missing headers", () => {
    const body = "{}";
    expect(verifyGranolaWebhookSignature(body, { id: null, timestamp: "123", signature: "v1,abc" })).toBe(false);
  });
});
