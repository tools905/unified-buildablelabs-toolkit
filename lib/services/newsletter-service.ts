import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { getWorkspaceByName } from "@/lib/services/workspace-service";
import {
  updateNewsletterPostSchema,
  type UpdateNewsletterPostInput,
} from "@/lib/validation/newsletter-schema";
import {
  coverCardUrl,
  isOwnNewsletterImageUrl,
  NEWSLETTER_BUCKET,
  newsletterImagePath,
  unusedNewsletterFiles,
} from "@/lib/utils/newsletter-cover";
import {
  isBlankNewsletterContent,
  newsletterVersionReferences,
  pickNewsletterContent,
  sameNewsletterContent,
  startsNewSession,
  type NewsletterVersionKind,
} from "@/lib/utils/newsletter-versions";

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

// The public feed always reads the agency's workspace, which never changes while the app runs.
// Remember it for a while instead of looking it up on every visit (one database trip saved).
const PUBLIC_WORKSPACE_TTL_MS = 10 * 60_000;
let publicWorkspace: { value: Awaited<ReturnType<typeof getWorkspaceByName>>; at: number } | null = null;

export async function getPublicWorkspace(supabase: SupabaseClient<any>, now = Date.now()) {
  if (publicWorkspace && now - publicWorkspace.at < PUBLIC_WORKSPACE_TTL_MS) return publicWorkspace.value;
  const workspace = await getWorkspaceByName(supabase, "BuildableLabs");
  // A missing workspace is not remembered, so the feed recovers as soon as it exists.
  if (workspace) publicWorkspace = { value: workspace, at: now };
  return workspace;
}

export function resetPublicWorkspaceCache() {
  publicWorkspace = null;
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

// True when a save changes the Medium/Substack details (tags, original link) of a post.
export function changesCapsuleDetails(
  previous: { tags?: string[] | null; original_url?: string | null },
  patch: { tags?: string[]; original_url?: string | null },
) {
  const tagsChanged =
    patch.tags !== undefined &&
    (patch.tags.length !== (previous.tags ?? []).length || patch.tags.some((tag, i) => tag !== (previous.tags ?? [])[i]));
  const linkChanged = patch.original_url !== undefined && (patch.original_url ?? null) !== (previous.original_url ?? null);
  return tagsChanged || linkChanged;
}

export async function updatePost(
  supabase: SupabaseClient<any>,
  postId: string,
  rawInput: UpdateNewsletterPostInput,
  actorId: string,
) {
  const input = updateNewsletterPostSchema.parse(rawInput);

  if (input.coverImageUrl && !isOwnNewsletterImageUrl(input.coverImageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", postId)) {
    throw new Error("The preview image must be uploaded from the editor.");
  }

  const patch = {
    title: input.title,
    deck: input.deck || null,
    tag: input.tag || null,
    body: input.body,
    author_ids: input.authorIds,
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.originalUrl !== undefined ? { original_url: input.originalUrl } : {}),
    ...(input.coverImageUrl !== undefined
      ? {
          cover_image_url: input.coverImageUrl,
          cover_brightness: input.coverImageUrl ? (input.coverBrightness ?? null) : null,
          // A removed or replaced image starts again from a centred, unzoomed frame.
          ...(input.coverImageUrl
            ? {}
            : { cover_focus_x: 50, cover_focus_y: 50, cover_zoom: 1, cover_tone: null }),
        }
      : {}),
    ...(input.coverImageUrl
      ? {
          ...(input.coverFocusX !== undefined ? { cover_focus_x: input.coverFocusX } : {}),
          ...(input.coverFocusY !== undefined ? { cover_focus_y: input.coverFocusY } : {}),
          ...(input.coverZoom !== undefined ? { cover_zoom: input.coverZoom } : {}),
          ...(input.coverTone !== undefined ? { cover_tone: input.coverTone } : {}),
        }
      : {}),
  };

  const previous = await getPost(supabase, postId);
  const before = pickNewsletterContent(previous);
  const contentSame = sameNewsletterContent(before, pickNewsletterContent({ ...previous, ...patch }));
  // Tags and the original link aren't part of what a reader sees, so they aren't versioned, but a change
  // to them is still a change that has to be saved.
  const detailsChanged = changesCapsuleDetails(previous, patch);
  // Opening the editor saves once without any change; that must not count as an edit.
  if (contentSame && !detailsChanged) return previous;

  if (!contentSame && startsNewSession(previous, actorId) && !isBlankNewsletterContent(before)) {
    await keepSessionVersion(supabase, previous, actorId);
  }

  const { data, error } = await supabase
    .from("newsletter_posts")
    .update({ ...patch, updated_by: actorId })
    .eq("id", postId)
    .select(NEWSLETTER_POST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// These are API routes next to /api/newsletter/[slug], which would hide a post with that slug.
const RESERVED_SLUGS = new Set(["subscribe", "confirm", "unsubscribe", "capture-config"]);

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
    if (!existing && !RESERVED_SLUGS.has(slug)) break;
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

  await insertVersion(supabase, data, "published", actorId);
  await removeUnusedImages(supabase, workspaceId, postId, data.body ?? "", data.cover_image_url);

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "newsletter_post.published",
    entityType: "newsletter_post",
    entityId: postId,
  });

  return data;
}

