"use client";

import { useEffect, useState } from "react";
import { getAttachmentDownloadAction } from "@/app/tools/content-board/actions";

// Download links are valid for an hour on the server; a bit less is trusted here.
const TRUST_MS = 50 * 60_000;
const cache = new Map<string, { url: string; at: number }>();

function cached(id: string): string | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > TRUST_MS) {
    cache.delete(id);
    return null;
  }
  return hit.url;
}

async function fetchDownloadUrl(id: string): Promise<{ url: string } | { error: string }> {
  try {
    const result = await getAttachmentDownloadAction(id);
    if (!result.ok) return { error: result.error };
    cache.set(id, { url: result.url, at: Date.now() });
    return { url: result.url };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}

// The address that downloads one attached file, prepared ahead of the tap so the Download button can
// be a plain link the browser follows itself.
export function useDownloadUrl(attachmentId: string | null) {
  const [result, setResult] = useState<{ id: string; url?: string; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!attachmentId || cached(attachmentId)) return;
    let cancelled = false;
    void fetchDownloadUrl(attachmentId).then((next) => {
      if (!cancelled) setResult({ id: attachmentId, ...next });
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentId, attempt]);

  const mine = result && result.id === attachmentId ? result : null;
  const url = attachmentId ? (cached(attachmentId) ?? mine?.url ?? null) : null;
  const error = !url ? (mine?.error ?? null) : null;

  return {
    url,
    error,
    loading: Boolean(attachmentId) && !url && !error,
    retry: () => {
      setResult(null);
      setAttempt((value) => value + 1);
    },
  };
}
