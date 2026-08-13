"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MeetingCardData = {
  id: string;
  title: string | null;
  event_title: string | null;
  summary_text: string | null;
  summary_markdown: string | null;
  web_url: string | null;
  start_time: string | null;
  attendees: { name: string | null; email: string }[];
  tickets_extracted_at: string | null;
  extracted_tickets_count: number;
};

export function MeetingCard({
  meeting,
  admin,
  extractTicketsAction,
}: {
  meeting: MeetingCardData;
  admin: boolean;
  extractTicketsAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const title = meeting.title || meeting.event_title || "Untitled meeting";
  const summary = meeting.summary_markdown || meeting.summary_text;

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex cursor-pointer flex-col transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{title}</CardTitle>
            {meeting.start_time ? (
              <Badge>{new Date(meeting.start_time).toLocaleDateString()}</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2">
          {meeting.attendees.length > 0 ? (
            <p className="truncate text-sm text-muted-foreground">
              {meeting.attendees.map((a) => a.name || a.email).join(", ")}
            </p>
          ) : null}
          {summary ? (
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{summary}</p>
          ) : (
            <p className="flex-1 text-sm italic text-muted-foreground">No summary yet.</p>
          )}
          {admin && meeting.tickets_extracted_at ? (
            <span className="text-xs text-muted-foreground">
              {meeting.extracted_tickets_count} ticket(s) extracted
            </span>
          ) : null}
        </CardContent>
      </Card>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {meeting.start_time ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(meeting.start_time).toLocaleString()}
                  </p>
                ) : null}
                {meeting.attendees.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {meeting.attendees.map((a) => a.name || a.email).join(", ")}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {summary ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">{summary}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No summary yet.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border p-5">
              {meeting.web_url ? (
                <a
                  href={meeting.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open in Granola <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {admin ? (
                meeting.tickets_extracted_at ? (
                  <span className="text-sm text-muted-foreground">
                    {meeting.extracted_tickets_count} ticket(s) extracted
                  </span>
                ) : (
                  <form action={extractTicketsAction}>
                    <input type="hidden" name="meetingId" value={meeting.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Extract tickets
                    </Button>
                  </form>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
