import { describe, expect, it } from "vitest";
import { createFakeCapsuleApi } from "./helpers/fake-capsule-api";
import { draftVersion } from "@/lib/capsule/version";
import type { Draft } from "@/lib/capsule/types";

function setup(initial: Partial<Draft> = {}) {
  let draft: Draft = {
    id: "d1",
    title: "Title",
    subtitle: "Sub",
    tags: ["ai"],
    body: "Hello",
    canonicalUrl: "https://example.com/p",
    ...initial,
  };
  const data = new Map<string, string>();
  let tick = 0;
  const api = createFakeCapsuleApi({
    getDraft: () => draft,
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    now: () => new Date(Date.UTC(2026, 9, 1, 12, 0, tick++)),
  });
  return { api, edit: (change: Partial<Draft>) => (draft = { ...draft, ...change }) };
}

describe("draftVersion", () => {
  const draft: Draft = { id: "d1", title: "T", subtitle: "S", tags: ["a"], body: "B", canonicalUrl: "" };

  it("is the same for the same text and changes when anything changes", () => {
    expect(draftVersion(draft)).toBe(draftVersion({ ...draft }));
    for (const change of [{ title: "T2" }, { subtitle: "S2" }, { tags: ["b"] }, { body: "B2" }, { canonicalUrl: "https://x.com" }]) {
      expect(draftVersion({ ...draft, ...change })).not.toBe(draftVersion(draft));
    }
  });
});

describe("fake capsule api", () => {
  it("has nothing to load before the first seal", async () => {
    const { api } = setup();
    expect(await api.load({ draftId: "d1" })).toEqual({ ok: true, data: { capsule: null, stale: false } });
  });

  it("seals both platforms as 'sealed' atoms", async () => {
    const { api } = setup();
    const result = await api.seal({ draftId: "d1" });
    if (!result.ok) throw new Error("seal failed");
    const { atoms } = result.data.capsule;
    expect(atoms.medium.status).toBe("sealed");
    expect(atoms.substack.status).toBe("sealed");
    expect(atoms.medium.html).toContain("<h1>Title</h1>");
    expect(atoms.substack.html).toContain("<p>Hello</p>");
  });

  it("loads the latest capsule and says when the draft has changed since", async () => {
    const { api, edit } = setup();
    await api.seal({ draftId: "d1" });
    const fresh = await api.load({ draftId: "d1" });
    expect(fresh.ok && fresh.data.stale).toBe(false);
    edit({ body: "Hello, changed" });
    const stale = await api.load({ draftId: "d1" });
    expect(stale.ok && stale.data.stale).toBe(true);
  });

  it("moves an atom from sealed to opened to posted, keeping the live link", async () => {
    const { api } = setup();
    const sealed = await api.seal({ draftId: "d1" });
    if (!sealed.ok) throw new Error("seal failed");
    const id = sealed.data.capsule.id;

    const opened = await api.markOpened({ capsuleId: id, platform: "medium" });
    expect(opened.ok && opened.data.atom.status).toBe("opened");
    expect(opened.ok && opened.data.atom.openedAt).toBeTruthy();

    const posted = await api.markPosted({ capsuleId: id, platform: "medium", platformUrl: " https://medium.com/p/1 " });
    expect(posted.ok && posted.data.atom).toMatchObject({ status: "posted", platformUrl: "https://medium.com/p/1" });

    // Opening again later must not undo Posted, and the other platform is untouched.
    const reopened = await api.markOpened({ capsuleId: id, platform: "medium" });
    expect(reopened.ok && reopened.data.atom.status).toBe("posted");
    const loaded = await api.load({ draftId: "d1" });
    expect(loaded.ok && loaded.data.capsule?.atoms.substack.status).toBe("sealed");
  });

  it("keeps every sealed capsule in the history, newest first", async () => {
    const { api, edit } = setup();
    await api.seal({ draftId: "d1" });
    edit({ body: "Second version" });
    await api.seal({ draftId: "d1" });
    const history = await api.history({ draftId: "d1" });
    if (!history.ok) throw new Error("history failed");
    expect(history.data.capsules).toHaveLength(2);
    expect(history.data.capsules[0].atoms.substack.html).toContain("<p>Second version</p>");
  });

  it("explains itself when the capsule is gone", async () => {
    const { api } = setup();
    const result = await api.markOpened({ capsuleId: "nope", platform: "medium" });
    expect(result.ok).toBe(false);
  });
});

describe("prepareCapsule", () => {
  it("seals the first time, then reuses the capsule while the draft is unchanged", async () => {
    const { prepareCapsule } = await import("@/lib/capsule/prepare");
    const { api } = setup();
    const first = await prepareCapsule(api, "d1");
    const second = await prepareCapsule(api, "d1");
    expect(second.id).toBe(first.id);
  });

  it("keeps the statuses the writer already set when it reuses the capsule", async () => {
    const { prepareCapsule } = await import("@/lib/capsule/prepare");
    const { api } = setup();
    const first = await prepareCapsule(api, "d1");
    await api.markOpened({ capsuleId: first.id, platform: "medium" });
    const again = await prepareCapsule(api, "d1");
    expect(again.atoms.medium.status).toBe("opened");
  });

  it("seals a new capsule after the draft changes, or when asked to", async () => {
    const { prepareCapsule } = await import("@/lib/capsule/prepare");
    const { api, edit } = setup();
    const first = await prepareCapsule(api, "d1");
    edit({ body: "Changed" });
    const afterEdit = await prepareCapsule(api, "d1");
    expect(afterEdit.id).not.toBe(first.id);
    const forced = await prepareCapsule(api, "d1", { forceNew: true });
    expect(forced.id).not.toBe(afterEdit.id);
  });

  it("turns a server error into an error the menu can show", async () => {
    const { prepareCapsule } = await import("@/lib/capsule/prepare");
    const failing = {
      load: async () => ({ ok: false as const, error: "Nope" }),
    } as unknown as import("@/lib/capsule/api").CapsuleApi;
    await expect(prepareCapsule(failing, "d1")).rejects.toThrow("Nope");
  });
});
