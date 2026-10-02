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

// Everything the screens need from the server. The real version is a set of server actions (Ananya's
// endpoints); until they exist the screens run on the in-browser fake in `fake-api.ts`. Both answer
// with the same shapes from `types.ts`, so swapping one for the other changes nothing else.
export interface CapsuleApi {
  seal(input: SealCapsuleInput): Promise<CapsuleResult<SealCapsuleOutput>>;
  load(input: LoadCapsuleInput): Promise<CapsuleResult<LoadCapsuleOutput>>;
  markOpened(input: MarkAtomOpenedInput): Promise<CapsuleResult<UpdateAtomOutput>>;
  markPosted(input: MarkAtomPostedInput): Promise<CapsuleResult<UpdateAtomOutput>>;
  history(input: CapsuleHistoryInput): Promise<CapsuleResult<CapsuleHistoryOutput>>;
}
