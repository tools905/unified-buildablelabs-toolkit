import { describe, expect, it, vi } from "vitest";

// React's cache() remembers a function's answer for the length of one server request. Outside a
// real render it does nothing, so stand in for it: same arguments, same remembered answer.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      const remembered = new Map<unknown, Map<unknown, unknown>>();
      return ((first: unknown, second: unknown) => {
        const bySecond = remembered.get(first) ?? new Map<unknown, unknown>();
        remembered.set(first, bySecond);
        if (!bySecond.has(second)) bySecond.set(second, (fn as unknown as (a: unknown, b: unknown) => unknown)(first, second));
        return bySecond.get(second);
      }) as unknown as T;
    },
  };
});

import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

// A stand-in for Supabase that records which queries are made.
function fakeSupabase(role: "admin" | "member") {
  const queries: string[] = [];
  const workspace = { id: "w1", name: "BuildableLabs" };
  const client = {
    from(table: string) {
      const columns: { value: string } = { value: "" };
      const builder: Record<string, unknown> = {
        select(value: string) {
          columns.value = value;
          return builder;
        },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        async maybeSingle() {
          queries.push(`${table}: ${columns.value}`);
          return columns.value.includes("workspaces(")
            ? { data: { role, workspaces: workspace }, error: null }
            : { data: { role, workspace_id: workspace.id }, error: null };
        },
      };
      return builder;
    },
  };
  return { client: client as never, queries };
}

describe("isWorkspaceAdmin", () => {
  it("answers from the workspace lookup without asking the database again", async () => {
    const { client, queries } = fakeSupabase("admin");
    const workspace = await getCurrentWorkspace(client, "u1");
    expect(workspace?.id).toBe("w1");
    expect(await isWorkspaceAdmin("w1", "u1", client)).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("workspaces(");
  });

  it("reports a member as not an admin", async () => {
    const { client } = fakeSupabase("member");
    expect(await isWorkspaceAdmin("w1", "u1", client)).toBe(false);
  });

  it("asks about the membership directly when the question is about another workspace", async () => {
    const { client, queries } = fakeSupabase("admin");
    expect(await isWorkspaceAdmin("some-other-workspace", "u1", client)).toBe(true);
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain("workspace_members: *");
  });
});
