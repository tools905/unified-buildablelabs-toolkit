import { describe, expect, it } from "vitest";
import { addReviewPoint } from "@/lib/services/content-review-service";
import { CONTENT_COLUMNS } from "@/components/content-board/types";
import { contentIdeaStatusSchema, updateContentIdeaSchema } from "@/lib/validation/content-idea-schema";

// A stand-in for Supabase that records the review point insert and the status update.
function fakeSupabase(options: { insertError?: boolean; ideaStillInIdeas: boolean }) {
  const calls = { inserted: [] as unknown[], update: null as null | { patch: unknown; filters: Record<string, string> } };
  const client = {
    from(table: string) {
      if (table === "content_idea_review_points") {
        return {
          insert: async (row: unknown) => {
            calls.inserted.push(row);
            return { error: options.insertError ? new Error("insert failed") : null };
          },
        };
      }
      const filters: Record<string, string> = {};
      const builder: Record<string, unknown> = {
        update: (patch: unknown) => {
          calls.update = { patch, filters };
          return builder;
        },
        eq: (column: string, value: string) => {
          filters[column] = value;
          return builder;
        },
        // The update only matches (and returns) a row if the idea is still in Ideas.
        select: async () => ({ data: options.ideaStillInIdeas && filters.status === "idea" ? [{ id: filters.id }] : [], error: null }),
      };
      return builder;
    },
  };
  return { client: client as never, calls };
}

const input = { workspaceId: "w1", ideaId: "i1", userId: "u1", body: "Make the headline shorter" };

describe("the first feedback moves an idea to Feedback", () => {
  it("moves an idea that is still in Ideas", async () => {
    const { client, calls } = fakeSupabase({ ideaStillInIdeas: true });
    expect(await addReviewPoint(client, input)).toEqual({ movedToFeedback: true });
    expect(calls.inserted).toHaveLength(1);
    expect(calls.update).toEqual({ patch: { status: "feedback" }, filters: { id: "i1", status: "idea" } });
  });

  it("only ever touches an idea that is currently in Ideas, so later stages are left alone", async () => {
    const { client, calls } = fakeSupabase({ ideaStillInIdeas: false });
    expect(await addReviewPoint(client, input)).toEqual({ movedToFeedback: false });
    expect(calls.update?.filters.status).toBe("idea");
  });

  it("moves nothing when the comment itself could not be saved", async () => {
    const { client, calls } = fakeSupabase({ insertError: true, ideaStillInIdeas: true });
    await expect(addReviewPoint(client, input)).rejects.toThrow("insert failed");
    expect(calls.update).toBeNull();
  });
});

describe("the Feedback column", () => {
  it("sits right after Ideas, in the agreed order", () => {
    expect(CONTENT_COLUMNS.map((column) => column.status)).toEqual(["idea", "feedback", "approved", "in_progress", "posted"]);
    expect(CONTENT_COLUMNS[1].label).toBe("Feedback");
  });

  it("is a status ideas can be moved to", () => {
    expect(contentIdeaStatusSchema.safeParse("feedback").success).toBe(true);
    expect(updateContentIdeaSchema.safeParse({ status: "feedback" }).success).toBe(true);
    expect(contentIdeaStatusSchema.safeParse("reviewed").success).toBe(false);
  });
});
