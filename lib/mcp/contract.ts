// Content Board connector for AI apps: the shapes both sides of the build agree on.
// The server side (endpoint, caller, read and upload tools) returns these; the review tools, the upload
// page and the consent screen use them. If you change a field here, tell the other person: this file is
// the contract. It holds no logic, only shapes, limits and input checks.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentAttachmentKind, ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";
import { contentIdeaStatusSchema, contentPlatformSchema } from "@/lib/validation/content-idea-schema";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_IDEA,
  MAX_REVIEW_POINT_LENGTH,
  MIN_REVIEW_POINT_LENGTH,
} from "@/lib/utils/content-board";

// ---- Limits ----------------------------------------------------------------------------------------
export const MCP_LIMITS = {
  uploadLinkMinutes: 15, // a one-time upload link stops working after this long, or after one use
  callsPerMinute: 60, // per person
  pdfPagesPerCall: 10,
  pdfPageMaxPixels: 1200, // longest side of a page image sent to the connected app
  auditKeepDays: 90,
  // The connecting app accepts about 150,000 characters from a tool; stay well under it.
  maxResultChars: 100_000,
  listIdeasDefault: 25,
  listIdeasMax: 100,
  maxFileBytes: MAX_ATTACHMENT_BYTES, // 15 MB, same as the app
  maxFilesPerIdea: MAX_ATTACHMENTS_PER_IDEA, // 12, same as the app
} as const;

// ---- Who is calling --------------------------------------------------------------------------------
// What `getMcpCaller(request)` returns (lib/mcp/caller.ts). Every tool starts from this and never works
// out the person or workspace itself. `supabase` acts as that person, so the database rules apply.
export type McpCaller = {
  userId: string;
  workspaceId: string;
  clientId: string; // the "client_id" claim of the token: marks a token issued to a connected app
  supabase: SupabaseClient<any>;
};

// ---- Errors ----------------------------------------------------------------------------------------
// The only error codes a tool answers with, so the caller (and the audit record) see the same words.
export const MCP_ERROR_CODES = [
  "not_found", // the idea, point or file doesn't exist, or the person can't see it
  "forbidden", // it exists but this person may not do that
  "invalid_input", // an input failed its check
  "limit_reached", // for example 12 files on an idea already
  "link_expired", // an upload link is past its time or already used
  "rate_limited", // more than 60 calls in a minute
] as const;
export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];
export type McpToolError = { code: McpErrorCode; message: string };

// ---- Shared input pieces ---------------------------------------------------------------------------
const id = z.string().uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-10.");

const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"] as const;

// ---- Tool inputs -----------------------------------------------------------------------------------
// Each tool's input as a zod schema. `.describe()` text is what the AI using the tool reads, so write it for that reader.
export const listIdeasInput = z.object({
  platform: contentPlatformSchema.optional().describe("Only ideas planned for this platform."),
  column: contentIdeaStatusSchema.optional().describe("Only ideas in this board column."),
  month: month.optional().describe("Only ideas scheduled in this month, like 2026-10."),
  mine_only: z.boolean().optional().describe("Only ideas assigned to the person asking."),
  limit: z.number().int().min(1).max(MCP_LIMITS.listIdeasMax).default(MCP_LIMITS.listIdeasDefault),
});

export const getIdeaInput = z.object({ idea_id: id });

export const getMonthScheduleInput = z.object({ month });

export const getPdfPagesInput = z
  .object({
    attachment_id: id.describe("A PDF file from get_idea."),
    first_page: z.number().int().min(1).default(1),
    last_page: z.number().int().min(1).optional().describe("Defaults to the first page plus nine more."),
  })
  .refine((v) => v.last_page === undefined || v.last_page >= v.first_page, {
    message: "last_page can't be before first_page.",
    path: ["last_page"],
  })
  .refine((v) => v.last_page === undefined || v.last_page - v.first_page + 1 <= MCP_LIMITS.pdfPagesPerCall, {
    message: `Ask for at most ${MCP_LIMITS.pdfPagesPerCall} pages at a time.`,
    path: ["last_page"],
  });

