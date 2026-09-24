import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import {
  updateNewsletterPostSchema,
  type UpdateNewsletterPostInput,
} from "@/lib/validation/newsletter-schema";

export const NEWSLETTER_POST_SELECT = "*";

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "issue";
}

export async function createDraft(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("newsletter_posts")
    .insert({
      workspace_id: workspaceId,
      title: "",
      body: "",
      author_ids: [userId],
      status: "draft",
      created_by: userId,
    })
    .select(NEWSLETTER_POST_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: userId,
    action: "newsletter_post.created",
    entityType: "newsletter_post",
    entityId: data.id,
  });

  return data;
}

export async function getPost(supabase: SupabaseClient<any>, postId: string) {
  const { data, error } = await supabase
    .from("newsletter_posts")
    .select(NEWSLETTER_POST_SELECT)
    .eq("id", postId)
    .single();
  if (error) throw error;
  return data;
}

export async function listPosts(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase
    .from("newsletter_posts")
    .select(NEWSLETTER_POST_SELECT)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAuthorsForPosts(
  supabase: SupabaseClient<any>,
  authorIds: string[],
) {
  if (authorIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", authorIds);
  if (error) throw error;
  return data ?? [];
}

export async function updatePost(
  supabase: SupabaseClient<any>,
  postId: string,
  rawInput: UpdateNewsletterPostInput,
) {
  const input = updateNewsletterPostSchema.parse(rawInput);

  const { data, error } = await supabase
    .from("newsletter_posts")
    .update({
      title: input.title,
      deck: input.deck || null,
      tag: input.tag || null,
      body: input.body,
      author_ids: input.authorIds,
    })
    .eq("id", postId)
    .select(NEWSLETTER_POST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function publishPost(
  supabase: SupabaseClient<any>,
  postId: string,
  workspaceId: string,
  actorId: string,
) {
  const post = await getPost(supabase, postId);

  let slug = slugify(post.title);
  let suffix = 2;
  // Ensure the slug is unique within the workspace before we commit to it.
  while (true) {
    const { data: existing, error } = await supabase
      .from("newsletter_posts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", slug)
      .neq("id", postId)
      .maybeSingle();
    if (error) throw error;
    if (!existing) break;
    slug = `${slugify(post.title)}-${suffix}`;
    suffix += 1;
  }

  const { data, error } = await supabase
    .from("newsletter_posts")
    .update({ status: "published", slug, published_at: new Date().toISOString() })
    .eq("id", postId)
    .select(NEWSLETTER_POST_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "newsletter_post.published",
    entityType: "newsletter_post",
    entityId: postId,
  });

  return data;
}

export async function deletePost(supabase: SupabaseClient<any>, postId: string) {
  const { error } = await supabase.from("newsletter_posts").delete().eq("id", postId);
  if (error) throw error;
}

// Public-facing reads/writes below run through the service-role client from
// an unauthenticated API route — never exposed to the browser's own client.

export async function listPublishedPosts(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  limit = 8,
) {
  const { data, error, count } = await supabase
    .from("newsletter_posts")
    .select(NEWSLETTER_POST_SELECT, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { posts: data ?? [], totalPublished: count ?? 0 };
}

export async function getPublishedPostBySlug(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  slug: string,
) {
  const { data, error } = await supabase
    .from("newsletter_posts")
    .select(NEWSLETTER_POST_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function addSubscriber(supabase: SupabaseClient<any>, email: string) {
  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert({ email: email.toLowerCase().trim() }, { onConflict: "email", ignoreDuplicates: true });
  if (error) throw error;
}
