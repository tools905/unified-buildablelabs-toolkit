import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import type { TicketStatus } from "@/lib/db/types";
import {
  createTicketSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "@/lib/validation/ticket-schema";

export const TICKET_SELECT =
  "*, assignee:profiles!tickets_assigned_to_fkey(id, full_name, email), creator:profiles!tickets_created_by_fkey(id, full_name, email), linked_meeting:meetings(id, title, event_title)";

export async function createTicket(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: CreateTicketInput,
) {
  const input = createTicketSchema.parse(rawInput);

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assignedTo ?? null,
      due_date: input.dueDate ? input.dueDate.toISOString() : null,
      status: input.assignedTo ? "assigned" : "backlog",
      linked_meeting_id: input.linkedMeetingId ?? null,
      created_by: createdBy,
    })
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: createdBy,
    action: "ticket.created",
    entityType: "ticket",
    entityId: ticket.id,
  });

  return ticket;
}

export async function getTicket(supabase: SupabaseClient<any>, ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("id", ticketId)
    .single();
  if (error) throw error;
  return data;
}

export async function listTickets(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  filters?: { status?: TicketStatus; assignedTo?: string; search?: string },
) {
  let query = supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("workspace_id", workspaceId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }
  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateTicket(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  actorId: string,
  rawInput: UpdateTicketInput,
) {
  const input = updateTicketSchema.parse(rawInput);

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.assignedTo !== undefined) update.assigned_to = input.assignedTo;
  if (input.status !== undefined) update.status = input.status;
  if (input.dueDate !== undefined) {
    update.due_date = input.dueDate ? input.dueDate.toISOString() : null;
  }

  const { data: ticket, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.updated",
    entityType: "ticket",
    entityId: ticketId,
    metadata: update,
  });

  return ticket;
}

export async function deleteTicket(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  ticketId: string,
  actorId: string,
) {
  const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.deleted",
    entityType: "ticket",
    entityId: ticketId,
  });
}

export async function addComment(
  supabase: SupabaseClient<any>,
  ticketId: string,
  authorId: string,
  content: string,
) {
  const { data, error } = await supabase
    .from("ticket_comments")
    .insert({ ticket_id: ticketId, author_id: authorId, content })
    .select("*, author:profiles(id, full_name, email)")
    .single();
  if (error) throw error;
  return data;
}

export async function bulkUpdateTickets(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  actorId: string,
  ticketIds: string[],
  updates: { status?: TicketStatus; assignedTo?: string | null },
) {
  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.assignedTo !== undefined) patch.assigned_to = updates.assignedTo;

  const { data, error } = await supabase
    .from("tickets")
    .update(patch)
    .in("id", ticketIds)
    .select(TICKET_SELECT);
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.bulk_updated",
    entityType: "ticket",
    metadata: { ticketIds, ...patch },
  });

  return data ?? [];
}

export async function bulkDeleteTickets(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  actorId: string,
  ticketIds: string[],
) {
  const { error } = await supabase.from("tickets").delete().in("id", ticketIds);
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "ticket.bulk_deleted",
    entityType: "ticket",
    metadata: { ticketIds },
  });
}

export async function getTicketComments(supabase: SupabaseClient<any>, ticketId: string) {
  const { data, error } = await supabase
    .from("ticket_comments")
    .select("*, author:profiles(id, full_name, email)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
