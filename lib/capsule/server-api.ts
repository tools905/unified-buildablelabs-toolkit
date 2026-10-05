import {
  capsuleHistoryAction,
  loadCapsuleAction,
  markAtomOpenedAction,
  markAtomPostedAction,
  sealCapsuleAction,
} from "@/app/tools/newsletter/capsule-actions";
import type { CapsuleApi } from "@/lib/capsule/api";

// The real CapsuleApi: each call is a server action, which reads and writes the saved post.
export function createServerCapsuleApi(): CapsuleApi {
  return {
    seal: sealCapsuleAction,
    load: loadCapsuleAction,
    markOpened: markAtomOpenedAction,
    markPosted: markAtomPostedAction,
    history: capsuleHistoryAction,
  };
}
