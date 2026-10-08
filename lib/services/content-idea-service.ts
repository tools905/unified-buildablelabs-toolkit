import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createNotification } from "@/lib/services/notification-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { canMoveIdea, deriveIdeaTitle, diffAssignees, groupIntoDrafts, latestActivity } from "@/lib/utils/content-board";
import { sendContentIdeaAssignedEmail } from "@/lib/services/email-service";
import { getAppLink } from "@/lib/utils/app-url";
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
  "*, creator:profiles!content_ideas_created_by_fkey(id, full_name, email), reviewer:profiles!content_ideas_reviewed_by_fkey(full_name, email), mover:profiles!content_ideas_status_changed_by_fkey(full_name, email), attachments:content_idea_attachments(id, kind, thumb_path, sort_order, created_by, created_at, uploader:profiles!content_idea_attachments_created_by_fkey(full_name, email)), review_points:content_idea_review_points(id, is_resolved, created_at, resolved_at, author:profiles!content_idea_review_points_created_by_fkey(full_name, email)), assignees:content_idea_assignees(user_id, profile:profiles!content_idea_assignees_user_id_fkey(id, full_name, email))";

export async function createContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateContentIdeaInput,
) {
  const input = createContentIdeaSchema.parse(rawInput);
  // Any one of the text fields is enough; the card's title is taken from whichever was filled in.
  const title = deriveIdeaTitle({
    title: input.title,
    description: input.description,
    caption: input.caption,
    referenceLinks: input.referenceLinks,
  });
  if (!title) throw new Error("Add a title, details, a caption or a reference post.");

  // Check the assignment is allowed before anything is saved, so a refused assignment can't leave
  // behind an idea the person never meant to create without it.
  const assigneeIds = input.assigneeIds ?? [];
  if (assigneeIds.length) await assertCanAssign(supabase, workspaceId, createdBy, assigneeIds);

  const { data: idea, error } = await supabase
    .from("content_ideas")
    .insert({
      workspace_id: workspaceId,
      title,
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
    await setIdeaAssignees(supabase, workspaceId, idea.id, createdBy, assigneeIds, { ideaTitle: title });
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

  // Telling people is best effort: a failed notification or email must not undo the assignment.
  const toNotify = add.filter((userId) => userId !== actorId);
  if (toNotify.length) {
    let title = options.ideaTitle;
    if (!title) {
      const { data } = await supabase.from("content_ideas").select("title").eq("id", ideaId).maybeSingle();
      title = data?.title ?? "an idea";
    }
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", [actorId, ...toNotify]);
    const nameOf = (id: string) => {
      const person = people?.find((candidate: { id: string }) => candidate.id === id);
      return person?.full_name || person?.email || "Someone";
    };
    const assignerName = nameOf(actorId);
    const ideaUrl = getAppLink(`/tools/content-board?idea=${ideaId}`);
    await Promise.allSettled(
      toNotify.flatMap((userId) => {
        const email = people?.find((candidate: { id: string; email: string | null }) => candidate.id === userId)?.email;
        return [
          createNotification({
            userId,
            type: "content_idea_assigned",
            title: "You were assigned a content idea",
            message: `${assignerName} assigned you “${title}” on the Content Board.`,
          }),
          email
            ? sendContentIdeaAssignedEmail(supabase, {
                to: email,
                assigneeName: nameOf(userId),
                assignerName,
                ideaTitle: title ?? "an idea",
                url: ideaUrl,
                workspaceId,
              })
            : Promise.resolve(),
        ];
      }),
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

type EmbeddedPerson = { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;

// PostgREST may give an embedded person as one object or a list.
function personName(person: EmbeddedPerson | undefined) {
  const one = Array.isArray(person) ? person[0] : person;
  return one?.full_name || one?.email || null;
}

type IdeaWithEmbeds = {
  status?: ContentIdeaStatus;
  status_changed_at?: string | null;
  mover?: EmbeddedPerson;
  reviewed_at?: string | null;
  reviewer?: EmbeddedPerson;
  attachments?:
    | {
        id: string;
        kind: "image" | "pdf" | "link";
        thumb_path: string | null;
        sort_order: number;
        created_by?: string;
        created_at?: string;
        uploader?: EmbeddedPerson;
      }[]
    | null;
  review_points?:
    | { id: string; is_resolved: boolean; created_at?: string; resolved_at?: string | null; author?: EmbeddedPerson }[]
    | null;
};

export type CardThumbnail = { kind: "image" | "pdf" | "link"; url: string | null };

// Adds the small things a board card shows: attachment count, review counts, when the first
// feedback came in, and a thumbnail. The thumbnail comes from the latest draft: its first upload that
// has a small preview image (a picture, or the first page of a PDF carousel). Without one, the
// earliest such upload; otherwise just the kind of file.
export async function attachCardPreviews<T extends IdeaWithEmbeds>(supabase: SupabaseClient<any>, ideas: T[]) {
  const firstThumb = new Map<number, { path: string; kind: "image" | "pdf" }>();
  ideas.forEach((idea, index) => {
    const sorted = [...(idea.attachments ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const drafts = groupIntoDrafts(sorted, (item) => item.created_by ?? "", (item) => item.created_at ?? "");
    const hasThumb = (item: (typeof sorted)[number]) => item.kind !== "link" && Boolean(item.thumb_path);
    const withThumb = drafts[drafts.length - 1]?.find(hasThumb) ?? sorted.find(hasThumb);
    if (withThumb?.thumb_path) firstThumb.set(index, { path: withThumb.thumb_path, kind: withThumb.kind as "image" | "pdf" });
  });
  const signed = await signPaths(supabase, [...firstThumb.values()].map((thumb) => thumb.path));

  return ideas.map((idea, index) => {
    const attachments = idea.attachments ?? [];
    const points = idea.review_points ?? [];
    const thumb = firstThumb.get(index);
    const thumbnail: CardThumbnail | null = thumb
      ? { kind: thumb.kind, url: signed.get(thumb.path) ?? null }
      : attachments.some((item) => item.kind === "pdf")
        ? { kind: "pdf", url: null }
        : attachments.some((item) => item.kind === "image")
          ? { kind: "image", url: null }
          : attachments.length > 0
            ? { kind: "link", url: null }
            : null;
    const feedbackTimes = points.map((point) => point.created_at).filter((value): value is string => Boolean(value)).sort();
    return {
      ...idea,
      attachment_count: attachments.length,
      file_count: attachments.filter((item) => item.kind !== "link").length,
      review_count: points.length,
      open_review_count: points.filter((point) => !point.is_resolved).length,
      first_feedback_at: feedbackTimes[0] ?? null,
      latest_activity: latestActivity({
        movedAt: idea.status_changed_at ?? null,
        moverName: personName(idea.mover),
        movedTo: idea.status,
        reviewedAt: idea.reviewed_at ?? null,
        reviewerName: personName(idea.reviewer),
        points: points
          .filter((point) => point.created_at)
          .map((point) => ({ createdAt: point.created_at as string, resolvedAt: point.resolved_at ?? null, authorName: personName(point.author) })),
        uploads: attachments
          .filter((item) => item.created_at)
          .map((item) => ({ createdAt: item.created_at as string, uploaderName: personName(item.uploader) })),
      }),
      thumbnail,
    };
  });
}

// Moves an idea to another column, if this person is allowed to make that move (see canMoveIdea).
// A date can come along when shortlisting, so the idea lands on the calendar at the same time.
export async function moveContentIdea(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ideaId: string,
  actorId: string,
  to: ContentIdeaStatus,
  options: { scheduledFor?: string | null } = {},
) {
  const [{ data: idea, error }, isAdmin] = await Promise.all([
    supabase
      .from("content_ideas")
      .select("id, status, assignees:content_idea_assignees(user_id)")
      .eq("id", ideaId)
      .maybeSingle(),
    isWorkspaceAdmin(workspaceId, actorId, supabase),
  ]);
  if (error) throw error;
  if (!idea) throw new Error("This idea no longer exists.");
  // Already there (someone else moved it, or this screen was out of date): nothing to refuse. A
  // posting day chosen at the same time is still saved.
  if (idea.status === to) {
    if (options.scheduledFor) {
      return updateContentIdea(supabase, workspaceId, ideaId, actorId, { scheduledFor: options.scheduledFor });
    }
    return idea;
  }
  if (!canMoveIdea({ from: idea.status, to, isAdmin })) {
    throw new Error(
      isAdmin ? "That move isn't allowed from here." : "Only admins can move an idea into or out of that column.",
    );
  }
  const moved = await updateContentIdea(supabase, workspaceId, ideaId, actorId, {
    status: to,
    ...(options.scheduledFor ? { scheduledFor: options.scheduledFor } : {}),
  });
  // Starting work on an idea nobody is assigned to makes whoever started it the assignee, so the card
  // shows who is posting it. Best effort: the move itself has already been saved.
  if (to === "in_progress" && (idea.assignees ?? []).length === 0) {
    await assignSelf(supabase, workspaceId, ideaId, actorId).catch(() => undefined);
  }
  return moved;
}

// Adds the person themselves as an assignee (anyone in the workspace may do this; assigning other
// people stays with admins).
async function assignSelf(supabase: SupabaseClient<any>, workspaceId: string, ideaId: string, actorId: string) {
  const { error } = await supabase
    .from("content_idea_assignees")
    .insert({ idea_id: ideaId, user_id: actorId, workspace_id: workspaceId, assigned_by: actorId });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "content_idea.assigned",
    entityType: "content_idea",
    entityId: ideaId,
    metadata: { added: [actorId], removed: [], reason: "started work" },
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
