import { describe, expect, it } from "vitest";
import { getIdeaTool, getMonthScheduleTool, listIdeasTool } from "@/lib/mcp/tools/read";
import { isMcpToolFailure } from "@/lib/mcp/errors";
import type { McpCaller } from "@/lib/mcp/contract";
import { fakeBoardDb, type BoardSeed, type Row } from "./helpers/fake-board-db";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AADI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const profiles = [
  { id: ME, full_name: "Mridul", email: "mridul@example.com" },
  { id: AADI, full_name: null, email: "aadi@example.com" },
];

const idea = (id: string, over: Row = {}): Row => ({
  id,
  workspace_id: WORKSPACE,
  title: `Idea ${id}`,
  description: null,
  caption: null,
  platform: "linkedin",
  platforms: ["linkedin"],
  status: "idea",
  post_url: null,
  scheduled_for: null,
  reference_links: [],
  updated_at: "2026-10-01T10:00:00.000Z",
  created_by: ME,
  ...over,
});

const caller = (client: never): McpCaller => ({ userId: ME, workspaceId: WORKSPACE, clientId: "client-1", supabase: client });
const setup = (seed: Omit<BoardSeed, "memberOf" | "profiles"> & { memberOf?: string[] }) =>
  fakeBoardDb({ profiles, memberOf: [WORKSPACE], ...seed });

async function failureCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isMcpToolFailure(error)) return error.code;
    throw error;
  }
  return "no failure";
}

