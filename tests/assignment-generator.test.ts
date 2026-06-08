import { describe, expect, it } from "vitest";
import { generateFullPeerAssignments } from "@/lib/utils/assignment-generator";

describe("generateFullPeerAssignments", () => {
  it("excludes self-review and creates n * (n - 1) assignments", () => {
    const members = ["a", "b", "c", "d", "e"].map((userId) => ({ userId }));
    const assignments = generateFullPeerAssignments(members);

    expect(assignments).toHaveLength(20);
    expect(assignments.every((a) => a.reviewerId !== a.revieweeId)).toBe(true);

    for (const member of members) {
      expect(assignments.filter((a) => a.reviewerId === member.userId)).toHaveLength(4);
      expect(assignments.filter((a) => a.revieweeId === member.userId)).toHaveLength(4);
    }
  });

  it("is deterministic regardless of input order", () => {
    const one = generateFullPeerAssignments(["b", "a", "c"].map((userId) => ({ userId })));
    const two = generateFullPeerAssignments(["c", "b", "a"].map((userId) => ({ userId })));
    expect(one).toEqual(two);
  });

  it("requires at least 3 members", () => {
    expect(() => generateFullPeerAssignments([{ userId: "a" }, { userId: "b" }])).toThrow(
      "At least 3 active project members are required.",
    );
  });
});
