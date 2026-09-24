import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceByName } from "@/lib/services/workspace-service";
import { listPublishedPosts, getAuthorsForPosts } from "@/lib/services/newsletter-service";

// Public, unauthenticated endpoint — the agency marketing site fetches this
// directly (same-origin in production via a Vercel rewrite, cross-origin in
// local dev), so it's served through the admin client, bypassing RLS.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function wordsPerMinuteReadTime(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const workspace = await getWorkspaceByName(supabase, "BuildableLabs");
  if (!workspace) {
    return NextResponse.json({ posts: [], totalPublished: 0 }, { headers: CORS_HEADERS });
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
      readMinutes: wordsPerMinuteReadTime(post.body),
      authors: post.author_ids
        .map((id) => authorsById[id]?.full_name || authorsById[id]?.email)
        .filter(Boolean),
    }),
  );

  return NextResponse.json({ posts: payload, totalPublished }, { headers: CORS_HEADERS });
}
