"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as resourceService from "@/lib/services/resource-service";
import type { RESOURCE_CATEGORIES } from "@/lib/validation/resource-schema";

type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

async function requireResourcesContext() {
  await requireEnabledTool("resources");
  const { supabase, user } = await requireUser("/tools/resources");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  return { supabase, user, workspace };
}

async function requireResourcesAdminContext() {
  const context = await requireResourcesContext();
  const admin = await isWorkspaceAdmin(context.workspace.id, context.user.id, context.supabase);
  if (!admin) notFound();
  return context;
}

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseRoadmapIds(formData: FormData) {
  return formData.getAll("roadmapIds").map(String);
}

function refreshResources() {
  revalidatePath("/tools/resources");
  revalidatePath("/tools/resources/admin");
}

export async function createResourceAction(formData: FormData) {
  const { supabase, user, workspace } = await requireResourcesContext();
  await resourceService.createResource(supabase, workspace.id, user.id, {
    title: String(formData.get("title") ?? ""),
    description: (formData.get("description") as string) || undefined,
    url: String(formData.get("url") ?? ""),
    category: (formData.get("category") as ResourceCategory) || "reference",
    tags: parseTags(formData.get("tags")),
    roadmapIds: parseRoadmapIds(formData),
  });
  refreshResources();
}

export async function updateResourceAction(formData: FormData) {
  const { supabase, user, workspace } = await requireResourcesAdminContext();
  const resourceId = String(formData.get("resourceId"));
  await resourceService.updateResource(supabase, workspace.id, resourceId, user.id, {
    title: String(formData.get("title") ?? ""),
    description: (formData.get("description") as string) || undefined,
    url: String(formData.get("url") ?? ""),
    category: (formData.get("category") as ResourceCategory) || "reference",
    tags: parseTags(formData.get("tags")),
    roadmapIds: parseRoadmapIds(formData),
  });
  refreshResources();
}

export async function deleteResourceAction(formData: FormData) {
  const { supabase, user, workspace } = await requireResourcesAdminContext();
  const resourceId = String(formData.get("resourceId"));
  await resourceService.deleteResource(supabase, workspace.id, resourceId, user.id);
  refreshResources();
}

export async function createRoadmapAction(formData: FormData) {
  const { supabase, user, workspace } = await requireResourcesAdminContext();
  await resourceService.createRoadmap(supabase, workspace.id, user.id, {
    name: String(formData.get("name") ?? ""),
    description: (formData.get("description") as string) || undefined,
  });
  refreshResources();
}

export async function deleteRoadmapAction(formData: FormData) {
  const { supabase } = await requireResourcesAdminContext();
  const roadmapId = String(formData.get("roadmapId"));
  await resourceService.deleteRoadmap(supabase, roadmapId);
  refreshResources();
}

