import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createNotification } from "@/lib/services/notification-service";
import { TICKET_SELECT } from "@/lib/services/ticket-service";

export async function getDefaultReviewer(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase
    .from("ticket_review_settings")
    .select("*, reviewer:profiles!ticket_review_settings_default_reviewer_id_fkey(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setDefaultReviewer(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  actorId: string,
  reviewerId: string,
) {
  const { data, error } = await supabase
    .from("ticket_review_settings")
    .upsert({ workspace_id: workspaceId, default_reviewer_id: reviewerId }, { onConflict: "workspace_id" })
    .select()
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket_review_settings.updated",
    entityType: "ticket_review_settings",
    entityId: workspaceId,
    metadata: { reviewerId },
  });

  return data;
}

export async function submitProgress(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  assigneeId: string,
  claimedPercent: number,
) {
  const settings = await getDefaultReviewer(supabase, workspaceId);
  if (!settings?.default_reviewer_id) {
    throw new Error("No reviewer is configured for this workspace yet. Ask an admin to set one in Tickets Admin.");
  }

  const { data: ticket, error } = await supabase
    .from("tickets")
    .update({
      claimed_progress_percent: claimedPercent,
      review_status: "pending_review",
      reviewer_id: settings.default_reviewer_id,
      verified_progress_percent: null,
      reviewed_at: null,
      review_notes: null,
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: assigneeId,
    action: "ticket.progress_submitted",
    entityType: "ticket",
    entityId: ticketId,
    metadata: { claimedPercent },
  });

  await createNotification({
    userId: settings.default_reviewer_id,
    title: "Progress review needed",
    message: `${ticket.assignee?.full_name || "A team member"} claimed ${claimedPercent}% on "${ticket.title}" — review it.`,
    type: "review_needed",
  });

  return ticket;
}

export async function getReviewQueue(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  reviewerId: string,
) {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("reviewer_id", reviewerId)
    .eq("review_status", "pending_review")
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function approveProgress(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  reviewerId: string,
  verifiedPercent: number,
  notes?: string,
) {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .update({
      verified_progress_percent: verifiedPercent,
      progress_percent: verifiedPercent,
      review_status: "verified",
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: reviewerId,
    action: "ticket.progress_approved",
    entityType: "ticket",
    entityId: ticketId,
    metadata: { verifiedPercent },
  });

  if (ticket.assigned_to) {
    await createNotification({
      userId: ticket.assigned_to,
      title: "Progress approved",
      message: `Your progress on "${ticket.title}" was approved at ${verifiedPercent}%.`,
      type: "review_completed",
    });
  }

  return ticket;
}

export async function disputeProgress(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  reviewerId: string,
  notes: string,
) {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .update({
      review_status: "disputed",
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: reviewerId,
    action: "ticket.progress_disputed",
    entityType: "ticket",
    entityId: ticketId,
    metadata: { notes },
  });

  if (ticket.assigned_to) {
    await createNotification({
      userId: ticket.assigned_to,
      title: "Progress needs clarification",
      message: `Your progress on "${ticket.title}" was disputed: ${notes}`,
      type: "review_completed",
    });
  }

  return ticket;
}

// Delivery stats scoped to a review round's time window, for showing real
// work context alongside a peer review's qualitative feedback. Unlike
// getPerformanceAccuracy below, this is windowed rather than all-time, and
// isn't scoped to a specific peer-review project since tickets don't carry
// a project link.
export async function getTicketDeliveryStats(
  supabase: SupabaseClient<any>,
  userId: string,
  windowStart: string,
  windowEnd: string,
) {
  const { data: touchedTickets, error: touchedError } = await supabase
    .from("tickets")
    .select("id, status, review_status")
    .eq("assigned_to", userId)
    .gte("updated_at", windowStart)
    .lte("updated_at", windowEnd);
  if (touchedError) throw touchedError;

  const touched = touchedTickets ?? [];
  const completed = touched.filter((t) => t.status === "done").length;
  const verified = touched.filter((t) => t.review_status === "verified").length;

  const { count: overdueCount, error: overdueError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .neq("status", "done")
    .lt("due_date", windowEnd);
  if (overdueError) throw overdueError;

  return {
    touched: touched.length,
    completed,
    verified,
    overdue: overdueCount ?? 0,
  };
}

export async function getPerformanceAccuracy(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("tickets")
    .select("review_status")
    .eq("workspace_id", workspaceId)
    .eq("assigned_to", userId)
    .not("claimed_progress_percent", "is", null);
  if (error) throw error;

  const totalTickets = data?.length ?? 0;
  const verifiedCount =
    data?.filter((t: { review_status: string | null }) => t.review_status === "verified").length ?? 0;
  const accuracy = totalTickets === 0 ? null : Math.round((verifiedCount / totalTickets) * 100);

  return { accuracy, totalTickets, verifiedCount };
}
