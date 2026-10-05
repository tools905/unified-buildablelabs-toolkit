import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { getPost } from "@/lib/services/newsletter-service";
import { adapters } from "@/lib/capsule/adapters";
import { toDraft } from "@/lib/capsule/draft";
import { parseLiveUrl } from "@/lib/capsule/live-url";
import { draftVersion } from "@/lib/capsule/version";
import {
  draftIdSchema,
  markAtomOpenedSchema,
  markAtomPostedSchema,
} from "@/lib/validation/newsletter-capsule-schema";
import type { Atom, Capsule, CapsulePlatform, CapsuleWarning, Draft } from "@/lib/capsule/types";

// Capsule publishing on the server: sealing a saved newsletter post into a Medium and a Substack
// version, and recording what the writer reports doing with each (see lib/capsule/types.ts).

const PLATFORMS: CapsulePlatform[] = ["medium", "substack"];
const HISTORY_LIMIT = 50;

export type CapsuleAtomRow = {
  capsule_id: string;
  platform: CapsulePlatform;
  html: string;
  title: string;
  subtitle: string;
  tags: string[] | null;
  warnings: CapsuleWarning[] | null;
  status: Atom["status"];
  platform_url: string | null;
  opened_at: string | null;
  posted_at: string | null;
};

export type CapsuleRow = {
  id: string;
  post_id: string;
  draft_version: string;
  canonical_url: string;
  sealed_at: string;
  newsletter_capsule_atoms: CapsuleAtomRow[] | null;
};

const ATOM_SELECT = "capsule_id, platform, html, title, subtitle, tags, warnings, status, platform_url, opened_at, posted_at";
const CAPSULE_SELECT = `id, post_id, draft_version, canonical_url, sealed_at, newsletter_capsule_atoms(${ATOM_SELECT})`;

// A problem the writer can act on. The endpoints show its message as it is.
export class CapsuleError extends Error {}

export function atomFromRow(row: CapsuleAtomRow): Atom {
  return {
    platform: row.platform,
    html: row.html,
    title: row.title,
    subtitle: row.subtitle,
    tags: row.tags ?? [],
    warnings: row.warnings ?? [],
    status: row.status,
    ...(row.platform_url ? { platformUrl: row.platform_url } : {}),
    ...(row.opened_at ? { openedAt: row.opened_at } : {}),
    ...(row.posted_at ? { postedAt: row.posted_at } : {}),
  };
}

// A capsule row with its atoms. Returns null if either atom is missing, which sealing never leaves.
export function rowsToCapsule(row: CapsuleRow): Capsule | null {
  const atoms = row.newsletter_capsule_atoms ?? [];
  const medium = atoms.find((atom) => atom.platform === "medium");
  const substack = atoms.find((atom) => atom.platform === "substack");
  if (!medium || !substack) return null;
  return {
    id: row.id,
    draftId: row.post_id,
    draftVersion: row.draft_version,
    canonicalUrl: row.canonical_url,
    sealedAt: row.sealed_at,
    atoms: { medium: atomFromRow(medium), substack: atomFromRow(substack) },
  };
}

// The post as it is saved (never what is on someone's screen), as the converters see it.
export async function getCapsuleDraft(supabase: SupabaseClient<any>, postId: string): Promise<{ draft: Draft; workspaceId: string }> {
  const post = await getPost(supabase, postId).catch(() => null);
  if (!post) throw new CapsuleError("This post no longer exists.");
  return { draft: toDraft(post), workspaceId: post.workspace_id };
}

