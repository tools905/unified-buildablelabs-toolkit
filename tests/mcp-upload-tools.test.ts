import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, clientName } = vi.hoisted(() => ({ admin: { current: null as unknown }, clientName: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.current }));
vi.mock("@/lib/mcp/clients", () => ({ getClientName: clientName }));

import { confirmUploadTool, startUploadTool } from "@/lib/mcp/tools/upload";
import { completeUpload } from "@/lib/mcp/upload-flow";
import { findLinkByToken, hashToken } from "@/lib/mcp/upload-links";
import { isMcpToolFailure } from "@/lib/mcp/errors";
import type { McpCaller } from "@/lib/mcp/contract";
import { fakeBoardDb, type Row } from "./helpers/fake-board-db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const IDEA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_IDEA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOMEONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTEXT = { origin: "https://tools.example.test" };
const pdf = new Uint8Array(readFileSync(join(__dirname, "fixtures", "three-page-carousel.pdf")));

const attachment = (id: string, over: Row = {}): Row => ({
  id,
  idea_id: IDEA,
  workspace_id: WORKSPACE,
  kind: "pdf",
  storage_path: `${WORKSPACE}/${IDEA}/${id}.pdf`,
  file_name: `${id}.pdf`,
  sort_order: 0,
  created_by: ME,
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

function setup(attachments: Row[] = []) {
  const db = fakeBoardDb({
    admin: true,
    memberOf: [WORKSPACE],
    content_ideas: [
      { id: IDEA, workspace_id: WORKSPACE, title: "Five gaps" },
      { id: OTHER_IDEA, workspace_id: OTHER_WORKSPACE, title: "Not mine" },
    ],
    content_idea_attachments: attachments,
  });
  admin.current = db.client;
  const caller: McpCaller = { userId: ME, workspaceId: WORKSPACE, clientId: "client-1", supabase: db.client };
  return { ...db, caller };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isMcpToolFailure(error)) return error;
    throw error;
  }
  throw new Error("expected a failure");
}

beforeEach(() => clientName.mockReset().mockResolvedValue("Chat App"));

describe("start_upload", () => {
  it("makes a one-time link for the idea and gives the person its address", async () => {
    const { caller, tables, client } = setup([attachment("a1"), attachment("a2")]);
    const result = await startUploadTool(caller, { idea_id: IDEA, file_name: "Carousel v2.pdf" }, CONTEXT);

    const token = result.upload_url.replace("https://tools.example.test/teams/mcp-upload/", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result).toMatchObject({ upload_id: tables.mcp_upload_links[0].id, replaces_attachment_id: null });
    expect(result.limits).toEqual({ max_bytes: 15 * 1024 * 1024, allowed_extensions: [".pdf", ".png", ".jpg", ".jpeg", ".webp"], files_used: 2, files_max: 12 });
    expect(new Date(result.expires_at).getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(new Date(result.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);

    const row = tables.mcp_upload_links[0];
    expect(row).toMatchObject({ workspace_id: WORKSPACE, idea_id: IDEA, user_id: ME, file_name: "Carousel v2.pdf", uploaded_via: "Chat App" });
    expect(row.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token); // only the hash is kept
    expect((await findLinkByToken(client, token))?.id).toBe(result.upload_id);
  });

  it("refuses a replacement that is not a real file id, and makes no link", async () => {
    const { caller, tables } = setup([attachment("a1")]);
    const result = await startUploadTool(caller, { idea_id: IDEA, file_name: "v2.pdf", replaces_attachment_id: "a1".padEnd(36, "0") }, CONTEXT).catch((e) => e);
    // not a uuid, so the contract refuses it before anything is made
    expect(isMcpToolFailure(result) && result.code).toBe("invalid_input");
    expect(tables.mcp_upload_links).toHaveLength(0);
  });

  it("replaces a file that is on the idea, even when the idea is full", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => attachment(`aaaaaaaa-aaaa-4aaa-8aaa-0000000000${String(i).padStart(2, "0")}`, { sort_order: i }));
    const { caller, tables } = setup(twelve);
    const target = twelve[3].id as string;
    const result = await startUploadTool(caller, { idea_id: IDEA, file_name: "v2.pdf", replaces_attachment_id: target }, CONTEXT);
    expect(result.replaces_attachment_id).toBe(target);
    expect(tables.mcp_upload_links[0].replaces_attachment_id).toBe(target);
  });

  it("refuses to add a 13th file", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => attachment(`f${i}`, { sort_order: i }));
    const { caller, tables } = setup(twelve);
    const error = await failure(startUploadTool(caller, { idea_id: IDEA, file_name: "v2.pdf" }, CONTEXT));
    expect(error.code).toBe("limit_reached");
    expect(tables.mcp_upload_links).toHaveLength(0);
  });

  it("refuses an idea that isn't in the workspace, a file that isn't on the idea, and a design link", async () => {
    const link = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
    const missing = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
    const { caller, tables } = setup([attachment(link, { kind: "link", storage_path: null, url: "https://figma.com/x" })]);
    expect((await failure(startUploadTool(caller, { idea_id: OTHER_IDEA, file_name: "v2.pdf" }, CONTEXT))).code).toBe("not_found");
    expect((await failure(startUploadTool(caller, { idea_id: "99999999-9999-4999-8999-999999999999", file_name: "v2.pdf" }, CONTEXT))).code).toBe("not_found");
    expect((await failure(startUploadTool(caller, { idea_id: IDEA, file_name: "v2.pdf", replaces_attachment_id: missing }, CONTEXT))).code).toBe("invalid_input");
    expect((await failure(startUploadTool(caller, { idea_id: IDEA, file_name: "v2.pdf", replaces_attachment_id: link }, CONTEXT))).code).toBe("invalid_input");
    expect(tables.mcp_upload_links).toHaveLength(0);
  });

  it("refuses a file name that isn't a PDF or image, or an input that isn't one", async () => {
    const { caller } = setup();
    expect((await failure(startUploadTool(caller, { idea_id: IDEA, file_name: "notes.docx" }, CONTEXT))).code).toBe("invalid_input");
    expect((await failure(startUploadTool(caller, { file_name: "a.pdf" }, CONTEXT))).code).toBe("invalid_input");
  });

  it("still makes a link when the app's name can't be found", async () => {
    clientName.mockResolvedValue(null);
    const { caller, tables } = setup();
    await startUploadTool(caller, { idea_id: IDEA, file_name: "a.pdf" }, CONTEXT);
    expect(tables.mcp_upload_links[0].uploaded_via).toBeNull();
  });
});

