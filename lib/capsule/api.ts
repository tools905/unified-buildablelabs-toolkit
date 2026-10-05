import type {
  CapsuleHistoryInput,
  CapsuleHistoryOutput,
  CapsuleResult,
  LoadCapsuleInput,
  LoadCapsuleOutput,
  MarkAtomOpenedInput,
  MarkAtomPostedInput,
  SealCapsuleInput,
  SealCapsuleOutput,
  UpdateAtomOutput,
} from "@/lib/capsule/types";

// Everything the screens need from the server. The real version is `createServerCapsuleApi()` in
// `server-api.ts` (server actions); tests use the in-memory fake in tests/helpers. Both answer with
// the same shapes from `types.ts`.
export interface CapsuleApi {
  seal(input: SealCapsuleInput): Promise<CapsuleResult<SealCapsuleOutput>>;
  load(input: LoadCapsuleInput): Promise<CapsuleResult<LoadCapsuleOutput>>;
  markOpened(input: MarkAtomOpenedInput): Promise<CapsuleResult<UpdateAtomOutput>>;
  markPosted(input: MarkAtomPostedInput): Promise<CapsuleResult<UpdateAtomOutput>>;
  history(input: CapsuleHistoryInput): Promise<CapsuleResult<CapsuleHistoryOutput>>;
}
