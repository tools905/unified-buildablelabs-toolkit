import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanFileName, completeUpload, getUploadState, prepareUpload, sniffFile } from "@/lib/mcp/upload-flow";
import { claimLink, cleanupExpiredLinks, createUploadLink, findLinkByToken, hashToken, linkStatus, newToken, releaseLink } from "@/lib/mcp/upload-links";
import { MCP_LIMITS, uploadLinkStateSchema, uploadPrepareResultSchema, uploadResultSchema } from "@/lib/mcp/contract";
import { fakeBoardDb, type Row } from "./helpers/fake-board-db";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const IDEA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-10-07T10:00:00.000Z");
const ATTEMPT = "abcdef012345";

const pdf = new Uint8Array(readFileSync(join(__dirname, "fixtures", "three-page-carousel.pdf")));
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const notAPdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4, 5, 6, 7, 8]); // starts like one, isn't one

const idea = (over: Row = {}): Row => ({ id: IDEA, workspace_id: WORKSPACE, title: "Five gaps", ...over });
const attachment = (id: string, over: Row = {}): Row => ({
  id,
  idea_id: IDEA,
  workspace_id: WORKSPACE,
  kind: "image",
  storage_path: `${WORKSPACE}/${IDEA}/${id}.png`,
  thumb_path: null,
  file_name: `${id}.png`,
  size_bytes: 10,
  sort_order: 0,
  created_by: ME,
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

async function setup(options: { attachments?: Row[]; objects?: Record<string, Uint8Array>; replaces?: string | null; uploadedVia?: string | null; at?: Date } = {}) {
  const db = fakeBoardDb({
    admin: true,
    memberOf: [WORKSPACE],
    content_ideas: [idea()],
    content_idea_attachments: options.attachments ?? [],
    objects: options.objects ?? {},
  });
  const link = await createUploadLink(
    db.client,
    {
      workspaceId: WORKSPACE,
      ideaId: IDEA,
      userId: ME,
      fileName: "v2.pdf",
      replacesAttachmentId: options.replaces ?? null,
      uploadedVia: options.uploadedVia === undefined ? "Chat App" : options.uploadedVia,
    },
    options.at ?? NOW,
  );
  return { ...db, link, base: `${WORKSPACE}/${IDEA}/mcp-${link.id}-${ATTEMPT}` };
}

const file = (name: string, type: string, size = 1000, thumbnail: "image/jpeg" | "image/webp" | null = null) => ({
  file_name: name,
  content_type: type,
  size_bytes: size,
  thumbnail_type: thumbnail,
  attempt: ATTEMPT,
});

describe("what a file is", () => {
  it("is told by the first bytes, whatever the name says", () => {
    expect(sniffFile(pdf)).toBe("pdf");
    expect(sniffFile(png)).toBe("png");
    expect(sniffFile(jpeg)).toBe("jpeg");
    expect(sniffFile(webp)).toBe("webp");
    expect(sniffFile(new TextEncoder().encode("MZ executable"))).toBeNull();
    expect(sniffFile(new Uint8Array())).toBeNull();
  });

  it("gives a name that is safe to show and store", () => {
    expect(cleanFileName("C:\\Users\\me\\deck.pdf")).toBe("deck.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("  my\u0000 deck.pdf ")).toBe("my deck.pdf");
    expect(cleanFileName("")).toBe("upload");
    expect(cleanFileName("a".repeat(300))).toHaveLength(200);
  });
});

describe("upload links", () => {
  it("has a secret that is never stored, only its hash, and the hash is the same each time", async () => {
    const { link, tables } = await setup();
    const row = tables.mcp_upload_links[0];
    expect(row.token_hash).toBe(hashToken(link.token));
    expect(JSON.stringify(row)).not.toContain(link.token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken()).not.toBe(newToken());
    expect(newToken().length).toBeGreaterThanOrEqual(40);
  });

  it("lasts 15 minutes and works once", async () => {
    const { link, client, tables } = await setup();
    expect(new Date(link.expiresAt).getTime() - NOW.getTime()).toBe(MCP_LIMITS.uploadLinkMinutes * 60_000);
    const row = (await findLinkByToken(client, link.token))!;
    expect(linkStatus(row, NOW)).toBe("ready");
    expect(linkStatus(row, new Date(NOW.getTime() + 15 * 60_000))).toBe("expired");
    expect((await claimLink(client, row.id, NOW))?.id).toBe(row.id);
    expect(await claimLink(client, row.id, NOW)).toBeNull(); // the second request loses
    expect(linkStatus(tables.mcp_upload_links[0] as never, NOW)).toBe("used");
    await releaseLink(client, row.id);
    expect((await claimLink(client, row.id, NOW))?.id).toBe(row.id); // given back, so it can be used again
  });

  it("never claims a link that has expired", async () => {
    const { link, client } = await setup();
    const row = (await findLinkByToken(client, link.token))!;
    expect(await claimLink(client, row.id, new Date(NOW.getTime() + 16 * 60_000))).toBeNull();
  });

  it("finds nothing for a token it didn't make", async () => {
    const { client } = await setup();
    expect(await findLinkByToken(client, "nope")).toBeNull();
    expect(await findLinkByToken(client, "")).toBeNull();
    expect(await findLinkByToken(client, "x".repeat(500))).toBeNull();
  });

  it("clears out old links and old call records in the nightly job", async () => {
    const { client, tables } = await setup();
    const day = 24 * 3600_000;
    const link = (id: string, over: Row) => ({ id, workspace_id: WORKSPACE, idea_id: IDEA, ...over });
    tables.mcp_upload_links.push(
      link("old-expired", { expires_at: new Date(NOW.getTime() - 2 * day).toISOString(), used_at: null }),
      link("old-used", { expires_at: new Date(NOW.getTime() + day).toISOString(), used_at: new Date(NOW.getTime() - 2 * day).toISOString() }),
      link("fresh-used", { expires_at: new Date(NOW.getTime() + day).toISOString(), used_at: new Date(NOW.getTime() - 1000).toISOString() }),
    );
    tables.mcp_audit_log.push(
      { id: "old-call", created_at: new Date(NOW.getTime() - 91 * day).toISOString() },
      { id: "recent-call", created_at: new Date(NOW.getTime() - 10 * day).toISOString() },
    );
    const result = await cleanupExpiredLinks(client, NOW);
    expect(result).toEqual({ linksRemoved: 2, orphanFilesRemoved: 0, auditRowsRemoved: 1 });
    expect(tables.mcp_upload_links.map((r) => r.id)).toContain("fresh-used");
    expect(tables.mcp_upload_links.map((r) => r.id)).not.toContain("old-expired");
    expect(tables.mcp_audit_log.map((r) => r.id)).toEqual(["recent-call"]);
  });

  it("also removes files an old link's tries left in storage, but never the file that became part of the idea", async () => {
    const day = 24 * 3600_000;
    const { client, tables, objects } = await setup({ attachments: [] });
    const folder = `${WORKSPACE}/${IDEA}`;
    tables.mcp_upload_links.push({
      id: "gone", workspace_id: WORKSPACE, idea_id: IDEA, expires_at: new Date(NOW.getTime() - 2 * day).toISOString(), used_at: null,
    });
    tables.mcp_upload_links.push({
      id: "done", workspace_id: WORKSPACE, idea_id: IDEA, expires_at: new Date(NOW.getTime() + day).toISOString(), used_at: new Date(NOW.getTime() - 2 * day).toISOString(),
    });
    // "gone": two tries that never completed. "done": the file that was kept, and a refused one beside it.
    objects[`${folder}/mcp-gone-aaaaaaaaaaaa.pdf`] = pdf;
    objects[`${folder}/mcp-gone-bbbbbbbbbbbb_thumb.jpg`] = jpeg;
    objects[`${folder}/mcp-done-cccccccccccc.pdf`] = pdf;
    objects[`${folder}/mcp-done-cccccccccccc_thumb.jpg`] = jpeg;
    objects[`${folder}/mcp-done-dddddddddddd.pdf`] = pdf;
    objects[`${folder}/someone-elses-file.pdf`] = pdf;
    tables.content_idea_attachments.push(
      attachment("kept", { storage_path: `${folder}/mcp-done-cccccccccccc.pdf`, thumb_path: `${folder}/mcp-done-cccccccccccc_thumb.jpg` }),
    );

    const result = await cleanupExpiredLinks(client, NOW);
    expect(result).toMatchObject({ linksRemoved: 2, orphanFilesRemoved: 3 });
    expect(Object.keys(objects).sort()).toEqual(
      [`${folder}/mcp-done-cccccccccccc.pdf`, `${folder}/mcp-done-cccccccccccc_thumb.jpg`, `${folder}/someone-elses-file.pdf`].sort(),
    );
  });
});

describe("the state of a link", () => {
  it("shows what the page needs while the link is ready", async () => {
    const { link, client } = await setup({ attachments: [attachment("a1", { file_name: "old.pdf", kind: "pdf" }), attachment("a2")], replaces: "a1" });
    const state = await getUploadState(client, link.token, NOW);
    expect(uploadLinkStateSchema.parse(state)).toEqual({
      status: "ready",
      idea_title: "Five gaps",
      file_name: "v2.pdf",
      replaces_file_name: "old.pdf",
      expires_at: link.expiresAt,
      limits: { max_bytes: 15 * 1024 * 1024, allowed_extensions: [".pdf", ".png", ".jpg", ".jpeg", ".webp"], files_used: 2, files_max: 12 },
    });
  });

  it("says unknown, expired or used, and nothing more", async () => {
    const { link, client } = await setup();
    expect(await getUploadState(client, "not-a-token", NOW)).toEqual({ status: "unknown" });
    expect(await getUploadState(client, link.token, new Date(NOW.getTime() + 16 * 60_000))).toEqual({ status: "expired" });
    await claimLink(client, (await findLinkByToken(client, link.token))!.id, NOW);
    expect(await getUploadState(client, link.token, NOW)).toEqual({ status: "used" });
  });
});

describe("prepare: where the file may go", () => {
  it("hands out one place for the file and one for its picture, fixed by the link and this try", async () => {
    const { link, client, storageCalls } = await setup();
    const result = await prepareUpload(client, link.token, file("v2.pdf", "application/pdf", 5000, "image/webp"), NOW);
    expect(result.ok).toBe(true);
    const { attempt } = result as { attempt: string };
    const base = `${WORKSPACE}/${IDEA}/mcp-${link.id}-${attempt}`;
    expect(uploadPrepareResultSchema.parse(result)).toEqual({
      ok: true,
      attempt,
      file: { path: `${base}.pdf`, upload_token: `token-for-${base}.pdf` },
      thumbnail: { path: `${base}_thumb.webp`, upload_token: `token-for-${base}_thumb.webp` },
    });
    expect(storageCalls.signed).toEqual([`${base}.pdf`, `${base}_thumb.webp`]);
  });

  it("gives every try its own places, so a retry never meets the cached file of an earlier one", async () => {
    const { link, client } = await setup();
    const first = (await prepareUpload(client, link.token, file("v2.pdf", "application/pdf"), NOW)) as { attempt: string; file: { path: string } };
    const second = (await prepareUpload(client, link.token, file("v2.pdf", "application/pdf"), NOW)) as { attempt: string; file: { path: string } };
    expect(first.attempt).not.toBe(second.attempt);
    expect(first.file.path).not.toBe(second.file.path);
  });

  it("gives no place for a picture when none is coming, and uses the right ending for each kind", async () => {
    const { link, client } = await setup();
    const png1 = await prepareUpload(client, link.token, file("a.PNG", "image/png"), NOW);
    expect(png1).toMatchObject({ ok: true, file: { path: expect.stringMatching(/\.png$/) }, thumbnail: null });
    expect(await prepareUpload(client, link.token, file("a.jpeg", "image/jpeg", 10, "image/jpeg"), NOW)).toMatchObject({
      file: { path: expect.stringMatching(/\.jpg$/) },
      thumbnail: { path: expect.stringMatching(/_thumb\.jpg$/) },
    });
  });

  it("refuses a type that isn't allowed, a name that doesn't match its type, and a file that is too big", async () => {
    const { link, client, storageCalls } = await setup();
    const code = async (input: unknown) => (await prepareUpload(client, link.token, input, NOW)) as { ok: false; code: string; message: string };
    expect((await code(file("run.exe", "application/octet-stream"))).code).toBe("invalid_input");
    expect((await code(file("deck.pdf", "image/png"))).code).toBe("invalid_input");
    expect((await code(file("pic.png", "application/pdf"))).code).toBe("invalid_input");
    expect((await code(file("pic.gif", "image/gif"))).code).toBe("invalid_input");
    const big = await code(file("deck.pdf", "application/pdf", MCP_LIMITS.maxFileBytes + 1));
    expect(big).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringContaining("15 MB") });
    expect((await code({ nonsense: true })).code).toBe("invalid_input");
    expect(storageCalls.signed).toEqual([]);
  });

  it("refuses a link that is unknown, expired or already used", async () => {
    const { link, client } = await setup();
    expect(await prepareUpload(client, "nope", file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false, code: "not_found" });
    expect(await prepareUpload(client, link.token, file("a.pdf", "application/pdf"), new Date(NOW.getTime() + 16 * 60_000))).toMatchObject({ ok: false, code: "link_expired" });
    await claimLink(client, (await findLinkByToken(client, link.token))!.id, NOW);
    expect(await prepareUpload(client, link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false, code: "link_expired", message: expect.stringContaining("already been used") });
  });

  it("says the idea is full at 12 files, but lets a file replace another one", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => attachment(`f${i}`, { sort_order: i }));
    const adding = await setup({ attachments: twelve });
    expect(await prepareUpload(adding.client, adding.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false, code: "limit_reached" });
    const replacing = await setup({ attachments: twelve, replaces: "f3" });
    expect(await prepareUpload(replacing.client, replacing.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: true });
  });
});

