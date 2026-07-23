import { differenceInHours } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendAdminOverdueSummaryEmail,
  sendReviewReminderEmail,
} from "@/lib/services/email-service";
import { getAppLink } from "@/lib/utils/app-url";
import { one } from "@/lib/utils/relations";

export async function sendPendingReviewReminders(
  supabase: SupabaseClient<any>,
  roundId?: string,
) {
  let query = supabase
    .from("review_assignments")
    .select("*, reviewer:profiles!review_assignments_reviewer_id_fkey(*), review_rounds!inner(*, projects(*))")
    .in("status", ["pending", "overdue"])
    .eq("review_rounds.status", "active");

  if (roundId) {
    query = query.eq("round_id", roundId);
  }

  const { data: assignments, error } = await query;
  if (error) throw error;

  let sent = 0;
  const now = new Date();
  const grouped = new Map<string, typeof assignments>();

  for (const assignment of assignments ?? []) {
    const lastReminded = assignment.last_reminded_at
      ? new Date(assignment.last_reminded_at)
      : null;
    if (lastReminded && differenceInHours(now, lastReminded) < 24) continue;
    const key = `${assignment.round_id}:${assignment.reviewer_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), assignment]);
  }

  for (const group of grouped.values()) {
    const assignment = group[0];
    const reviewer = one(assignment.reviewer);
    const project = one(assignment.review_rounds?.projects);
    if (!reviewer?.email || !project) continue;

    await sendReviewReminderEmail(supabase, {
      to: reviewer.email,
      projectName: project.name,
      roundTitle: assignment.review_rounds.title,
      pendingCount: group.length,
      dueAt: new Date(assignment.review_rounds.due_at).toLocaleString(),
      url: getAppLink("/tools/peer-review/member"),
      workspaceId: project.workspace_id,
      projectId: assignment.review_rounds.project_id,
      roundId: assignment.round_id,
    });

    await supabase
      .from("review_assignments")
      .update({
        reminder_count: Math.max(...group.map((item) => item.reminder_count)) + 1,
        last_reminded_at: now.toISOString(),
      })
      .in("id", group.map((item) => item.id));
    sent += 1;
  }

  return sent;
}

export async function markOverdueAssignments(
  supabase: SupabaseClient<any>,
) {
  const { data: rounds, error } = await supabase
    .from("review_rounds")
    .select("*")
    .eq("status", "active")
    .lt("due_at", new Date().toISOString());
  if (error) throw error;

  let count = 0;
  for (const round of rounds ?? []) {
    const { data, error: updateError } = await supabase
      .from("review_assignments")
      .update({ status: "overdue" })
      .eq("round_id", round.id)
      .eq("status", "pending")
      .select("id");
    if (updateError) throw updateError;
    count += data?.length ?? 0;
  }
  return count;
}

export async function sendAdminOverdueSummaries(
  supabase: SupabaseClient<any>,
) {
  const { data: rounds, error } = await supabase
    .from("review_rounds")
    .select("*, projects(*)")
    .eq("status", "active")
    .lt("due_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
  if (error) throw error;

  let sent = 0;

  for (const round of rounds ?? []) {
    const { data: assignments } = await supabase
      .from("review_assignments")
      .select("*, reviewer:profiles!review_assignments_reviewer_id_fkey(*)")
      .eq("round_id", round.id)
      .neq("status", "submitted");
    const { data: admins } = await supabase
      .from("workspace_members")
      .select("profiles(*)")
      .eq("workspace_id", round.projects?.workspace_id ?? "")
      .eq("role", "admin");
    const pendingMembers = [
      ...new Set(
        (assignments ?? []).map((assignment) => {
          const reviewer = one(assignment.reviewer);
          return reviewer?.full_name ?? reviewer?.email ?? "Unknown";
        }),
      ),
    ];

    await Promise.all((admins ?? []).map(async (admin) => {
      const profile = one(admin.profiles);
      if (!profile?.email) return;
      await sendAdminOverdueSummaryEmail(supabase, {
        to: profile.email,
        projectName: round.projects?.name ?? "Peer review project",
        roundTitle: round.title,
        pendingMembers,
        overdueAssignments: assignments?.length ?? 0,
        url: getAppLink(`/tools/peer-review/admin/${round.project_id}/rounds/${round.id}`),
        workspaceId: round.projects?.workspace_id ?? "",
        projectId: round.project_id,
        roundId: round.id,
      });
      sent += 1;
    }));
  }

  return sent;
}
