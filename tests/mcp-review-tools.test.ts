import { describe, expect, it } from "vitest";
import { addReviewPointTool, listReviewPointsTool, resolveReviewPointTool } from "@/lib/mcp/tools/review";
import { isMcpToolFailure, McpToolFailure, parseToolInput } from "@/lib/mcp/errors";
import { listReviewPointsInput } from "@/lib/mcp/contract";
import type { McpCaller } from "@/lib/mcp/contract";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDEA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_IDEA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Row = Record<string, any>;

// A small in-memory stand-in for the three tables the review tools touch. It applies filters, hides rows
// of workspaces the person isn't in (like the database rules do) and joins the author's profile.
function fakeDb(seed: { ideas: Row[]; points: Row[]; memberOf?: string[] }) {
  const memberOf = seed.memberOf ?? [WORKSPACE];
  const tables: Record<string, Row[]> = {
    content_ideas: seed.ideas.map((r) => ({ ...r })),
    content_idea_review_points: seed.points.map((r) => ({ ...r })),
  };
  const profiles: Record<string, Row> = {
    [ME]: { id: ME, full_name: "Mridul", email: "mridul@example.com" },
    [REVIEWER]: { id: REVIEWER, full_name: null, email: "reviewer@example.com" },
  };
  const visible = (table: string) => tables[table].filter((r) => memberOf.includes(r.workspace_id));

  function builder(table: string) {
    let op: "select" | "insert" | "update" = "select";
    let patch: Row = {};
    let row: Row = {};
    let selectCols = "";
    const filters: [string, unknown][] = [];

    const matches = () => visible(table).filter((r) => filters.every(([k, v]) => r[k] === v));
    const shape = (r: Row) => {
      if (table === "content_idea_review_points" && selectCols.includes("author:")) {
        return { ...r, author: profiles[r.created_by] ?? null };
      }
      return r;
    };
    const run = () => {
      if (op === "insert") {
        if (!memberOf.includes(row.workspace_id)) return { data: null, error: new Error("row-level security") };
        tables[table].push({ created_at: new Date().toISOString(), is_resolved: false, resolved_at: null, ...row });
        return { data: null, error: null };
      }
      if (op === "update") {
        const hit = matches();
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit.map(shape), error: null };
      }
      return { data: matches().map(shape), error: null };
    };

    const api: Record<string, any> = {
      select: (cols: string) => {
        selectCols = cols;
        return api;
      },
      insert: (r: Row) => {
        op = "insert";
        row = r;
        return api;
      },
      update: (p: Row) => {
        op = "update";
        patch = p;
        return api;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return api;
      },
      order: () => api,
      maybeSingle: async () => {
        const result = run();
        return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return api;
  }

  return { client: { from: (table: string) => builder(table) } as never, tables };
}

function caller(client: never): McpCaller {
  return { userId: ME, workspaceId: WORKSPACE, clientId: "client-1", supabase: client };
}

const idea = (over: Row = {}) => ({ id: IDEA, workspace_id: WORKSPACE, status: "idea", ...over });
const point = (over: Row = {}) => ({
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  idea_id: IDEA,
  workspace_id: WORKSPACE,
  body: "Shorten the headline",
  is_resolved: false,
  resolved_at: null,
  created_by: REVIEWER,
  created_at: "2026-10-01T10:00:00.000Z",
  ...over,
});

async function failureOf(promise: Promise<unknown>): Promise<McpToolFailure> {
  try {
    await promise;
  } catch (error) {
    if (isMcpToolFailure(error)) return error;
    throw error;
  }
  throw new Error("expected the tool to fail");
}

describe("list_review_points", () => {
  it("lists open points with the reviewer's name, falling back to their email", async () => {
    const { client } = fakeDb({ ideas: [idea()], points: [point(), point({ id: "p2", created_by: ME, body: "Add a CTA" })] });
    const result = await listReviewPointsTool(caller(client), { idea_id: IDEA });
    expect(result.points.map((p) => [p.text, p.by])).toEqual([
      ["Shorten the headline", "reviewer@example.com"],
      ["Add a CTA", "Mridul"],
    ]);
    expect(result.points[0]).toEqual({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      text: "Shorten the headline",
      by: "reviewer@example.com",
      created_at: "2026-10-01T10:00:00.000Z",
      done: false,
      done_at: null,
    });
  });

  it("leaves out ticked points unless asked for them", async () => {
    const { client } = fakeDb({
      ideas: [idea()],
      points: [point(), point({ id: "p2", is_resolved: true, resolved_at: "2026-10-02T09:00:00.000Z" })],
    });
    expect((await listReviewPointsTool(caller(client), { idea_id: IDEA })).points).toHaveLength(1);
    const all = await listReviewPointsTool(caller(client), { idea_id: IDEA, include_done: true });
    expect(all.points.map((p) => p.done)).toEqual([false, true]);
  });

  it("says not_found for an idea that doesn't exist", async () => {
    const { client } = fakeDb({ ideas: [], points: [] });
    expect((await failureOf(listReviewPointsTool(caller(client), { idea_id: IDEA }))).code).toBe("not_found");
  });

  it("says not_found for an idea of another workspace, even one the person can see", async () => {
    const { client } = fakeDb({
      ideas: [idea({ id: OTHER_IDEA, workspace_id: OTHER_WORKSPACE })],
      points: [point({ idea_id: OTHER_IDEA, workspace_id: OTHER_WORKSPACE })],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
    expect((await failureOf(listReviewPointsTool(caller(client), { idea_id: OTHER_IDEA }))).code).toBe("not_found");
  });

  it("says invalid_input for an id that isn't one", async () => {
    const { client } = fakeDb({ ideas: [], points: [] });
    const failure = await failureOf(listReviewPointsTool(caller(client), { idea_id: "not-an-id" }));
    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toContain("idea_id");
  });
});

describe("add_review_point", () => {
  it("saves the point as the person, returns it with their name, and moves an idea in Ideas to Feedback", async () => {
    const { client, tables } = fakeDb({ ideas: [idea()], points: [] });
    const result = await addReviewPointTool(caller(client), { idea_id: IDEA, text: "  The intro is too long  " });

    expect(result.moved_to_feedback).toBe(true);
    expect(result.point).toMatchObject({ text: "The intro is too long", by: "Mridul", done: false, done_at: null });
    expect(tables.content_idea_review_points).toHaveLength(1);
    expect(tables.content_idea_review_points[0]).toMatchObject({
      id: result.point.id,
      idea_id: IDEA,
      workspace_id: WORKSPACE,
      created_by: ME,
    });
    expect(tables.content_ideas[0].status).toBe("feedback");
  });

  it("leaves an idea that is already past Ideas where it is", async () => {
    const { client, tables } = fakeDb({ ideas: [idea({ status: "shortlisted" })], points: [] });
    const result = await addReviewPointTool(caller(client), { idea_id: IDEA, text: "Nice, one small thing" });
    expect(result.moved_to_feedback).toBe(false);
    expect(tables.content_ideas[0].status).toBe("shortlisted");
  });

  it("refuses an idea of another workspace and writes nothing", async () => {
    const { client, tables } = fakeDb({
      ideas: [idea({ id: OTHER_IDEA, workspace_id: OTHER_WORKSPACE })],
      points: [],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
    const failure = await failureOf(addReviewPointTool(caller(client), { idea_id: OTHER_IDEA, text: "Sneaky point" }));
    expect(failure.code).toBe("not_found");
    expect(tables.content_idea_review_points).toHaveLength(0);
  });

  it("refuses text that is too short or too long", async () => {
    const { client, tables } = fakeDb({ ideas: [idea()], points: [] });
    expect((await failureOf(addReviewPointTool(caller(client), { idea_id: IDEA, text: " a " }))).code).toBe("invalid_input");
    expect((await failureOf(addReviewPointTool(caller(client), { idea_id: IDEA, text: "x".repeat(3001) }))).code).toBe(
      "invalid_input",
    );
    expect(tables.content_idea_review_points).toHaveLength(0);
  });
});

describe("resolve_review_point", () => {
  it("ticks a point off and returns it with the time", async () => {
    const { client } = fakeDb({ ideas: [idea()], points: [point()] });
    const result = await resolveReviewPointTool(caller(client), { point_id: point().id });
    expect(result.point.done).toBe(true);
    expect(result.point.done_at).toEqual(expect.any(String));
  });

  it("un-ticks a point with done false", async () => {
    const { client } = fakeDb({
      ideas: [idea()],
      points: [point({ is_resolved: true, resolved_at: "2026-10-02T09:00:00.000Z" })],
    });
    const result = await resolveReviewPointTool(caller(client), { point_id: point().id, done: false });
    expect(result.point).toMatchObject({ done: false, done_at: null });
  });

  it("keeps the original time when a ticked point is ticked again", async () => {
    const { client, tables } = fakeDb({
      ideas: [idea()],
      points: [point({ is_resolved: true, resolved_at: "2026-10-02T09:00:00.000Z" })],
    });
    const result = await resolveReviewPointTool(caller(client), { point_id: point().id });
    expect(result.point.done_at).toBe("2026-10-02T09:00:00.000Z");
    expect(tables.content_idea_review_points[0].resolved_at).toBe("2026-10-02T09:00:00.000Z");
  });

  it("says not_found for a point that doesn't exist or belongs to another workspace", async () => {
    const { client } = fakeDb({
      ideas: [],
      points: [point({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", workspace_id: OTHER_WORKSPACE })],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
    const missing = "99999999-9999-4999-8999-999999999999";
    expect((await failureOf(resolveReviewPointTool(caller(client), { point_id: missing }))).code).toBe("not_found");
    expect(
      (await failureOf(resolveReviewPointTool(caller(client), { point_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }))).code,
    ).toBe("not_found");
  });
});

describe("tool errors", () => {
  it("carries a code and a message a person can read", () => {
    const failure = new McpToolFailure("forbidden", "Not yours.");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.toJSON()).toEqual({ code: "forbidden", message: "Not yours." });
    expect(isMcpToolFailure(failure)).toBe(true);
    expect(isMcpToolFailure(new Error("x"))).toBe(false);
  });

  it("applies a tool's defaults when checking input", () => {
    expect(parseToolInput(listReviewPointsInput, { idea_id: IDEA })).toEqual({ idea_id: IDEA, include_done: false });
  });
});