async function capsulesFor(supabase: SupabaseClient<any>, postId: string, limit: number) {
  const { data, error } = await supabase
    .from("newsletter_capsules")
    .select(CAPSULE_SELECT)
    .eq("post_id", postId)
    .order("sealed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as CapsuleRow[]).map(rowsToCapsule).filter((capsule): capsule is Capsule => capsule !== null);
}

async function getCapsule(supabase: SupabaseClient<any>, capsuleId: string) {
  const { data, error } = await supabase.from("newsletter_capsules").select(CAPSULE_SELECT).eq("id", capsuleId).maybeSingle();
  if (error) throw error;
  const capsule = data ? rowsToCapsule(data as CapsuleRow) : null;
  if (!capsule) throw new CapsuleError("That capsule no longer exists. Open the menu again.");
  return capsule;
}

export async function sealCapsule(supabase: SupabaseClient<any>, rawInput: unknown, actorId: string): Promise<Capsule> {
  const { draftId } = draftIdSchema.parse(rawInput);
  const { draft, workspaceId } = await getCapsuleDraft(supabase, draftId);

  const atoms = PLATFORMS.map((platform) => {
    const { html, warnings } = adapters[platform].transform(draft);
    return { platform, html, title: draft.title, subtitle: draft.subtitle, tags: draft.tags, warnings };
  });

  const { data: capsuleId, error } = await supabase.rpc("seal_newsletter_capsule", {
    target_post_id: draftId,
    target_draft_version: draftVersion(draft),
    target_canonical_url: draft.canonicalUrl,
    target_atoms: atoms,
  });
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "newsletter_capsule.sealed",
    entityType: "newsletter_capsule",
    entityId: capsuleId as string,
    metadata: { postId: draftId },
  });
  return getCapsule(supabase, capsuleId as string);
}

// The latest capsule for a post, and whether the saved post has changed since it was sealed.
export async function getLatestCapsule(supabase: SupabaseClient<any>, rawInput: unknown) {
  const { draftId } = draftIdSchema.parse(rawInput);
  const [{ draft }, [capsule = null]] = await Promise.all([
    getCapsuleDraft(supabase, draftId),
    capsulesFor(supabase, draftId, 1),
  ]);
  return { capsule, stale: capsule ? capsule.draftVersion !== draftVersion(draft) : false };
}

// Every capsule sealed for a post, newest first.
export async function listCapsules(supabase: SupabaseClient<any>, rawInput: unknown) {
  const { draftId } = draftIdSchema.parse(rawInput);
  return capsulesFor(supabase, draftId, HISTORY_LIMIT);
}

async function updateAtom(
  supabase: SupabaseClient<any>,
  capsuleId: string,
  platform: CapsulePlatform,
  patch: Partial<Pick<CapsuleAtomRow, "status" | "platform_url" | "opened_at" | "posted_at">>,
  options: { unlessPosted?: boolean } = {},
) {
  let query = supabase.from("newsletter_capsule_atoms").update(patch).eq("capsule_id", capsuleId).eq("platform", platform);
  if (options.unlessPosted) query = query.neq("status", "posted");
  const { data, error } = await query.select(ATOM_SELECT).maybeSingle();
  if (error) throw error;
  if (data) return atomFromRow(data as CapsuleAtomRow);

  // Nothing changed: the atom was already posted (and stays so), or it doesn't exist.
  const existing = await supabase
    .from("newsletter_capsule_atoms")
    .select(ATOM_SELECT)
    .eq("capsule_id", capsuleId)
    .eq("platform", platform)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new CapsuleError("That capsule no longer exists. Open the menu again.");
  return atomFromRow(existing.data as CapsuleAtomRow);
}

export async function markAtomOpened(supabase: SupabaseClient<any>, rawInput: unknown, now = new Date()) {
  const { capsuleId, platform } = markAtomOpenedSchema.parse(rawInput);
  // Opening again never undoes Posted.
  return updateAtom(supabase, capsuleId, platform, { status: "opened", opened_at: now.toISOString() }, { unlessPosted: true });
}

export async function markAtomPosted(supabase: SupabaseClient<any>, rawInput: unknown, actorId: string, now = new Date()) {
  const { capsuleId, platform, platformUrl } = markAtomPostedSchema.parse(rawInput);
  const live = parseLiveUrl(platformUrl ?? "");
  if (!live.ok) throw new CapsuleError(live.error);

  const atom = await updateAtom(supabase, capsuleId, platform, {
    status: "posted",
    posted_at: now.toISOString(),
    // A blank link keeps whatever link was given before.
    ...(live.url ? { platform_url: live.url } : {}),
  });

  const { data: capsule } = await supabase.from("newsletter_capsules").select("workspace_id, post_id").eq("id", capsuleId).maybeSingle();
  await writeAuditLog(supabase, {
    workspaceId: capsule?.workspace_id ?? null,
    actorId,
    action: "newsletter_capsule.posted",
    entityType: "newsletter_capsule",
    entityId: capsuleId,
    metadata: { platform, postId: capsule?.post_id ?? null, platformUrl: live.url },
  });
  return atom;
}
