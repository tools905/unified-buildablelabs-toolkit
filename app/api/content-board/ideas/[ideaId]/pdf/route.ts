import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { getIdeaPdfDownloadUrl, NothingToDownloadError } from "@/lib/services/content-export-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Building a PDF from many large files can take a little while.
export const maxDuration = 60;

// Downloads an idea's post as one PDF. The button is a plain link to this address, and the answer
// is a redirect to a signed file link that tells the browser to save the file. Following links is
// something every browser does, phones and in-app browsers included, unlike saving a file a script
// has fetched.
export async function GET(_request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  await requireEnabledTool("content-board");
  const { ideaId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return new NextResponse("Please sign in again, then try the download.", { status: 401 });

  try {
    const url = await getIdeaPdfDownloadUrl(supabase, ideaId);
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NothingToDownloadError) return new NextResponse(error.message, { status: 404 });
    console.error("content-board pdf export failed", error);
    return new NextResponse("Couldn't prepare the PDF. Please try again.", { status: 500 });
  }
}
