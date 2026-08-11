import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGranolaNote, verifyGranolaWebhookSignature } from "@/lib/services/granola-client";
import { upsertMeetingFromGranolaNote } from "@/lib/services/calendar-service";
import { getWorkspaceByName } from "@/lib/services/workspace-service";

// Ingests only these two events — a fresh or regenerated summary is what
// makes a note fetchable at all via the Granola API. note.edited/
// note.access_granted don't necessarily mean new summary content.
const INGESTED_EVENT_TYPES = new Set(["note.generated", "note.regenerated"]);

function extractNoteId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  const candidates = [
    typeof record.id === "string" ? record.id : undefined,
    typeof record.note_id === "string" ? record.note_id : undefined,
    typeof data?.id === "string" ? (data.id as string) : undefined,
    typeof (data?.note as Record<string, unknown> | undefined)?.id === "string"
      ? ((data?.note as Record<string, unknown>).id as string)
      : undefined,
  ];
  return candidates.find((id) => id?.startsWith("not_")) ?? null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const verified = verifyGranolaWebhookSignature(rawBody, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = typeof (body as Record<string, unknown>)?.type === "string"
    ? ((body as Record<string, unknown>).type as string)
    : null;

  if (!eventType || !INGESTED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ ignored: true, eventType });
  }

  const noteId = extractNoteId(body);
  if (!noteId) {
    return NextResponse.json({ error: "Could not find a note id in the webhook payload" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const workspace = await getWorkspaceByName(admin, "BuildableLabs");
    if (!workspace) {
      return NextResponse.json({ error: "Default workspace not found" }, { status: 500 });
    }

    const note = await fetchGranolaNote(noteId);
    const meeting = await upsertMeetingFromGranolaNote(admin, workspace.id, note);
    return NextResponse.json({ ok: true, meetingId: meeting.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error processing webhook" },
      { status: 500 },
    );
  }
}
