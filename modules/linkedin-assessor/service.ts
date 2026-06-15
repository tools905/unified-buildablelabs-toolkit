import "server-only";

import { endOfWeek, startOfWeek, subDays, subWeeks } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit-service";
import { calculateLinkedInMemberStats, summarizeLinkedInStats } from "./analytics";
import { classifyLinkedInActivity, getLinkedInConnector, type FetchedLinkedInActivity } from "./connectors";
import { LINKEDIN_SCORING_VERSION, scoreLinkedInPost } from "./scoring";
import type { LinkedInConnectorSource, LinkedInPostKind, LinkedInTrackedMember } from "./types";

export async function getLinkedInDashboardData(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  options?: { profileId?: string; memberOnly?: boolean; includeReports?: boolean; includeLogs?: boolean; startDate?: Date; endDate?: Date },
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
    supabase.from("linkedin_settings").select("default_monthly_post_target, default_volume_weight, default_quality_weight, connector_preference, weekly_reports_enabled, member_insights_enabled, member_submissions_enabled, analysis_window_days").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  const endDate = options?.endDate ?? new Date();
  const analysisWindowDays = Number(settings?.analysis_window_days ?? 30);
  const startDate = options?.startDate ?? subDays(endDate, analysisWindowDays - 1);
  const activeWindow = {
    name: options?.startDate ? "Selected period" : `Last ${analysisWindowDays} days`,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
  };
  const memberIds = (members ?? []).map((member) => member.id);
  const [postResult, reportResult, logResult] = await Promise.all([
    memberIds.length
      ? supabase
        .from("linkedin_posts")
        .select("id, tracked_member_id, post_url, post_text, posted_at, post_kind, ingestion_source, collaboration_context, linkedin_post_scores(*), linkedin_score_overrides(total_score, archetype, admin_notes, exclude_from_quality_average, created_at)")
        .in("tracked_member_id", memberIds)
        .gte("posted_at", activeWindow.start_date)
        .lte("posted_at", activeWindow.end_date)
        .order("posted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    options?.includeReports
      ? supabase.from("linkedin_weekly_reports").select("id, start_date, end_date, report_summary, report_json, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
    options?.includeLogs
      ? supabase.from("linkedin_sync_logs").select("id, tracked_member_id, job_type, status, message, metadata, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50)
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
    const override = [...(post.linkedin_score_overrides ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const effectiveScore = override?.exclude_from_quality_average ? null : override?.total_score ?? score?.total_score ?? null;
    return {
      id: post.id,
      memberId: post.tracked_member_id,
      member: memberNames.get(post.tracked_member_id) ?? "Unknown member",
      text: post.post_text,
      url: post.post_url as string | null,
      postedAt: post.posted_at,
      score: effectiveScore == null ? null : Number(effectiveScore),
      originalScore: score?.total_score == null ? null : Number(score.total_score),
      archetype: override?.archetype ?? score?.archetype ?? "unscored",
      summary: score?.ai_summary ?? null,
      strengths: (score?.strengths ?? []) as string[],
      weaknesses: (score?.weaknesses ?? []) as string[],
      suggestions: (score?.improvement_suggestions ?? []) as string[],
      scoreBreakdown: score ? {
        hook: Number(score.hook_score), clarity: Number(score.clarity_score), specificity: Number(score.specificity_score),
        originality: Number(score.originality_score), readerValue: Number(score.reader_value_score), depth: Number(score.depth_score),
        relevance: Number(score.relevance_score), storytelling: Number(score.storytelling_score), authority: Number(score.authority_score),
        engagement: Number(score.engagement_score), writingQuality: Number(score.writing_quality_score),
      } : null,
      provider: score?.provider ?? null,
      model: score?.model_name ?? null,
      postKind: post.post_kind as LinkedInPostKind,
      ingestionSource: post.ingestion_source as string,
      collaborationContext: post.collaboration_context as string | null,
      override: override ?? null,
    };
  });
  return { members: typedMembers, stats, posts: feed, reports: reportResult.data ?? [], logs: logResult.data ?? [], windows: windows ?? [], window: activeWindow, settings, summary: summarizeLinkedInStats(stats) };
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

export async function createSelfLinkedInTrackedMember(input: {
  workspaceId: string;
  actorId: string;
  name: string;
  email?: string | null;
  memberRole: string;
  linkedinProfileUrl: string;
}) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("linkedin_tracked_members").select("id").eq("workspace_id", input.workspaceId).eq("profile_id", input.actorId).maybeSingle();
  if (existing) throw new Error("Your toolkit account already has a LinkedIn profile.");
  const { data: settings } = await supabase.from("linkedin_settings").select("default_monthly_post_target, default_volume_weight, default_quality_weight, connector_preference").eq("workspace_id", input.workspaceId).maybeSingle();
  return createLinkedInTrackedMember(supabase, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    profileId: input.actorId,
    name: input.name,
    email: input.email,
    memberRole: input.memberRole,
    linkedinProfileUrl: input.linkedinProfileUrl,
    monthlyPostTarget: Number(settings?.default_monthly_post_target ?? 12),
    volumeWeight: Number(settings?.default_volume_weight ?? 0.45),
    qualityWeight: Number(settings?.default_quality_weight ?? 0.55),
    connectorPreference: settings?.connector_preference ?? "mock",
  });
}

export async function updateLinkedInTrackedMember(supabase: SupabaseClient<any>, workspaceId: string, memberId: string, updates: Record<string, unknown>, actorId?: string) {
  const { data, error } = await supabase.from("linkedin_tracked_members").update(updates).eq("workspace_id", workspaceId).eq("id", memberId).select("*").single();
  if (error) throw error;
  if (actorId) await writeAuditLog(supabase, { workspaceId, actorId, action: "linkedin.member_updated", entityType: "linkedin_tracked_member", entityId: memberId, metadata: updates });
  return data;
}

export async function createLinkedInAnalysisWindow(supabase: SupabaseClient<any>, input: { workspaceId: string; actorId: string; name: string; startDate: Date; endDate: Date }) {
  const { data, error } = await supabase.from("linkedin_analysis_windows").insert({ workspace_id: input.workspaceId, created_by: input.actorId, name: input.name, start_date: input.startDate.toISOString(), end_date: input.endDate.toISOString() }).select("*").single();
  if (error) throw error;
  return data;
}

export async function upsertLinkedInSettings(supabase: SupabaseClient<any>, input: { workspaceId: string; monthlyPostTarget: number; volumeWeight: number; qualityWeight: number; connectorPreference: string; weeklyReportsEnabled: boolean; memberInsightsEnabled: boolean; memberSubmissionsEnabled: boolean; analysisWindowDays: number }) {
  const { data, error } = await supabase.from("linkedin_settings").upsert({
    workspace_id: input.workspaceId,
    default_monthly_post_target: input.monthlyPostTarget,
    default_volume_weight: input.volumeWeight,
    default_quality_weight: input.qualityWeight,
    connector_preference: input.connectorPreference,
    weekly_reports_enabled: input.weeklyReportsEnabled,
    member_insights_enabled: input.memberInsightsEnabled,
    member_submissions_enabled: input.memberSubmissionsEnabled,
    analysis_window_days: input.analysisWindowDays,
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
    if (activityType !== "original_post" && activityType !== "collaborative_post") {
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
      post_kind: activityType,
      ingestion_source: "connector",
    }, { onConflict: "tracked_member_id,external_post_id", ignoreDuplicates: true });
    if (postError) throw postError;
    originalPostsStored += 1;
  }
  return { originalPostsStored, excludedActivities };
}

export async function submitLinkedInPost(input: {
  workspaceId: string;
  actorId: string;
  trackedMemberId: string;
  postUrl: string;
  postText: string;
  postedAt: Date;
  postKind: LinkedInPostKind;
  collaborationContext?: string | null;
  ingestionSource?: "manual" | "browser_extension";
  admin: boolean;
}) {
  const supabase = createAdminClient();
  if (!input.admin) {
    const { data: settings } = await supabase.from("linkedin_settings").select("member_submissions_enabled").eq("workspace_id", input.workspaceId).maybeSingle();
    if (settings?.member_submissions_enabled === false) throw new Error("Member post submissions are disabled for this workspace.");
  }
  let memberQuery = supabase.from("linkedin_tracked_members").select("id, workspace_id, profile_id").eq("id", input.trackedMemberId).eq("workspace_id", input.workspaceId);
  if (!input.admin) memberQuery = memberQuery.eq("profile_id", input.actorId);
  const { data: member, error: memberError } = await memberQuery.maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new Error("You cannot submit a post for this profile.");

  const externalId = `submitted:${input.postUrl}`;
  const rawPayload = { submitted: true, type: input.postKind, collaborationContext: input.collaborationContext || null };
  const { data: existingPost } = await supabase.from("linkedin_posts").select("id").eq("tracked_member_id", member.id).eq("post_url", input.postUrl).maybeSingle();
  if (existingPost) {
    const { data: updated, error: updateError } = await supabase.from("linkedin_posts").update({
      post_text: input.postText,
      posted_at: input.postedAt.toISOString(),
      raw_payload: rawPayload,
      post_kind: input.postKind,
      ingestion_source: input.ingestionSource ?? "manual",
      submitted_by: input.actorId,
      collaboration_context: input.collaborationContext || null,
    }).eq("id", existingPost.id).select("id").single();
    if (updateError) throw updateError;
    await supabase.from("linkedin_post_scores").delete().eq("post_id", existingPost.id);
    return updated;
  }
  const { data: activity, error: activityError } = await supabase.from("linkedin_activities").upsert({
    tracked_member_id: member.id,
    external_id: externalId,
    linkedin_url: input.postUrl,
    activity_type: input.postKind,
    text_content: input.postText,
    posted_at: input.postedAt.toISOString(),
    raw_payload: rawPayload,
  }, { onConflict: "tracked_member_id,external_id" }).select("id").single();
  if (activityError) throw activityError;

  const { data: post, error: postError } = await supabase.from("linkedin_posts").upsert({
    tracked_member_id: member.id,
    activity_id: activity.id,
    external_post_id: externalId,
    post_url: input.postUrl,
    post_text: input.postText,
    posted_at: input.postedAt.toISOString(),
    raw_payload: rawPayload,
    post_kind: input.postKind,
    ingestion_source: input.ingestionSource ?? "manual",
    submitted_by: input.actorId,
    collaboration_context: input.collaborationContext || null,
  }, { onConflict: "tracked_member_id,external_post_id" }).select("id").single();
  if (postError) throw postError;
  return post;
}

export async function createLinkedInScoreOverride(supabase: SupabaseClient<any>, input: {
  workspaceId: string;
  actorId: string;
  postId: string;
  totalScore?: number | null;
  archetype?: string | null;
  adminNotes?: string | null;
  excludeFromQualityAverage: boolean;
}) {
  const { data: post } = await supabase.from("linkedin_posts").select("id, linkedin_tracked_members!inner(workspace_id)").eq("id", input.postId).eq("linkedin_tracked_members.workspace_id", input.workspaceId).maybeSingle();
  if (!post) throw new Error("Post not found.");
  const { data, error } = await supabase.from("linkedin_score_overrides").insert({
    post_id: input.postId,
    overridden_by: input.actorId,
    total_score: input.totalScore ?? null,
    archetype: input.archetype || null,
    admin_notes: input.adminNotes || null,
    exclude_from_quality_average: input.excludeFromQualityAverage,
  }).select("*").single();
  if (error) throw error;
  await writeAuditLog(supabase, { workspaceId: input.workspaceId, actorId: input.actorId, action: "linkedin.score_overridden", entityType: "linkedin_post", entityId: input.postId });
  return data;
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
  const workspaceResults = new Map<string, { scored: number; failed: number; providers: Record<string, number> }>();
  for (const post of posts ?? []) {
    const existing = Array.isArray(post.linkedin_post_scores) ? post.linkedin_post_scores[0] : post.linkedin_post_scores;
    if (existing) continue;
    const member = Array.isArray(post.linkedin_tracked_members) ? post.linkedin_tracked_members[0] : post.linkedin_tracked_members;
    const workspaceId = member?.workspace_id as string | undefined;
    const workspaceResult = workspaceId ? workspaceResults.get(workspaceId) ?? { scored: 0, failed: 0, providers: {} } : null;
    try {
      const result = await scoreLinkedInPost({ postText: post.post_text, memberRole: member?.member_role ?? null });
      const { error: insertError } = await supabase.from("linkedin_post_scores").insert({ post_id: post.id, ...result.score, raw_ai_response: result.score, provider: result.provider, model_name: result.model, scoring_version: LINKEDIN_SCORING_VERSION });
      if (insertError) throw insertError;
      postsScored += 1;
      if (workspaceId && workspaceResult) {
        workspaceResult.scored += 1;
        workspaceResult.providers[result.provider] = (workspaceResult.providers[result.provider] ?? 0) + 1;
        workspaceResults.set(workspaceId, workspaceResult);
      }
    } catch {
      failed += 1;
      if (workspaceId && workspaceResult) {
        workspaceResult.failed += 1;
        workspaceResults.set(workspaceId, workspaceResult);
      }
    }
  }
  for (const [workspaceId, result] of workspaceResults) await supabase.from("linkedin_sync_logs").insert({ workspace_id: workspaceId, job_type: "score_posts", status: result.failed > 0 ? "partial" : "success", message: `Scored ${result.scored} posts; ${result.failed} failed.`, metadata: { providers: result.providers, scoringVersion: LINKEDIN_SCORING_VERSION } });
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
    const { data: settings } = await supabase.from("linkedin_settings").select("weekly_reports_enabled").eq("workspace_id", workspace.id).maybeSingle();
    if (settings?.weekly_reports_enabled === false) continue;
    const data = await getLinkedInDashboardData(supabase, workspace.id, { startDate, endDate });
    const summary = summarizeLinkedInStats(data.stats);
    const reportSummary = `${summary.totalPosts} original posts with an average quality score of ${summary.averageQuality ?? "N/A"}. Most active: ${summary.mostActiveMember ?? "N/A"}. Focus: ${summary.recommendedFocus}`;
    const { data: report, error: reportError } = await supabase.from("linkedin_weekly_reports").upsert({ workspace_id: workspace.id, start_date: startDate.toISOString(), end_date: endDate.toISOString(), report_json: { summary, members: data.stats }, report_summary: reportSummary }, { onConflict: "workspace_id,start_date,end_date" }).select("id").single();
    if (reportError) throw reportError;
    reportIds.push(report.id);
  }
  return { reportIds };
}
