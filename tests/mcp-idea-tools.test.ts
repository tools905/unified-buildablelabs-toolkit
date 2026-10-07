import { describe, expect, it } from "vitest";
import { createIdeaTool } from "@/lib/mcp/tools/ideas";
import { isMcpToolFailure } from "@/lib/mcp/errors";
import type { McpCaller } from "@/lib/mcp/contract";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// A stand-in for the two tables the board's creation code touches: it records the idea row and the
// audit entry, and hands the saved idea back the way the database would.
function fakeDb() {
  const saved: { ideas: Record<string, any>[]; audits: Record<string, any>[] } = { ideas: [], audits: [] };
  const client = {
    from(table: string) {
      if (table === "content_ideas") {
        return {
          insert(row: Record<string, any>) {
            saved.ideas.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: NEW_ID,
                    status: "idea",
                    scheduled_for: row.scheduled_for ?? null,
                    updated_at: "2026-10-06T12:00:00.000Z",
                    ...row,
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          insert: async (row: Record<string, any>) => {
            saved.audits.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const caller: McpCaller = { userId: ME, workspaceId: WORKSPACE, clientId: "client-1", supabase: client as never };
  return { caller, saved };
}

async function failureCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isMcpToolFailure(error)) return error.code;
    throw error;
  }
  return "no failure";
}

describe("create_idea", () => {
  it("creates the idea as the person, in their workspace, in the Ideas column", async () => {
    const { caller, saved } = fakeDb();
    const result = await createIdeaTool(caller, { title: "  Five gaps after the pilot  ", platforms: ["linkedin", "instagram"] });

    expect(saved.ideas).toHaveLength(1);
    expect(saved.ideas[0]).toMatchObject({
      workspace_id: WORKSPACE,
      created_by: ME,
      title: "Five gaps after the pilot",
      platform: "linkedin",
      platforms: ["linkedin", "instagram"],
    });
    expect(result.idea).toEqual({
      id: NEW_ID,
      title: "Five gaps after the pilot",
      platforms: ["linkedin", "instagram"],
      column: "idea",
      scheduled_for: null,
      open_review_points: 0,
      file_count: 0,
      updated_at: "2026-10-06T12:00:00.000Z",
    });
  });

  it("keeps the notes, post text, day and links when they are given", async () => {
    const { caller, saved } = fakeDb();
    const result = await createIdeaTool(caller, {
      title: "Carousel: why pilots stall",
      platforms: ["linkedin"],
      description: "For founders. Lead with the cost of waiting.",
      caption: "Most pilots never ship. Here is why.",
      scheduled_for: "2026-10-20",
      reference_links: ["https://example.com/post"],
    });
    expect(saved.ideas[0]).toMatchObject({
      description: "For founders. Lead with the cost of waiting.",
      caption: "Most pilots never ship. Here is why.",
      scheduled_for: "2026-10-20",
      reference_links: ["https://example.com/post"],
    });
    expect(result.idea.scheduled_for).toBe("2026-10-20");
  });

  it("writes the same audit entry as the board", async () => {
    const { caller, saved } = fakeDb();
    await createIdeaTool(caller, { title: "Audit me", platforms: ["x"] });
    expect(saved.audits).toHaveLength(1);
    expect(saved.audits[0]).toMatchObject({
      action: "content_idea.created",
      actor_id: ME,
      workspace_id: WORKSPACE,
      entity_id: NEW_ID,
    });
  });

  it("refuses an idea with no platform, a one-letter title, a bad day or an unknown platform", async () => {
    const { caller, saved } = fakeDb();
    expect(await failureCode(createIdeaTool(caller, { title: "Fine title", platforms: [] }))).toBe("invalid_input");
    expect(await failureCode(createIdeaTool(caller, { title: "x", platforms: ["x"] }))).toBe("invalid_input");
    expect(await failureCode(createIdeaTool(caller, { title: "Fine title", platforms: ["x"], scheduled_for: "next week" }))).toBe("invalid_input");
    expect(await failureCode(createIdeaTool(caller, { title: "Fine title", platforms: ["tiktok"] }))).toBe("invalid_input");
    expect(saved.ideas).toHaveLength(0);
  });

  it("explains a day that doesn't exist instead of failing in the database, and accepts real ones", async () => {
    const { caller, saved } = fakeDb();
    for (const day of ["2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10", "2027-02-29"]) {
      try {
        await createIdeaTool(caller, { title: "Fine title", platforms: ["x"], scheduled_for: day });
        throw new Error(`${day} was accepted`);
      } catch (error) {
        expect(isMcpToolFailure(error), day).toBe(true);
        expect((error as { code: string }).code).toBe("invalid_input");
        expect((error as Error).message, day).toContain("scheduled_for");
      }
    }
    expect(saved.ideas).toHaveLength(0);
    for (const day of ["2026-02-28", "2028-02-29", "2026-12-31"]) {
      await createIdeaTool(caller, { title: "Fine title", platforms: ["x"], scheduled_for: day });
    }
    expect(saved.ideas.map((row) => row.scheduled_for)).toEqual(["2026-02-28", "2028-02-29", "2026-12-31"]);
  });

  it("accepts the board's 'Any' platform", async () => {
    const { caller, saved } = fakeDb();
    const result = await createIdeaTool(caller, { title: "Fine title", platforms: ["any"] });
    expect(result.idea.platforms).toEqual(["any"]);
    expect(saved.ideas[0]).toMatchObject({ platform: "any", platforms: ["any"] });
  });

  it("refuses a link the board would refuse, and saves nothing", async () => {
    const { caller, saved } = fakeDb();
    const code = await failureCode(
      createIdeaTool(caller, { title: "Fine title", platforms: ["x"], reference_links: ["http://example.com/not-secure"] }),
    );
    expect(code).toBe("invalid_input");
    expect(saved.ideas).toHaveLength(0);
  });
});
