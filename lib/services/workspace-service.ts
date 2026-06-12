import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WorkspaceRole } from "@/lib/db/types";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createAdminClient } from "@/lib/supabase/admin";

export async function ensureProfile(
  supabase: SupabaseClient<any>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name: fullName,
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createWorkspace(
  supabase: SupabaseClient<any>,
  input: { name: string; userId: string },
) {
  const admin = createAdminClient();
  const { data: workspace, error } = await admin
    .from("workspaces")
    .insert({ name: input.name, created_by: input.userId })
    .select()
    .single();

  if (error) throw error;

  const { error: memberError } = await admin
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: input.userId,
      role: "admin",
    });

  if (memberError) throw memberError;

  await writeAuditLog(admin, {
    workspaceId: workspace.id,
    actorId: input.userId,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
  });

  return workspace;
}

export const getCurrentWorkspace = cache(async function getCurrentWorkspace(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<Database["public"]["Tables"]["workspaces"]["Row"] | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const workspace = data?.workspaces;
  return Array.isArray(workspace) ? (workspace[0] ?? null) : (workspace ?? null);
});

export const getWorkspaceMembership = cache(async function getWorkspaceMembership(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
});

export async function getWorkspaceMembers(
  supabase: SupabaseClient<any>,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, profiles(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at");

  if (error) throw error;
  return data ?? [];
}

export async function isWorkspaceAdmin(
  workspaceId: string,
  userId: string,
  supabase: SupabaseClient<any>,
) {
  const membership = await getWorkspaceMembership(supabase, workspaceId, userId);
  return membership?.role === "admin";
}

export async function setWorkspaceRole(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function joinDefaultWorkspace(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const admin = createAdminClient();

  // Find the workspace named "BuildableLabs"
  const { data: workspace, error: findError } = await admin
    .from("workspaces")
    .select("*")
    .eq("name", "BuildableLabs")
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;

  if (workspace) {
    // Check if the user is already a member
    const { data: existingMember, error: memberError } = await admin
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) throw memberError;

    if (!existingMember) {
      const { error: insertError } = await admin
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: userId,
          role: "member",
          status: "active",
        });

      if (insertError) throw insertError;

      await writeAuditLog(admin, {
        workspaceId: workspace.id,
        actorId: userId,
        action: "workspace.member_joined",
        entityType: "workspace",
        entityId: workspace.id,
      });
    }
    return workspace;
  } else {
    // Workspace does not exist; create it.
    // The first user will be an admin.
    const { data: newWorkspace, error: createError } = await admin
      .from("workspaces")
      .insert({ name: "BuildableLabs", created_by: userId })
      .select()
      .single();

    if (createError) throw createError;

    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({
        workspace_id: newWorkspace.id,
        user_id: userId,
        role: "admin",
        status: "active",
      });

    if (memberError) throw memberError;

    await writeAuditLog(admin, {
      workspaceId: newWorkspace.id,
      actorId: userId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: newWorkspace.id,
    });

    return newWorkspace;
  }
}
