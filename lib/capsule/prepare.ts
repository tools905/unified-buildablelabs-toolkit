import type { CapsuleApi } from "@/lib/capsule/api";
import type { Capsule } from "@/lib/capsule/types";

// The capsule to show when the Publish menu opens: the latest one if the draft hasn't changed since
// (so statuses the writer already set are kept), otherwise a freshly sealed one. `forceNew` always seals.
export async function prepareCapsule(
  api: CapsuleApi,
  draftId: string,
  options: { forceNew?: boolean } = {},
): Promise<Capsule> {
  if (!options.forceNew) {
    const loaded = await api.load({ draftId });
    if (!loaded.ok) throw new Error(loaded.error);
    if (loaded.data.capsule && !loaded.data.stale) return loaded.data.capsule;
  }
  const sealed = await api.seal({ draftId });
  if (!sealed.ok) throw new Error(sealed.error);
  return sealed.data.capsule;
}
