"use server";

import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as capsuleService from "@/lib/services/newsletter-capsule-service";
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

// The capsule endpoints the Publish menu calls (lib/capsule/api.ts). They answer with a
// CapsuleResult instead of throwing, so the screens can show the message to the writer.

async function run<T>(failure: string, work: (ctx: Awaited<ReturnType<typeof requireUser>>) => Promise<T>): Promise<CapsuleResult<T>> {
  try {
    await requireEnabledTool("newsletter");
    const ctx = await requireUser("/tools/newsletter");
    return { ok: true, data: await work(ctx) };
  } catch (error) {
    // Next.js signals redirects (e.g. to sign in) by throwing; let those through.
    unstable_rethrow(error);
    if (error instanceof capsuleService.CapsuleError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? failure };
    console.error(`${failure}:`, error);
    return { ok: false, error: `${failure}. Try again in a moment.` };
  }
}

export async function sealCapsuleAction(input: SealCapsuleInput): Promise<CapsuleResult<SealCapsuleOutput>> {
  return run("Could not prepare the post", async ({ supabase, user }) => ({
    capsule: await capsuleService.sealCapsule(supabase, input, user.id),
  }));
}

export async function loadCapsuleAction(input: LoadCapsuleInput): Promise<CapsuleResult<LoadCapsuleOutput>> {
  return run("Could not load the prepared post", ({ supabase }) => capsuleService.getLatestCapsule(supabase, input));
}

export async function markAtomOpenedAction(input: MarkAtomOpenedInput): Promise<CapsuleResult<UpdateAtomOutput>> {
  return run("Could not record that the editor was opened", async ({ supabase }) => ({
    atom: await capsuleService.markAtomOpened(supabase, input),
  }));
}

export async function markAtomPostedAction(input: MarkAtomPostedInput): Promise<CapsuleResult<UpdateAtomOutput>> {
  return run("Could not mark the post as published", async ({ supabase, user }) => ({
    atom: await capsuleService.markAtomPosted(supabase, input, user.id),
  }));
}

export async function capsuleHistoryAction(input: CapsuleHistoryInput): Promise<CapsuleResult<CapsuleHistoryOutput>> {
  return run("Could not load the cross-post history", async ({ supabase }) => ({
    capsules: await capsuleService.listCapsules(supabase, input),
  }));
}
