import crypto from "node:crypto";
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceRole } from "@/lib/db/types";
import { sendInviteEmail as sendInvite } from "@/lib/services/email-service";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppLink } from "@/lib/utils/app-url";

export async function createInvite(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    invitedBy: string;
  },
) {
  const token = crypto.randomBytes(32).toString("hex");
  const { data, error } = await supabase
    .from("invites")
    .upsert(
      {
        workspace_id: input.workspaceId,
        email: input.email.toLowerCase(),
        role: input.role,
        token,
        invited_by: input.invitedBy,
        expires_at: addDays(new Date(), 14).toISOString(),
        status: "pending",
      },
      { onConflict: "workspace_id,email,status" },
    )
    .select("*, workspaces(name), profiles!invites_invited_by_fkey(full_name,email)")
    .single();

  if (error) throw error;

  const emailResult = await sendInvite(supabase, {
    to: data.email,
    workspaceName: data.workspaces?.name ?? "your workspace",
    inviterName: data.profiles?.full_name ?? data.profiles?.email ?? "An admin",
    acceptUrl: getAppLink(`/onboarding?invite=${data.token}`),
    expiresAt: new Date(data.expires_at).toLocaleDateString(),
    workspaceId: data.workspace_id,
  });

  if (emailResult && "error" in emailResult && emailResult.error) {
    throw new Error(`Failed to send invite email: ${emailResult.error}`);
  }

  await writeAuditLog(supabase, {
    workspaceId: input.workspaceId,
    actorId: input.invitedBy,
    action: "invite.created",
    entityType: "invite",
    entityId: data.id,
    metadata: { email: input.email, role: input.role },
  });

  return data;
}

export async function acceptInvite(
  supabase: SupabaseClient<any>,
  token: string,
  userId: string,
) {
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("invites")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error) throw error;

  const { error: memberError } = await admin
    .from("workspace_members")
    .upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: userId,
        role: invite.role,
        status: "active",
      },
      { onConflict: "workspace_id,user_id" },
    );
  if (memberError) throw memberError;

  const { error: inviteError } = await admin
    .from("invites")
    .update({
      status: "accepted",
      accepted_by: userId,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (inviteError) throw inviteError;

  return invite;
}
