"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as contentIdeaService from "@/lib/services/content-idea-service";
import type { ContentIdeaStatus } from "@/lib/db/types";

async function requireContentBoardContext() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  return { supabase, user, workspace };
}

function refreshContentBoard() {
  revalidatePath("/tools/content-board");
}

export async function createIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();

  await contentIdeaService.createContentIdea(supabase, workspace.id, user.id, {
    title: String(formData.get("title") ?? ""),
    description: (formData.get("description") as string) || undefined,
    platform: formData.get("platform") as any,
  });
  refreshContentBoard();
}

export async function updateIdeaStatusAction(ideaId: string, status: ContentIdeaStatus) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, { status });
  refreshContentBoard();
}

export async function updateIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const ideaId = String(formData.get("ideaId"));

  await contentIdeaService.updateContentIdea(supabase, workspace.id, ideaId, user.id, {
    title: (formData.get("title") as string) || undefined,
    description: (formData.get("description") as string) ?? null,
    platform: (formData.get("platform") as any) || undefined,
    status: (formData.get("status") as ContentIdeaStatus) || undefined,
    postUrl: (formData.get("postUrl") as string) ?? null,
  });
  refreshContentBoard();
}

export async function deleteIdeaAction(formData: FormData) {
  const { supabase, user, workspace } = await requireContentBoardContext();
  const ideaId = String(formData.get("ideaId"));
  await contentIdeaService.deleteContentIdea(supabase, workspace.id, ideaId, user.id);
  refreshContentBoard();
}
