"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLinkedInAnalysisWindow,
  createLinkedInTrackedMember,
  generateLinkedInWeeklyReports,
  linkedinSettingsSchema,
  linkedinTrackedMemberSchema,
  linkedinWindowSchema,
  scoreUnscoredLinkedInPosts,
  syncLinkedInMembers,
  updateLinkedInTrackedMember,
  upsertLinkedInSettings,
} from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";

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
  const { supabase, workspace } = await requireLinkedInAdmin();
  const memberId = String(formData.get("memberId"));
  const status = String(formData.get("status"));
  await updateLinkedInTrackedMember(supabase, workspace.id, memberId, { tracking_status: status, is_active: status !== "archived" });
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
  });
  await upsertLinkedInSettings(supabase, { workspaceId: workspace.id, ...parsed });
  refreshLinkedIn();
}

export async function generateLinkedInReportAction() {
  const { workspace } = await requireLinkedInAdmin();
  await generateLinkedInWeeklyReports({ workspaceId: workspace.id });
  refreshLinkedIn();
}
