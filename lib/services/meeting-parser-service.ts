import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requestIntelligenceJson } from "@/modules/shared/ai";
import { createNotification } from "@/lib/services/notification-service";
import { createTicket } from "@/lib/services/ticket-service";
import { getWorkspaceMembers } from "@/lib/services/workspace-service";

export type ParsedTicket = {
  title: string;
  description?: string;
  assigneeName?: string;
  dueDate?: string;
};

type ParsedMeeting = {
  actionItems?: Array<{
    title?: string;
    assigneeName?: string;
    dueDate?: string;
  }>;
};

type MeetingInput = {
  title: string | null;
  event_title: string | null;
  summary_text: string | null;
  summary_markdown: string | null;
  attendees: Array<{ name: string | null; email: string }>;
};

const ACTION_PHRASE = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:will|should|needs? to|is going to)\s+(.+?)(?:\.|$)/g;

/**
 * Extracts candidate tickets from a meeting summary. Tries the LLM first
 * (OpenRouter/DeepSeek, same provider chain as ai-report-service.ts); falls
 * back to a simple "<Name> will/should/needs to <action>" regex if no
 * provider is configured or the call fails, so this never hard-blocks on
 * AI availability.
 */
export async function parseMeetingForTickets(meeting: MeetingInput): Promise<ParsedTicket[]> {
  const text = meeting.summary_markdown || meeting.summary_text;
  if (!text) return [];

  try {
    const result = await requestIntelligenceJson<ParsedMeeting>({
      temperature: 0.1,
      system: [
        "You extract action items from a meeting summary for a ticket tracker.",
        "Only extract concrete commitments — someone doing something specific — not general discussion topics.",
        "Return only valid JSON matching the exact required schema. If there are no clear action items, return an empty array.",
      ].join(" "),
      user: {
        meetingTitle: meeting.title || meeting.event_title || "Untitled meeting",
        summary: text,
        attendees: meeting.attendees.map((a) => a.name || a.email),
        requiredJsonShape: {
          actionItems: [
            {
              title: "short imperative ticket title, e.g. 'Send updated proposal to client'",
              assigneeName: "the attendee's name this was assigned to, if identifiable, else omit",
              dueDate: "ISO date (YYYY-MM-DD) if a deadline was mentioned, else omit",
            },
          ],
        },
      },
    });

    const items = result?.data?.actionItems ?? [];
    return items
      .filter((item): item is { title: string; assigneeName?: string; dueDate?: string } => Boolean(item.title))
      .map((item) => ({
        title: item.title,
        assigneeName: item.assigneeName,
        dueDate: item.dueDate,
      }));
  } catch {
    return parseMeetingForTicketsFallback(text);
  }
}

function parseMeetingForTicketsFallback(text: string): ParsedTicket[] {
  const matches = Array.from(text.matchAll(ACTION_PHRASE));
  return matches.slice(0, 10).map((match) => ({
    title: match[2].trim().replace(/\s+/g, " ").slice(0, 200),
    assigneeName: match[1],
  }));
}

/**
 * Matches a name mentioned in a meeting to a workspace member's profile.
 * Exact (case-insensitive) match first, then "contains" as a looser
 * fallback for partial names ("Vatsal" matching "Vatsal Bhatt").
 */
export function matchAttendeeToProfile(
  name: string | undefined,
  members: Array<{ user_id: string; profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] }>,
): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const candidates = members.map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return { userId: member.user_id, fullName: profile?.full_name?.toLowerCase() ?? "" };
  });

  const exact = candidates.find((c) => c.fullName === normalized);
  if (exact) return exact.userId;

  const partial = candidates.find((c) => c.fullName && (c.fullName.includes(normalized) || normalized.includes(c.fullName)));
  return partial?.userId ?? null;
}

/**
 * Parses a meeting for action items and creates tickets from them, linked
 * back to the meeting. Pass dryRun to preview without persisting anything.
 */
export async function createTicketsFromMeeting(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  meeting: MeetingInput & { id: string },
  actorId: string,
  options?: { dryRun?: boolean },
) {
  const parsed = await parseMeetingForTickets(meeting);
  if (parsed.length === 0) {
    return { tickets: [], preview: parsed, createdCount: 0 };
  }

  const members = await getWorkspaceMembers(supabase, workspaceId);

  const resolved = parsed.map((item) => ({
    ...item,
    assigneeId: matchAttendeeToProfile(item.assigneeName, members),
  }));

  if (options?.dryRun) {
    return { tickets: [], preview: resolved, createdCount: 0 };
  }

  const created: any[] = [];
  for (const item of resolved) {
    const ticket = await createTicket(supabase, workspaceId, actorId, {
      title: item.title,
      assignedTo: item.assigneeId ?? undefined,
      dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
      linkedMeetingId: meeting.id,
    });
    created.push(ticket);
  }

  await supabase
    .from("meetings")
    .update({
      tickets_extracted_at: new Date().toISOString(),
      extracted_tickets_count: created.length,
    })
    .eq("id", meeting.id);

  const admins = members.filter((m: { role: string }) => m.role === "admin");
  await Promise.all(
    admins.map((admin: { user_id: string }) =>
      createNotification({
        userId: admin.user_id,
        title: "Tickets created from a meeting",
        message: `${created.length} ticket(s) added to the backlog from "${meeting.title || meeting.event_title || "a meeting"}" — review assignments.`,
        type: "meeting_tickets_created",
      }),
    ),
  );

  return { tickets: created, preview: resolved, createdCount: created.length };
}
