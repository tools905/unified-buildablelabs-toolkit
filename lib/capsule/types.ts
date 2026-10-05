// Capsule publishing: the shapes both sides of the build agree on.
// Engine (converters, sealing, saving) returns these; screens (preview, Publish menu, side panel) read them.
// If you change a field here, tell the other person: this file is the contract.

export type CapsulePlatform = "medium" | "substack";

// The writer's working document. `body` is Markdown; everything else is plain text.
export type Draft = {
  id: string;
  title: string;
  subtitle: string;
  tags: string[];
  body: string;
  // Address of the original post on our own site. Both copies point search engines back to it.
  canonicalUrl: string;
};

// Something the writer should know before pasting, e.g. "Table converted to an image".
export type CapsuleWarning = {
  // Short stable code so screens and tests can match on it. In use today:
  //   any platform  title-missing, body-empty, no-canonical-url, no-tags, image-not-public, link-removed
  //   converters    heading-flattened, list-flattened, code-no-highlight, table-as-list, math-plain,
  //                 embed-manual, footnotes-converted
  code: string;
  message: string;
};

export type AtomStatus = "sealed" | "opened" | "posted";

// One platform's ready-to-paste version of the draft.
export type Atom = {
  platform: CapsulePlatform;
  html: string; // adapter output, ready to paste as rich text
  title: string;
  subtitle: string;
  tags: string[];
  warnings: CapsuleWarning[];
  status: AtomStatus;
  platformUrl?: string; // live link the writer pastes back after publishing
  openedAt?: string; // ISO timestamps
  postedAt?: string;
};

// A sealed snapshot of the draft, created each time the writer clicks Publish.
export type Capsule = {
  id: string;
  draftId: string;
  draftVersion: string; // hash of the draft at the moment of sealing
  canonicalUrl: string;
  sealedAt: string;
  atoms: Record<CapsulePlatform, Atom>;
};

// An adapter turns a draft into one platform's version. The preview switch and the seal step call
// the same adapters, so what you preview is exactly what gets sealed.
export type AdapterResult = { html: string; warnings: CapsuleWarning[] };

export interface Adapter {
  platform: CapsulePlatform;
  transform(draft: Draft): AdapterResult;
}

// ---- Server endpoints (Ananya builds, Mridul's screens call) -----------------------------------
// Every endpoint answers with this wrapper, like the rest of the toolkit's server actions.
export type CapsuleResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Seal: run both adapters on the saved draft and store the capsule.
export type SealCapsuleInput = { draftId: string };
export type SealCapsuleOutput = { capsule: Capsule };

// Load: the latest capsule for a draft, plus whether the draft changed since it was sealed.
export type LoadCapsuleInput = { draftId: string };
export type LoadCapsuleOutput = { capsule: Capsule | null; stale: boolean };

// Status updates: the app can't see inside the platforms, so the writer reports what happened.
export type MarkAtomOpenedInput = { capsuleId: string; platform: CapsulePlatform };
export type MarkAtomPostedInput = { capsuleId: string; platform: CapsulePlatform; platformUrl?: string };
export type UpdateAtomOutput = { atom: Atom };

// History: every capsule sealed for a draft, newest first, with each atom's status.
export type CapsuleHistoryInput = { draftId: string };
export type CapsuleHistoryOutput = { capsules: Capsule[] };
