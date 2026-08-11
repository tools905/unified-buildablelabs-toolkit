import type { TicketReviewStatus, TicketStatus } from "@/lib/db/types";

export type TicketProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

export type TicketWithRelations = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: TicketStatus;
  progress_percent: number;
  due_date: string | null;
  claimed_progress_percent: number | null;
  verified_progress_percent: number | null;
  review_status: TicketReviewStatus | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  linked_meeting_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee: TicketProfile | null;
  creator: TicketProfile | null;
  linked_meeting: { id: string; title: string | null; event_title: string | null } | null;
};

export type MemberOption = {
  id: string;
  label: string;
};

export const TICKET_COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "assigned", label: "Assigned" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "done", label: "Done" },
];