describe("list_ideas", () => {
  it("lists the workspace's ideas, most recently updated first, with their counts", async () => {
    const { client } = setup({
      content_ideas: [
        idea("old", { updated_at: "2026-09-01T00:00:00.000Z" }),
        idea("new", { updated_at: "2026-10-05T00:00:00.000Z", scheduled_for: "2026-10-20" }),
      ],
      content_idea_attachments: [
        { id: "a1", idea_id: "new", workspace_id: WORKSPACE, kind: "pdf" },
        { id: "a2", idea_id: "new", workspace_id: WORKSPACE, kind: "link" },
      ],
      content_idea_review_points: [
        { id: "p1", idea_id: "new", workspace_id: WORKSPACE, is_resolved: false },
        { id: "p2", idea_id: "new", workspace_id: WORKSPACE, is_resolved: true },
      ],
    });
    const result = await listIdeasTool(caller(client), {});
    expect(result.truncated).toBe(false);
    expect(result.ideas.map((i) => i.id)).toEqual(["new", "old"]);
    expect(result.ideas[0]).toEqual({
      id: "new",
      title: "Idea new",
      platforms: ["linkedin"],
      column: "idea",
      scheduled_for: "2026-10-20",
      open_review_points: 1,
      file_count: 1, // the design link is not a file
      updated_at: "2026-10-05T00:00:00.000Z",
    });
  });

  it("never shows another workspace's ideas, even to a person who can see both", async () => {
    const { client } = setup({
      content_ideas: [idea("mine"), idea("theirs", { workspace_id: OTHER_WORKSPACE })],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
    expect((await listIdeasTool(caller(client), {})).ideas.map((i) => i.id)).toEqual(["mine"]);
  });

  it("filters by column, platform, month and assigned to me", async () => {
    const { client } = setup({
      content_ideas: [
        idea("a", { status: "feedback", platforms: ["instagram", "linkedin"], platform: "instagram", scheduled_for: "2026-10-03" }),
        idea("b", { status: "idea", platforms: ["x"], platform: "x", scheduled_for: "2026-11-03" }),
        idea("c", { status: "idea", platforms: [], platform: "instagram", scheduled_for: "2026-10-28" }),
      ],
      content_idea_assignees: [{ idea_id: "c", user_id: ME, workspace_id: WORKSPACE }, { idea_id: "a", user_id: AADI, workspace_id: WORKSPACE }],
    });
    const ids = async (input: object) => (await listIdeasTool(caller(client), input)).ideas.map((i) => i.id).sort();
    expect(await ids({ column: "feedback" })).toEqual(["a"]);
    expect(await ids({ platform: "linkedin" })).toEqual(["a"]);
    expect(await ids({ platform: "instagram" })).toEqual(["a", "c"]); // c has no list, so its one platform counts
    expect(await ids({ month: "2026-10" })).toEqual(["a", "c"]);
    expect(await ids({ month: "2026-11" })).toEqual(["b"]);
    expect(await ids({ mine_only: true })).toEqual(["c"]);
    expect(await ids({ platform: "instagram", month: "2026-10", column: "idea" })).toEqual(["c"]);
  });

  it("stops at the limit and says there is more", async () => {
    const { client } = setup({ content_ideas: ["1", "2", "3"].map((n, i) => idea(n, { updated_at: `2026-10-0${i + 1}T00:00:00.000Z` })) });
    const result = await listIdeasTool(caller(client), { limit: 2 });
    expect(result.ideas.map((i) => i.id)).toEqual(["3", "2"]);
    expect(result.truncated).toBe(true);
    expect((await listIdeasTool(caller(client), { limit: 3 })).truncated).toBe(false);
  });

  it("refuses a limit or month that makes no sense", async () => {
    const { client } = setup({});
    expect(await failureCode(listIdeasTool(caller(client), { limit: 0 }))).toBe("invalid_input");
    expect(await failureCode(listIdeasTool(caller(client), { limit: 101 }))).toBe("invalid_input");
    expect(await failureCode(listIdeasTool(caller(client), { month: "October" }))).toBe("invalid_input");
    expect(await failureCode(listIdeasTool(caller(client), { column: "archived" }))).toBe("invalid_input");
  });
});

const IDEA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_IDEA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("get_idea", () => {
  const seed = () =>
    setup({
      content_ideas: [
        idea(IDEA, {
          title: "Five gaps",
          description: "For founders.",
          caption: "Most pilots never ship.",
          post_url: "https://example.com/post",
          reference_links: ["https://example.com/ref"],
          status: "feedback",
          platforms: ["linkedin", "instagram"],
          scheduled_for: "2026-10-12",
        }),
        idea(OTHER_IDEA, { workspace_id: OTHER_WORKSPACE }),
      ],
      content_idea_attachments: [
        { id: "f1", idea_id: IDEA, workspace_id: WORKSPACE, kind: "pdf", file_name: "v1.pdf", size_bytes: 1000, url: null, created_by: ME, created_at: "2026-10-01T09:00:00.000Z", sort_order: 0, uploaded_via: null },
        { id: "f2", idea_id: IDEA, workspace_id: WORKSPACE, kind: "pdf", file_name: "v2.pdf", size_bytes: 2000, url: null, created_by: AADI, created_at: "2026-10-03T09:00:00.000Z", sort_order: 1, uploaded_via: "Chat App" },
        { id: "f3", idea_id: IDEA, workspace_id: WORKSPACE, kind: "link", file_name: null, size_bytes: null, url: "https://figma.com/x", created_by: ME, created_at: "2026-10-04T09:00:00.000Z", sort_order: 2, uploaded_via: null },
      ],
      content_idea_review_points: [
        { id: "p1", idea_id: IDEA, workspace_id: WORKSPACE, body: "Shorten the headline", is_resolved: false, resolved_at: null, created_by: AADI, created_at: "2026-10-02T10:00:00.000Z" },
        { id: "p2", idea_id: IDEA, workspace_id: WORKSPACE, body: "Fix the typo", is_resolved: true, resolved_at: "2026-10-03T10:00:00.000Z", created_by: ME, created_at: "2026-10-02T11:00:00.000Z" },
      ],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });

  it("gives the idea in full: details, caption, links, summary counts", async () => {
    const result = await getIdeaTool(caller(seed().client), { idea_id: IDEA });
    expect(result).toMatchObject({
      id: IDEA,
      title: "Five gaps",
      details: "For founders.",
      caption: "Most pilots never ship.",
      post_url: "https://example.com/post",
      reference_links: ["https://example.com/ref"],
      column: "feedback",
      platforms: ["linkedin", "instagram"],
      scheduled_for: "2026-10-12",
      open_review_points: 1,
      file_count: 2,
    });
  });

  it("lists the files with who added them, how, and the address of a design link", async () => {
    const { files } = await getIdeaTool(caller(seed().client), { idea_id: IDEA });
    expect(files.map((f) => [f.id, f.kind, f.file_name, f.uploaded_by, f.uploaded_via, f.link_url])).toEqual([
      ["f1", "pdf", "v1.pdf", "Mridul", null, null],
      ["f2", "pdf", "v2.pdf", "aadi@example.com", "Chat App", null],
      ["f3", "link", null, "Mridul", null, "https://figma.com/x"],
    ]);
    expect(files[1]).toMatchObject({ size_bytes: 2000, uploaded_at: "2026-10-03T09:00:00.000Z" });
  });

  it("lists the review points with who wrote them and whether they are done", async () => {
    const { review_points } = await getIdeaTool(caller(seed().client), { idea_id: IDEA });
    expect(review_points.map((p) => [p.text, p.by, p.done, p.done_at])).toEqual([
      ["Shorten the headline", "aadi@example.com", false, null],
      ["Fix the typo", "Mridul", true, "2026-10-03T10:00:00.000Z"],
    ]);
  });

  it("says not_found for an idea that doesn't exist or belongs to another workspace", async () => {
    const { client } = seed();
    expect(await failureCode(getIdeaTool(caller(client), { idea_id: "99999999-9999-4999-8999-999999999999" }))).toBe("not_found");
    expect(await failureCode(getIdeaTool(caller(client), { idea_id: OTHER_IDEA }))).toBe("not_found");
    expect(await failureCode(getIdeaTool(caller(client), { idea_id: "nope" }))).toBe("invalid_input");
  });
});

describe("get_month_schedule", () => {
  const scheduled = (id: string, day: string | null, over: Row = {}) => idea(id, { title: `T-${id}`, scheduled_for: day, ...over });

  it("groups a month's ideas by day, in date order, and leaves out days with nothing", async () => {
    const { client } = setup({
      content_ideas: [
        scheduled("b", "2026-10-12"),
        scheduled("a", "2026-10-03", { platforms: ["instagram", "linkedin"], platform: "instagram" }),
        scheduled("c", "2026-10-12", { platforms: [], platform: "x" }),
        scheduled("d", "2026-09-30"),
        scheduled("e", "2026-11-01"),
        scheduled("f", null),
        scheduled("g", "2026-10-15", { workspace_id: OTHER_WORKSPACE }),
      ],
      memberOf: [WORKSPACE, OTHER_WORKSPACE],
    });
    const result = await getMonthScheduleTool(caller(client), { month: "2026-10" });
    expect(result.month).toBe("2026-10");
    expect(result.days).toEqual([
      { date: "2026-10-03", ideas: [{ id: "a", title: "T-a", platforms: ["instagram", "linkedin"] }] },
      {
        date: "2026-10-12",
        ideas: [
          { id: "b", title: "T-b", platforms: ["linkedin"] },
          { id: "c", title: "T-c", platforms: ["x"] },
        ],
      },
    ]);
  });

  it("includes the first and last day of a month, whatever its length", async () => {
    const { client } = setup({ content_ideas: [scheduled("a", "2028-02-01"), scheduled("b", "2028-02-29"), scheduled("c", "2028-03-01")] });
    const feb = await getMonthScheduleTool(caller(client), { month: "2028-02" });
    expect(feb.days.map((d) => d.date)).toEqual(["2028-02-01", "2028-02-29"]);
    const { client: client2 } = setup({ content_ideas: [scheduled("a", "2027-02-28"), scheduled("b", "2027-03-01")] });
    expect((await getMonthScheduleTool(caller(client2), { month: "2027-02" })).days.map((d) => d.date)).toEqual(["2027-02-28"]);
    const { client: client3 } = setup({ content_ideas: [scheduled("a", "2026-12-31")] });
    expect((await getMonthScheduleTool(caller(client3), { month: "2026-12" })).days).toHaveLength(1);
  });

  it("answers with no days for an empty month, and refuses a month that isn't one", async () => {
    const { client } = setup({});
    expect(await getMonthScheduleTool(caller(client), { month: "2026-10" })).toEqual({ month: "2026-10", days: [] });
    expect(await failureCode(getMonthScheduleTool(caller(client), { month: "2026-13" }))).toBe("invalid_input");
    expect(await failureCode(getMonthScheduleTool(caller(client), {}))).toBe("invalid_input");
  });
});
