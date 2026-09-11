import { describe, expect, it, vi } from "vitest";
import { findDuplicateTicket } from "@/lib/services/duplicate-ticket-service";

function mockSupabaseWithCandidates(candidates: Array<{ id: string; title: string }>) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: candidates, error: null }),
  };
  return { from: vi.fn(() => builder) } as any;
}

describe("findDuplicateTicket", () => {
  it("returns null when there are no open candidate tickets", async () => {
    const supabase = mockSupabaseWithCandidates([]);

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Implement Patient APIs" });

    expect(result).toBeNull();
  });

  it("flags a near-duplicate where one title is a more detailed version of the other", async () => {
    const supabase = mockSupabaseWithCandidates([
      { id: "t1", title: "Implement Patient APIs with tenant isolation" },
    ]);

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Implement Patient APIs" });

    expect(result?.ticketId).toBe("t1");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("does not flag titles that merely share a couple of common words", async () => {
    const supabase = mockSupabaseWithCandidates([{ id: "t1", title: "Write tests for Patient APIs" }]);

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Implement Patient APIs" });

    expect(result).toBeNull();
  });

  it("does not flag titles about a different resource", async () => {
    const supabase = mockSupabaseWithCandidates([{ id: "t1", title: "Implement Visit APIs" }]);

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Implement Patient APIs" });

    expect(result).toBeNull();
  });

  it("flags a same-length reworded title via Jaccard overlap", async () => {
    const supabase = mockSupabaseWithCandidates([{ id: "t1", title: "Fix broken login redirect" }]);

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Fix login redirect bug" });

    expect(result?.ticketId).toBe("t1");
  });

  it("never throws — a DB error just means no duplicate found", async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error("connection lost");
      }),
    } as any;

    const result = await findDuplicateTicket(supabase, "workspace-1", { title: "Implement Patient APIs" });

    expect(result).toBeNull();
  });
});
