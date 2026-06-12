import "server-only";

import { endOfWeek, startOfWeek, subDays, subWeeks } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit-service";
import { calculateLinkedInMemberStats, summarizeLinkedInStats } from "./analytics";
import { classifyLinkedInActivity, getLinkedInConnector, type FetchedLinkedInActivity } from "./connectors";
import { scoreLinkedInPost } from "./scoring";
import type { LinkedInConnectorSource, LinkedInTrackedMember } from "./types";

export async function getLinkedInDashboardData(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  options?: { profileId?: string; memberOnly?: boolean; includeReports?: boolean },
) {
  let memberQuery = supabase
    .from("linkedin_tracked_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (options?.memberOnly && options.profileId) memberQuery = memberQuery.eq("profile_id", options.profileId);
  const [{ data: members, error: memberError }, { data: windows }, { data: settings }] = await Promise.all([
    memberQuery,
    supabase.from("linkedin_analysis_windows").select("id, name, start_date, end_date").eq("workspace_id", workspaceId).order("start_date", { ascending: false }).limit(10),
    supabase.from("linkedin_settings").select("default_monthly_post_target, default_volume_weight, default_quality_weight, connector_preference, weekly_reports_enabled, member_insights_enabled").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  const activeWindow = windows?.[0] ?? {
    name: "Last 30 days",
    start_date: subDays(new Date(), 30).toISOString(),
    end_date: new Date().toISOString(),
  };
  const memberIds = (members ?? []).map((member) => member.id);
  const [postResult, reportResult] = await Promise.all([
    memberIds.length
      ? supabase
        .from("linkedin_posts")
        .select("id, tracked_member_id, post_url, post_text, posted_at, linkedin_post_scores(total_score, archetype, ai_summary, strengths, weaknesses, improvement_suggestions)")
        .in("tracked_member_id", memberIds)
        .gte("posted_at", activeWindow.start_date)
        .lte("posted_at", activeWindow.end_date)
        .order("posted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    options?.includeReports
      ? supabase.from("linkedin_weekly_reports").select("id, start_date, end_date, report_summary, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data: posts, error: postError } = postResult;
  if (postError) throw postError;
  const typedMembers = (members ?? []) as LinkedInTrackedMember[];
  const stats = typedMembers.map((member) =>
    calculateLinkedInMemberStats({
      member,
      posts: (posts ?? []).filter((post) => post.tracked_member_id === member.id),
      startDate: new Date(activeWindow.start_date),
      endDate: new Date(activeWindow.end_date),
    }),
  );
  const memberNames = new Map(typedMembers.map((member) => [member.id, member.name]));
  const feed = (posts ?? []).map((post) => {
    const score = Array.isArray(post.linkedin_post_scores) ? post.linkedin_post_scores[0] : post.linkedin_post_scores;
    return {
      id: post.id,
      memberId: post.tracked_member_id,
      member: memberNames.get(post.tracked_member_id) ?? "Unknown member",
      text: post.post_text,
      url: post.post_url as string | null,
      postedAt: post.posted_at,
      score: score?.total_score == null ? null : Number(score.total_score),
      archetype: score?.archetype ?? "unscored",
      summary: score?.ai_summary ?? null,
      strengths: (score?.strengths ?? []) as string[],
      weaknesses: (score?.weaknesses ?? []) as string[],
      suggestions: (score?.improvement_suggestions ?? []) as string[],
    };
  });
  return { stats, posts: feed, reports: reportResult.data ?? [], windows: windows ?? [], window: activeWindow, settings, summary: summarizeLinkedInStats(stats) };
}

export async function createLinkedInTrackedMember(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    actorId: string;
    profileId?: string | null;
    name: string;
    email?: string | null;
    memberRole: string;
    linkedinProfileUrl: string;
    monthlyPostTarget: number;
    volumeWeight: number;
    qualityWeight: number;
    connectorPreference: string;
  },
) {
  const { data, error } = await supabase.from("linkedin_tracked_members").insert({
    workspace_id: input.workspaceId,
    profile_id: input.profileId || null,
    name: input.name,
    email: input.email || null,
    member_role: input.memberRole,
    linkedin_profile_url: input.linkedinProfileUrl,
    monthly_post_target: input.monthlyPostTarget,
    volume_weight: input.volumeWeight,
    quality_weight: input.qualityWeight,
    connector_preference: input.connectorPreference,
    created_by: input.actorId,
  }).select("*").single();
  if (error) throw error;
  await writeAuditLog(supabase, { workspaceId: input.workspaceId, actorId: input.actorId, action: "linkedin.member_created", entityType: "linkedin_tracked_member", entityId: data.id });
  return data;
}

export async function updateLinkedInTrackedMember(supabase: SupabaseClient<any>, workspaceId: string, memberId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from("linkedin_tracked_members").update(updates).eq("workspace_id", workspaceId).eq("id", memberId).select("*").single();
  if (error) throw error;
  return data;
}

export async function createLinkedInAnalysisWindow(supabase: SupabaseClient<any>, input: { workspaceId: string; actorId: string; name: string; startDate: Date; endDate: Date }) {
  const { data, error } = await supabase.from("linkedin_analysis_windows").insert({ workspace_id: input.workspaceId, created_by: input.actorId, name: input.name, start_date: input.startDate.toISOString(), end_date: input.endDate.toISOString() }).select("*").single();
  if (error) throw error;
  return data;
}

export async function upsertLinkedInSettings(supabase: SupabaseClient<any>, input: { workspaceId: string; monthlyPostTarget: number; volumeWeight: number; qualityWeight: number; connectorPreference: string; weeklyReportsEnabled: boolean; memberInsightsEnabled: boolean }) {
  const { data, error } = await supabase.from("linkedin_settings").upsert({
    workspace_id: input.workspaceId,
    default_monthly_post_target: input.monthlyPostTarget,
    default_volume_weight: input.volumeWeight,
    default_quality_weight: input.qualityWeight,
    connector_preference: input.connectorPreference,
    weekly_reports_enabled: input.weeklyReportsEnabled,
    member_insights_enabled: input.memberInsightsEnabled,
  }, { onConflict: "workspace_id" }).select("*").single();
  if (error) throw error;
  return data;
}

async function persistActivities(supabase: SupabaseClient<any>, trackedMemberId: string, activities: FetchedLinkedInActivity[]) {
  let originalPostsStored = 0;
  let excludedActivities = 0;
  for (const activity of activities) {
    const activityType = classifyLinkedInActivity(activity);
    const { data: stored, error } = await supabase.from("linkedin_activities").upsert({
      tracked_member_id: trackedMemberId,
      external_id: activity.externalId,
      linkedin_url: activity.url,
      activity_type: activityType,
      text_content: activity.text,
      posted_at: activity.postedAt,
      raw_payload: activity.rawPayload,
      exclusion_reason: activityType === "original_post" ? null : `Excluded ${activityType} from original post count.`,
    }, { onConflict: "tracked_member_id,external_id" }).select("id").single();
    if (error) throw error;
    if (activityType !== "original_post") {
      excludedActivities += 1;
      continue;
    }
    const { error: postError } = await supabase.from("linkedin_posts").upsert({
      tracked_member_id: trackedMemberId,
      activity_id: stored.id,
      external_post_id: activity.externalId,
      post_url: activity.url,
      post_text: activity.text ?? "",
      posted_at: activity.postedAt,
      raw_payload: activity.rawPayload,
    }, { onConflict: "tracked_member_id,external_post_id", ignoreDuplicates: true });
    if (postError) throw postError;
    originalPostsStored += 1;
  }
  return { originalPostsStored, excludedActivities };
}

export async function syncLinkedInMembers(options?: { workspaceId?: string; memberId?: string }) {
  const supabase = createAdminClient();
  let query = supabase.from("linkedin_tracked_members").select("*").eq("is_active", true).neq("tracking_status", "paused");
  if (options?.workspaceId) query = query.eq("workspace_id", options.workspaceId);
  if (options?.memberId) query = query.eq("id", options.memberId);
  const { data: members, error } = await query;
  if (error) throw error;
  const totals = { membersProcessed: members?.length ?? 0, activitiesFetched: 0, originalPostsStored: 0, excludedActivities: 0, failed: 0 };
  for (const member of (members ?? []) as LinkedInTrackedMember[]) {
    const to = new Date();
    const from = member.last_sync_at ? new Date(member.last_sync_at) : subDays(to, 30);
    try {
      const activities = await getLinkedInConnector(member.connector_preference as LinkedInConnectorSource).fetchActivities({ trackedMemberId: member.id, linkedinProfileUrl: member.linkedin_profile_url, from, to });
      const result = await persistActivities(supabase, member.id, activities);
      totals.activitiesFetched += activities.length;
      totals.originalPostsStored += result.originalPostsStored;
      totals.excludedActivities += result.excludedActivities;
      await supabase.from("linkedin_tracked_members").update({ last_sync_at: to.toISOString(), last_sync_error: null, tracking_status: "active" }).eq("id", member.id);
      await supabase.from("linkedin_sync_logs").insert({ workspace_id: member.workspace_id, tracked_member_id: member.id, job_type: "sync_posts", status: "success", message: `Fetched ${activities.length} activities.`, metadata: result });
    } catch (syncError) {
      totals.failed += 1;
      const message = syncError instanceof Error ? syncError.message : "Unknown sync error.";
      await supabase.from("linkedin_tracked_members").update({ last_sync_error: message, tracking_status: "fetch_failed" }).eq("id", member.id);
      await supabase.from("linkedin_sync_logs").insert({ workspace_id: member.workspace_id, tracked_member_id: member.id, job_type: "sync_posts", status: "failed", message });
    }
  }
  return totals;
}

export async function scoreUnscoredLinkedInPosts(options?: { workspaceId?: string }) {
  const supabase = createAdminClient();
  let query = supabase.from("linkedin_posts").select("id, post_text, tracked_member_id, linkedin_tracked_members!inner(workspace_id, member_role), linkedin_post_scores(id)").order("posted_at", { ascending: true }).limit(100);
  if (options?.workspaceId) query = query.eq("linkedin_tracked_members.workspace_id", options.workspaceId);
  const { data: posts, error } = await query;
  if (error) throw error;
  let postsScored = 0;
  let failed = 0;
  for (const post of posts ?? []) {
    const existing = Array.isArray(post.linkedin_post_scores) ? post.linkedin_post_scores[0] : post.linkedin_post_scores;
    if (existing) continue;
    const member = Array.isArray(post.linkedin_tracked_members) ? post.linkedin_tracked_members[0] : post.linkedin_tracked_members;
    try {
      const result = await scoreLinkedInPost({ postText: post.post_text, memberRole: member?.member_role ?? null });
      const { error: insertError } = await supabase.from("linkedin_post_scores").insert({ post_id: post.id, ...result.score, raw_ai_response: result.score, provider: result.provider, model_name: result.model });
      if (insertError) throw insertError;
      postsScored += 1;
    } catch {
      failed += 1;
    }
  }
  return { postsScored, failed };
}

export async function generateLinkedInWeeklyReports(options?: { workspaceId?: string }) {
  const supabase = createAdminClient();
  let query = supabase.from("workspaces").select("id");
  if (options?.workspaceId) query = query.eq("id", options.workspaceId);
  const { data: workspaces, error } = await query;
  if (error) throw error;
  const previousWeek = subWeeks(new Date(), 1);
  const startDate = startOfWeek(previousWeek, { weekStartsOn: 1 });
  const endDate = endOfWeek(previousWeek, { weekStartsOn: 1 });
  const reportIds: string[] = [];
  for (const workspace of workspaces ?? []) {
    const data = await getLinkedInDashboardData(supabase, workspace.id);
    const summary = summarizeLinkedInStats(data.stats);
    const reportSummary = `${summary.totalPosts} original posts with an average quality score of ${summary.averageQuality ?? "N/A"}. Most active: ${summary.mostActiveMember ?? "N/A"}. Focus: ${summary.recommendedFocus}`;
    const { data: report, error: reportError } = await supabase.from("linkedin_weekly_reports").upsert({ workspace_id: workspace.id, start_date: startDate.toISOString(), end_date: endDate.toISOString(), report_json: { summary, members: data.stats }, report_summary: reportSummary }, { onConflict: "workspace_id,start_date,end_date" }).select("id").single();
    if (reportError) throw reportError;
    reportIds.push(report.id);
  }
  return { reportIds };
}
