import { z } from "zod";

const ticketStatusSchema = z.enum(["backlog", "assigned", "in_progress", "in_review", "done"]);

export const createTicketSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters."),
  description: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  linkedMeetingId: z.string().uuid().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  status: ticketStatusSchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketFilterSchema = z.object({
  status: ticketStatusSchema.optional(),
  assignedTo: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type TicketFilterInput = z.infer<typeof ticketFilterSchema>;

export const progressUpdateSchema = z.object({
  progressPercent: z.coerce.number().int().min(0).max(100),
});

export type ProgressUpdateInput = z.infer<typeof progressUpdateSchema>;
