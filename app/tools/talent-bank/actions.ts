"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import * as talent from "@/lib/services/talent-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import type { TalentShelf } from "@/lib/utils/talent";
import type { CandidateInput } from "@/lib/validation/talent-schema";

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
type UploadedFile = { path: string; name: string; size: number; kind: "resume" | "work" };

// Every Talent Bank action is for admins only (the database checks this too).
async function context() {
  await requireEnabledTool("talent-bank");
  const { supabase, user } = await requireUser("/tools/talent-bank");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) throw new Error("Only admins can use Talent Bank.");
  return { supabase, user, workspace };
}

async function run<T extends object>(work: (ctx: Awaited<ReturnType<typeof context>>) => Promise<T | void>): Promise<Result<T>> {
  try {
    const data = await work(await context());
    revalidatePath("/tools/talent-bank");
    return { ok: true, ...(data ?? {}) } as Result<T>;
  } catch (error) {
    const issues = (error as { issues?: { message: string }[] }).issues;
    console.error("talent bank action failed", error);
    return { ok: false, error: issues?.[0]?.message ?? (error instanceof Error && error.message.length < 160 ? error.message : "That didn't work. Please try again.") };
  }
}

export async function createCandidateAction(input: { candidateId: string; fields: CandidateInput; files: UploadedFile[] }) {
  return run(async ({ supabase, user, workspace }) => ({
    id: await talent.createCandidate(supabase, { workspaceId: workspace.id, userId: user.id, candidateId: input.candidateId, fields: input.fields, files: input.files }),
  }));
}

export async function updateCandidateAction(candidateId: string, fields: CandidateInput) {
  return run(({ supabase }) => talent.updateCandidate(supabase, candidateId, fields));
}

export async function setShelfAction(candidateId: string, shelf: TalentShelf) {
  return run(({ supabase }) => talent.setShelf(supabase, candidateId, shelf));
}

export async function deleteCandidateAction(candidateId: string) {
  return run(({ supabase, workspace }) => talent.deleteCandidate(supabase, workspace.id, candidateId));
}

export async function addFilesAction(candidateId: string, files: UploadedFile[]) {
  return run(({ supabase, workspace }) => talent.addFiles(supabase, workspace.id, candidateId, files));
}

export async function removeFileAction(fileId: string) {
  return run(({ supabase }) => talent.removeFile(supabase, fileId));
}

export async function fileLinkAction(fileId: string, inline: boolean) {
  return run(async ({ supabase }) => {
    const url = await talent.fileLink(supabase, fileId, inline);
    if (!url) throw new Error("That file is gone.");
    return { url };
  });
}

// Reads a resume just uploaded for a new candidate, to fill in the form.
export async function readResumeAction(path: string) {
  return run(async ({ supabase, workspace }) => {
    if (!path.startsWith(`${workspace.id}/`)) throw new Error("That file isn't in this workspace.");
    return { found: await talent.readResume(supabase, path) };
  });
}

// Files uploaded for a candidate who was then not saved.
export async function discardUploadsAction(paths: string[]) {
  return run(async ({ supabase, workspace }) => {
    const mine = paths.filter((path) => path.startsWith(`${workspace.id}/`) && !path.includes(".."));
    if (mine.length) await supabase.storage.from(talent.TALENT_BUCKET).remove(mine);
  });
}

export async function setFormLinkAction(change: { active?: boolean; fresh?: boolean }) {
  return run(async ({ supabase, user, workspace }) => {
    const link = await talent.setFormLink(supabase, workspace.id, user.id, change);
    return { token: link.token, active: link.active };
  });
}
