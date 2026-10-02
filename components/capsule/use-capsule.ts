"use client";

import { useCallback, useRef, useState } from "react";
import type { CapsuleApi } from "@/lib/capsule/api";
import { prepareCapsule } from "@/lib/capsule/prepare";
import { draftVersion } from "@/lib/capsule/version";
import type { Atom, Capsule, CapsulePlatform, Draft } from "@/lib/capsule/types";

export type CapsuleState =
  | { phase: "idle" }
  | { phase: "preparing" } // saving the draft, then loading or sealing the capsule
  | { phase: "ready" }
  | { phase: "error"; message: string };

// The capsule for one draft: opening the menu seals it if needed, and statuses update as the writer
// works. `beforeSeal` should save the draft first, so the server seals what is on screen.
export function useCapsule({
  api,
  draft,
  beforeSeal,
}: {
  api: CapsuleApi;
  draft: Draft;
  beforeSeal?: () => Promise<void>;
}) {
  const [capsule, setCapsule] = useState<Capsule | null>(null);
  const [state, setState] = useState<CapsuleState>({ phase: "idle" });
  // Only the latest request may change the screen, so a slow older one can't overwrite a newer one.
  const request = useRef(0);

  // True as soon as the writer edits after sealing: no need to ask the server.
  const stale = capsule !== null && capsule.draftVersion !== draftVersion(draft);

  const prepare = useCallback(
    async (options: { forceNew?: boolean } = {}) => {
      const mine = ++request.current;
      setState({ phase: "preparing" });
      try {
        await beforeSeal?.();
        const next = await prepareCapsule(api, draft.id, options);
        if (mine !== request.current) return;
        setCapsule(next);
        setState({ phase: "ready" });
      } catch (failure) {
        if (mine !== request.current) return;
        setState({ phase: "error", message: failure instanceof Error ? failure.message : "Could not prepare the post." });
      }
    },
    [api, beforeSeal, draft.id],
  );

  function replaceAtom(platform: CapsulePlatform, atom: Atom) {
    setCapsule((current) => (current ? { ...current, atoms: { ...current.atoms, [platform]: atom } } : current));
  }

  const markOpened = useCallback(
    async (platform: CapsulePlatform) => {
      if (!capsule) return;
      const result = await api.markOpened({ capsuleId: capsule.id, platform });
      if (result.ok) replaceAtom(platform, result.data.atom);
    },
    [api, capsule],
  );

  // Returns an error message to show, or null when it worked.
  const markPosted = useCallback(
    async (platform: CapsulePlatform, platformUrl?: string): Promise<string | null> => {
      if (!capsule) return "Open the menu again first.";
      const result = await api.markPosted({ capsuleId: capsule.id, platform, platformUrl });
      if (!result.ok) return result.error;
      replaceAtom(platform, result.data.atom);
      return null;
    },
    [api, capsule],
  );

  return { capsule, stale, state, prepare, markOpened, markPosted };
}
