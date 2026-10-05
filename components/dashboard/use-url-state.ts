"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

type Patch = Record<string, string | null>;

function urlWith(patch: Patch) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url;
}

// Keeps what is open on a page (a card's side panel, a dialog on it) in the address, e.g.
// ?idea=…&view=edit. Opening something adds a history entry, so the phone's Back button (or the
// browser's) closes it again instead of leaving the page, and the page stays where it was.
// It also means a link, like the one in an assignment email, can open a card directly.
//
// Uses the browser's own pushState, which Next.js keeps in step with useSearchParams without
// asking the server for the page again.
export function useUrlState(keys: readonly string[]) {
  const searchParams = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, searchParams.get(key)])) as Record<string, string | null>;
  // How many entries this page added that Back can still take away.
  const added = useRef(0);

  useEffect(() => {
    function onPopState() {
      added.current = Math.max(0, added.current - 1);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Opens something on top of what is showing now.
  const push = useCallback((patch: Patch) => {
    const next = urlWith(patch);
    if (next.href === window.location.href) return;
    added.current += 1;
    window.history.pushState(null, "", next);
  }, []);

  // Closes the top-most thing. When this page opened it, that is a step back in history; when the
  // page was loaded with it already open (a shared link), the address is just tidied instead.
  const pop = useCallback((patch: Patch) => {
    if (added.current > 0) {
      window.history.back();
      return;
    }
    const next = urlWith(patch);
    if (next.href !== window.location.href) window.history.replaceState(null, "", next);
  }, []);

  return { values, push, pop };
}
