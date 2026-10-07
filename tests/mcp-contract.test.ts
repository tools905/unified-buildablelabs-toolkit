import { describe, expect, it } from "vitest";
import {
  MCP_LIMITS,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
  addReviewPointInput,
  confirmUploadInput,
  createIdeaInput,
  getMonthScheduleInput,
  getPdfPagesInput,
  listIdeasInput,
  listReviewPointsInput,
  resolveReviewPointInput,
  MCP_ERROR_CODES,
  MCP_UPLOAD_API_PATH,
  MCP_UPLOAD_PAGE_PATH,
  startUploadInput,
  uploadCompleteInput,
  uploadFileInput,
  uploadLinkStateSchema,
  uploadPrepareResultSchema,
  uploadResultSchema,
} from "@/lib/mcp/contract";

const ID = "7b6f1f0e-6f0a-4d0e-9c56-2d9f6a3e8f11";

describe("MCP contract: the tools", () => {
  it("lists exactly the ten agreed tools", () => {
    expect([...MCP_TOOL_NAMES].sort()).toEqual(
      [
        "add_review_point",
        "confirm_upload",
        "create_idea",
        "get_idea",
        "get_month_schedule",
        "get_pdf_pages",
        "list_ideas",
        "list_review_points",
        "resolve_review_point",
        "start_upload",
      ].sort(),
    );
  });

  it("marks the reading tools read-only and everything that changes data as not", () => {
    const readOnly = MCP_TOOL_NAMES.filter((name) => MCP_TOOLS[name].readOnly).sort();
    expect(readOnly).toEqual(["get_idea", "get_month_schedule", "get_pdf_pages", "list_ideas", "list_review_points"]);
  });
});

describe("MCP contract: input checks", () => {
  it("gives list_ideas a default limit and caps it", () => {
    expect(listIdeasInput.parse({}).limit).toBe(MCP_LIMITS.listIdeasDefault);
    expect(listIdeasInput.safeParse({ limit: MCP_LIMITS.listIdeasMax + 1 }).success).toBe(false);
    expect(listIdeasInput.safeParse({ platform: "tiktok" }).success).toBe(false);
    expect(listIdeasInput.safeParse({ column: "feedback", platform: "instagram" }).success).toBe(true);
  });

  it("wants a month like 2026-10", () => {
    expect(getMonthScheduleInput.safeParse({ month: "2026-10" }).success).toBe(true);
    expect(getMonthScheduleInput.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(getMonthScheduleInput.safeParse({ month: "Oct 2026" }).success).toBe(false);
  });

  it("limits a PDF request to ten pages, in order", () => {
    expect(getPdfPagesInput.parse({ attachment_id: ID })).toMatchObject({ first_page: 1 });
    expect(getPdfPagesInput.safeParse({ attachment_id: ID, first_page: 1, last_page: 10 }).success).toBe(true);
    expect(getPdfPagesInput.safeParse({ attachment_id: ID, first_page: 1, last_page: 11 }).success).toBe(false);
    expect(getPdfPagesInput.safeParse({ attachment_id: ID, first_page: 5, last_page: 4 }).success).toBe(false);
    expect(getPdfPagesInput.safeParse({ attachment_id: "not-an-id" }).success).toBe(false);
  });

  it("hides ticked-off review points unless asked", () => {
    expect(listReviewPointsInput.parse({ idea_id: ID }).include_done).toBe(false);
  });

  it("trims a review point and keeps it within the app's length rules", () => {
    expect(addReviewPointInput.parse({ idea_id: ID, text: "  Shorten slide 1  " }).text).toBe("Shorten slide 1");
    expect(addReviewPointInput.safeParse({ idea_id: ID, text: " a " }).success).toBe(false);
    expect(addReviewPointInput.safeParse({ idea_id: ID, text: "x".repeat(3001) }).success).toBe(false);
    expect(addReviewPointInput.safeParse({ idea_id: ID, text: "x".repeat(3000) }).success).toBe(true);
  });

  it("ticks a point off by default and can un-tick it", () => {
    expect(resolveReviewPointInput.parse({ point_id: ID }).done).toBe(true);
    expect(resolveReviewPointInput.parse({ point_id: ID, done: false }).done).toBe(false);
  });

  it("accepts only PDFs and images for an upload, in any letter case", () => {
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "Carousel.PDF" }).success).toBe(true);
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "slide.webp" }).success).toBe(true);
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "run.exe" }).success).toBe(false);
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "" }).success).toBe(false);
  });

  it("lets an upload name the file it replaces, which must be a real id", () => {
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "a.pdf", replaces_attachment_id: ID }).success).toBe(true);
    expect(startUploadInput.safeParse({ idea_id: ID, file_name: "a.pdf", replaces_attachment_id: "x" }).success).toBe(false);
  });

  it("needs a title and at least one platform to create an idea, and keeps the optional parts optional", () => {
    expect(createIdeaInput.safeParse({ title: "A title", platforms: ["linkedin"] }).success).toBe(true);
    expect(createIdeaInput.safeParse({ title: "A title", platforms: [] }).success).toBe(false);
    expect(createIdeaInput.safeParse({ title: "A", platforms: ["linkedin"] }).success).toBe(false);
    expect(createIdeaInput.safeParse({ title: "A title", platforms: ["tiktok"] }).success).toBe(false);
    expect(createIdeaInput.safeParse({ title: "A title", platforms: ["x"], scheduled_for: "2026-10-12" }).success).toBe(true);
    expect(createIdeaInput.safeParse({ title: "A title", platforms: ["x"], scheduled_for: "12 Oct" }).success).toBe(false);
    expect(createIdeaInput.safeParse({ title: "A title", platforms: ["x"], scheduled_for: "2026-02-31" }).success).toBe(false);
  });

  it("needs a real upload id to confirm", () => {
    expect(confirmUploadInput.safeParse({ upload_id: ID }).success).toBe(true);
    expect(confirmUploadInput.safeParse({ upload_id: "abc" }).success).toBe(false);
  });
});

