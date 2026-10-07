import type { McpCaller, McpToolName } from "@/lib/mcp/contract";
import { createIdeaTool } from "@/lib/mcp/tools/ideas";
import { getPdfPagesTool } from "@/lib/mcp/tools/pdf";
import { getIdeaTool, getMonthScheduleTool, listIdeasTool } from "@/lib/mcp/tools/read";
import { addReviewPointTool, listReviewPointsTool, resolveReviewPointTool } from "@/lib/mcp/tools/review";
import { confirmUploadTool, startUploadTool } from "@/lib/mcp/tools/upload";

// What a tool may need to know about the request besides who is calling.
export type ToolContext = { origin: string }; // the site's address as the app used it, for links

export type McpToolHandler = (caller: McpCaller, input: unknown, context: ToolContext) => Promise<unknown>;

// The tools the endpoint serves right now. Add a tool here once its handler exists: the endpoint lists and
// runs exactly the tools in this table, so a tool that is in the contract but not built yet is never
// offered to the app.
export const MCP_TOOL_HANDLERS: Partial<Record<McpToolName, McpToolHandler>> = {
  list_ideas: listIdeasTool,
  get_idea: getIdeaTool,
  get_month_schedule: getMonthScheduleTool,
  get_pdf_pages: getPdfPagesTool,
  create_idea: createIdeaTool,
  list_review_points: listReviewPointsTool,
  add_review_point: addReviewPointTool,
  resolve_review_point: resolveReviewPointTool,
  start_upload: startUploadTool,
  confirm_upload: confirmUploadTool,
};
