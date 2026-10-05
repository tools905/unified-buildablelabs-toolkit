import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribe } from "@/lib/services/newsletter-subscriber-service";

// Two callers: mail apps' own unsubscribe button (RFC 8058 one-click, a POST with the body
// "List-Unsubscribe=One-Click") and the /newsletter/unsubscribe page. Both carry the signed
// subscriber id in the query string. There is deliberately no GET: a link scanner opening the
// URL must not unsubscribe anyone.

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const done = await unsubscribe(createAdminClient(), params.get("s") ?? "", params.get("t") ?? "");
    if (!done) return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
    return NextResponse.json({ status: "unsubscribed" });
  } catch (error) {
    console.error("Newsletter unsubscribe failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