describe("MCP contract: limits match the app", () => {
  it("reuses the Content Board file limits", () => {
    expect(MCP_LIMITS.maxFileBytes).toBe(15 * 1024 * 1024);
    expect(MCP_LIMITS.maxFilesPerIdea).toBe(12);
    expect(MCP_LIMITS.maxResultChars).toBeLessThan(150_000);
  });
});

describe("MCP contract: the upload page", () => {
  const limits = { max_bytes: 15 * 1024 * 1024, allowed_extensions: [".pdf", ".png"], files_used: 3, files_max: 12 };

  it("agrees where the page and the backend live", () => {
    expect(MCP_UPLOAD_PAGE_PATH).toBe("/mcp-upload");
    expect(MCP_UPLOAD_API_PATH).toBe("/api/mcp-upload");
  });

  it("describes a link that can still be used with everything the page shows", () => {
    const ready = {
      status: "ready",
      idea_title: "Carousel: five gaps",
      file_name: "carousel-v2.pdf",
      replaces_file_name: "carousel-v1.pdf",
      expires_at: "2026-10-06T12:15:00.000Z",
      limits,
    };
    expect(uploadLinkStateSchema.parse(ready)).toEqual(ready);
    expect(uploadLinkStateSchema.safeParse({ ...ready, limits: undefined }).success).toBe(false);
  });

  it("describes the other states with a status alone, and refuses an unknown one", () => {
    for (const status of ["expired", "used", "unknown"]) {
      expect(uploadLinkStateSchema.safeParse({ status }).success).toBe(true);
    }
    expect(uploadLinkStateSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("describes the file the browser is about to send, with the picture optional", () => {
    expect(uploadFileInput.parse({ file_name: " a.pdf ", content_type: "application/pdf", size_bytes: 10 })).toEqual({
      file_name: "a.pdf",
      content_type: "application/pdf",
      size_bytes: 10,
      thumbnail_type: null,
    });
    expect(uploadFileInput.safeParse({ file_name: "a.pdf", content_type: "application/pdf", size_bytes: 10, thumbnail_type: "image/png" }).success).toBe(false);
    expect(uploadFileInput.safeParse({ file_name: "", content_type: "application/pdf", size_bytes: 10 }).success).toBe(false);
    expect(uploadFileInput.safeParse({ file_name: "a.pdf", content_type: "application/pdf", size_bytes: 0 }).success).toBe(false);
  });

  it("needs the attempt code from prepare to complete a try, and only that kind of code", () => {
    const base = { file_name: "a.pdf", content_type: "application/pdf", size_bytes: 10 };
    expect(uploadCompleteInput.safeParse({ ...base, attempt: "abcdef012345" }).success).toBe(true);
    expect(uploadCompleteInput.safeParse(base).success).toBe(false);
    for (const attempt of ["", "short", "ABCDEF012345", "../../etc/pw", "abcdef0123456"]) {
      expect(uploadCompleteInput.safeParse({ ...base, attempt }).success, attempt).toBe(false);
    }
  });

  it("answers prepare with where to put the file, or a refusal", () => {
    const target = { path: "w/i/mcp-x.pdf", upload_token: "t" };
    const attempt = "abcdef012345";
    expect(uploadPrepareResultSchema.safeParse({ ok: true, attempt, file: target, thumbnail: null }).success).toBe(true);
    expect(uploadPrepareResultSchema.safeParse({ ok: true, attempt, file: target, thumbnail: target }).success).toBe(true);
    expect(uploadPrepareResultSchema.safeParse({ ok: true, attempt, file: target }).success).toBe(false);
    expect(uploadPrepareResultSchema.safeParse({ ok: true, file: target, thumbnail: null }).success).toBe(false);
    expect(uploadPrepareResultSchema.safeParse({ ok: true, attempt: "../x", file: target, thumbnail: null }).success).toBe(false);
    expect(uploadPrepareResultSchema.safeParse({ ok: false, code: "invalid_input", message: "Too big." }).success).toBe(true);
  });

  it("answers complete with the stored file or a refusal", () => {
    const stored = { ok: true, attachment_id: ID, file_name: "a.pdf", kind: "pdf", page_count: 4, replaced_attachment_id: null };
    expect(uploadResultSchema.safeParse(stored).success).toBe(true);
    expect(uploadResultSchema.safeParse({ ...stored, kind: "image", page_count: null }).success).toBe(true);
    expect(uploadResultSchema.safeParse({ ok: false, code: "limit_reached", message: "This idea already has 12 files." }).success).toBe(true);
  });

  it("only answers a refusal with one of the agreed error codes", () => {
    for (const code of MCP_ERROR_CODES) {
      expect(uploadResultSchema.safeParse({ ok: false, code, message: "x" }).success).toBe(true);
    }
    expect(uploadResultSchema.safeParse({ ok: false, code: "oops", message: "x" }).success).toBe(false);
    expect(uploadResultSchema.safeParse({ ok: true, attachment_id: "nope", file_name: "a.pdf", kind: "pdf", page_count: 1, replaced_attachment_id: null }).success).toBe(false);
  });
});
