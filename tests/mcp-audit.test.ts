import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return { insert, from: vi.fn(() => ({ insert })) };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { createAuditStore, type AuditEntry } from "@/lib/mcp/audit";

const entry: AuditEntry = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  client_id: "client-1",
  tool_name: "list_review_points",
  idea_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  outcome: "error",
  error_code: "not_found",
};

beforeEach(() => {
  insert.mockReset();
  from.mockClear();
});

describe("recording a call", () => {
  it("writes the entry to the audit table", async () => {
    insert.mockResolvedValue({ error: null });
    await createAuditStore().record(entry);
    expect(from).toHaveBeenCalledWith("mcp_audit_log");
    expect(insert).toHaveBeenCalledWith(entry);
  });

  it("keeps the record of a call about an idea that doesn't exist, without the link to it", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23503", message: "violates foreign key constraint" } }).mockResolvedValueOnce({ error: null });
    await createAuditStore().record(entry);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith({ ...entry, idea_id: null });
  });

  it("reports any other failure, and a failure of the retry", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    await expect(createAuditStore().record(entry)).rejects.toMatchObject({ code: "42501" });
    expect(insert).toHaveBeenCalledTimes(1);

    insert.mockReset();
    insert.mockResolvedValueOnce({ error: { code: "23503", message: "fk" } }).mockResolvedValueOnce({ error: { code: "XX000", message: "down" } });
    await expect(createAuditStore().record(entry)).rejects.toMatchObject({ code: "XX000" });
  });

  it("doesn't retry when there was no idea to leave out", async () => {
    insert.mockResolvedValue({ error: { code: "23503", message: "workspace gone" } });
    await expect(createAuditStore().record({ ...entry, idea_id: null })).rejects.toMatchObject({ code: "23503" });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("counting calls", () => {
  it("counts a person's calls in the last minute", async () => {
    const gte = vi.fn(async (...args: [string, string]) => ({ count: args.length > 0 ? 7 : 0, error: null }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    from.mockReturnValueOnce({ select } as never);
    const count = await createAuditStore().callsInLastMinute(entry.user_id);
    expect(count).toBe(7);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("user_id", entry.user_id);
    const since = new Date(gte.mock.calls[0][1]).getTime();
    expect(Date.now() - since).toBeGreaterThanOrEqual(59_000);
    expect(Date.now() - since).toBeLessThan(65_000);
  });
});
