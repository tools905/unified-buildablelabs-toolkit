// The tool that starts the flow: create a new idea on the Content Board. It acts as the signed-in person
// (`caller.supabase`) and goes through the board's own creation code, so an idea made here is checked,
// saved and logged exactly like one made with the New idea button.

import { ZodError } from "zod";
import {
  createIdeaInput,
  type CreateIdeaOutput,
  type McpCaller,
} from "@/lib/mcp/contract";
import { McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import { createContentIdea } from "@/lib/services/content-idea-service";
import type { ContentPlatform } from "@/lib/db/types";

export async function createIdeaTool(caller: McpCaller, rawInput: unknown): Promise<CreateIdeaOutput> {
  const input = parseToolInput(createIdeaInput, rawInput);

  let idea;
  try {
    idea = await createContentIdea(caller.supabase, caller.workspaceId, caller.userId, {
      title: input.title,
      description: input.description,
      caption: input.caption,
      platforms: input.platforms,
      scheduledFor: input.scheduled_for,
      referenceLinks: input.reference_links,
    });
  } catch (error) {
    // The board's own checks are a little stricter than the contract's (for example links must be https).
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      throw new McpToolFailure("invalid_input", `${where}${first?.message ?? "The idea is not valid."}`);
    }
    throw error;
  }

  const platforms: ContentPlatform[] = idea.platforms?.length ? idea.platforms : [idea.platform];
  return {
    idea: {
      id: idea.id,
      title: idea.title,
      platforms,
      column: idea.status,
      scheduled_for: idea.scheduled_for ?? null,
      open_review_points: 0,
      file_count: 0,
      updated_at: idea.updated_at,
    },
  };
}
