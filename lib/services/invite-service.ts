import crypto from "node:crypto";
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceRole } from "@/lib/db/types";
import { sendInviteEmail as sendInvite } from "@/lib/services/email-service";
import { writeAuditLog } from "@/lib/services/audit-service";

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
    .insert({
      workspace_id: input.workspaceId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      invited_by: input.invitedBy,
      expires_at: addDays(new Date(), 14).toISOString(),
    })
    .select("*, workspaces(name), profiles!invites_invited_by_fkey(full_name,email)")
    .single();

  if (error) throw error;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await sendInvite(supabase, {
    to: data.email,
    workspaceName: data.workspaces?.name ?? "your workspace",
    inviterName: data.profiles?.full_name ?? data.profiles?.email ?? "An admin",
    acceptUrl: `${appUrl}/onboarding?invite=${data.token}`,
    expiresAt: new Date(data.expires_at).toLocaleDateString(),
    workspaceId: data.workspace_id,
  });

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
  const { data: invite, error } = await supabase
    .from("invites")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error) throw error;

  const { error: memberError } = await supabase
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

  const { error: inviteError } = await supabase
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
