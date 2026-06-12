import { describe, expect, it } from "vitest";
import { calculateLinkedInMemberStats } from "@/modules/linkedin-assessor/analytics";
import { createDeterministicLinkedInScore } from "@/modules/linkedin-assessor/fallback-scoring";
import { normalizeLinkedInProfileUrl } from "@/modules/linkedin-assessor/validation";

describe("LinkedIn Assessor", () => {
  it("normalizes LinkedIn profile URLs", () => {
    expect(normalizeLinkedInProfileUrl("linkedin.com/in/nitai-test?trk=profile")).toBe("https://www.linkedin.com/in/nitai-test/");
    expect(() => normalizeLinkedInProfileUrl("example.com/in/nitai")).toThrow();
  });

  it("creates a bounded deterministic fallback score", () => {
    const score = createDeterministicLinkedInScore({ postText: "I learned from one specific customer example because the tradeoff was measurable.", memberRole: "founder" });
    expect(score.total_score).toBeGreaterThanOrEqual(0);
    expect(score.total_score).toBeLessThanOrEqual(100);
    expect(score.strengths.length).toBeGreaterThan(0);
  });

  it("combines volume and quality using member weights", () => {
    const stats = calculateLinkedInMemberStats({
      member: {
        id: "member-1", workspace_id: "workspace-1", profile_id: null, name: "Test Member", email: null,
        member_role: "developer", linkedin_profile_url: "https://www.linkedin.com/in/test/", monthly_post_target: 2,
        volume_weight: 0.5, quality_weight: 0.5, tracking_status: "active", connector_preference: "mock",
        last_sync_at: null, last_sync_error: null, is_active: true, created_at: new Date().toISOString(),
      },
      posts: [{
        id: "post-1", posted_at: "2026-06-05T00:00:00.000Z", linkedin_post_scores: {
          total_score: 80, hook_score: 8, clarity_score: 8, specificity_score: 8, originality_score: 8,
          reader_value_score: 12, depth_score: 8, relevance_score: 8, storytelling_score: 6, authority_score: 6,
          engagement_score: 4, writing_quality_score: 4, archetype: "educational", ai_summary: "Useful",
          strengths: ["Clear"], weaknesses: ["Needs proof"], improvement_suggestions: ["Add evidence"],
        },
      }],
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    });
    expect(stats.volumeScore).toBe(50);
    expect(stats.averageQualityScore).toBe(80);
    expect(stats.finalScore).toBe(65);
  });
});
