import { describe, expect, it } from "vitest";
import { canMoveIdea, columnOrderNote, deriveIdeaTitle, describeActivity, latestActivity, nextStep, sortColumnIdeas } from "@/lib/utils/content-board";
import { platformsSchema } from "@/lib/validation/content-idea-schema";
import { matchesPlatform } from "@/components/content-board/types";
import { activityTone, describeUploads, groupUploads } from "@/components/content-board/activity";

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

  it("lets an admin shortlist from Feedback, pointing out review points still open", () => {
    expect(nextStep({ ...base, status: "feedback", isAdmin: true, openReviewCount: 2 })).toMatchObject({
      kind: "move",
      to: "approved",
      note: expect.stringContaining("2 review points are still open"),
    });
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

  it("puts the idea with the latest review activity at the top of Feedback, reviewed or not", () => {
    const ideas = [
      { id: "reviewed-yesterday", status: "feedback" as const, created_at: "2026-09-01T00:00:00Z", latest_activity: { kind: "reviewed" as const, at: "2026-10-05T10:00:00Z", by: "Aditi" } },
      { id: "commented-now", status: "feedback" as const, created_at: "2026-09-02T00:00:00Z", latest_activity: { kind: "comment" as const, at: "2026-10-06T09:00:00Z", by: "Akhil" } },
      { id: "quiet", status: "feedback" as const, created_at: "2026-09-03T00:00:00Z", first_feedback_at: "2026-09-04T00:00:00Z", latest_activity: null },
    ];
    expect(sortColumnIdeas("feedback", ideas).map((idea) => idea.id)).toEqual(["commented-now", "reviewed-yesterday", "quiet"]);
  });

  it("finds an idea's latest review activity and says what it was", () => {
    const activity = latestActivity({
      reviewedAt: "2026-10-05T10:00:00Z",
      reviewerName: "Aditi",
      points: [{ createdAt: "2026-10-04T10:00:00Z", resolvedAt: "2026-10-06T08:00:00Z", authorName: "Akhil" }],
      uploads: [{ createdAt: "2026-10-03T10:00:00Z", uploaderName: "Mridul" }],
    });
    expect(activity).toEqual({ kind: "resolved", at: "2026-10-06T08:00:00Z", by: null });
    expect(describeActivity(activity!)).toBe("Comment marked done");
    expect(describeActivity({ kind: "upload", at: "x", by: "Mridul" })).toBe("New upload by Mridul");
    expect(describeActivity({ kind: "reviewed", at: "x", by: "Aditi" })).toBe("Reviewed by Aditi");
    expect(latestActivity({})).toBeNull();
  });

  it("puts the most recent card first in every other column, a move into it counting as activity", () => {
    const ideas = [
      { id: "posted-long-ago", status: "posted" as const, created_at: "2026-10-02T00:00:00Z", latest_activity: { kind: "moved" as const, at: "2026-09-10T00:00:00Z", by: "Akhil", to: "posted" as const } },
      { id: "just-posted", status: "posted" as const, created_at: "2026-09-02T00:00:00Z", latest_activity: { kind: "moved" as const, at: "2026-10-06T00:00:00Z", by: "Aditi", to: "posted" as const } },
    ];
    expect(sortColumnIdeas("posted", ideas).map((idea) => idea.id)).toEqual(["just-posted", "posted-long-ago"]);
    expect(describeActivity(ideas[1].latest_activity)).toBe("Moved to Posted by Aditi");
  });

  it("counts a move into the column as the latest activity when it is the newest thing", () => {
    expect(
      latestActivity({ movedAt: "2026-10-06T12:00:00Z", moverName: "Aditi", movedTo: "approved", reviewedAt: "2026-10-06T11:00:00Z" }),
    ).toEqual({ kind: "moved", at: "2026-10-06T12:00:00Z", by: "Aditi", to: "approved" });
    expect(columnOrderNote("idea")).toBe("Oldest idea first");
    expect(columnOrderNote("approved")).toBe("Most recent activity first");
  });
});

describe("the idea panel's uploads and activity", () => {
  const file = (id: string, uploaderName: string, createdAt: string, kind: "image" | "pdf" | "link" = "image") => ({
    id,
    kind,
    fileName: `${id}.png`,
    url: `https://x/${id}`,
    embedUrl: null,
    thumbUrl: null,
    createdAt,
    uploaderName,
    uploadedVia: null,
  });

  it("groups uploads by who added them and when, in the order they happened", () => {
    const groups = groupUploads([
      file("a", "Ankitha", "2026-10-01T04:53:00Z"),
      file("b", "Ankitha", "2026-10-01T04:54:00Z"),
      file("c", "Aditi", "2026-10-05T20:24:00Z", "pdf"),
      file("d", "Aditi", "2026-10-06T09:00:00Z"),
    ]);
    expect(groups.map((group) => [group.uploaderName, group.items.map((item) => item.index)])).toEqual([
      ["Ankitha", [0, 1]],
      ["Aditi", [2]],
      ["Aditi", [3]],
    ]);
    expect(describeUploads(groups[0].items)).toBe("2 images");
    expect(describeUploads(groups[1].items)).toBe("1 PDF");
  });

  it("highlights activity red while reviewed work waits in Feedback and green once shortlisted", () => {
    expect(activityTone("feedback", 2)).toBe("waiting");
    expect(activityTone("feedback", 0)).toBeNull();
    expect(activityTone("idea", 0)).toBeNull();
    expect(activityTone("approved", 1)).toBe("shortlisted");
    expect(activityTone("posted", 0)).toBe("shortlisted");
  });
});

describe("a new idea needs only one thing filled in", () => {
  it("takes the card's title from whatever was filled in", () => {
    expect(deriveIdeaTitle({ title: "  Founder Bingo " })).toBe("Founder Bingo");
    expect(deriveIdeaTitle({ description: "\n  Talk about agent pricing\nmore notes" })).toBe("Talk about agent pricing");
    expect(deriveIdeaTitle({ caption: "If you're a founder, read this." })).toBe("If you're a founder, read this.");
    expect(deriveIdeaTitle({ referenceLinks: ["https://www.linkedin.com/posts/abc"] })).toBe("Reference: linkedin.com/posts/abc");
    expect(deriveIdeaTitle({ fileName: "dots-carousel.pdf" })).toBe("dots-carousel");
    expect(deriveIdeaTitle({ description: "x".repeat(120) })).toHaveLength(80);
    expect(deriveIdeaTitle({ title: " ", description: "", referenceLinks: [] })).toBeNull();
  });

  it("saves an idea with no platform picked as Any, and shows Any ideas under every platform", () => {
    expect(platformsSchema.parse([])).toEqual(["any"]);
    expect(platformsSchema.parse(["linkedin", "linkedin"])).toEqual(["linkedin"]);
    expect(matchesPlatform({ platform: "any", platforms: ["any"] }, "instagram")).toBe(true);
    expect(matchesPlatform({ platform: "linkedin", platforms: ["linkedin"] }, "instagram")).toBe(false);
    expect(matchesPlatform({ platform: "linkedin", platforms: ["linkedin"] }, "")).toBe(true);
  });
});
