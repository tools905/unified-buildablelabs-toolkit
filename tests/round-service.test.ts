import { describe, expect, it, vi } from "vitest";
import { closeOverdueRounds, getRoundProgress } from "@/lib/services/round-service";

vi.mock("@/lib/services/audit-service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/email-service", () => ({
  sendReportReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendRoundStartedEmail: vi.fn().mockResolvedValue(undefined),
}));

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function makeMockSupabase(rounds: { id: string; due_at: string; projects: { review_due_hours: number } | null }[]) {
  const updateSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "closed-round", project_id: "project-1", title: "Week 1 Review", projects: { workspace_id: "workspace-1", name: "Test Project" } },
            error: null,
          }),
        }),
      }),
    }),
  });

  const supabase = {
    updateSpy,
    from: vi.fn((table: string) => {
      if (table === "review_rounds") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: rounds, error: null }),
          }),
          update: updateSpy,
        };
      }
      if (table === "review_assignments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === "workspace_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  };

  return supabase as any;
}

describe("closeOverdueRounds", () => {
  it("closes a round once it's past its project's review window past due_at", async () => {
    const supabase = makeMockSupabase([
      { id: "round-1", due_at: hoursAgo(24 * 100), projects: { review_due_hours: 48 } },
    ]);

    const closed = await closeOverdueRounds(supabase);

    expect(closed).toBe(1);
    expect(supabase.updateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not close a round that's overdue but still within its grace window", async () => {
    const supabase = makeMockSupabase([
      { id: "round-2", due_at: hoursAgo(10), projects: { review_due_hours: 48 } },
    ]);

    const closed = await closeOverdueRounds(supabase);

    expect(closed).toBe(0);
    expect(supabase.updateSpy).not.toHaveBeenCalled();
  });

  it("does not close a round that isn't due yet", async () => {
    const supabase = makeMockSupabase([
      { id: "round-3", due_at: hoursAgo(-24), projects: { review_due_hours: 48 } },
    ]);

    const closed = await closeOverdueRounds(supabase);

    expect(closed).toBe(0);
    expect(supabase.updateSpy).not.toHaveBeenCalled();
  });

  it("falls back to a 48-hour grace period when the project's review_due_hours is missing", async () => {
    const supabase = makeMockSupabase([
      { id: "round-4", due_at: hoursAgo(49), projects: null },
    ]);

    const closed = await closeOverdueRounds(supabase);

    expect(closed).toBe(1);
    expect(supabase.updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getRoundProgress", () => {
  function makeAssignmentsSupabase(assignments: { status: string; reviewer_id: string }[]) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: assignments, error: null }),
        }),
      }),
    } as any;
  }

  it("does not count skipped assignments as pending", async () => {
    const supabase = makeAssignmentsSupabase([
      { status: "submitted", reviewer_id: "r1" },
      { status: "skipped", reviewer_id: "r2" },
      { status: "pending", reviewer_id: "r3" },
    ]);

    const progress = await getRoundProgress(supabase, "round-1");

    expect(progress.total).toBe(3);
    expect(progress.submitted).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.pending).toBe(1);
  });

  it("excludes skipped reviewers from the missing-reviewers list", async () => {
    const supabase = makeAssignmentsSupabase([
      { status: "skipped", reviewer_id: "r1" },
      { status: "pending", reviewer_id: "r2" },
    ]);

    const progress = await getRoundProgress(supabase, "round-1");

    expect(progress.missingReviewers).toHaveLength(1);
  });
});