export const listReviewPointsInput = z.object({
  idea_id: id,
  include_done: z.boolean().default(false).describe("Also list points that are already ticked off."),
});

export const addReviewPointInput = z.object({
  idea_id: id,
  text: z.string().trim().min(MIN_REVIEW_POINT_LENGTH).max(MAX_REVIEW_POINT_LENGTH),
});

export const resolveReviewPointInput = z.object({
  point_id: id,
  done: z.boolean().default(true).describe("false un-ticks a point."),
});

export const startUploadInput = z.object({
  idea_id: id,
  file_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((name) => ALLOWED_UPLOAD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)), {
      message: "Use a PDF or an image (png, jpg or webp).",
    }),
  replaces_attachment_id: id.optional().describe("Swap this existing file for the new one instead of adding another."),
});

export const confirmUploadInput = z.object({ upload_id: id });

// ---- Tool outputs ----------------------------------------------------------------------------------
export type IdeaSummary = {
  id: string;
  title: string;
  platforms: ContentPlatform[];
  column: ContentIdeaStatus;
  scheduled_for: string | null; // a day like "2026-10-12"
  open_review_points: number;
  file_count: number;
  updated_at: string;
};
export type ListIdeasOutput = { ideas: IdeaSummary[]; truncated: boolean };

export type IdeaFile = {
  id: string;
  kind: ContentAttachmentKind;
  file_name: string | null;
  size_bytes: number | null;
  link_url: string | null; // only for design links
  uploaded_by: string; // a name
  uploaded_at: string;
};

export type ReviewPoint = {
  id: string;
  text: string;
  by: string; // the reviewer's name
  created_at: string;
  done: boolean;
  done_at: string | null;
};

export type GetIdeaOutput = IdeaSummary & {
  details: string | null;
  caption: string | null;
  post_url: string | null;
  reference_links: string[];
  files: IdeaFile[];
  review_points: ReviewPoint[];
};

export type MonthScheduleOutput = {
  month: string;
  days: { date: string; ideas: { id: string; title: string; platforms: ContentPlatform[] }[] }[];
};

// The page images travel as image content next to this object, not inside it.
export type GetPdfPagesOutput = { attachment_id: string; page_count: number; first_page: number; last_page: number };

export type ListReviewPointsOutput = { points: ReviewPoint[] };
// The first review point on an idea in the Ideas column moves it to Feedback, as in the app.
export type AddReviewPointOutput = { point: ReviewPoint; moved_to_feedback: boolean };
export type ResolveReviewPointOutput = { point: ReviewPoint };

export type StartUploadOutput = {
  upload_id: string;
  upload_url: string; // one-time, opened by the person in their browser
  expires_at: string;
  replaces_attachment_id: string | null;
  limits: UploadLimits;
};
export type ConfirmUploadOutput = {
  attachment_id: string;
  file_name: string;
  page_count: number | null; // null for an image
  replaced_attachment_id: string | null;
};

// ---- The upload page -------------------------------------------------------------------------------
// The page at <site>/teams/mcp-upload/<token> (Mridul) talks to one route of the upload backend (Ananya):
// <site>/teams/api/mcp-upload/<token>. The token in the address is the only credential, so neither the page
// nor the route needs a sign-in. Build `upload_url` from the request's own address, never a fixed host.
//
// GET answers with status 200 and an UploadLinkState, whatever state the link is in.
// POST receives multipart/form-data and answers with an UploadResult (the body, not the HTTP status, is
// what the page reads). The fields are UPLOAD_FORM_FIELDS:
//   file       required. The PDF, or an image the browser has already shrunk, under its original name.
//   thumbnail  optional. A small JPEG or WebP picture of it (the first page for a PDF), made in the
//              browser exactly as the board does, so the card shows a picture. Without it the card shows
//              a plain "PDF" or no picture.
// A successful POST stores the file and adds it to the idea like the board does (under the person who
// started the upload, with `uploaded_via` set to the app's name), replaces the old file when the link
// said so, and uses the link up. confirm_upload then only reports that result to the AI, and gives the
// same answer if it is called again. A refused file (wrong type, too big, idea full) does not use the link,
// so the person can try again until it expires. The server checks type and size itself and never trusts
// the browser.
export const MCP_UPLOAD_PAGE_PATH = "/mcp-upload";
export const MCP_UPLOAD_API_PATH = "/api/mcp-upload";
export const UPLOAD_FORM_FIELDS = { file: "file", thumbnail: "thumbnail" } as const;

