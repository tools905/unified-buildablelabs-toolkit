// The reading tools: find ideas, read one in full, see a month's calendar. They act as the signed-in
// person (`caller.supabase`) and only ever look inside the caller's workspace.

import {
  getIdeaInput,
  getMonthScheduleInput,
  listIdeasInput,
  type GetIdeaOutput,
  type IdeaFile,
  type IdeaSummary,
  type ListIdeasOutput,
  type McpCaller,
  type MonthScheduleOutput,
  type ReviewPoint,
} from "@/lib/mcp/contract";
import { McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import type { ContentPlatform } from "@/lib/db/types";
import { listAttachments } from "@/lib/services/content-attachment-service";
import { CONTENT_IDEA_SELECT } from "@/lib/services/content-idea-service";
import { listReviewPoints } from "@/lib/services/content-review-service";

type IdeaRow = {
  id: string;
  title: string;
  description: string | null;
  caption: string | null;
  platform: ContentPlatform;
  platforms: ContentPlatform[] | null;
  status: IdeaSummary["column"];
  post_url: string | null;
  scheduled_for: string | null;
  reference_links: string[] | null;
  updated_at: string;
  attachments?: { kind: string }[] | null;
  review_points?: { is_resolved: boolean }[] | null;
  assignees?: { user_id: string }[] | null;
};

const platformsOf = (idea: Pick<IdeaRow, "platform" | "platforms">): ContentPlatform[] =>
  idea.platforms?.length ? idea.platforms : [idea.platform];

function toSummary(idea: IdeaRow): IdeaSummary {
  return {
    id: idea.id,
    title: idea.title,
    platforms: platformsOf(idea),
    column: idea.status,
    scheduled_for: idea.scheduled_for ?? null,
    open_review_points: (idea.review_points ?? []).filter((point) => !point.is_resolved).length,
    // Uploaded images and PDFs, as on the board: a design link is not a file.
    file_count: (idea.attachments ?? []).filter((item) => item.kind !== "link").length,
    updated_at: idea.updated_at,
  };
}

export async function listIdeasTool(caller: McpCaller, rawInput: unknown): Promise<ListIdeasOutput> {
  const input = parseToolInput(listIdeasInput, rawInput);

  let query = caller.supabase.from("content_ideas").select(CONTENT_IDEA_SELECT).eq("workspace_id", caller.workspaceId);
  if (input.column) query = query.eq("status", input.column);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;

  const ideas = ((data ?? []) as IdeaRow[]).filter((idea) => {
    if (input.platform && !platformsOf(idea).includes(input.platform)) return false;
    if (input.month && !idea.scheduled_for?.startsWith(`${input.month}-`)) return false;
    if (input.mine_only && !(idea.assignees ?? []).some((assignee) => assignee.user_id === caller.userId)) return false;
    return true;
  });

  return { ideas: ideas.slice(0, input.limit).map(toSummary), truncated: ideas.length > input.limit };
}

export async function getIdeaTool(caller: McpCaller, rawInput: unknown): Promise<GetIdeaOutput> {
  const input = parseToolInput(getIdeaInput, rawInput);

  const { data, error } = await caller.supabase
    .from("content_ideas")
    .select(CONTENT_IDEA_SELECT)
    .eq("id", input.idea_id)
    .eq("workspace_id", caller.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new McpToolFailure("not_found", "There is no idea with that id in this workspace.");
  const idea = data as IdeaRow;

  const [attachments, points] = await Promise.all([
    listAttachments(caller.supabase, input.idea_id),
    listReviewPoints(caller.supabase, input.idea_id),
  ]);

  const uploaderIds = [...new Set(attachments.map((item) => item.created_by))];
  const names = new Map<string, string>();
  if (uploaderIds.length) {
    const { data: people, error: peopleError } = await caller.supabase.from("profiles").select("id, full_name, email").in("id", uploaderIds);
    if (peopleError) throw peopleError;
    for (const person of people ?? []) names.set(person.id, person.full_name || person.email || "Unknown");
  }

  const files: IdeaFile[] = attachments.map((item) => ({
    id: item.id,
    kind: item.kind,
    file_name: item.file_name,
    size_bytes: item.size_bytes,
    link_url: item.kind === "link" ? item.url : null,
    uploaded_by: names.get(item.created_by) ?? "Unknown",
    uploaded_via: item.uploaded_via ?? null,
    uploaded_at: item.created_at,
  }));

  const review_points: ReviewPoint[] = points.map((point) => {
    const author = Array.isArray(point.author) ? point.author[0] : point.author;
    return {
      id: point.id,
      text: point.body,
      by: author?.full_name || author?.email || "Unknown",
      created_at: point.created_at,
      done: point.is_resolved,
      done_at: point.resolved_at,
    };
  });

  return {
    ...toSummary({ ...idea, attachments, review_points: points }),
    details: idea.description ?? null,
    caption: idea.caption ?? null,
    post_url: idea.post_url ?? null,
    reference_links: idea.reference_links ?? [],
    files,
    review_points,
  };
}

// The last day of a month like "2026-10", as a day number (28 to 31).
function daysIn(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export async function getMonthScheduleTool(caller: McpCaller, rawInput: unknown): Promise<MonthScheduleOutput> {
  const input = parseToolInput(getMonthScheduleInput, rawInput);

  const { data, error } = await caller.supabase
    .from("content_ideas")
    .select("id, title, platform, platforms, scheduled_for")
    .eq("workspace_id", caller.workspaceId)
    .gte("scheduled_for", `${input.month}-01`)
    .lte("scheduled_for", `${input.month}-${String(daysIn(input.month)).padStart(2, "0")}`)
    .order("scheduled_for", { ascending: true });
  if (error) throw error;

  const byDay = new Map<string, MonthScheduleOutput["days"][number]["ideas"]>();
  for (const idea of (data ?? []) as Pick<IdeaRow, "id" | "title" | "platform" | "platforms" | "scheduled_for">[]) {
    if (!idea.scheduled_for) continue;
    const day = byDay.get(idea.scheduled_for) ?? [];
    day.push({ id: idea.id, title: idea.title, platforms: platformsOf(idea) });
    byDay.set(idea.scheduled_for, day);
  }

  return {
    month: input.month,
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ideas]) => ({ date, ideas })),
  };
}
