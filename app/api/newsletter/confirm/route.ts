import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmSubscription } from "@/lib/services/newsletter-subscriber-service";

// Called by the /newsletter/confirm page from the reader's browser, never on a plain GET, so
// email security scanners that open links ahead of the reader do not confirm anyone.

const confirmSchema = z.object({ token: z.string().min(1).max(200) });

const STATUS_BY_OUTCOME = { confirmed: 200, expired: 410, invalid: 404 } as const;

export async function POST(request: Request) {
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "invalid" }, { status: 404 });

  try {
    const outcome = await confirmSubscription(createAdminClient(), parsed.data.token);
    return NextResponse.json({ status: outcome }, { status: STATUS_BY_OUTCOME[outcome] });
  } catch (error) {
    console.error("Newsletter confirm failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
