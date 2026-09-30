import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";
import { removeStoredFilesForIdea, signPaths } from "@/lib/services/content-attachment-service";
import {
  createContentIdeaSchema,
  updateContentIdeaSchema,
  type CreateContentIdeaInput,
  type UpdateContentIdeaInput,
} from "@/lib/validation/content-idea-schema";

export const CONTENT_IDEA_SELECT =
  "*, creator:profiles!content_ideas_created_by_fkey(id, full_name, email), attachments:content_idea_attachments(id, kind, thumb_path, sort_order), review_points:content_idea_review_points(id, is_resolved)";

export async function createContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateContentIdeaInput,
) {
  const input = createContentIdeaSchema.parse(rawInput);

  const { data: idea, error } = await supabase
    .from("content_ideas")
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      description: input.description ?? null,
      platform: input.platform,
      ...(input.scheduledFor ? { scheduled_for: input.scheduledFor } : {}),
      ...(input.referenceLinks?.length ? { reference_links: input.referenceLinks } : {}),
      created_by: createdBy,
    })
    .select(CONTENT_IDEA_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: createdBy,
    action: "content_idea.created",
    entityType: "content_idea",
    entityId: idea.id,
  });

  return idea;
}

export async function listContentIdeas(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  filters?: { status?: ContentIdeaStatus; platform?: ContentPlatform; createdBy?: string },
) {
  let query = supabase
    .from("content_ideas")
    .select(CONTENT_IDEA_SELECT)
    .eq("workspace_id", workspaceId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.platform) {
    query = query.eq("platform", filters.platform);
  }
  if (filters?.createdBy) {
    query = query.eq("created_by", filters.createdBy);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

type IdeaWithEmbeds = {
  attachments?: { id: string; kind: "image" | "pdf" | "link"; thumb_path: string | null; sort_order: number }[] | null;
  review_points?: { id: string; is_resolved: boolean }[] | null;
};

export type CardThumbnail = { kind: "image" | "pdf" | "link"; url: string | null };

// Adds the small things a board card shows: attachment count, review counts and a
// thumbnail (a signed URL to the first image's small thumbnail, or just an icon kind).
export async function attachCardPreviews<T extends IdeaWithEmbeds>(supabase: SupabaseClient<any>, ideas: T[]) {
  const firstImageThumb = new Map<number, string>();
  ideas.forEach((idea, index) => {
    const sorted = [...(idea.attachments ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const image = sorted.find((item) => item.kind === "image" && item.thumb_path);
    if (image?.thumb_path) firstImageThumb.set(index, image.thumb_path);
  });
  const signed = await signPaths(supabase, [...firstImageThumb.values()]);

  return ideas.map((idea, index) => {
    const attachments = idea.attachments ?? [];
    const points = idea.review_points ?? [];
    const thumbPath = firstImageThumb.get(index);
    const thumbnail: CardThumbnail | null = thumbPath
      ? { kind: "image", url: signed.get(thumbPath) ?? null }
      : attachments.some((item) => item.kind === "pdf")
        ? { kind: "pdf", url: null }
        : attachments.length > 0
          ? { kind: "link", url: null }
          : null;
    return {
      ...idea,
      attachment_count: attachments.length,
      review_count: points.length,
      open_review_count: points.filter((point) => !point.is_resolved).length,
      thumbnail,
    };
  });
}

export async function updateContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ideaId: string,
  actorId: string,
  rawInput: UpdateContentIdeaInput,
) {
  const input = updateContentIdeaSchema.parse(rawInput);

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.platform !== undefined) update.platform = input.platform;
  if (input.status !== undefined) update.status = input.status;
  if (input.scheduledFor !== undefined) update.scheduled_for = input.scheduledFor;
  if (input.referenceLinks !== undefined) update.reference_links = input.referenceLinks;
  if (input.postUrl !== undefined) update.post_url = input.postUrl;

  const { data: idea, error } = await supabase
    .from("content_ideas")
    .update(update)
    .eq("id", ideaId)
    .select(CONTENT_IDEA_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "content_idea.updated",
    entityType: "content_idea",
    entityId: ideaId,
    metadata: update,
  });

  return idea;
}

export async function deleteContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ideaId: string,
  actorId: string,
) {
  await removeStoredFilesForIdea(supabase, ideaId);
  const { error } = await supabase.from("content_ideas").delete().eq("id", ideaId);
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "content_idea.deleted",
    entityType: "content_idea",
    entityId: ideaId,
  });
}
