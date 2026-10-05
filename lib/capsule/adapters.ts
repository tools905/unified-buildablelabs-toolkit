import { medium } from "@/lib/capsule/converters/medium";
import { substack } from "@/lib/capsule/converters/substack";
import type { Adapter, CapsulePlatform } from "@/lib/capsule/types";

// The converters, one per platform. Everything else (preview, seal) only calls
// `adapters[platform].transform(draft)`. Each converter is a set of rules on the shared base in
// `lib/capsule/engine/`.
export const adapters: Record<CapsulePlatform, Adapter> = { medium, substack };
