export const linkedinMemberRoles = [
  "founder",
  "marketer",
  "developer",
  "designer",
  "intern",
  "content_creator",
  "other",
] as const;

export const linkedinConnectors = [
  "linkedin_oauth",
  "fallback",
  "third_party_api",
  "mock",
] as const;

export const linkedinArchetypes = [
  "lesson_learned",
  "build_in_public",
  "opinion_thought_leadership",
  "educational",
  "case_study",
  "personal_story",
  "failure_retrospective",
  "framework",
  "behind_the_scenes",
  "company_culture",
  "technical_breakdown",
  "career_reflection",
  "announcement",
  "other",
] as const;

export type LinkedInMemberRole = (typeof linkedinMemberRoles)[number];
export type LinkedInConnectorSource = (typeof linkedinConnectors)[number];
export type LinkedInArchetype = (typeof linkedinArchetypes)[number];
export type LinkedInActivityType = "original_post" | "collaborative_post" | "repost" | "comment" | "reaction" | "unknown";
export type LinkedInPostKind = "original_post" | "collaborative_post";
export type LinkedInIngestionSource = "connector" | "manual" | "browser_extension";

export type LinkedInTrackedMember = {
  id: string;
  workspace_id: string;
  profile_id: string | null;
  name: string;
  email: string | null;
  member_role: LinkedInMemberRole;
  linkedin_profile_url: string;
  monthly_post_target: number;
  volume_weight: number;
  quality_weight: number;
  tracking_status: string;
  connector_preference: LinkedInConnectorSource;
  last_sync_at: string | null;
  last_sync_error: string | null;
  is_active: boolean;
  created_at: string;
};

export type LinkedInPostScore = {
  total_score: number;
  hook_score: number;
  clarity_score: number;
  specificity_score: number;
  originality_score: number;
  reader_value_score: number;
  depth_score: number;
  relevance_score: number;
  storytelling_score: number;
  authority_score: number;
  engagement_score: number;
  writing_quality_score: number;
  archetype: LinkedInArchetype;
  ai_summary: string;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
};

export type LinkedInMemberStats = {
  trackedMemberId: string;
  name: string;
  role: string;
  linkedinProfileUrl: string;
  trackingStatus: string;
  lastSyncAt: string | null;
  postCount: number;
  periodTarget: number;
  volumeScore: number;
  volumeWeight: number;
  qualityWeight: number;
  averageQualityScore: number | null;
  finalScore: number | null;
  bestPostId: string | null;
  weakestPostId: string | null;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  topStrengths: string[];
  improvementFocus: string[];
  archetypeDistribution: Record<string, number>;
};
