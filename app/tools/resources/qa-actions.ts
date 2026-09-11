"use server";

import { requireResourcesContext } from "@/app/tools/resources/actions";
import * as qaService from "@/lib/services/qa-service";
import { startQaAttemptSchema, submitQaAnswerSchema } from "@/lib/validation/qa-schema";

export async function startQaAttemptAction(roadmapId: string) {
  const { roadmapId: validatedRoadmapId } = startQaAttemptSchema.parse({ roadmapId });
  const { supabase, user, workspace } = await requireResourcesContext();
  return qaService.startQaAttempt(supabase, workspace.id, user.id, validatedRoadmapId);
}

export async function submitQaAnswerAction(attemptId: string, selectedOptionId: string) {
  const validated = submitQaAnswerSchema.parse({ attemptId, selectedOptionId });
  const { supabase, user } = await requireResourcesContext();
  return qaService.submitQaAnswer(supabase, user.id, validated.attemptId, validated.selectedOptionId);
}
