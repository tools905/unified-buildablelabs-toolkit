import "server-only";

import { formatDistanceToNow } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GranolaNote } from "@/lib/services/granola-client";
import { createNotification } from "@/lib/services/notification-service";
import { getWorkspaceMembers } from "@/lib/services/workspace-service";

/**
 * Upserts a meeting recap from a Granola note. Called from the webhook
 * handler after fetching the authoritative note via the Granola API.
 */
export async function upsertMeetingFromGranolaNote(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  note: GranolaNote,
) {
  const calendarEvent = note.calendar_event;

  const { data, error } = await supabase
    .from("meetings")
    .upsert(
      {
        workspace_id: workspaceId,
        granola_note_id: note.id,
        title: note.title,
        event_title: calendarEvent?.event_title ?? null,
        summary_text: note.summary_text,
        summary_markdown: note.summary_markdown,
        attendees: note.attendees ?? [],
        organiser_email: calendarEvent?.organiser ?? null,
        web_url: note.web_url,
        start_time: calendarEvent?.scheduled_start_time ?? null,
        end_time: calendarEvent?.scheduled_end_time ?? null,
      },
      { onConflict: "granola_note_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMeetings(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  limit = 50,
) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("start_time", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

function meetingLabel(meeting: { title: string | null; event_title: string | null }) {
  return meeting.title || meeting.event_title || "Untitled meeting";
}

/**
 * Builds a recap digest of meetings ingested in the given window. This is a
 * recap of meetings that already happened and were summarized by Granola,
 * not a preview of upcoming meetings — Granola's API has no such feed.
 */
export async function generateMeetingDigest(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  since: Date,
) {
  const { data, error } = await supabase
    .from("meetings")
    .select("title, event_title, summary_text, start_time")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since.toISOString())
    .order("start_time", { ascending: true });
  if (error) throw error;

  const meetings = data ?? [];
  if (meetings.length === 0) return null;

  const lines = meetings.map((meeting: { title: string | null; event_title: string | null; summary_text: string | null; start_time: string | null }) => {
    const when = meeting.start_time
      ? formatDistanceToNow(new Date(meeting.start_time), { addSuffix: true })
      : "time unknown";
    const summary = meeting.summary_text ? ` — ${meeting.summary_text.slice(0, 140)}` : "";
    return `${meetingLabel(meeting)} (${when})${summary}`;
  });

  return { count: meetings.length, lines };
}

export async function sendMeetingDigestNotifications(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  since: Date,
  period: "daily" | "weekly",
) {
  const digest = await generateMeetingDigest(supabase, workspaceId, since);
  if (!digest) return { sentTo: 0, meetingCount: 0 };

  const members = await getWorkspaceMembers(supabase, workspaceId);
  const title = period === "daily" ? "Yesterday's meeting recap" : "This week's meeting recap";
  const message = `${digest.count} meeting(s): ${digest.lines.join("; ")}`;

  await Promise.all(
    members.map((member: { user_id: string }) =>
      createNotification({
        userId: member.user_id,
        title,
        message,
        type: "meeting_digest",
      }),
    ),
  );

  return { sentTo: members.length, meetingCount: digest.count };
}
