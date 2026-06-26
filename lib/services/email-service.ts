import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";

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

function normalizeEmailFrom() {
  let from = process.env.EMAIL_FROM ?? "";
  if (from.startsWith('"') && from.endsWith('"')) {
    from = from.slice(1, -1);
  }
  return from.trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function list(items: string[]) {
  if (!items.length) return "<li>No signal available yet.</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

async function logEmail(
  supabase: SupabaseClient<any>,
  input: EmailInput,
  status: string,
  providerMessageId?: string | null,
  errorMessage?: string | null,
) {
  const admin = createAdminClient();
  await admin.from("notification_logs").insert({
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
  const from = normalizeEmailFrom();

  if (!apiKey) {
    await logEmail(supabase, input, "skipped", null, "RESEND_API_KEY missing");
    return { skipped: true };
  }

  if (!from || from.includes("@example.com")) {
    const message = "EMAIL_FROM must use a verified Resend sender/domain.";
    await logEmail(supabase, input, "failed", null, message);
    return { error: message };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (result.error) {
      const message = result.error.message || "Unknown Resend error";
      await logEmail(supabase, input, "failed", null, message);
      return { error: message };
    }
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
  return `<h1>Join ${input.workspaceName}</h1><p>${input.inviterName} invited you to the BuildableLabs Toolkit.</p>${button(input.acceptUrl, "Accept invite")}<p>This invite expires ${input.expiresAt}.</p>`;
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
    subject: `You're invited to join ${input.workspaceName} on the BuildableLabs Toolkit`,
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

export async function sendLinkedInPostSummaryEmail(
  supabase: SupabaseClient<any>,
  input: {
    to: string;
    memberName: string;
    postUrl?: string | null;
    totalScore: number;
    archetype: string;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    workspaceId: string;
  },
) {
  const postLink = input.postUrl ? button(input.postUrl, "Open LinkedIn post") : "";
  return sendEmail(supabase, {
    to: input.to,
    subject: `Your LinkedIn post coaching summary: ${input.totalScore}/100`,
    html: `
      <h1>Your private LinkedIn coaching summary</h1>
      <p>Hi ${escapeHtml(input.memberName)}, your submitted post has been assessed.</p>
      <p><strong>Score:</strong> ${input.totalScore}/100</p>
      <p><strong>Post type:</strong> ${escapeHtml(input.archetype.replaceAll("_", " "))}</p>
      <p>${escapeHtml(input.summary)}</p>
      <h2>What worked well</h2>
      <ul>${list(input.strengths)}</ul>
      <h2>What to improve</h2>
      <ul>${list(input.weaknesses)}</ul>
      <h2>Next revision ideas</h2>
      <ul>${list(input.suggestions)}</ul>
      ${postLink}
      <p style="color:#666;font-size:12px">This is private coaching for the post you manually submitted in the BuildableLabs Toolkit.</p>
    `,
    type: "linkedin_post_summary",
    workspaceId: input.workspaceId,
  });
}