// Best effort: images uploaded for a post but later cut from the story are deleted when it
// is published, unless an earlier version still shows them. A leftover file is harmless, so
// this never fails the publish.
export async function removeUnusedImages(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  postId: string,
  body: string,
  coverUrl: string | null,
) {
  try {
    const folder = `${workspaceId}/${postId}`;
    const { data: files } = await supabase.storage.from(NEWSLETTER_BUCKET).list(folder);
    const kept = `${body}
${await versionReferences(supabase, postId)}`;
    const unused = unusedNewsletterFiles((files ?? []).map((file) => file.name), kept, coverUrl);
    if (unused.length) await supabase.storage.from(NEWSLETTER_BUCKET).remove(unused.map((name) => `${folder}/${name}`));
    return unused.length;
  } catch {
    return 0;
  }
}

export async function deletePost(supabase: SupabaseClient<any>, postId: string) {
  const { data: post } = await supabase.from("newsletter_posts").select("workspace_id").eq("id", postId).maybeSingle();

  const { error } = await supabase.from("newsletter_posts").delete().eq("id", postId);
  if (error) throw error;

  // Best effort: the post is already gone, so a leftover file must not fail the delete.
  if (post?.workspace_id) {
    const folder = `${post.workspace_id}/${postId}`;
    const { data: files } = await supabase.storage.from(NEWSLETTER_BUCKET).list(folder);
    const paths = (files ?? []).map((file) => `${folder}/${file.name}`);
    if (paths.length) await supabase.storage.from(NEWSLETTER_BUCKET).remove(paths);
  }
}

// --- Version history -------------------------------------------------------------------

