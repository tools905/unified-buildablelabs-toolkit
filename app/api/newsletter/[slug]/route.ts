import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorsForPosts, getPublicWorkspace, getPublishedPostBySlug } from "@/lib/services/newsletter-service";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";
import { coverImagePayload } from "@/lib/utils/newsletter-cover";
import {
  PUBLIC_CORS_HEADERS,
  PUBLIC_FEED_CACHE_CONTROL,
  PUBLIC_NOT_FOUND_CACHE_CONTROL,
  publicFeedHeaders,
} from "@/lib/utils/public-cache";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const workspace = await getPublicWorkspace(supabase);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PUBLIC_CORS_HEADERS });
  }

  const post = await getPublishedPostBySlug(supabase, workspace.id, slug);
  if (!post) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: publicFeedHeaders(PUBLIC_NOT_FOUND_CACHE_CONTROL) },
    );
  }

  const authors = await getAuthorsForPosts(supabase, post.author_ids ?? []);

  return NextResponse.json(
    {
      title: post.title,
      deck: post.deck,
      tag: post.tag,
      slug: post.slug,
      publishedAt: post.published_at,
      coverImage: coverImagePayload(post.cover_image_url, post.cover_brightness, {
        focusX: post.cover_focus_x ?? 50,
        focusY: post.cover_focus_y ?? 50,
        zoom: Number(post.cover_zoom ?? 1),
        tone: post.cover_tone,
      }),
      authors: authors.map((author: { full_name: string | null; email: string }) => author.full_name || author.email),
      bodyHtml: renderNewsletterMarkdown(post.body),
    },
    { headers: publicFeedHeaders(PUBLIC_FEED_CACHE_CONTROL) },
  );
}
