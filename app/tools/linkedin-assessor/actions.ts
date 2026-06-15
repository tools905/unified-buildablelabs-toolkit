"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLinkedInAnalysisWindow,
  createLinkedInScoreOverride,
  createSelfLinkedInTrackedMember,
  createLinkedInTrackedMember,
  generateLinkedInWeeklyReports,
  linkedinSettingsSchema,
  linkedinManualPostSchema,
  linkedinScoreOverrideSchema,
  linkedinSelfProfileSchema,
  linkedinTrackedMemberSchema,
  linkedinWindowSchema,
  scoreUnscoredLinkedInPosts,
  syncLinkedInMembers,
  submitLinkedInPost,
  updateLinkedInTrackedMember,
  upsertLinkedInSettings,
} from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { requireLinkedInContext } from "@/modules/linkedin-assessor/context";

const refreshLinkedIn = () => {
  revalidatePath("/tools/linkedin-assessor");
  revalidatePath("/tools/linkedin-assessor/admin");
  revalidatePath("/tools/linkedin-assessor/reports");
};

export async function createTrackedMemberAction(formData: FormData) {
  const { supabase, user, workspace } = await requireLinkedInAdmin();
  const parsed = linkedinTrackedMemberSchema.parse(Object.fromEntries(formData));
  const member = await createLinkedInTrackedMember(supabase, {
    workspaceId: workspace.id,
    actorId: user.id,
    profileId: parsed.profileId || null,
    name: parsed.name,
    email: parsed.email || null,
    memberRole: parsed.memberRole,
    linkedinProfileUrl: parsed.linkedinProfileUrl,
    monthlyPostTarget: parsed.monthlyPostTarget,
    volumeWeight: parsed.volumeWeight,
    qualityWeight: parsed.qualityWeight,
    connectorPreference: parsed.connectorPreference,
  });
  redirect(`/tools/linkedin-assessor/admin/members/${member.id}`);
}

export async function setTrackedMemberStatusAction(formData: FormData) {
  const { supabase, user, workspace } = await requireLinkedInAdmin();
  const memberId = String(formData.get("memberId"));
  const status = String(formData.get("status"));
  await updateLinkedInTrackedMember(supabase, workspace.id, memberId, { tracking_status: status === "archived" ? "paused" : status, is_active: status !== "archived" }, user.id);
  refreshLinkedIn();
}

export async function syncLinkedInAction(formData: FormData) {
  const { workspace } = await requireLinkedInAdmin();
  await syncLinkedInMembers({ workspaceId: workspace.id, memberId: String(formData.get("memberId") || "") || undefined });
  refreshLinkedIn();
}

export async function scoreLinkedInAction() {
  const { workspace } = await requireLinkedInAdmin();
  await scoreUnscoredLinkedInPosts({ workspaceId: workspace.id });
  refreshLinkedIn();
}

export async function createAnalysisWindowAction(formData: FormData) {
  const { supabase, user, workspace } = await requireLinkedInAdmin();
  const parsed = linkedinWindowSchema.parse(Object.fromEntries(formData));
  await createLinkedInAnalysisWindow(supabase, { workspaceId: workspace.id, actorId: user.id, ...parsed });
  refreshLinkedIn();
}

export async function updateLinkedInSettingsAction(formData: FormData) {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const parsed = linkedinSettingsSchema.parse({
    ...Object.fromEntries(formData),
    weeklyReportsEnabled: formData.get("weeklyReportsEnabled") === "on",
    memberInsightsEnabled: formData.get("memberInsightsEnabled") === "on",
    memberSubmissionsEnabled: formData.get("memberSubmissionsEnabled") === "on",
  });
  await upsertLinkedInSettings(supabase, { workspaceId: workspace.id, ...parsed });
  refreshLinkedIn();
}

export async function updateTrackedMemberAction(formData: FormData) {
  const { supabase, user, workspace } = await requireLinkedInAdmin();
  const memberId = String(formData.get("memberId"));
  const parsed = linkedinTrackedMemberSchema.parse(Object.fromEntries(formData));
  await updateLinkedInTrackedMember(supabase, workspace.id, memberId, {
    profile_id: parsed.profileId || null,
    name: parsed.name,
    email: parsed.email || null,
    member_role: parsed.memberRole,
    linkedin_profile_url: parsed.linkedinProfileUrl,
    monthly_post_target: parsed.monthlyPostTarget,
    volume_weight: parsed.volumeWeight,
    quality_weight: parsed.qualityWeight,
    connector_preference: parsed.connectorPreference,
  }, user.id);
  refreshLinkedIn();
}

export async function submitLinkedInPostAction(formData: FormData) {
  const { user, workspace, admin } = await requireLinkedInContext();
  const parsed = linkedinManualPostSchema.parse(Object.fromEntries(formData));
  await submitLinkedInPost({
    workspaceId: workspace.id,
    actorId: user.id,
    admin,
    ...parsed,
    collaborationContext: parsed.collaborationContext || null,
  });
  await scoreUnscoredLinkedInPosts({ workspaceId: workspace.id });
  refreshLinkedIn();
}

export async function overrideLinkedInScoreAction(formData: FormData) {
  const { supabase, user, workspace } = await requireLinkedInAdmin();
  const parsed = linkedinScoreOverrideSchema.parse({
    ...Object.fromEntries(formData),
    excludeFromQualityAverage: formData.get("excludeFromQualityAverage") === "on",
  });
  await createLinkedInScoreOverride(supabase, {
    workspaceId: workspace.id,
    actorId: user.id,
    postId: parsed.postId,
    totalScore: parsed.totalScore === "" ? null : parsed.totalScore,
    archetype: parsed.archetype || null,
    adminNotes: parsed.adminNotes || null,
    excludeFromQualityAverage: parsed.excludeFromQualityAverage,
  });
  refreshLinkedIn();
}

export async function connectOwnLinkedInProfileAction(formData: FormData) {
  const { user, workspace, admin } = await requireLinkedInContext();
  if (admin) throw new Error("Admins should create tracked profiles from the admin dashboard.");
  const parsed = linkedinSelfProfileSchema.parse(Object.fromEntries(formData));
  await createSelfLinkedInTrackedMember({
    workspaceId: workspace.id,
    actorId: user.id,
    name: parsed.name,
    email: user.email,
    memberRole: parsed.memberRole,
    linkedinProfileUrl: parsed.linkedinProfileUrl,
  });
  refreshLinkedIn();
}

export async function generateLinkedInReportAction() {
  const { workspace } = await requireLinkedInAdmin();
  await generateLinkedInWeeklyReports({ workspaceId: workspace.id });
  refreshLinkedIn();
}
