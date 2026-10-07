// get_pdf_pages: shows the pages of a PDF on an idea as pictures. It acts as the signed-in person to find the
// file (so the same rules as the board decide whether they may see it), then reads the stored file with the
// server's own connection, because the file itself lives in storage rather than in the tables.

import { getPdfPagesInput, type GetPdfPagesOutput, type McpCaller } from "@/lib/mcp/contract";
import { McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import { renderPdfPages } from "@/lib/mcp/pdf-pages";
import { withImages, type WithImages } from "@/lib/mcp/tool-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";

export async function getPdfPagesTool(caller: McpCaller, rawInput: unknown): Promise<WithImages<GetPdfPagesOutput>> {
  const input = parseToolInput(getPdfPagesInput, rawInput);

  const { data: file, error } = await caller.supabase
    .from("content_idea_attachments")
    .select("id, kind, storage_path, workspace_id")
    .eq("id", input.attachment_id)
    .eq("workspace_id", caller.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!file) throw new McpToolFailure("not_found", "There is no file with that id in this workspace.");
  if (file.kind !== "pdf" || !file.storage_path) {
    throw new McpToolFailure("invalid_input", "That file is not a PDF. Only PDFs can be shown page by page.");
  }
  // A stored path always starts with its workspace, so a mismatched one is never read.
  if (!String(file.storage_path).startsWith(`${caller.workspaceId}/`)) {
    throw new McpToolFailure("not_found", "There is no file with that id in this workspace.");
  }

  const { data: blob, error: downloadError } = await createAdminClient().storage.from(CONTENT_BUCKET).download(file.storage_path);
  if (downloadError || !blob) throw new McpToolFailure("not_found", "The file could not be found in storage.");

  const rendered = await renderPdfPages(new Uint8Array(await blob.arrayBuffer()), input.first_page, input.last_page);
  return withImages(
    { attachment_id: input.attachment_id, page_count: rendered.pageCount, first_page: rendered.firstPage, last_page: rendered.lastPage },
    rendered.images,
  );
}
