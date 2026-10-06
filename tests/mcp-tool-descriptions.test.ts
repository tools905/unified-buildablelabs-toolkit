import { describe, expect, it } from "vitest";
import { MCP_TOOLS, MCP_TOOL_NAMES } from "@/lib/mcp/contract";
import { MCP_TOOL_TEXT } from "@/lib/mcp/tool-descriptions";
import { contentIdeaStatusSchema } from "@/lib/validation/content-idea-schema";

// Words a description may use besides the tools and their inputs: parts of what a tool gives back, and
// the board columns' values (checked below).
const OUTPUT_FIELDS = [
  "moved_to_feedback",
  "link_url",
  "upload_url",
  "upload_id",
  "attachment_id",
  "files_used",
  "files_max",
];

function inputFieldNames(): string[] {
  return Object.values(MCP_TOOLS).flatMap((tool) => Object.keys((tool.input as unknown as { shape: object }).shape));
}

// Every snake_case word in a description: a tool, an input or something the tool gives back.
function wordsWithUnderscores(text: string): string[] {
  return text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
}

describe("tool descriptions", () => {
  it("has one for every tool and none for a tool that doesn't exist", () => {
    expect(Object.keys(MCP_TOOL_TEXT).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("gives each tool a short title and a description that is neither empty nor a wall of text", () => {
    for (const name of MCP_TOOL_NAMES) {
      const { title, description } = MCP_TOOL_TEXT[name];
      expect(title.length, `${name} title`).toBeGreaterThan(5);
      expect(title.length, `${name} title`).toBeLessThanOrEqual(50);
      expect(description.length, `${name} description`).toBeGreaterThan(150);
      expect(description.length, `${name} description`).toBeLessThanOrEqual(1100);
    }
  });

  it("only names tools, inputs and results that exist", () => {
    const known = new Set<string>([...MCP_TOOL_NAMES, ...inputFieldNames(), ...OUTPUT_FIELDS, ...contentIdeaStatusSchema.options]);
    for (const name of MCP_TOOL_NAMES) {
      for (const word of wordsWithUnderscores(MCP_TOOL_TEXT[name].description)) {
        expect(known.has(word), `${name} mentions "${word}"`).toBe(true);
      }
    }
  });

  it("explains every board column by the value the tool takes", () => {
    const text = MCP_TOOL_TEXT.list_ideas.description;
    for (const column of contentIdeaStatusSchema.options) expect(text, column).toContain(column);
  });

  it("points the upload steps at each other", () => {
    expect(MCP_TOOL_TEXT.start_upload.description).toContain("confirm_upload");
    expect(MCP_TOOL_TEXT.confirm_upload.description).toContain("start_upload");
  });

  it("tells the AI to ask before changing anything on the person's behalf where it matters", () => {
    expect(MCP_TOOL_TEXT.add_review_point.description).toMatch(/asked for or agreed to/);
    expect(MCP_TOOL_TEXT.resolve_review_point.description).toMatch(/get_pdf_pages/);
  });
});