async function insertVersion(
  supabase: SupabaseClient<any>,
  post: Record<string, any>,
  kind: NewsletterVersionKind,
  actorId: string,
  extra: { createdAt?: string } = {},
) {
  const { data, error } = await supabase
    .from("newsletter_post_versions")
    .insert({
      ...pickNewsletterContent(post),
      post_id: post.id,
      workspace_id: post.workspace_id,
      kind,
      edited_by: post.updated_by ?? post.created_by,
      created_by: actorId,
      ...(extra.createdAt ? { created_at: extra.createdAt } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Safety net for when leaving the editor could not keep a version (a crashed browser, a lost
// connection): the next save after a long pause, or by someone else, keeps the post as it
// stood before, unless the newest version already holds exactly that.
async function keepSessionVersion(supabase: SupabaseClient<any>, post: Record<string, any>, actorId: string) {
  const latest = await latestVersion(supabase, post.id);
  if (latest && sameNewsletterContent(pickNewsletterContent(latest), pickNewsletterContent(post))) return;

  try {
    // Stamped with the time of the last save, so the history shows when this text was written.
    await insertVersion(supabase, post, "session", actorId, { createdAt: post.updated_at });
  } catch (insertError) {
    // Another save at the same moment already kept this copy.
    if ((insertError as { code?: string }).code !== "23505") throw insertError;
  }
}

async function latestVersion(supabase: SupabaseClient<any>, postId: string) {
  const { data, error } = await supabase
    .from("newsletter_post_versions")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function versionReferences(supabase: SupabaseClient<any>, postId: string) {
  const { data } = await supabase
    .from("newsletter_post_versions")
    .select("body, cover_image_url")
    .eq("post_id", postId);
  return newsletterVersionReferences(data ?? []);
}

export async function listVersions(supabase: SupabaseClient<any>, postId: string) {
  const { data, error } = await supabase
    .from("newsletter_post_versions")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Called when someone leaves the editor after changing the post: saves their last edits and
// keeps the post as they left it, unless the newest version already holds exactly that.
export async function keepVersionOnLeave(
  supabase: SupabaseClient<any>,
  postId: string,
  rawInput: UpdateNewsletterPostInput,
  actorId: string,
) {
  const post = await updatePost(supabase, postId, rawInput, actorId);
  if (isBlankNewsletterContent(pickNewsletterContent(post))) return;

  const latest = await latestVersion(supabase, postId);
  if (latest && sameNewsletterContent(pickNewsletterContent(latest), pickNewsletterContent(post))) return;
  await insertVersion(supabase, post, "session", actorId);
}

// Deletes images the editor dropped from a post, but only those that neither the post nor
// any of its versions still use. Best effort: a leftover file is harmless.
export async function removeStaleImages(supabase: SupabaseClient<any>, postId: string, urls: string[]) {
  try {
    const post = await getPost(supabase, postId);
    const inUse = `${post.body ?? ""}\n${post.cover_image_url ?? ""}\n${await versionReferences(supabase, postId)}`;
    const paths = urls
      // A dropped cover takes its small card copy with it.
      .flatMap((url) => [url, coverCardUrl(url)])
      .map((url) => (url ? newsletterImagePath(url) : null))
      .filter((path): path is string => !!path && path.startsWith(`${post.workspace_id}/${postId}/`))
      .filter((path) => !inUse.includes(path.split("/").pop() ?? path));
    if (paths.length) await supabase.storage.from(NEWSLETTER_BUCKET).remove(paths);
  } catch {
    // Ignored on purpose.
  }
}

// Public-facing reads/writes below run through the service-role client from
// an unauthenticated API route — never exposed to the browser's own client.

// Only what the website's cards show. The story text is left out on purpose: it is by far the
// largest column, and the cards need just its word count (kept by Postgres in body_word_count).
export const PUBLIC_POST_CARD_SELECT = [
  "id",
  "title",
  "deck",
  "tag",
  "slug",
  "published_at",
  "author_ids",
  "cover_image_url",
  "cover_brightness",
  "cover_focus_x",
  "cover_focus_y",
  "cover_zoom",
  "cover_tone",
  "body_word_count",
].join(", ");

// Used until migration 048 (body_word_count) has been applied: the same columns, with the
// story text in place of the count so the reading time can still be worked out.
export const PUBLIC_POST_CARD_SELECT_WITH_BODY = PUBLIC_POST_CARD_SELECT.replace("body_word_count", "body");

// Postgres: the column named in the query does not exist.
const UNDEFINED_COLUMN = "42703";

export type PublicPostCard = {
  id: string;
  title: string;
  deck: string | null;
  tag: string | null;
  slug: string | null;
  published_at: string | null;
  author_ids: string[];
  cover_image_url: string | null;
  cover_brightness: number | null;
  cover_focus_x: number | null;
  cover_focus_y: number | null;
  cover_zoom: number | string | null;
  cover_tone: number | null;
  // One of the two is present: the count once migration 048 is applied, the text before that.
  body_word_count?: number | null;
  body?: string | null;
};

export async function listPublishedPosts(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  limit = 8,
) {
  const query = (select: string) =>
    supabase
      .from("newsletter_posts")
      .select(select, { count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit);

  let { data, error, count } = await query(PUBLIC_POST_CARD_SELECT);
  if (error?.code === UNDEFINED_COLUMN) {
    ({ data, error, count } = await query(PUBLIC_POST_CARD_SELECT_WITH_BODY));
  }
  if (error) throw error;
  return { posts: (data ?? []) as unknown as PublicPostCard[], totalPublished: count ?? 0 };
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

// Subscriber signups, confirmation and unsubscribing live in newsletter-subscriber-service.ts.
