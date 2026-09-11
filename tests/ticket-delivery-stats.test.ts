import { describe, expect, it, vi } from "vitest";
import { getTicketDeliveryStats } from "@/lib/services/ticket-review-service";

function makeMockSupabase({
  touched = [] as { id: string; status: string; review_status: string | null }[],
  overdueCount = 0,
}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn((_fields: string, options?: { count?: string }) => {
        if (options?.count === "exact") {
          return {
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({ count: overdueCount, error: null }),
              }),
            }),
          };
        }
        return {
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: touched, error: null }),
            }),
          }),
        };
      }),
    }),
  } as any;
}

describe("getTicketDeliveryStats", () => {
  it("counts completed and verified tickets touched during the window", async () => {
    const supabase = makeMockSupabase({
      touched: [
        { id: "t1", status: "done", review_status: "verified" },
        { id: "t2", status: "done", review_status: "pending_review" },
        { id: "t3", status: "in_progress", review_status: null },
      ],
      overdueCount: 0,
    });

    const stats = await getTicketDeliveryStats(supabase, "user-1", "2026-01-01", "2026-01-08");

    expect(stats.touched).toBe(3);
    expect(stats.completed).toBe(2);
    expect(stats.verified).toBe(1);
    expect(stats.overdue).toBe(0);
  });

  it("reports overdue tickets independently of the touched window", async () => {
    const supabase = makeMockSupabase({ touched: [], overdueCount: 4 });

    const stats = await getTicketDeliveryStats(supabase, "user-1", "2026-01-01", "2026-01-08");

    expect(stats.touched).toBe(0);
    expect(stats.overdue).toBe(4);
  });
});
