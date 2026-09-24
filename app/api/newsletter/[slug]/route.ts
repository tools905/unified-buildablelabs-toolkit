import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceByName } from "@/lib/services/workspace-service";
import { getAuthorsForPosts, getPublishedPostBySlug } from "@/lib/services/newsletter-service";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const workspace = await getWorkspaceByName(supabase, "BuildableLabs");
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const post = await getPublishedPostBySlug(supabase, workspace.id, slug);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const authors = await getAuthorsForPosts(supabase, post.author_ids ?? []);

  return NextResponse.json(
    {
      title: post.title,
      deck: post.deck,
      tag: post.tag,
      slug: post.slug,
      publishedAt: post.published_at,
      authors: authors.map((author: { full_name: string | null; email: string }) => author.full_name || author.email),
      bodyHtml: renderNewsletterMarkdown(post.body),
    },
    { headers: CORS_HEADERS },
  );
}
