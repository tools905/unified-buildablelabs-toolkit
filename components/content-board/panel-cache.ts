import type { IdeaPanelData } from "@/components/content-board/types";
import { BASE_PATH } from "@/lib/utils/app-url";

async function fetchPanel(ideaId: string): Promise<IdeaPanelData> {
  const response = await fetch(`${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/panel`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Panel request failed (${response.status})`);
  return (await response.json()) as IdeaPanelData;
}

// Keeps the last panel data per idea in the browser. Hovering a card loads it ahead of the
// click, and opening an idea again shows what was there at once while fresh data loads behind.
const FRESH_MS = 20_000;
const KEEP_MS = 5 * 60_000;

const cache = new Map<string, { data: IdeaPanelData; at: number }>();
const inflight = new Map<string, Promise<IdeaPanelData>>();

export function peekPanel(ideaId: string): IdeaPanelData | null {
  const hit = cache.get(ideaId);
  if (!hit) return null;
  if (Date.now() - hit.at > KEEP_MS) {
    cache.delete(ideaId);
    return null;
  }
  return hit.data;
}

// Data loaded only moments ago, fresh enough to skip another request.
export function peekFreshPanel(ideaId: string): IdeaPanelData | null {
  const hit = cache.get(ideaId);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.data : null;
}

export function storePanel(ideaId: string, data: IdeaPanelData) {
  cache.set(ideaId, { data, at: Date.now() });
}

export function forgetPanel(ideaId: string) {
  cache.delete(ideaId);
}

// One request per idea at a time: a hover and a click share the same call. After an edit,
// pass `fresh` so an older request that started before the edit can't be reused.
export function loadPanel(ideaId: string, options: { fresh?: boolean } = {}): Promise<IdeaPanelData> {
  const pending = inflight.get(ideaId);
  if (pending && !options.fresh) return pending;
  const request = fetchPanel(ideaId)
    .then((data) => {
      storePanel(ideaId, data);
      return data;
    })
    .finally(() => {
      if (inflight.get(ideaId) === request) inflight.delete(ideaId);
    });
  inflight.set(ideaId, request);
  return request;
}

export function prefetchPanel(ideaId: string) {
  const hit = cache.get(ideaId);
  if (hit && Date.now() - hit.at < FRESH_MS) return;
  void loadPanel(ideaId).catch(() => {
    // A failed warm-up is harmless; the real open will try again and show any error.
  });
}
