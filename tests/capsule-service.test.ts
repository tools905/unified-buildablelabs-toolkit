import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createFakeCapsuleDb } from "./helpers/fake-capsule-db";
import * as capsuleService from "@/lib/services/newsletter-capsule-service";
import { draftVersion } from "@/lib/capsule/version";
import { toDraft } from "@/lib/capsule/draft";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const POST = "33333333-3333-4333-8333-333333333333";
const FOREIGN_POST = "44444444-4444-4444-8444-444444444444";
const MISSING = "55555555-5555-4555-8555-555555555555";
const USER = "66666666-6666-4666-8666-666666666666";

function setup() {
  const post = {
    id: POST,
    workspace_id: WORKSPACE,
    title: "Write once",
    deck: "Post twice",
    tags: ["writing"],
    body: "Hello **world**\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    original_url: "https://www.buildablelabs.com/blog/write-once",
    cover_image_url: null,
  };
  const foreign = { ...post, id: FOREIGN_POST, workspace_id: OTHER_WORKSPACE };
  const db = createFakeCapsuleDb({ workspaceId: WORKSPACE, posts: [post, foreign] });
  return { ...db, post };
}

describe("sealCapsule", () => {
  it("seals the saved post into two sealed atoms built by the converters", async () => {
    const { client, post, tables } = setup();
    const capsule = await capsuleService.sealCapsule(client, { draftId: POST }, USER);

    expect(capsule.draftId).toBe(POST);
    expect(capsule.draftVersion).toBe(draftVersion(toDraft(post as never)));
    expect(capsule.canonicalUrl).toBe(post.original_url);
    expect(capsule.atoms.medium).toMatchObject({ platform: "medium", status: "sealed", title: "Write once", subtitle: "Post twice", tags: ["writing"] });
    expect(capsule.atoms.medium.html.startsWith("<h1>Write once</h1><h2>Post twice</h2>")).toBe(true);
    expect(capsule.atoms.substack.html).not.toContain("<h1>");
    expect(capsule.atoms.medium.warnings.map((w) => w.code)).toContain("table-as-list");
    expect(tables.audit_logs).toEqual([expect.objectContaining({ action: "newsletter_capsule.sealed", actor_id: USER })]);
  });

  it("refuses a post in another workspace, or one that doesn't exist", async () => {
    const { client } = setup();
    await expect(capsuleService.sealCapsule(client, { draftId: FOREIGN_POST }, USER)).rejects.toThrow("no longer exists");
    await expect(capsuleService.sealCapsule(client, { draftId: MISSING }, USER)).rejects.toBeInstanceOf(capsuleService.CapsuleError);
  });

  it("rejects a malformed id before touching the database", async () => {
    const { client } = setup();
    await expect(capsuleService.sealCapsule(client, { draftId: "nope" }, USER)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getLatestCapsule", () => {
  it("is empty and not stale before anything is sealed", async () => {
    const { client } = setup();
    expect(await capsuleService.getLatestCapsule(client, { draftId: POST })).toEqual({ capsule: null, stale: false });
  });

  it("returns the newest capsule, and reports stale once the saved post changes", async () => {
    const { client, post } = setup();
    await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    const second = await capsuleService.sealCapsule(client, { draftId: POST }, USER);

    const fresh = await capsuleService.getLatestCapsule(client, { draftId: POST });
    expect(fresh.capsule?.id).toBe(second.id);
    expect(fresh.stale).toBe(false);

    post.body = "Edited";
    expect((await capsuleService.getLatestCapsule(client, { draftId: POST })).stale).toBe(true);
  });

  it("does not count edits outside the draft (like the cover) as stale", async () => {
    const { client, post } = setup();
    await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    (post as { cover_image_url: string | null }).cover_image_url = "https://a.co/new.webp";
    expect((await capsuleService.getLatestCapsule(client, { draftId: POST })).stale).toBe(false);
  });
});

describe("atom statuses", () => {
  it("goes sealed, opened, posted, and keeps the live link", async () => {
    const { client, tables } = setup();
    const { id } = await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    const now = new Date("2026-10-05T10:00:00Z");

    const opened = await capsuleService.markAtomOpened(client, { capsuleId: id, platform: "medium" }, now);
    expect(opened).toMatchObject({ status: "opened", openedAt: now.toISOString() });

    const posted = await capsuleService.markAtomPosted(
      client,
      { capsuleId: id, platform: "medium", platformUrl: "  https://medium.com/@us/write-once-123  " },
      USER,
      now,
    );
    expect(posted).toMatchObject({ status: "posted", postedAt: now.toISOString(), platformUrl: "https://medium.com/@us/write-once-123" });
    expect(tables.audit_logs.at(-1)).toMatchObject({ action: "newsletter_capsule.posted", metadata: { platform: "medium", postId: POST } });

    // The other platform is untouched.
    const latest = await capsuleService.getLatestCapsule(client, { draftId: POST });
    expect(latest.capsule?.atoms.substack.status).toBe("sealed");
  });

  it("never lets Opened undo Posted, and a blank link keeps the earlier one", async () => {
    const { client } = setup();
    const { id } = await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    await capsuleService.markAtomPosted(client, { capsuleId: id, platform: "substack", platformUrl: "https://us.substack.com/p/x" }, USER);

    expect(await capsuleService.markAtomOpened(client, { capsuleId: id, platform: "substack" })).toMatchObject({ status: "posted" });
    expect(await capsuleService.markAtomPosted(client, { capsuleId: id, platform: "substack", platformUrl: "" }, USER)).toMatchObject({
      platformUrl: "https://us.substack.com/p/x",
    });
  });

  it("rejects a live link that isn't a web address, and an unknown capsule or platform", async () => {
    const { client } = setup();
    const { id } = await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    await expect(capsuleService.markAtomPosted(client, { capsuleId: id, platform: "medium", platformUrl: "javascript:x" }, USER)).rejects.toThrow(
      "https://",
    );
    await expect(capsuleService.markAtomOpened(client, { capsuleId: MISSING, platform: "medium" })).rejects.toThrow("no longer exists");
    await expect(capsuleService.markAtomOpened(client, { capsuleId: id, platform: "linkedin" })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listCapsules", () => {
  it("lists every capsule for the post, newest first", async () => {
    const { client } = setup();
    const first = await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    const second = await capsuleService.sealCapsule(client, { draftId: POST }, USER);
    expect((await capsuleService.listCapsules(client, { draftId: POST })).map((c) => c.id)).toEqual([second.id, first.id]);
  });
});

describe("rowsToCapsule", () => {
  it("skips a capsule that is missing an atom, and leaves out empty optional fields", () => {
    const atom = {
      capsule_id: "c",
      platform: "medium" as const,
      html: "<p>x</p>",
      title: "t",
      subtitle: "",
      tags: null,
      warnings: null,
      status: "sealed" as const,
      platform_url: null,
      opened_at: null,
      posted_at: null,
    };
    const row = { id: "c", post_id: "p", draft_version: "v", canonical_url: "", sealed_at: "2026-10-05T00:00:00Z" };
    expect(capsuleService.rowsToCapsule({ ...row, newsletter_capsule_atoms: [atom] })).toBeNull();

    const capsule = capsuleService.rowsToCapsule({ ...row, newsletter_capsule_atoms: [atom, { ...atom, platform: "substack" }] });
    expect(capsule?.atoms.medium).toEqual({
      platform: "medium",
      html: "<p>x</p>",
      title: "t",
      subtitle: "",
      tags: [],
      warnings: [],
      status: "sealed",
    });
  });
});
