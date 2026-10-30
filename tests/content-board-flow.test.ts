import { describe, expect, it } from "vitest";
import { canDiscard, canMoveIdea, canTeamMoveFrom, columnOrderNote, deriveIdeaTitle, describeActivity, latestActivity, nextStep, sortColumnIdeas } from "@/lib/utils/content-board";
import { platformsSchema } from "@/lib/validation/content-idea-schema";
import { matchesPlatform } from "@/components/content-board/types";
import { activityTone, describeUploads, groupUploads } from "@/components/content-board/activity";

describe("who can move an idea between columns", () => {
  it("lets admins move a card anywhere", () => {
    expect(canMoveIdea({ from: "idea", to: "posted", isAdmin: true })).toBe(true);
    expect(canMoveIdea({ from: "posted", to: "feedback", isAdmin: true })).toBe(true);
  });

  it("lets anyone on the team take an idea from Feedback through to Posted, and one step back", () => {
    const member = { isAdmin: false };
    expect(canMoveIdea({ from: "feedback", to: "approved", ...member })).toBe(true);
    expect(canMoveIdea({ from: "approved", to: "feedback", ...member })).toBe(true);
    expect(canTeamMoveFrom("feedback")).toBe(true);
    expect(canMoveIdea({ from: "approved", to: "in_progress", ...member })).toBe(true);
    expect(canMoveIdea({ from: "in_progress", to: "posted", ...member })).toBe(true);
    expect(canMoveIdea({ from: "in_progress", to: "approved", ...member })).toBe(true);
    expect(canMoveIdea({ from: "posted", to: "in_progress", ...member })).toBe(true);
    expect(canTeamMoveFrom("approved")).toBe(true);
    expect(canTeamMoveFrom("posted")).toBe(true);
  });

  it("lets a team member shortlist only once every review point is fixed (admins anyway)", () => {
    expect(canMoveIdea({ from: "feedback", to: "approved", isAdmin: false, openReviewCount: 1 })).toBe(false);
    expect(canMoveIdea({ from: "feedback", to: "approved", isAdmin: true, openReviewCount: 3 })).toBe(true);
  });

  it("follows what the admin chose for once the changes are made", () => {
    const member = { from: "feedback" as const, to: "approved" as const, isAdmin: false };
    // "They move it to Shortlisted": their own click, open points or not.
    expect(canMoveIdea({ ...member, openReviewCount: 3, afterChanges: "shortlist" })).toBe(true);
    // "Send it back to me": never by a team member.
    expect(canMoveIdea({ ...member, openReviewCount: 0, afterChanges: "review" })).toBe(false);
    expect(canMoveIdea({ ...member, isAdmin: true, afterChanges: "review" })).toBe(true);
    expect(nextStep({ status: "feedback", isAdmin: false, openReviewCount: 2, afterChanges: "review" })).toMatchObject({ kind: "changes_done" });
    expect(nextStep({ status: "feedback", isAdmin: false, openReviewCount: 2, afterChanges: "review", changesDoneByName: "Mridul" })).toMatchObject({
      kind: "wait",
      reason: expect.stringContaining("Mridul"),
    });
    expect(nextStep({ status: "feedback", isAdmin: false, openReviewCount: 2, afterChanges: "shortlist" })).toMatchObject({ kind: "move", to: "approved" });
  });

  it("keeps every other move with admins", () => {
    const member = { isAdmin: false };
    expect(canMoveIdea({ from: "idea", to: "feedback", ...member })).toBe(false);
    expect(canMoveIdea({ from: "idea", to: "approved", ...member })).toBe(false);
    expect(canMoveIdea({ from: "feedback", to: "in_progress", ...member })).toBe(false);
    expect(canMoveIdea({ from: "approved", to: "posted", ...member })).toBe(false);
    expect(canTeamMoveFrom("idea")).toBe(false);
  });

  it("treats a move to the same column as no move", () => {
    expect(canMoveIdea({ from: "idea", to: "idea", isAdmin: true })).toBe(false);
  });
});

