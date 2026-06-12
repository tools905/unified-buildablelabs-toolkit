import { differenceInCalendarDays } from "date-fns";
import type { LinkedInMemberStats, LinkedInPostScore, LinkedInTrackedMember } from "./types";

type ScoredPost = { id: string; posted_at: string; linkedin_post_scores?: LinkedInPostScore | LinkedInPostScore[] | null };

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function rounded(value: number | null) {
  return value == null || Number.isNaN(value) ? null : Math.round(value * 10) / 10;
}

export function calculateLinkedInMemberStats(input: {
  member: LinkedInTrackedMember;
  posts: ScoredPost[];
  startDate: Date;
  endDate: Date;
}): LinkedInMemberStats {
  const scored = input.posts.map((post) => ({ ...post, score: one(post.linkedin_post_scores) })).filter((post) => post.score);
  const days = Math.max(1, differenceInCalendarDays(input.endDate, input.startDate) + 1);
  const periodTarget = input.member.monthly_post_target * (days / 30);
  const volumeScore = Math.min(input.posts.length / periodTarget, 1) * 100;
  const averageQuality = scored.length
    ? scored.reduce((sum, post) => sum + Number(post.score?.total_score ?? 0), 0) / scored.length
    : null;
  const finalScore = averageQuality == null
    ? null
    : volumeScore * Number(input.member.volume_weight) + averageQuality * Number(input.member.quality_weight);
  const strengths = new Map<string, number>();
  const weaknesses = new Map<string, number>();
  const archetypes: Record<string, number> = {};
  for (const post of scored) {
    if (!post.score) continue;
    archetypes[post.score.archetype] = (archetypes[post.score.archetype] ?? 0) + 1;
    for (const item of post.score.strengths ?? []) strengths.set(item, (strengths.get(item) ?? 0) + 1);
    for (const item of post.score.weaknesses ?? []) weaknesses.set(item, (weaknesses.get(item) ?? 0) + 1);
  }
  const top = (items: Map<string, number>) => [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label);
  const midpoint = input.startDate.getTime() + (input.endDate.getTime() - input.startDate.getTime()) / 2;
  const first = scored.filter((post) => new Date(post.posted_at).getTime() <= midpoint);
  const second = scored.filter((post) => new Date(post.posted_at).getTime() > midpoint);
  const average = (items: typeof scored) => items.length ? items.reduce((sum, post) => sum + Number(post.score?.total_score ?? 0), 0) / items.length : 0;
  const trend = scored.length < 4 ? "insufficient_data" : average(second) >= average(first) + 5 ? "improving" : average(second) <= average(first) - 5 ? "declining" : "stable";
  return {
    trackedMemberId: input.member.id,
    name: input.member.name,
    role: input.member.member_role,
    linkedinProfileUrl: input.member.linkedin_profile_url,
    trackingStatus: input.member.tracking_status,
    lastSyncAt: input.member.last_sync_at,
    postCount: input.posts.length,
    periodTarget: rounded(periodTarget) ?? 0,
    volumeScore: rounded(volumeScore) ?? 0,
    volumeWeight: Number(input.member.volume_weight),
    qualityWeight: Number(input.member.quality_weight),
    averageQualityScore: rounded(averageQuality),
    finalScore: rounded(finalScore),
    trend,
    topStrengths: top(strengths),
    improvementFocus: top(weaknesses),
    archetypeDistribution: archetypes,
  };
}

export function calculateLinkedInLeaderboards(stats: LinkedInMemberStats[]) {
  const by = (key: "finalScore" | "postCount" | "averageQualityScore") => [...stats].sort((a, b) => Number(b[key] ?? -1) - Number(a[key] ?? -1));
  return { finalScore: by("finalScore"), volume: by("postCount"), quality: by("averageQualityScore") };
}

export function summarizeLinkedInStats(stats: LinkedInMemberStats[]) {
  const totalPosts = stats.reduce((sum, member) => sum + member.postCount, 0);
  const scored = stats.filter((member) => member.averageQualityScore != null);
  return {
    totalPosts,
    averageQuality: scored.length ? rounded(scored.reduce((sum, member) => sum + Number(member.averageQualityScore), 0) / scored.length) : null,
    mostActiveMember: [...stats].sort((a, b) => b.postCount - a.postCount)[0]?.name ?? null,
    highestQualityMember: [...stats].sort((a, b) => Number(b.averageQualityScore ?? -1) - Number(a.averageQualityScore ?? -1))[0]?.name ?? null,
    recommendedFocus: stats.flatMap((member) => member.improvementFocus)[0] ?? "Add more concrete examples to posts.",
  };
}
