import type { CapsuleApi } from "@/lib/capsule/api";
import { previewAtom } from "@/lib/capsule/preview";
import { draftVersion } from "@/lib/capsule/version";
import type { Atom, Capsule, CapsulePlatform, CapsuleResult, Draft } from "@/lib/capsule/types";

// In-memory CapsuleApi for tests of the screens' logic (prepareCapsule, statuses). It answers like the
// real server actions (app/tools/newsletter/capsule-actions.ts) and builds atoms with the same adapters.

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const KEY = "capsule-fake-store";

// The browser's storage, looked up at the moment it is used (never while the page is built on the
// server), and quietly doing nothing where it is blocked.
export const browserStorage: Storage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* blocked: the fake just forgets */
    }
  },
};

function ok<T>(data: T): CapsuleResult<T> {
  return { ok: true, data };
}
function fail<T>(error: string): CapsuleResult<T> {
  return { ok: false, error };
}

export function createFakeCapsuleApi({
  getDraft,
  storage,
  now = () => new Date(),
}: {
  // Reads the draft as it is right now (the real server reads the saved copy).
  getDraft: (draftId: string) => Draft;
  storage: Storage;
  now?: () => Date;
}): CapsuleApi {
  function readAll(): Capsule[] {
    try {
      const parsed = JSON.parse(storage.getItem(KEY) ?? "[]");
      return Array.isArray(parsed) ? (parsed as Capsule[]) : [];
    } catch {
      return [];
    }
  }
  function writeAll(capsules: Capsule[]) {
    storage.setItem(KEY, JSON.stringify(capsules));
  }
  const forDraft = (draftId: string) =>
    readAll()
      .filter((capsule) => capsule.draftId === draftId)
      .sort((a, b) => b.sealedAt.localeCompare(a.sealedAt));

  function updateAtom(
    capsuleId: string,
    platform: CapsulePlatform,
    change: (atom: Atom) => Atom,
  ): CapsuleResult<{ atom: Atom }> {
    const all = readAll();
    const capsule = all.find((candidate) => candidate.id === capsuleId);
    if (!capsule) return fail("That capsule no longer exists. Open the menu again.");
    capsule.atoms[platform] = change(capsule.atoms[platform]);
    writeAll(all);
    return ok({ atom: capsule.atoms[platform] });
  }

  return {
    async seal({ draftId }) {
      const draft = getDraft(draftId);
      const sealedAt = now().toISOString();
      const atom = (platform: CapsulePlatform): Atom => ({ ...previewAtom(platform, draft), status: "sealed" });
      const capsule: Capsule = {
        id: `capsule-${sealedAt}-${Math.random().toString(36).slice(2, 8)}`,
        draftId,
        draftVersion: draftVersion(draft),
        canonicalUrl: draft.canonicalUrl,
        sealedAt,
        atoms: { medium: atom("medium"), substack: atom("substack") },
      };
      writeAll([...readAll(), capsule]);
      return ok({ capsule });
    },

    async load({ draftId }) {
      const latest = forDraft(draftId)[0] ?? null;
      const stale = latest ? latest.draftVersion !== draftVersion(getDraft(draftId)) : false;
      return ok({ capsule: latest, stale });
    },

    async markOpened({ capsuleId, platform }) {
      return updateAtom(capsuleId, platform, (atom) =>
        // Opened never undoes Posted.
        atom.status === "posted" ? atom : { ...atom, status: "opened", openedAt: now().toISOString() },
      );
    },

    async markPosted({ capsuleId, platform, platformUrl }) {
      return updateAtom(capsuleId, platform, (atom) => ({
        ...atom,
        status: "posted",
        postedAt: now().toISOString(),
        ...(platformUrl?.trim() ? { platformUrl: platformUrl.trim() } : {}),
      }));
    },

    async history({ draftId }) {
      return ok({ capsules: forDraft(draftId) });
    },
  };
}
