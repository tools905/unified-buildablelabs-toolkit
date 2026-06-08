import { describe, expect, it } from "vitest";
import { projectSchema } from "@/lib/validation/project-schema";
import { reviewSchema } from "@/lib/validation/review-schema";

describe("validation", () => {
  it("rejects projects with fewer than 3 members", () => {
    expect(() =>
      projectSchema.parse({
        name: "Demo",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-15"),
        cadence: "weekly",
        reviewDueHours: 48,
        memberIds: ["00000000-0000-0000-0000-000000000001"],
      }),
    ).toThrow();
  });

  it("rejects end date before start date", () => {
    expect(() =>
      projectSchema.parse({
        name: "Demo",
        startDate: new Date("2026-01-15"),
        endDate: new Date("2026-01-01"),
        cadence: "weekly",
        reviewDueHours: 48,
        memberIds: [
          "00000000-0000-0000-0000-000000000001",
          "00000000-0000-0000-0000-000000000002",
          "00000000-0000-0000-0000-000000000003",
        ],
      }),
    ).toThrow();
  });

  it("validates review ownership payload shape", () => {
    const parsed = reviewSchema.parse({
      strengths: "Very thoughtful collaborator",
      improvements: "Could document decisions more clearly",
      communicationRating: 4,
      reliabilityRating: 5,
      ownershipRating: 4,
      specificExample: "Delivered the API changes with careful review notes.",
    });
    expect(parsed.communicationRating).toBe(4);
  });
});
