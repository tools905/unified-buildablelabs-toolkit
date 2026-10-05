import { adapters } from "@/lib/capsule/adapters";
import type { Atom, CapsulePlatform, Draft } from "@/lib/capsule/types";

export const CAPSULE_PLATFORMS: { value: CapsulePlatform; label: string }[] = [
  { value: "medium", label: "Medium" },
  { value: "substack", label: "Substack" },
];

// What a platform preview needs: an atom without the sealing details (a preview is not sealed).
export type PreviewAtom = Pick<Atom, "platform" | "html" | "title" | "subtitle" | "tags" | "warnings">;

// The preview and the seal step both call the same adapters, so what you preview is what gets sealed.
export function previewAtom(platform: CapsulePlatform, draft: Draft): PreviewAtom {
  const { html, warnings } = adapters[platform].transform(draft);
  return { platform, html, title: draft.title, subtitle: draft.subtitle, tags: draft.tags, warnings };
}