describe("complete: check the file and put it on the idea", () => {
  it("adds a PDF as the person who started the upload, labelled with the app, and uses the link up", async () => {
    const { link, client, base, tables, objects } = await setup();
    objects[`${base}.pdf`] = pdf;
    const result = await completeUpload(client, link.token, file("../Carousel v2.pdf", "application/pdf", pdf.length), NOW);

    expect(uploadResultSchema.parse(result)).toMatchObject({ ok: true, file_name: "Carousel v2.pdf", kind: "pdf", page_count: 3, replaced_attachment_id: null });
    expect(tables.content_idea_attachments).toHaveLength(1);
    expect(tables.content_idea_attachments[0]).toMatchObject({
      idea_id: IDEA,
      workspace_id: WORKSPACE,
      kind: "pdf",
      storage_path: `${base}.pdf`,
      file_name: "Carousel v2.pdf",
      size_bytes: pdf.length,
      uploaded_via: "Chat App",
      created_by: ME,
    });
    expect(tables.content_idea_attachments[0].id).toBe((result as { attachment_id: string }).attachment_id);
    const stored = tables.mcp_upload_links[0];
    expect(stored.used_at).toBe(NOW.toISOString());
    expect(stored.result).toMatchObject({ attachment_id: tables.content_idea_attachments[0].id, kind: "pdf", page_count: 3 });
  });

  it("draws the card's picture itself when the browser didn't send one", async () => {
    const { link, client, base, tables, objects, storageCalls } = await setup();
    objects[`${base}.pdf`] = pdf;
    await completeUpload(client, link.token, file("a.pdf", "application/pdf"), NOW);
    expect(tables.content_idea_attachments[0].thumb_path).toBe(`${base}_thumb.jpg`);
    expect(storageCalls.uploaded).toContain(`${base}_thumb.jpg`);
    expect(sniffFile(objects[`${base}_thumb.jpg`])).toBe("jpeg");
  });

  it("keeps the browser's picture when it is a real one, and drops it when it isn't", async () => {
    const good = await setup();
    good.objects[`${good.base}.pdf`] = pdf;
    good.objects[`${good.base}_thumb.webp`] = webp;
    await completeUpload(good.client, good.link.token, file("a.pdf", "application/pdf", 10, "image/webp"), NOW);
    expect(good.tables.content_idea_attachments[0].thumb_path).toBe(`${good.base}_thumb.webp`);

    const bad = await setup();
    bad.objects[`${bad.base}.pdf`] = pdf;
    bad.objects[`${bad.base}_thumb.webp`] = png; // says webp, is a png
    await completeUpload(bad.client, bad.link.token, file("a.pdf", "application/pdf", 10, "image/webp"), NOW);
    expect(bad.tables.content_idea_attachments[0].thumb_path).toBe(`${bad.base}_thumb.jpg`); // drawn instead
    expect(bad.storageCalls.removed).toContain(`${bad.base}_thumb.webp`);
  });

  it("adds an image with no page count", async () => {
    const { link, client, base, tables, objects } = await setup();
    objects[`${base}.png`] = png;
    objects[`${base}_thumb.jpg`] = jpeg;
    const result = await completeUpload(client, link.token, file("slide.png", "image/png", 12, "image/jpeg"), NOW);
    expect(result).toMatchObject({ ok: true, kind: "image", page_count: null });
    expect(tables.content_idea_attachments[0]).toMatchObject({ kind: "image", thumb_path: `${base}_thumb.jpg` });
  });

  it("takes the place of the file it replaces: same position, old file gone", async () => {
    const { link, client, base, tables, objects, storageCalls } = await setup({
      attachments: [attachment("old", { kind: "pdf", sort_order: 4, storage_path: `${WORKSPACE}/${IDEA}/old.pdf` }), attachment("other", { sort_order: 5 })],
      replaces: "old",
      objects: { [`${WORKSPACE}/${IDEA}/old.pdf`]: pdf },
    });
    objects[`${base}.pdf`] = pdf;
    const result = await completeUpload(client, link.token, file("v2.pdf", "application/pdf"), NOW);
    expect(result).toMatchObject({ ok: true, replaced_attachment_id: "old" });
    expect(tables.content_idea_attachments.map((a) => a.id)).not.toContain("old");
    expect(tables.content_idea_attachments).toHaveLength(2);
    const added = tables.content_idea_attachments.find((a) => a.storage_path === `${base}.pdf`)!;
    expect(added.sort_order).toBe(4);
    expect(storageCalls.removed).toContain(`${WORKSPACE}/${IDEA}/old.pdf`);
  });

  it("replaces a file even when the idea is full, and adds when the file it was to replace is already gone", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => attachment(`f${i}`, { sort_order: i, storage_path: `${WORKSPACE}/${IDEA}/f${i}.png` }));
    const full = await setup({ attachments: twelve, replaces: "f2" });
    full.objects[`${full.base}.pdf`] = pdf;
    expect(await completeUpload(full.client, full.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: true, replaced_attachment_id: "f2" });
    expect(full.tables.content_idea_attachments).toHaveLength(12);

    const gone = await setup({ replaces: "was-deleted" });
    gone.objects[`${gone.base}.pdf`] = pdf;
    expect(await completeUpload(gone.client, gone.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: true, replaced_attachment_id: null });
  });

  describe("refusals leave the link usable and remove what was sent", () => {
    const refused = async (arrange: (s: Awaited<ReturnType<typeof setup>>) => void, input = file("a.pdf", "application/pdf")) => {
      const s = await setup();
      arrange(s);
      const result = (await completeUpload(s.client, s.link.token, input, NOW)) as { ok: false; code: string; message: string };
      return { s, result };
    };

    it("when the file never arrived", async () => {
      const { s, result } = await refused(() => {});
      expect(result).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringContaining("did not arrive") });
      expect(s.tables.mcp_upload_links[0].used_at).toBeUndefined();
      expect(s.tables.content_idea_attachments).toHaveLength(0);
    });

    it("when the bytes are not what the name says", async () => {
      const { s, result } = await refused(({ objects, base }) => (objects[`${base}.pdf`] = png));
      expect(result).toMatchObject({ code: "invalid_input", message: expect.stringContaining("not what its name says") });
      expect(s.storageCalls.removed).toContain(`${s.base}.pdf`);
      expect(s.objects[`${s.base}.pdf`]).toBeUndefined();
      expect(s.tables.content_idea_attachments).toHaveLength(0);
    });

    it("when the PDF can't be opened", async () => {
      const { s, result } = await refused(({ objects, base }) => (objects[`${base}.pdf`] = notAPdf));
      expect(result).toMatchObject({ code: "invalid_input", message: expect.stringContaining("could not be opened") });
      expect(s.tables.content_idea_attachments).toHaveLength(0);
    });

    it("when the stored file is bigger than allowed", async () => {
      const huge = new Uint8Array(MCP_LIMITS.maxFileBytes + 1);
      huge.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const { result } = await refused(({ objects, base }) => (objects[`${base}.pdf`] = huge));
      expect(result).toMatchObject({ code: "invalid_input", message: expect.stringContaining("15 MB") });
    });

    it("when the idea filled up while the file was on its way", async () => {
      const twelve = Array.from({ length: 12 }, (_, i) => attachment(`f${i}`));
      const s = await setup({ attachments: twelve });
      s.objects[`${s.base}.pdf`] = pdf;
      const result = await completeUpload(s.client, s.link.token, file("a.pdf", "application/pdf"), NOW);
      expect(result).toMatchObject({ ok: false, code: "limit_reached" });
      expect(s.tables.mcp_upload_links[0].used_at).toBeUndefined();
    });

    it("so that the same link works on the next try", async () => {
      const s = await setup();
      s.objects[`${s.base}.pdf`] = png;
      expect(await completeUpload(s.client, s.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false });
      s.objects[`${s.base}.pdf`] = pdf; // the person picks the right file and tries again
      expect(await completeUpload(s.client, s.link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: true });
    });
  });

  it("refuses a link that is unknown, expired or already used", async () => {
    const { link, client, base, objects } = await setup();
    objects[`${base}.pdf`] = pdf;
    expect(await completeUpload(client, "nope", file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false, code: "not_found" });
    expect(await completeUpload(client, link.token, file("a.pdf", "application/pdf"), new Date(NOW.getTime() + 16 * 60_000))).toMatchObject({ code: "link_expired" });
    expect(await completeUpload(client, link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: true });
    expect(await completeUpload(client, link.token, file("a.pdf", "application/pdf"), NOW)).toMatchObject({ ok: false, code: "link_expired" });
  });

  it("lets only one of two requests that arrive together add the file", async () => {
    const { link, client, base, tables, objects } = await setup();
    objects[`${base}.pdf`] = pdf;
    const [first, second] = await Promise.all([
      completeUpload(client, link.token, file("a.pdf", "application/pdf"), NOW),
      completeUpload(client, link.token, file("a.pdf", "application/pdf"), NOW),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(tables.content_idea_attachments).toHaveLength(1);
    expect(objects[`${base}.pdf`]).toBeDefined(); // the loser did not delete the winner's file
  });

  it("refuses an attempt code that isn't one, and doesn't find another try's file", async () => {
    const { link, client, base, objects } = await setup();
    objects[`${base}.pdf`] = pdf; // this try's file
    const bad = await completeUpload(client, link.token, { ...file("a.pdf", "application/pdf"), attempt: "../../x" }, NOW);
    expect(bad).toMatchObject({ ok: false, code: "invalid_input" });
    const other = await completeUpload(client, link.token, { ...file("a.pdf", "application/pdf"), attempt: "000000000000" }, NOW);
    expect(other).toMatchObject({ ok: false, message: expect.stringContaining("did not arrive") });
    expect(objects[`${base}.pdf`]).toBeDefined(); // the other try's refusal removed only its own places
  });

  it("only ever reads the places the link allows", async () => {
    const s = await setup();
    s.objects[`${s.base}.pdf`] = pdf;
    s.objects[`${WORKSPACE}/${IDEA}/someone-elses.pdf`] = pdf;
    await completeUpload(s.client, s.link.token, { ...file("../../someone-elses.pdf", "application/pdf") }, NOW);
    expect(s.tables.content_idea_attachments[0].storage_path).toBe(`${s.base}.pdf`);
  });
});
