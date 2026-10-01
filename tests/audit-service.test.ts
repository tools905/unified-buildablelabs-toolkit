import { beforeEach, describe, expect, it, vi } from "vitest";

const adminInsert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: adminInsert }) }),
}));

import { writeAuditLog } from "@/lib/services/audit-service";

const entry = { workspaceId: "w1", actorId: "u1", action: "content_idea.assigned", entityType: "content_idea", entityId: "i1" };

function userClient(result: unknown) {
  const insert = vi.fn().mockResolvedValue(result);
  return { client: { from: () => ({ insert }) } as never, insert };
}

beforeEach(() => {
  adminInsert.mockReset();
  adminInsert.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("writeAuditLog", () => {
  it("writes with the person's own connection when that is allowed", async () => {
    const { client, insert } = userClient({ error: null });
    await writeAuditLog(client, entry);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action: "content_idea.assigned", actor_id: "u1", entity_id: "i1" }));
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("falls back to the server's connection when the person's own is refused", async () => {
    const { client } = userClient({ error: { message: "new row violates row-level security policy" } });
    await writeAuditLog(client, { ...entry, metadata: { added: ["a"] } });
    expect(adminInsert).toHaveBeenCalledTimes(1);
    expect(adminInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "content_idea.assigned", metadata: { added: ["a"] } }));
  });

  it("never throws, even when both attempts fail", async () => {
    const { client } = userClient({ error: { message: "refused" } });
    adminInsert.mockResolvedValue({ error: { message: "database down" } });
    await expect(writeAuditLog(client, entry)).resolves.toBeUndefined();
    adminInsert.mockRejectedValue(new Error("no admin key"));
    await expect(writeAuditLog(client, entry)).resolves.toBeUndefined();
  });

  it("treats a connection that reports no error as success, even if it returns nothing", async () => {
    const { client } = userClient(undefined);
    await expect(writeAuditLog(client, entry)).resolves.toBeUndefined();
    expect(adminInsert).not.toHaveBeenCalled();
  });
});
