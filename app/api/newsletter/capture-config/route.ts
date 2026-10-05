import { NextResponse } from "next/server";
import { DEFAULT_CAPTURE_CONFIG } from "@/lib/utils/newsletter-capture-config";
import { CAPTURE_CONFIG_CACHE_CONTROL, PUBLIC_CORS_HEADERS, publicFeedHeaders } from "@/lib/utils/public-cache";

// Public, unauthenticated: the website reads what each newsletter capture point says and when
// it appears. If this request fails, the website falls back to its own copy of the defaults.

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(DEFAULT_CAPTURE_CONFIG, { headers: publicFeedHeaders(CAPTURE_CONFIG_CACHE_CONTROL) });
}
