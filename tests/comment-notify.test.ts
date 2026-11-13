import { describe, expect, it } from "vitest";
import { commentNotice, commentRecipients, emailAllowedSince } from "@/lib/utils/comment-notify";

describe("who hears about a comment", () => {
  it("is the creator, draft uploaders and assignees, once each, never the commenter", () => {
    expect(commentRecipients({ createdBy: "a", uploaders: ["b", "a", null, "c"], assignees: ["d", "b", "me"], actorId: "me" })).toEqual(["a", "b", "c", "d"]);
    expect(commentRecipients({ createdBy: "me", uploaders: ["me"], assignees: [], actorId: "me" })).toEqual([]);
  });
});

describe("how often they're emailed", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  it("at most once an hour in Ideas and Feedback", () => {
    expect(emailAllowedSince({ status: "feedback", status_changed_at: "2026-11-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }, now)).toBe("2026-11-13T09:00:00.000Z");
    expect(emailAllowedSince({ status: "idea", status_changed_at: null, created_at: "2026-10-01T00:00:00Z" }, now)).toBe("2026-11-13T09:00:00.000Z");
  });
  it("once per stay in the other columns", () => {
    expect(emailAllowedSince({ status: "in_progress", status_changed_at: "2026-11-10T05:00:00Z", created_at: "2026-10-01T00:00:00Z" }, now)).toBe("2026-11-10T05:00:00Z");
    expect(emailAllowedSince({ status: "posted", status_changed_at: null, created_at: "2026-10-01T00:00:00Z" }, now)).toBe("2026-10-01T00:00:00Z");
  });
});

describe("the notice", () => {
  it("names who and which post, never the comment", () => {
    const notice = commentNotice("point", "Aditi Swarasya", "Founder myths");
    expect(notice.subject).toBe("Aditi Swarasya commented on your post “Founder myths”");
    expect(notice.bellMessage).toBe("Aditi Swarasya added a review point on “Founder myths”. Open the post to see it.");
    expect(commentNotice("pencil", "Aditi", "X").line).toBe("Aditi left a Pencil review on your post “X”.");
  });
});