describe("the next step shown on an idea", () => {
  const base = { isAdmin: false, openReviewCount: 0 };

  it("lets an admin shortlist from Feedback, pointing out review points still open", () => {
    expect(nextStep({ ...base, status: "feedback", isAdmin: true, openReviewCount: 2 })).toMatchObject({
      kind: "move",
      to: "approved",
      note: expect.stringContaining("2 review points are still open"),
    });
    expect(nextStep({ ...base, status: "feedback", isAdmin: true })).toEqual({ kind: "move", to: "approved", label: "Shortlist" });
  });

  it("lets a team member shortlist from Feedback once the review points are fixed", () => {
    expect(nextStep({ ...base, status: "feedback" })).toEqual({ kind: "move", to: "approved", label: "Shortlist" });
    expect(nextStep({ ...base, status: "feedback", openReviewCount: 1 })).toEqual({
      kind: "wait",
      reason: "1 review point is still open. Mark it as fixed to shortlist it.",
    });
  });

  it("lets anyone start a shortlisted idea and then mark it posted", () => {
    expect(nextStep({ ...base, status: "approved" })).toEqual({ kind: "move", to: "in_progress", label: "Start working" });
    expect(nextStep({ ...base, status: "in_progress" })).toEqual({ kind: "move", to: "posted", label: "Mark as posted" });
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

describe("the latest update on a card", () => {
  it("is the Pencil review, not the comment and reviewed mark that come with it", () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 17, minutes)).toISOString();
    const latest = latestActivity({
      uploads: [{ createdAt: at(0), uploaderName: "Mridul" }],
      markups: [{ createdAt: at(30), authorName: "Aditi" }],
      points: [{ createdAt: at(30), authorName: "Aditi" }],
      reviewedAt: at(31),
      reviewerName: "Aditi",
    });
    expect(latest).toMatchObject({ kind: "markup", by: "Aditi" });
    expect(describeActivity(latest!)).toBe("Pencil review by Aditi");
  });

  it("is a newer upload once the team has made changes after the review", () => {
    const latest = latestActivity({
      markups: [{ createdAt: "2026-10-10T17:30:00Z", authorName: "Aditi" }],
      uploads: [{ createdAt: "2026-10-10T19:00:00Z", uploaderName: "Mridul" }],
    });
    expect(latest).toMatchObject({ kind: "upload", by: "Mridul" });
  });
});

describe("discarding an idea", () => {
  it("is its own step from Ideas or Feedback, never a plain move or drag", () => {
    expect(canDiscard("idea")).toBe(true);
    expect(canDiscard("feedback")).toBe(true);
    expect(canDiscard("approved")).toBe(false);
    expect(canMoveIdea({ from: "idea", to: "discarded", isAdmin: true })).toBe(false);
    expect(canMoveIdea({ from: "feedback", to: "discarded", isAdmin: false })).toBe(false);
  });

  it("can be undone by an admin dragging it out; the team uses Restore", () => {
    expect(canMoveIdea({ from: "discarded", to: "idea", isAdmin: true })).toBe(true);
    expect(canMoveIdea({ from: "discarded", to: "feedback", isAdmin: false })).toBe(false);
    expect(canTeamMoveFrom("discarded")).toBe(false);
  });

  it("lists the most recently discarded first, and says so", () => {
    const card = (id: string, discardedAt: string) => ({
      id,
      status: "discarded" as const,
      created_at: "2026-10-01T00:00:00Z",
      latest_activity: null,
      first_feedback_at: null,
      discarded_at: discardedAt,
    });
    const sorted = sortColumnIdeas("discarded", [card("old", "2026-10-02T00:00:00Z"), card("new", "2026-10-20T00:00:00Z")]);
    expect(sorted.map((idea) => idea.id)).toEqual(["new", "old"]);
    expect(columnOrderNote("discarded")).toBe("Most recently discarded first");
  });

  it("shows on the card as discarded, by whom", () => {
    expect(describeActivity({ kind: "moved", at: "2026-10-20T00:00:00Z", by: "Aditi", to: "discarded" })).toBe("Discarded by Aditi");
  });
});
