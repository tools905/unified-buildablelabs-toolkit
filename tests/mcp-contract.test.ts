import { describe, expect, it } from "vitest";
import {
  MCP_LIMITS,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
  addReviewPointInput,
  confirmUploadInput,
  getMonthScheduleInput,
  getPdfPagesInput,
  listIdeasInput,
  listReviewPointsInput,
  resolveReviewPointInput,
  startUploadInput,
} from "@/lib/mcp/contract";

const ID = "7b6f1f0e-6f0a-4d0e-9c56-2d9f6a3e8f11";

describe("MCP contract: the tools", () => {
  it("lists exactly the nine agreed tools", () => {
    expect([...MCP_TOOL_NAMES].sort()).toEqual(
      [
        "add_review_point",
        "confirm_upload",
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