describe("confirm_upload", () => {
  async function uploaded() {
    const s = setup();
    const started = await startUploadTool(s.caller, { idea_id: IDEA, file_name: "v2.pdf" }, CONTEXT);
    const token = started.upload_url.split("/").pop()!;
    const row = tables0(s).mcp_upload_links[0];
    s.objects[`${WORKSPACE}/${IDEA}/mcp-${row.id}-abcdef012345.pdf`] = pdf;
    const done = await completeUpload(s.client, token, { file_name: "v2.pdf", content_type: "application/pdf", size_bytes: pdf.length, attempt: "abcdef012345" }, new Date());
    return { ...s, started, token, done };
  }
  const tables0 = (s: { tables: Record<string, Row[]> }) => s.tables;

  it("reports what the upload made, and the same again when asked twice", async () => {
    const s = await uploaded();
    expect(s.done).toMatchObject({ ok: true });
    const first = await confirmUploadTool(s.caller, { upload_id: s.started.upload_id });
    expect(first).toEqual({
      attachment_id: s.tables.content_idea_attachments[0].id,
      file_name: "v2.pdf",
      page_count: 3,
      replaced_attachment_id: null,
    });
    expect(await confirmUploadTool(s.caller, { upload_id: s.started.upload_id })).toEqual(first);
  });

  it("says no file has arrived yet while the link is waiting, and that it expired once it has", async () => {
    const s = setup();
    const started = await startUploadTool(s.caller, { idea_id: IDEA, file_name: "v2.pdf" }, CONTEXT);
    const waiting = await failure(confirmUploadTool(s.caller, { upload_id: started.upload_id }));
    expect(waiting).toMatchObject({ code: "not_found", message: expect.stringContaining("No file has arrived") });
    s.tables.mcp_upload_links[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await failure(confirmUploadTool(s.caller, { upload_id: started.upload_id }))).code).toBe("link_expired");
  });

  it("finds the file by where it was stored when its result wasn't noted down", async () => {
    const s = await uploaded();
    s.tables.mcp_upload_links[0].result = null;
    const result = await confirmUploadTool(s.caller, { upload_id: s.started.upload_id });
    expect(result.attachment_id).toBe(s.tables.content_idea_attachments[0].id);
  });

  it("treats another person's upload, or one that doesn't exist, as not found", async () => {
    const s = await uploaded();
    const stranger: McpCaller = { ...s.caller, userId: SOMEONE };
    expect((await failure(confirmUploadTool(stranger, { upload_id: s.started.upload_id }))).code).toBe("not_found");
    const otherWorkspace: McpCaller = { ...s.caller, workspaceId: OTHER_WORKSPACE };
    expect((await failure(confirmUploadTool(otherWorkspace, { upload_id: s.started.upload_id }))).code).toBe("not_found");
    expect((await failure(confirmUploadTool(s.caller, { upload_id: "99999999-9999-4999-8999-999999999999" }))).code).toBe("not_found");
    expect((await failure(confirmUploadTool(s.caller, { upload_id: "nope" }))).code).toBe("invalid_input");
  });
});
