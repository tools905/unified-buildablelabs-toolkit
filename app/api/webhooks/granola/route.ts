import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGranolaNote, verifyGranolaWebhookSignature } from "@/lib/services/granola-client";
import { upsertMeetingFromGranolaNote } from "@/lib/services/calendar-service";
import { getWorkspaceByName } from "@/lib/services/workspace-service";

const LOG_PREFIX = "[granola-webhook]";

// Per https://docs.granola.ai/webhooks — these are the only three event
// types Granola sends. note.edited covers regenerated/edited summaries;
// note.access_granted covers notes shared with us after generation.
const INGESTED_EVENT_TYPES = new Set(["note.generated", "note.edited", "note.access_granted"]);

// Payload shape per docs: { event_id, event_type, note_id, occurred_at, data? }
function extractNoteId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  const candidates = [
    typeof record.note_id === "string" ? record.note_id : undefined,
    typeof record.id === "string" ? record.id : undefined,
    typeof data?.id === "string" ? (data.id as string) : undefined,
    typeof (data?.note as Record<string, unknown> | undefined)?.id === "string"
      ? ((data?.note as Record<string, unknown>).id as string)
      : undefined,
  ];
  return candidates.find((id) => id?.startsWith("not_")) ?? null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  console.log(`${LOG_PREFIX} received delivery`, {
    webhookId: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    bodyLength: rawBody.length,
  });

  const verified = verifyGranolaWebhookSignature(rawBody, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  console.log(`${LOG_PREFIX} signature verification`, { verified });
  if (!verified) {
    console.error(`${LOG_PREFIX} rejected: invalid or missing signature`);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    console.error(`${LOG_PREFIX} rejected: invalid JSON body`, error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = typeof (body as Record<string, unknown>)?.event_type === "string"
    ? ((body as Record<string, unknown>).event_type as string)
    : null;
  console.log(`${LOG_PREFIX} parsed event`, { eventType, body });

  if (!eventType || !INGESTED_EVENT_TYPES.has(eventType)) {
    console.log(`${LOG_PREFIX} ignoring event`, { eventType, reason: !eventType ? "missing event_type" : "not in INGESTED_EVENT_TYPES" });
    return NextResponse.json({ ignored: true, eventType });
  }

  const noteId = extractNoteId(body);
  console.log(`${LOG_PREFIX} extracted noteId`, { noteId });
  if (!noteId) {
    console.error(`${LOG_PREFIX} rejected: no note id found in payload`, { body });
    return NextResponse.json({ error: "Could not find a note id in the webhook payload" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const workspace = await getWorkspaceByName(admin, "BuildableLabs");
    console.log(`${LOG_PREFIX} resolved workspace`, { workspaceId: workspace?.id ?? null });
    if (!workspace) {
      console.error(`${LOG_PREFIX} rejected: default workspace "BuildableLabs" not found`);
      return NextResponse.json({ error: "Default workspace not found" }, { status: 500 });
    }

    const note = await fetchGranolaNote(noteId);
    console.log(`${LOG_PREFIX} fetched note from Granola API`, { noteId: note.id, title: note.title });

    const meeting = await upsertMeetingFromGranolaNote(admin, workspace.id, note);
    console.log(`${LOG_PREFIX} upserted meeting`, { meetingId: meeting.id, noteId });
    return NextResponse.json({ ok: true, meetingId: meeting.id });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed processing webhook`, { noteId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error processing webhook" },
      { status: 500 },
    );
  }
}
