import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createNotification } from "@/lib/services/notification-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { diffAssignees } from "@/lib/utils/content-board";
import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";
import { removeStoredFilesForIdea, signPaths } from "@/lib/services/content-attachment-service";
import {
  assigneeIdsSchema,
  createContentIdeaSchema,
  updateContentIdeaSchema,
  type CreateContentIdeaInput,
  type UpdateContentIdeaInput,
} from "@/lib/validation/content-idea-schema";

export const CONTENT_IDEA_SELECT =
  "*, creator:profiles!content_ideas_created_by_fkey(id, full_name, email), attachments:content_idea_attachments(id, kind, thumb_path, sort_order), review_points:content_idea_review_points(id, is_resolved), assignees:content_idea_assignees(user_id, profile:profiles!content_idea_assignees_user_id_fkey(id, full_name, email))";

export async function createContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateContentIdeaInput,
) {
  const input = createContentIdeaSchema.parse(rawInput);

  // Check the assignment is allowed before anything is saved, so a refused assignment can't leave
  // behind an idea the person never meant to create without it.
  const assigneeIds = input.assigneeIds ?? [];
  if (assigneeIds.length) await assertCanAssign(supabase, workspaceId, createdBy, assigneeIds);

  const { data: idea, error } = await supabase
    .from("content_ideas")
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      description: input.description ?? null,
      caption: input.caption?.trim() || null,
      platform: input.platforms[0],
      platforms: input.platforms,
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

  if (assigneeIds.length) {
    await setIdeaAssignees(supabase, workspaceId, idea.id, createdBy, assigneeIds, { ideaTitle: input.title });
  }

  return idea;
}

// Only admins may assign, and only people who are active members of the workspace.
async function assertCanAssign(supabase: SupabaseClient<any>, workspaceId: string, actorId: string, userIds: string[]) {
  if (!(await isWorkspaceAdmin(workspaceId, actorId, supabase))) {
    throw new Error("Only admins can assign ideas.");
  }
  if (userIds.length === 0) return;
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("user_id", userIds);
  if (error) throw error;
  const members = new Set((data ?? []).map((row: { user_id: string }) => row.user_id));
  if (userIds.some((id) => !members.has(id))) {
    throw new Error("You can only assign people who are in this workspace.");
  }
}

// Makes the idea's assignees exactly `rawIds`. Anyone newly added gets a notification in the bell
// (not the admin assigning themselves); anyone left out is simply taken off.
export async function setIdeaAssignees(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ideaId: string,
  actorId: string,
  rawIds: string[],
  options: { ideaTitle?: string } = {},
) {
  const ids = assigneeIdsSchema.parse(rawIds);
  await assertCanAssign(supabase, workspaceId, actorId, ids);

  const { data: existing, error: existingError } = await supabase
    .from("content_idea_assignees")
    .select("user_id")
    .eq("idea_id", ideaId);
  if (existingError) throw existingError;

  const { add, remove } = diffAssignees(
    (existing ?? []).map((row: { user_id: string }) => row.user_id),
    ids,
  );
  if (add.length === 0 && remove.length === 0) return { added: [] as string[], removed: [] as string[] };

  if (add.length) {
    const { error } = await supabase.from("content_idea_assignees").insert(
      add.map((userId) => ({ idea_id: ideaId, user_id: userId, workspace_id: workspaceId, assigned_by: actorId })),
    );
    if (error) throw error;
  }
  if (remove.length) {
    const { error } = await supabase.from("content_idea_assignees").delete().eq("idea_id", ideaId).in("user_id", remove);
    if (error) throw error;
  }

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "content_idea.assigned",
    entityType: "content_idea",
    entityId: ideaId,
    metadata: { added: add, removed: remove },
  });

  // Telling people is best effort: a failed notification must not undo the assignment.
  const toNotify = add.filter((userId) => userId !== actorId);
  if (toNotify.length) {
    let title = options.ideaTitle;
    if (!title) {
      const { data } = await supabase.from("content_ideas").select("title").eq("id", ideaId).maybeSingle();
      title = data?.title ?? "an idea";
    }
    await Promise.allSettled(
      toNotify.map((userId) =>
        createNotification({
          userId,
          type: "content_idea_assigned",
          title: "You were assigned a content idea",
          message: `You were assigned “${title}” on the Content Board. Open Content Board in Tools to see it.`,
        }),
      ),
    );
  }

  return { added: add, removed: remove };
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
    query = query.or(`platform.eq.${filters.platform},platforms.cs.{${filters.platform}}`);
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
  if (input.caption !== undefined) update.caption = input.caption?.trim() || null;
  if (input.platforms !== undefined) {
    update.platforms = input.platforms;
    update.platform = input.platforms[0];
  }
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

export async function setIdeaReviewed(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ideaId: string,
  actorId: string,
  reviewed: boolean,
) {
  const { data, error } = await supabase
    .from("content_ideas")
    .update(reviewed ? { reviewed_at: new Date().toISOString(), reviewed_by: actorId } : { reviewed_at: null, reviewed_by: null })
    .eq("id", ideaId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Could not update this idea.");

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: reviewed ? "content_idea.reviewed" : "content_idea.review_cleared",
    entityType: "content_idea",
    entityId: ideaId,
  });
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
