import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscribe } from "@/lib/services/newsletter-subscriber-service";
import {
  clientIp,
  isHoneypotFilled,
  isValidEmail,
  normalizeEmail,
  subscribeCorsHeaders,
  subscribeRequestSchema,
} from "@/lib/utils/newsletter-subscription";

// Public, unauthenticated endpoint used by every capture point on the website (homepage CTA
// block, side rail, in-article prompt, popup). Signups are double opt-in: a valid email always
// gets the same "pending" answer, so the form never reveals who is already subscribed.

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: subscribeCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const headers = subscribeCorsHeaders(request.headers.get("origin"));
  const body = await request.json().catch(() => null);
  const parsed = subscribeRequestSchema.safeParse(body);
  const email = parsed.success ? normalizeEmail(parsed.data.email) : "";
  if (!parsed.success || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400, headers });
  }

  // Bots that fill the hidden field are told it worked, and nothing is stored or sent.
  if (isHoneypotFilled(parsed.data)) return NextResponse.json({ status: "pending" }, { headers });

  try {
    const result = await subscribe(createAdminClient(), {
      email,
      source: parsed.data.source ?? "unknown",
      sourcePath: parsed.data.sourcePath ?? null,
      postSlug: parsed.data.postSlug ?? null,
      consentVersion: parsed.data.consentVersion ?? null,
      ip: clientIp(request.headers),
    });
    if (result.status === "rate_limited") {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { ...headers, "Retry-After": "600" } },
      );
    }
    return NextResponse.json({ status: "pending" }, { headers });
  } catch (error) {
    console.error("Newsletter subscribe failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers });
  }
}
