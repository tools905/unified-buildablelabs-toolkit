import { describe, expect, it } from "vitest";
import { calculateLinkedInMemberStats } from "@/modules/linkedin-assessor/analytics";
import { createDeterministicLinkedInScore } from "@/modules/linkedin-assessor/fallback-scoring";
import { classifyLinkedInActivity, getLinkedInConnector } from "@/modules/linkedin-assessor/connectors";
import { linkedinManualPostSchema, linkedinSettingsSchema, normalizeLinkedInProfileUrl } from "@/modules/linkedin-assessor/validation";

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

  it("classifies collaborative posts as assessable activities", () => {
    expect(classifyLinkedInActivity({ externalId: "1", url: null, text: "Shared work", postedAt: null, rawPayload: { type: "collaborative_post" }, source: "mock" })).toBe("collaborative_post");
  });

  it("fails visibly when a production connector is not configured", async () => {
    await expect(getLinkedInConnector("fallback").fetchActivities({ trackedMemberId: "member", linkedinProfileUrl: "https://www.linkedin.com/in/test/", from: new Date(), to: new Date() })).rejects.toThrow("not configured");
  });

  it("validates manual submissions and rolling window bounds", () => {
    const valid = linkedinManualPostSchema.parse({ trackedMemberId: "11111111-1111-4111-8111-111111111111", postUrl: "https://www.linkedin.com/posts/test", postText: "A complete original post with enough text to assess properly.", postedAt: "2026-06-10", postKind: "original_post", collaborationContext: "" });
    expect(valid.postKind).toBe("original_post");
    expect(() => linkedinManualPostSchema.parse({ trackedMemberId: "11111111-1111-4111-8111-111111111111", postUrl: "https://example.com/post", postText: "A complete original post with enough text to assess properly.", postedAt: "2026-06-10", postKind: "original_post" })).toThrow();
    expect(() => linkedinSettingsSchema.parse({ monthlyPostTarget: 12, volumeWeight: 0.45, qualityWeight: 0.55, connectorPreference: "mock", weeklyReportsEnabled: true, memberInsightsEnabled: true, memberSubmissionsEnabled: true, analysisWindowDays: 3 })).toThrow();
    expect(() => linkedinSettingsSchema.parse({ monthlyPostTarget: 12, volumeWeight: 0.45, qualityWeight: 0.55, connectorPreference: "linkedin_oauth", weeklyReportsEnabled: true, memberInsightsEnabled: true, memberSubmissionsEnabled: true, analysisWindowDays: 30 })).toThrow();
  });

  it("uses score overrides and excludes marked posts from quality", () => {
    const baseScore = createDeterministicLinkedInScore({ postText: "I learned from a specific example because the outcome was measurable.", memberRole: "founder" });
    const member = { id: "member-1", workspace_id: "workspace-1", profile_id: null, name: "Test Member", email: null, member_role: "founder" as const, linkedin_profile_url: "https://www.linkedin.com/in/test/", monthly_post_target: 2, volume_weight: 0.5, quality_weight: 0.5, tracking_status: "active", connector_preference: "mock" as const, last_sync_at: null, last_sync_error: null, is_active: true, created_at: new Date().toISOString() };
    const overridden = calculateLinkedInMemberStats({ member, posts: [{ id: "post-1", posted_at: "2026-06-05T00:00:00.000Z", linkedin_post_scores: baseScore, linkedin_score_overrides: [{ total_score: 90, archetype: "case_study", exclude_from_quality_average: false, created_at: "2026-06-06T00:00:00.000Z" }] }], startDate: new Date("2026-06-01"), endDate: new Date("2026-06-30") });
    expect(overridden.averageQualityScore).toBe(90);
    expect(overridden.bestPostId).toBe("post-1");
    const excluded = calculateLinkedInMemberStats({ member, posts: [{ id: "post-1", posted_at: "2026-06-05T00:00:00.000Z", linkedin_post_scores: baseScore, linkedin_score_overrides: [{ total_score: null, archetype: null, exclude_from_quality_average: true, created_at: "2026-06-06T00:00:00.000Z" }] }], startDate: new Date("2026-06-01"), endDate: new Date("2026-06-30") });
    expect(excluded.averageQualityScore).toBeNull();
    expect(excluded.finalScore).toBeNull();
  });
});