export const uploadLimitsSchema = z.object({
  max_bytes: z.number().int().positive(),
  allowed_extensions: z.array(z.string()),
  files_used: z.number().int().min(0),
  files_max: z.number().int().positive(),
});
export type UploadLimits = z.infer<typeof uploadLimitsSchema>;

export const uploadLinkStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    idea_title: z.string(),
    file_name: z.string(), // the name start_upload was given: shown to the person as what is expected
    replaces_file_name: z.string().nullable(), // set when the file swaps an existing one
    expires_at: z.string(),
    limits: uploadLimitsSchema,
  }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("used") }),
  z.object({ status: z.literal("unknown") }), // never existed, or not a link this server made
]);
export type UploadLinkState = z.infer<typeof uploadLinkStateSchema>;

export const uploadResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    attachment_id: z.string().uuid(),
    file_name: z.string(),
    kind: z.enum(["pdf", "image"]),
    replaced: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum(MCP_ERROR_CODES), // link_expired, invalid_input (type or size), limit_reached, not_found, ...
    message: z.string(), // plain words the page can show to the person as they are
  }),
]);
export type UploadResult = z.infer<typeof uploadResultSchema>;

// ---- The tools -------------------------------------------------------------------------------------
// `readOnly` becomes the tool's "read only" hint for the connected app, so it can run read tools without asking.
export const MCP_TOOLS = {
  list_ideas: { readOnly: true, input: listIdeasInput },
  get_idea: { readOnly: true, input: getIdeaInput },
  get_month_schedule: { readOnly: true, input: getMonthScheduleInput },
  get_pdf_pages: { readOnly: true, input: getPdfPagesInput },
  list_review_points: { readOnly: true, input: listReviewPointsInput },
  add_review_point: { readOnly: false, input: addReviewPointInput },
  resolve_review_point: { readOnly: false, input: resolveReviewPointInput },
  start_upload: { readOnly: false, input: startUploadInput },
  confirm_upload: { readOnly: false, input: confirmUploadInput },
} as const;

export type McpToolName = keyof typeof MCP_TOOLS;
export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS) as McpToolName[];

// ---- Table rows (Ananya's spec; Mridul writes migrations 049 to 052) -------------------------------
// 049 mcp_upload_links. Only the server reads and writes it; the link's secret is stored only as a hash.
export type McpUploadLinkRow = {
  id: string;
  workspace_id: string;
  idea_id: string;
  user_id: string;
  file_name: string;
  replaces_attachment_id: string | null;
  token_hash: string; // unique
  expires_at: string; // created_at plus MCP_LIMITS.uploadLinkMinutes
  used_at: string | null; // empty until the link is used
  created_at: string;
};

// 050 mcp_audit_log. Members can read their own rows, admins all; only the server writes.
export type McpAuditRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  client_id: string;
  tool_name: McpToolName;
  idea_id: string | null;
  outcome: "ok" | "error";
  error_code: McpErrorCode | null;
  created_at: string;
};

// 051 content_idea_attachments.uploaded_via (text, empty for files added on the board). The upload backend
// sets it to the name of the app the file came through, at most 60 characters, when it adds the file. The
// board shows it as "uploaded by <person> through <app>" on the file and in the activity list.

// 052 safety rules, the last migration: on every table outside the Content Board, a restrictive rule that
// blocks any token carrying a client_id, so these tokens can't read other data through Supabase directly.
