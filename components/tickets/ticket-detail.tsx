"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addCommentAction,
  approveProgressAction,
  deleteTicketAction,
  disputeProgressAction,
  getTicketCommentsAction,
  submitProgressAction,
  updateTicketAction,
} from "@/app/tools/tickets/actions";
import { TICKET_COLUMNS, type MemberOption, type TicketWithRelations } from "@/components/tickets/types";

type Comment = {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; full_name: string | null; email: string } | null;
};

export function TicketDetail({
  ticket,
  members,
  currentUserId,
  onClose,
}: {
  ticket: TicketWithRelations;
  members: MemberOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsTicketId, setCommentsTicketId] = useState<string | null>(null);
  const loadingComments = commentsTicketId !== ticket.id;

  useEffect(() => {
    let active = true;
    getTicketCommentsAction(ticket.id).then((data) => {
      if (active) {
        setComments(data as Comment[]);
        setCommentsTicketId(ticket.id);
      }
    });
    return () => {
      active = false;
    };
  }, [ticket.id]);

  const statusLabel = TICKET_COLUMNS.find((c) => c.status === ticket.status)?.label ?? ticket.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="popover-shadow flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
          <div>
            <p className="eyebrow mb-1">{statusLabel}</p>
            <h2 className="text-lg font-semibold leading-snug">{ticket.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <form
            action={(formData) => {
              formData.set("ticketId", ticket.id);
              startTransition(() => updateTicketAction(formData));
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={ticket.title} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={ticket.description ?? ""}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={ticket.status}
                  className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm"
                >
                  {TICKET_COLUMNS.map((column) => (
                    <option key={column.status} value={column.status}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="assignedTo">Assignee</Label>
                <select
                  id="assignedTo"
                  name="assignedTo"
                  defaultValue={ticket.assigned_to ?? ""}
                  className="mt-1 h-10 w-full rounded-sm border border-border bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={ticket.due_date ? ticket.due_date.slice(0, 10) : ""}
                className="mt-1 max-w-[10rem]"
              />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <ConfirmButton
                type="button"
                variant="destructive"
                size="sm"
                message="Delete this ticket? This cannot be undone."
                onClick={() => {
                  const formData = new FormData();
                  formData.set("ticketId", ticket.id);
                  startTransition(async () => {
                    await deleteTicketAction(formData);
                    onClose();
                  });
                }}
              >
                Delete
              </ConfirmButton>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>

          <div className="rounded-md border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Progress</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Verified: {ticket.progress_percent}%
              {ticket.review_status === "pending_review"
                ? ` · Claimed ${ticket.claimed_progress_percent}% (awaiting review)`
                : null}
              {ticket.review_status === "disputed" ? " · Last claim disputed" : null}
            </p>
            {ticket.review_status === "disputed" && ticket.review_notes ? (
              <p className="mt-2 rounded-sm bg-destructive/10 p-2 text-sm text-destructive">
                {ticket.review_notes}
              </p>
            ) : null}

            {ticket.assigned_to === currentUserId ? (
              <form
                action={(formData) => {
                  formData.set("ticketId", ticket.id);
                  startTransition(() => submitProgressAction(formData));
                }}
                className="mt-3 flex items-center gap-3"
              >
                <input
                  name="claimedPercent"
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={ticket.claimed_progress_percent ?? ticket.progress_percent}
                  className="w-full accent-primary"
                />
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Submit for review
                </Button>
              </form>
            ) : null}

            {ticket.reviewer_id === currentUserId && ticket.review_status === "pending_review" ? (
              <div className="mt-4 rounded-md border border-border bg-card p-3">
                <p className="text-sm font-medium">Review claimed progress: {ticket.claimed_progress_percent}%</p>
                <form
                  action={(formData) => {
                    formData.set("ticketId", ticket.id);
                    formData.set("verifiedPercent", String(ticket.claimed_progress_percent ?? 0));
                    startTransition(() => approveProgressAction(formData));
                  }}
                  className="mt-2"
                >
                  <input type="hidden" name="notes" value="" />
                  <Button type="submit" size="sm" disabled={pending}>
                    Approve at {ticket.claimed_progress_percent}%
                  </Button>
                </form>
                <form
                  action={(formData) => {
                    formData.set("ticketId", ticket.id);
                    startTransition(() => disputeProgressAction(formData));
                  }}
                  className="mt-2 flex gap-2"
                >
                  <Input name="notes" placeholder="Why is this disputed?" className="flex-1" required />
                  <Button type="submit" size="sm" variant="destructive" disabled={pending}>
                    Dispute
                  </Button>
                </form>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Comments</h3>
            <form
              action={(formData) => {
                formData.set("ticketId", ticket.id);
                startTransition(async () => {
                  await addCommentAction(formData);
                  const fresh = await getTicketCommentsAction(ticket.id);
                  setComments(fresh as Comment[]);
                });
              }}
              className="mt-2 flex gap-2"
            >
              <Input name="content" placeholder="Add a comment" className="flex-1 bg-card" />
              <Button type="submit" size="sm" disabled={pending}>
                Post
              </Button>
            </form>
            <div className="mt-3 space-y-2">
              {loadingComments ? (
                <p className="text-sm text-muted-foreground">Loading comments…</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                comments.map((comment) => {
                  const authorLabel = comment.author?.full_name || comment.author?.email || "Unknown";
                  return (
                    <div key={comment.id} className="flex gap-3 rounded-md bg-card p-3 text-sm">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                        {authorLabel.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{authorLabel}</span>
                          <span>{format(new Date(comment.created_at), "MMM d, h:mm a")}</span>
                        </div>
                        <p className="mt-0.5 break-words">{comment.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
