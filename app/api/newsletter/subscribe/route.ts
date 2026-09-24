import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { addSubscriber } from "@/lib/services/newsletter-service";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const subscribeSchema = z.object({ email: z.string().email() });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createAdminClient();
  await addSubscriber(supabase, parsed.data.email);

  return NextResponse.json({ status: "subscribed" }, { headers: CORS_HEADERS });
}
