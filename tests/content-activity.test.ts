import { describe, expect, it } from "vitest";
import { buildActivity, formatWhen, hasChangesSinceReview } from "@/components/content-board/activity";
import type { IdeaPanelData } from "@/components/content-board/types";

function data(overrides: Partial<IdeaPanelData> = {}): IdeaPanelData {
  return {
    workspaceId: "w",
    currentUserId: "u",
    currentUserName: "Me",
    isAdmin: false,
    history: {
      createdAt: "2026-09-01T09:00:00Z",
      creatorName: "Mridul",
      postedAt: null,
      reviewedAt: null,
      reviewerName: null,
    },
    attachments: [],
    points: [],
    ...overrides,
  };
}

describe("formatWhen", () => {
  it("shows date and a lower-case 12 hour time", () => {
    expect(formatWhen(new Date(2026, 8, 30, 17, 12))).toBe("30 Sep 2026, 5:12 pm");
    expect(formatWhen(new Date(2026, 0, 5, 9, 5))).toBe("5 Jan 2026, 9:05 am");
  });
});

describe("buildActivity", () => {
  it("lists uploads, comments, completed comments, review and posting, newest first", () => {
    const events = buildActivity(
      data({
        history: {
          createdAt: "2026-09-01T09:00:00Z",
          creatorName: "Mridul",
          postedAt: "2026-09-05T09:00:00Z",
          reviewedAt: "2026-09-03T09:00:00Z",
          reviewerName: "Aditi",
        },
        attachments: [
          { id: "a1", kind: "pdf", fileName: "carousel.pdf", url: null, embedUrl: null, thumbUrl: null, createdAt: "2026-09-02T09:00:00Z", uploaderName: "Mridul" },
        ],
        points: [
          {
            id: "p1",
            body: "Make the title bigger",
            isResolved: true,
            createdAt: "2026-09-02T12:00:00Z",
            resolvedAt: "2026-09-04T09:00:00Z",
            authorId: "x",
            authorName: "Aditi",
          },
        ],
      }),
    );

    expect(events.map((event) => event.id)).toEqual(["posted", "done-p1", "reviewed", "comment-p1", "file-a1", "created"]);
    expect(events.find((event) => event.id === "file-a1")).toMatchObject({ label: "PDF uploaded by Mridul", detail: "carousel.pdf" });
    expect(events.find((event) => event.id === "reviewed")?.label).toBe("Marked as reviewed by Aditi");
  });

  it("only has the creation event for a brand new idea", () => {
    expect(buildActivity(data()).map((event) => event.id)).toEqual(["created"]);
  });
});

describe("hasChangesSinceReview", () => {
  const file = (createdAt: string) => ({ id: "a", kind: "image" as const, fileName: null, url: null, embedUrl: null, thumbUrl: null, createdAt, uploaderName: "M" });

  it("is false when nothing was reviewed", () => {
    expect(hasChangesSinceReview(data({ attachments: [file("2026-09-02T09:00:00Z")] }))).toBe(false);
  });

  it("is true only for files added after the review", () => {
    const history = { ...data().history, reviewedAt: "2026-09-03T09:00:00Z", reviewerName: "Aditi" };
    expect(hasChangesSinceReview(data({ history, attachments: [file("2026-09-02T09:00:00Z")] }))).toBe(false);
    expect(hasChangesSinceReview(data({ history, attachments: [file("2026-09-04T09:00:00Z")] }))).toBe(true);
  });
});
