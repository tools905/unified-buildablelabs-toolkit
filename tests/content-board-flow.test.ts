import { describe, expect, it } from "vitest";
import { canMoveIdea, nextStep, sortColumnIdeas } from "@/lib/utils/content-board";

describe("who can move an idea between columns", () => {
  it("lets admins move a card anywhere", () => {
    expect(canMoveIdea({ from: "idea", to: "posted", isAdmin: true, isAssignee: false })).toBe(true);
    expect(canMoveIdea({ from: "posted", to: "feedback", isAdmin: true, isAssignee: false })).toBe(true);
  });

  it("lets the assigned people start, post and step back once", () => {
    const assignee = { isAdmin: false, isAssignee: true };
    expect(canMoveIdea({ from: "approved", to: "in_progress", ...assignee })).toBe(true);
    expect(canMoveIdea({ from: "in_progress", to: "posted", ...assignee })).toBe(true);
    expect(canMoveIdea({ from: "in_progress", to: "approved", ...assignee })).toBe(true);
    expect(canMoveIdea({ from: "posted", to: "in_progress", ...assignee })).toBe(true);
  });

  it("does not let assignees shortlist their own idea", () => {
    expect(canMoveIdea({ from: "feedback", to: "approved", isAdmin: false, isAssignee: true })).toBe(false);
    expect(canMoveIdea({ from: "approved", to: "posted", isAdmin: false, isAssignee: true })).toBe(false);
  });

  it("does not let other members move cards", () => {
    expect(canMoveIdea({ from: "approved", to: "in_progress", isAdmin: false, isAssignee: false })).toBe(false);
    expect(canMoveIdea({ from: "idea", to: "feedback", isAdmin: false, isAssignee: false })).toBe(false);
  });

  it("treats a move to the same column as no move", () => {
    expect(canMoveIdea({ from: "idea", to: "idea", isAdmin: true, isAssignee: true })).toBe(false);
  });
});

describe("the next step shown on an idea", () => {
  const base = { isAdmin: false, isAssignee: false, hasAssignees: true, openReviewCount: 0 };

  it("only lets an admin shortlist once every review point is fixed", () => {
    expect(nextStep({ ...base, status: "feedback", isAdmin: true, openReviewCount: 2 })).toMatchObject({ kind: "blocked" });
    expect(nextStep({ ...base, status: "feedback", isAdmin: true })).toEqual({ kind: "move", to: "approved", label: "Shortlist" });
    expect(nextStep({ ...base, status: "feedback" })).toMatchObject({ kind: "wait" });
  });

  it("asks an admin to assign someone before work starts", () => {
    expect(nextStep({ ...base, status: "approved", isAdmin: true, hasAssignees: false })).toMatchObject({ kind: "blocked" });
  });

  it("lets the assignee start and then mark it posted", () => {
    expect(nextStep({ ...base, status: "approved", isAssignee: true })).toMatchObject({ kind: "move", to: "in_progress" });
    expect(nextStep({ ...base, status: "in_progress", isAssignee: true })).toMatchObject({ kind: "move", to: "posted" });
  });

  it("has nothing further once posted", () => {
    expect(nextStep({ ...base, status: "posted", isAdmin: true })).toBeNull();
  });
});

describe("the order of cards inside a column", () => {
  it("shows the first idea added at the top of Ideas", () => {
    const ideas = [
      { id: "new", status: "idea" as const, created_at: "2026-10-02T10:00:00Z" },
      { id: "old", status: "idea" as const, created_at: "2026-09-30T10:00:00Z" },
    ];
    expect(sortColumnIdeas("idea", ideas).map((idea) => idea.id)).toEqual(["old", "new"]);
  });

  it("shows the idea that got feedback first at the top of Feedback", () => {
    const ideas = [
      { id: "a", status: "feedback" as const, created_at: "2026-09-01T00:00:00Z", first_feedback_at: "2026-10-03T00:00:00Z" },
      { id: "b", status: "feedback" as const, created_at: "2026-09-20T00:00:00Z", first_feedback_at: "2026-10-01T00:00:00Z" },
      { id: "c", status: "feedback" as const, created_at: "2026-09-10T00:00:00Z", first_feedback_at: null },
    ];
    // "c" has no feedback date, so its creation date stands in for it.
    expect(sortColumnIdeas("feedback", ideas).map((idea) => idea.id)).toEqual(["c", "b", "a"]);
  });

  it("leaves other columns in the order they came in", () => {
    const ideas = [
      { id: "x", status: "posted" as const, created_at: "2026-10-02T00:00:00Z" },
      { id: "y", status: "posted" as const, created_at: "2026-09-02T00:00:00Z" },
    ];
    expect(sortColumnIdeas("posted", ideas).map((idea) => idea.id)).toEqual(["x", "y"]);
  });
});
