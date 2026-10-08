import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { getIdeaPdfDownloadUrl, NothingToDownloadError } from "@/lib/services/content-export-service";
import { getMarkupReview } from "@/lib/services/content-markup-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Building a PDF from many large files can take a little while.
export const maxDuration = 60;

// Downloads an idea's post as one PDF. The button is a plain link to this address, and the answer
// is a redirect to a signed file link that tells the browser to save the file. Following links is
// something every browser does, phones and in-app browsers included, unlike saving a file a script
// has fetched.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `?files=<id>,<id>` picks the draft to download (the one on screen); without it, the latest draft.
// `?review=<id>` downloads a Pencil review: its draft with the marks drawn on.
export async function GET(request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  await requireEnabledTool("content-board");
  const { ideaId } = await params;
  const { supabase, user } = await getUserSession();
  if (!user) return new NextResponse("Please sign in again, then try the download.", { status: 401 });

  try {
    const fileIds = (new URL(request.url).searchParams.get("files") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => UUID.test(value))
      .slice(0, 50);
    const reviewId = new URL(request.url).searchParams.get("review") ?? "";
    const review = UUID.test(reviewId) ? await getMarkupReview(supabase, reviewId) : null;
    if (UUID.test(reviewId) && (!review || review.ideaId !== ideaId)) {
      return new NextResponse("This review no longer exists.", { status: 404 });
    }
    const url = await getIdeaPdfDownloadUrl(supabase, ideaId, fileIds, review);
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NothingToDownloadError) return new NextResponse(error.message, { status: 404 });
    console.error("content-board pdf export failed", error);
    return new NextResponse("Couldn't prepare the PDF. Please try again.", { status: 500 });
  }
}
