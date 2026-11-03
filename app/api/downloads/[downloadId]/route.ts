import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { downloadLink } from "@/lib/services/download-service";

// Downloads a file from Settings → Downloads again: a redirect to a short-lived link to it.
export async function GET(_request: Request, { params }: { params: Promise<{ downloadId: string }> }) {
  const { downloadId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return new NextResponse("Please sign in again, then download.", { status: 401 });
  try {
    const url = await downloadLink(supabase, downloadId);
    if (!url) return new NextResponse("This file has expired or was deleted. Export it again to get a new copy.", { status: 410 });
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("download link failed", error);
    return new NextResponse("Couldn't prepare the download. Please try again.", { status: 500 });
  }
}
