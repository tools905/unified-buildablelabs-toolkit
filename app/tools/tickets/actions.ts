"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as ticketService from "@/lib/services/ticket-service";
import * as ticketReviewService from "@/lib/services/ticket-review-service";
import * as linearLinkService from "@/lib/services/linear-link-service";
import { findDuplicateTicket, type DuplicateTicketMatch } from "@/lib/services/duplicate-ticket-service";
import type { LinearIssue } from "@/lib/services/linear-client";
import type { TicketStatus } from "@/lib/db/types";

async function requireTicketsContext() {
  await requireEnabledTool("tickets");
  const { supabase, user } = await requireUser("/tools/tickets");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  return { supabase, user, workspace };
}

async function requireTicketsAdminContext() {
  const context = await requireTicketsContext();
  const admin = await isWorkspaceAdmin(context.workspace.id, context.user.id, context.supabase);
  if (!admin) notFound();
  return context;
}

function refreshTickets() {
  revalidatePath("/tools/tickets");
  revalidatePath("/tools/tickets/admin");
}

export async function createTicketAction(
  formData: FormData,
): Promise<{ status: "duplicate"; duplicate: DuplicateTicketMatch } | { status: "created" }> {
  const { supabase, user, workspace } = await requireTicketsContext();
  const title = String(formData.get("title") ?? "");
  const description = (formData.get("description") as string) || undefined;

  if (formData.get("skipDuplicateCheck") !== "true") {
    const duplicate = await findDuplicateTicket(supabase, workspace.id, { title, description });
    if (duplicate) {
      return { status: "duplicate", duplicate };
    }
  }

  const dueDateValue = formData.get("dueDate");
  const ticket = await ticketService.createTicket(supabase, workspace.id, user.id, {
    title,
    description,
    assignedTo: (formData.get("assignedTo") as string) || undefined,
    dueDate: dueDateValue ? new Date(String(dueDateValue)) : undefined,
  });
  const linked = await linearLinkService.detectAndLinkByIdentifier(supabase, workspace.id, ticket, user.id);
  if (!linked.linear_issue_id) {
    await linearLinkService.detectSemanticMatch(supabase, workspace.id, linked, user.id);
  }
  refreshTickets();
  return { status: "created" };
}

export async function updateTicketStatusAction(ticketId: string, status: TicketStatus) {
  const { supabase, user, workspace } = await requireTicketsContext();
  await ticketService.updateTicket(supabase, workspace.id, ticketId, user.id, { status });
  refreshTickets();
}

export async function updateTicketAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  const dueDateValue = formData.get("dueDate");
  const assignedToValue = formData.get("assignedTo");

  const ticket = await ticketService.updateTicket(supabase, workspace.id, ticketId, user.id, {
    title: (formData.get("title") as string) || undefined,
    description: (formData.get("description") as string) ?? null,
    assignedTo: assignedToValue ? String(assignedToValue) : null,
    status: (formData.get("status") as TicketStatus) || undefined,
    dueDate: dueDateValue ? new Date(String(dueDateValue)) : null,
  });
  const linked = await linearLinkService.detectAndLinkByIdentifier(supabase, workspace.id, ticket, user.id);
  if (!linked.linear_issue_id) {
    await linearLinkService.detectSemanticMatch(supabase, workspace.id, linked, user.id);
  }
  refreshTickets();
}

export async function deleteTicketAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  await ticketService.deleteTicket(supabase, workspace.id, ticketId, user.id);
  refreshTickets();
}

export async function addCommentAction(formData: FormData) {
  const { supabase, user } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await ticketService.addComment(supabase, ticketId, user.id, content);
  refreshTickets();
}

export async function getTicketCommentsAction(ticketId: string) {
  const { supabase } = await requireTicketsContext();
  return ticketService.getTicketComments(supabase, ticketId);
}

export async function bulkUpdateStatusAction(ticketIds: string[], status: TicketStatus) {
  const { supabase, user, workspace } = await requireTicketsAdminContext();
  if (ticketIds.length === 0) return;
  await ticketService.bulkUpdateTickets(supabase, workspace.id, user.id, ticketIds, { status });
  refreshTickets();
}

export async function bulkAssignAction(ticketIds: string[], assignedTo: string | null) {
  const { supabase, user, workspace } = await requireTicketsAdminContext();
  if (ticketIds.length === 0) return;
  await ticketService.bulkUpdateTickets(supabase, workspace.id, user.id, ticketIds, { assignedTo });
  refreshTickets();
}

export async function bulkDeleteAction(ticketIds: string[]) {
  const { supabase, user, workspace } = await requireTicketsAdminContext();
  if (ticketIds.length === 0) return;
  await ticketService.bulkDeleteTickets(supabase, workspace.id, user.id, ticketIds);
  refreshTickets();
}

export async function submitProgressAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  const claimedPercent = Number(formData.get("claimedPercent"));
  await ticketReviewService.submitProgress(supabase, workspace.id, ticketId, user.id, claimedPercent);
  refreshTickets();
  revalidatePath("/tools/tickets/reviews");
}

export async function approveProgressAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  const verifiedPercent = Number(formData.get("verifiedPercent"));
  const notes = (formData.get("notes") as string) || undefined;
  await ticketReviewService.approveProgress(supabase, workspace.id, ticketId, user.id, verifiedPercent, notes);
  refreshTickets();
  revalidatePath("/tools/tickets/reviews");
}

export async function disputeProgressAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsContext();
  const ticketId = String(formData.get("ticketId"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!notes) throw new Error("Notes are required when disputing a claim.");
  await ticketReviewService.disputeProgress(supabase, workspace.id, ticketId, user.id, notes);
  refreshTickets();
  revalidatePath("/tools/tickets/reviews");
}

export async function setDefaultReviewerAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsAdminContext();
  const reviewerId = String(formData.get("reviewerId"));
  await ticketReviewService.setDefaultReviewer(supabase, workspace.id, user.id, reviewerId);
  revalidatePath("/tools/tickets/admin");
}

export async function searchLinearIssuesAction(query: string): Promise<LinearIssue[]> {
  const { supabase, workspace } = await requireTicketsContext();
  return linearLinkService.searchLinearIssuesForWorkspace(supabase, workspace.id, query);
}

export async function linkLinearIssueAction(ticketId: string, issue: LinearIssue) {
  const { supabase, user, workspace } = await requireTicketsContext();
  await linearLinkService.linkTicketToIssue(supabase, workspace.id, ticketId, user.id, issue, "manual");
  refreshTickets();
}

export async function unlinkLinearIssueAction(ticketId: string) {
  const { supabase, user, workspace } = await requireTicketsContext();
  await linearLinkService.unlinkTicketFromLinear(supabase, workspace.id, ticketId, user.id);
  refreshTickets();
}

export async function setLinearSettingsAction(formData: FormData) {
  const { supabase, user, workspace } = await requireTicketsAdminContext();
  const teamIdsRaw = String(formData.get("linearTeamIds") ?? "");
  const linearTeamIds = teamIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const suggestThreshold = Number(formData.get("suggestThreshold") ?? 0.5);
  await linearLinkService.setLinearSettings(supabase, workspace.id, user.id, {
    linearTeamIds,
    suggestThreshold,
  });
  revalidatePath("/tools/tickets/admin");
}
