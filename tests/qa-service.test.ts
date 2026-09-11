import { describe, expect, it, vi } from "vitest";
import { qaGeneratedTurnSchema } from "@/lib/validation/qa-schema";
import { computeScore, startQaAttempt, type QaTurnRecord } from "@/lib/services/qa-service";

vi.mock("@/modules/shared/ai", () => ({
  generateStructuredAnalysis: vi.fn().mockRejectedValue(new Error("AI should not be called in this test")),
}));

vi.mock("@/lib/services/audit-service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const baseOptions = [
  { id: "A" as const, text: "Option A" },
  { id: "B" as const, text: "Option B" },
  { id: "C" as const, text: "Option C" },
  { id: "D" as const, text: "Option D" },
];

function makeTurn(overrides: Partial<QaTurnRecord> = {}): QaTurnRecord {
  return {
    turnNumber: 1,
    question: "What does this concept mean?",
    options: baseOptions,
    isChallenge: false,
    correctOptionId: "B",
    selectedOptionId: "B",
    isCorrect: true,
    answeredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("qaGeneratedTurnSchema", () => {
  it("accepts a well-formed generated turn", () => {
    const result = qaGeneratedTurnSchema.safeParse({
      question: "Which statement is correct about this topic?",
      options: baseOptions,
      correctOptionId: "B",
      isChallenge: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a correctOptionId that doesn't match any option", () => {
    const result = qaGeneratedTurnSchema.safeParse({
      question: "Which statement is correct about this topic?",
      options: baseOptions,
      correctOptionId: "Z",
      isChallenge: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const result = qaGeneratedTurnSchema.safeParse({
      question: "Which statement is correct about this topic?",
      options: [baseOptions[0], baseOptions[0], baseOptions[2], baseOptions[3]],
      correctOptionId: "A",
      isChallenge: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("computeScore", () => {
  it("counts all-correct turns", () => {
    const turns = [makeTurn(), makeTurn({ turnNumber: 2 }), makeTurn({ turnNumber: 3 })];
    expect(computeScore(turns)).toBe(3);
  });

  it("counts all-wrong turns as zero", () => {
    const turns = [
      makeTurn({ selectedOptionId: "A", isCorrect: false }),
      makeTurn({ turnNumber: 2, selectedOptionId: "C", isCorrect: false }),
    ];
    expect(computeScore(turns)).toBe(0);
  });

  it("counts a mixed set correctly", () => {
    const turns = [
      makeTurn({ turnNumber: 1, isCorrect: true }),
      makeTurn({ turnNumber: 2, selectedOptionId: "A", isCorrect: false }),
      makeTurn({ turnNumber: 3, isCorrect: true }),
    ];
    expect(computeScore(turns)).toBe(2);
  });
});

describe("startQaAttempt", () => {
  it("resumes an existing in-progress attempt without calling the AI", async () => {
    const existingRow = {
      id: "attempt-1",
      workspace_id: "workspace-1",
      roadmap_id: "roadmap-1",
      status: "in_progress",
      total_questions: 6,
      turns: [makeTurn({ selectedOptionId: null, isCorrect: null, answeredAt: null })],
      score: null,
      summary: null,
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any;

    const attempt = await startQaAttempt(mockSupabase, "workspace-1", "user-1", "roadmap-1");

    expect(attempt.id).toBe("attempt-1");
    // The resumed (pending) turn must not leak the answer key to the caller.
    expect(attempt.turns[0]).not.toHaveProperty("correctOptionId");
  });
});
