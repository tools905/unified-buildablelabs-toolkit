import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";
import {
  createContentIdeaSchema,
  updateContentIdeaSchema,
  type CreateContentIdeaInput,
  type UpdateContentIdeaInput,
} from "@/lib/validation/content-idea-schema";

export const CONTENT_IDEA_SELECT =
  "*, creator:profiles!content_ideas_created_by_fkey(id, full_name, email)";

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
