import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import {
  createResourceSchema,
  createRoadmapSchema,
  updateResourceSchema,
  type CreateResourceInput,
  type CreateRoadmapInput,
  type UpdateResourceInput,
} from "@/lib/validation/resource-schema";

const RESOURCE_SELECT = "*, creator:profiles!resources_created_by_fkey(id, full_name, email)";

async function setResourceRoadmaps(
  supabase: SupabaseClient<any>,
  resourceId: string,
  roadmapIds: string[],
) {
  const { error: deleteError } = await supabase
    .from("resource_roadmap_mapping")
    .delete()
    .eq("resource_id", resourceId);
  if (deleteError) throw deleteError;

  if (roadmapIds.length === 0) return;

  const { error: insertError } = await supabase.from("resource_roadmap_mapping").insert(
    roadmapIds.map((roadmapId, index) => ({
      resource_id: resourceId,
      roadmap_id: roadmapId,
      sort_order: index,
    })),
  );
  if (insertError) throw insertError;
}

export async function createResource(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateResourceInput,
) {
  const input = createResourceSchema.parse(rawInput);

  const { data: resource, error } = await supabase
    .from("resources")
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      description: input.description ?? null,
      url: input.url,
      category: input.category,
      tags: input.tags,
      created_by: createdBy,
    })
    .select(RESOURCE_SELECT)
    .single();
  if (error) throw error;

  await setResourceRoadmaps(supabase, resource.id, input.roadmapIds);

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: createdBy,
    action: "resource.created",
    entityType: "resource",
    entityId: resource.id,
  });

  return resource;
}

export async function updateResource(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  resourceId: string,
  actorId: string,
  rawInput: UpdateResourceInput,
) {
  const input = updateResourceSchema.parse(rawInput);

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.url !== undefined) update.url = input.url;
  if (input.category !== undefined) update.category = input.category;
  if (input.tags !== undefined) update.tags = input.tags;

  const { data: resource, error } = await supabase
    .from("resources")
    .update(update)
    .eq("id", resourceId)
    .select(RESOURCE_SELECT)
    .single();
  if (error) throw error;

  if (input.roadmapIds !== undefined) {
    await setResourceRoadmaps(supabase, resourceId, input.roadmapIds);
  }

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "resource.updated",
    entityType: "resource",
    entityId: resourceId,
    metadata: update,
  });

  return resource;
}

export async function deleteResource(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  resourceId: string,
  actorId: string,
) {
  const { error } = await supabase.from("resources").delete().eq("id", resourceId);
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "resource.deleted",
    entityType: "resource",
    entityId: resourceId,
  });
}

export async function listResources(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  filters?: { category?: string; tag?: string; roadmapId?: string; search?: string },
) {
  let resourceIds: string[] | null = null;
  if (filters?.roadmapId) {
    const { data: mappings, error } = await supabase
      .from("resource_roadmap_mapping")
      .select("resource_id")
      .eq("roadmap_id", filters.roadmapId)
      .order("sort_order");
    if (error) throw error;
    resourceIds = (mappings ?? []).map((m: { resource_id: string }) => m.resource_id);
    if (resourceIds.length === 0) return [];
  }

  let query = supabase.from("resources").select(RESOURCE_SELECT).eq("workspace_id", workspaceId);

  if (resourceIds) query = query.in("id", resourceIds);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.tag) query = query.contains("tags", [filters.tag]);
  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getResourceRoadmapIds(supabase: SupabaseClient<any>, resourceId: string) {
  const { data, error } = await supabase
    .from("resource_roadmap_mapping")
    .select("roadmap_id")
    .eq("resource_id", resourceId);
  if (error) throw error;
  return (data ?? []).map((row: { roadmap_id: string }) => row.roadmap_id);
}

export async function listRoadmaps(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase
    .from("learning_roadmaps")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createRoadmap(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateRoadmapInput,
) {
  const input = createRoadmapSchema.parse(rawInput);
  const { data, error } = await supabase
    .from("learning_roadmaps")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      description: input.description ?? null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoadmap(supabase: SupabaseClient<any>, roadmapId: string) {
  const { error } = await supabase.from("learning_roadmaps").delete().eq("id", roadmapId);
  if (error) throw error;
}
