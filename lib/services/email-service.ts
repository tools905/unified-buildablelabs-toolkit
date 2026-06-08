import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/db/types";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  type: NotificationType;
  workspaceId?: string | null;
  projectId?: string | null;
  roundId?: string | null;
  assignmentId?: string | null;
};

async function logEmail(
  supabase: SupabaseClient<any>,
  input: EmailInput,
  status: string,
  providerMessageId?: string | null,
  errorMessage?: string | null,
) {
  await supabase.from("notification_logs").insert({
    workspace_id: input.workspaceId ?? null,
    project_id: input.projectId ?? null,
    round_id: input.roundId ?? null,
    assignment_id: input.assignmentId ?? null,
    recipient_email: input.to,
    type: input.type,
    status,
    provider_message_id: providerMessageId ?? null,
    error_message: errorMessage ?? null,
  });
}

export async function sendEmail(
  supabase: SupabaseClient<any>,
  input: EmailInput,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Peer Reviews <reviews@example.com>";

  if (!apiKey) {
    await logEmail(supabase, input, "skipped", null, "RESEND_API_KEY missing");
    return { skipped: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    await logEmail(supabase, input, "sent", result.data?.id ?? null, null);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    await logEmail(supabase, input, "failed", null, message);
    return { error: message };
  }
}

function button(url: string, label: string) {
  return `<p><a href="${url}" style="background:#1f6f5b;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">${label}</a></p>`;
}

export function inviteEmailHtml(input: {
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
  expiresAt: string;
}) {
  return `<h1>Join ${input.workspaceName}</h1><p>${input.inviterName} invited you to Peer Reviews.</p>${button(input.acceptUrl, "Accept invite")}<p>This invite expires ${input.expiresAt}.</p>`;
}

export async function sendInviteEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    workspaceName: string;
    inviterName: string;
    acceptUrl: string;
    expiresAt: string;
    workspaceId: string;
  },
) {
  return sendEmail(supabase, {
    to: input.to,
    subject: `You're invited to join ${input.workspaceName} on Peer Reviews`,
    html: inviteEmailHtml(input),
    type: "invite",
    workspaceId: input.workspaceId,
  });
}

export async function sendRoundStartedEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    projectName: string;
    reviewCount: number;
    dueAt: string;
    url: string;
    workspaceId: string;
    projectId: string;
    roundId: string;
  },
) {
  return sendEmail(supabase, {
    to: input.to,
    subject: `Peer review round started: ${input.projectName}`,
    html: `<p>You have ${input.reviewCount} reviews to complete.</p><p>Due date: ${input.dueAt}</p>${button(input.url, "View my reviews")}`,
    type: "round_started",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    roundId: input.roundId,
  });
}

export async function sendReviewReminderEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    projectName: string;
    roundTitle: string;
    pendingCount: number;
    dueAt: string;
    url: string;
    workspaceId: string;
    projectId: string;
    roundId: string;
  },
) {
  return sendEmail(supabase, {
    to: input.to,
    subject: `Reminder: ${input.pendingCount} peer reviews pending`,
    html: `<p>Project: ${input.projectName}</p><p>Round: ${input.roundTitle}</p><p>Due date: ${input.dueAt}</p>${button(input.url, "Complete reviews")}`,
    type: "review_reminder",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    roundId: input.roundId,
  });
}

export async function sendAdminOverdueSummaryEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    projectName: string;
    roundTitle: string;
    pendingMembers: string[];
    overdueAssignments: number;
    url: string;
    workspaceId: string;
    projectId: string;
    roundId: string;
  },
) {
  return sendEmail(supabase, {
    to: input.to,
    subject: `Peer review overdue summary: ${input.projectName}`,
    html: `<p>Round: ${input.roundTitle}</p><p>Pending members: ${input.pendingMembers.join(", ") || "None"}</p><p>Overdue assignments: ${input.overdueAssignments}</p>${button(input.url, "View round progress")}`,
    type: "admin_overdue_summary",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    roundId: input.roundId,
  });
}

export async function sendReportReadyEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    projectName: string;
    roundTitle: string;
    completionRate: number;
    url: string;
    workspaceId: string;
    projectId: string;
    roundId: string;
  },
) {
  return sendEmail(supabase, {
    to: input.to,
    subject: `Peer review report ready: ${input.projectName}`,
    html: `<p>Round: ${input.roundTitle}</p><p>Completion rate: ${input.completionRate}%</p>${button(input.url, "View report")}`,
    type: "report_ready",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    roundId: input.roundId,
  });
}
