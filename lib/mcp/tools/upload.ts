// The two upload tools. A tool can't carry a file, so start_upload gives the person a one-time link to drop the
// file on (the page and its routes are in app/mcp-upload and app/api/mcp-upload), and confirm_upload tells the
// app what came of it.

import {
  MCP_LIMITS,
  MCP_UPLOAD_PAGE_PATH,
  confirmUploadInput,
  startUploadInput,
  type ConfirmUploadOutput,
  type McpCaller,
  type StartUploadOutput,
} from "@/lib/mcp/contract";
import { getClientName } from "@/lib/mcp/clients";
import { McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import type { ToolContext } from "@/lib/mcp/tools";
import { cleanFileName } from "@/lib/mcp/upload-flow";
import { createUploadLink, findLinkById, linkStatus } from "@/lib/mcp/upload-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAttachments } from "@/lib/services/content-attachment-service";
import { BASE_PATH } from "@/lib/utils/app-url";

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const NO_SUCH_IDEA = "There is no idea with that id in this workspace.";

export async function startUploadTool(caller: McpCaller, rawInput: unknown, context: ToolContext): Promise<StartUploadOutput> {
  const input = parseToolInput(startUploadInput, rawInput);

  // The person's own connection decides whether they may see the idea.
  const { data: idea, error } = await caller.supabase
    .from("content_ideas")
    .select("id")
    .eq("id", input.idea_id)
    .eq("workspace_id", caller.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!idea) throw new McpToolFailure("not_found", NO_SUCH_IDEA);

  const attachments = await listAttachments(caller.supabase, input.idea_id);
  const replaced = input.replaces_attachment_id ? attachments.find((item) => item.id === input.replaces_attachment_id) : undefined;
  if (input.replaces_attachment_id && !replaced) {
    throw new McpToolFailure("invalid_input", "That file is not on this idea, so it can't be replaced. Use get_idea to see its files.");
  }
  if (replaced?.kind === "link") {
    throw new McpToolFailure("invalid_input", "A design link can't be replaced by a file. Add the file without replacing anything.");
  }
  if (attachments.length - (replaced ? 1 : 0) >= MCP_LIMITS.maxFilesPerIdea) {
    throw new McpToolFailure("limit_reached", `This idea already has ${MCP_LIMITS.maxFilesPerIdea} files. Replace one of them or remove one on the board first.`);
  }

  const link = await createUploadLink(createAdminClient(), {
    workspaceId: caller.workspaceId,
    ideaId: input.idea_id,
    userId: caller.userId,
    fileName: cleanFileName(input.file_name),
    replacesAttachmentId: replaced?.id ?? null,
    uploadedVia: await getClientName(caller.clientId),
  });

  return {
    upload_id: link.id,
    upload_url: `${context.origin}${BASE_PATH}${MCP_UPLOAD_PAGE_PATH}/${link.token}`,
    expires_at: link.expiresAt,
    replaces_attachment_id: replaced?.id ?? null,
    limits: {
      max_bytes: MCP_LIMITS.maxFileBytes,
      allowed_extensions: ALLOWED_EXTENSIONS,
      files_used: attachments.length,
      files_max: MCP_LIMITS.maxFilesPerIdea,
    },
  };
}

export async function confirmUploadTool(caller: McpCaller, rawInput: unknown): Promise<ConfirmUploadOutput> {
  const input = parseToolInput(confirmUploadInput, rawInput);
  const admin = createAdminClient();

  const link = await findLinkById(admin, input.upload_id);
  // Another person's upload looks exactly like one that doesn't exist.
  if (!link || link.user_id !== caller.userId || link.workspace_id !== caller.workspaceId) {
    throw new McpToolFailure("not_found", "There is no upload with that id.");
  }

  if (link.result) {
    return {
      attachment_id: link.result.attachment_id,
      file_name: link.result.file_name,
      page_count: link.result.page_count,
      replaced_attachment_id: link.result.replaced_attachment_id,
    };
  }

  const status = linkStatus(link);
  if (status === "used") {
    // The file arrived but its result wasn't noted down: find it by the place it was stored.
    const base = `${link.workspace_id}/${link.idea_id}/mcp-${link.id}-`;
    const file = (await listAttachments(admin, link.idea_id)).find((item) => item.storage_path?.startsWith(base));
    if (file) {
      return { attachment_id: file.id, file_name: file.file_name ?? link.file_name, page_count: null, replaced_attachment_id: link.replaces_attachment_id };
    }
    throw new McpToolFailure("not_found", "The link was used but no file was added. Ask the person to try again, and call start_upload for a new link.");
  }
  if (status === "expired") {
    throw new McpToolFailure("link_expired", "The link expired before a file arrived. Call start_upload again for a new one.");
  }
  throw new McpToolFailure("not_found", "No file has arrived yet. Ask the person to open the link and drop the file there, then confirm again.");
}
