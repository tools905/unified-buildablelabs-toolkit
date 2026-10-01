import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorsForPosts, getPublicWorkspace, listPublishedPosts } from "@/lib/services/newsletter-service";
import { coverImagePayload } from "@/lib/utils/newsletter-cover";
import { PUBLIC_CORS_HEADERS, PUBLIC_FEED_CACHE_CONTROL, publicFeedHeaders } from "@/lib/utils/public-cache";

// Public, unauthenticated endpoint — the agency marketing site fetches this
// directly (same-origin in production via a Vercel rewrite, cross-origin in
// local dev), so it's served through the admin client, bypassing RLS.

function wordsPerMinuteReadTime(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const workspace = await getPublicWorkspace(supabase);
  if (!workspace) {
    // Not cached: if the workspace turns up a moment later the feed should recover at once.
    return NextResponse.json({ posts: [], totalPublished: 0 }, { headers: PUBLIC_CORS_HEADERS });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 20);

  const { posts, totalPublished } = await listPublishedPosts(supabase, workspace.id, limit);
  const authorIds = Array.from(new Set(posts.flatMap((post: { author_ids: string[] }) => post.author_ids ?? [])));
  const authors = await getAuthorsForPosts(supabase, authorIds);
  const authorsById = Object.fromEntries(
    authors.map((author: { id: string; full_name: string | null; email: string }) => [author.id, author]),
  );

  const payload = posts.map(
    (post: {
      title: string;
      deck: string | null;
      tag: string | null;
      cover_image_url: string | null;
      cover_brightness: number | null;
      cover_focus_x: number | null;
      cover_focus_y: number | null;
      cover_zoom: number | null;
      cover_tone: number | null;
      body: string;
      slug: string | null;
      author_ids: string[];
      published_at: string | null;
    }) => ({
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
      readMinutes: wordsPerMinuteReadTime(post.body),
      authors: post.author_ids
        .map((id) => authorsById[id]?.full_name || authorsById[id]?.email)
        .filter(Boolean),
    }),
  );

  return NextResponse.json({ posts: payload, totalPublished }, { headers: publicFeedHeaders(PUBLIC_FEED_CACHE_CONTROL) });
}
