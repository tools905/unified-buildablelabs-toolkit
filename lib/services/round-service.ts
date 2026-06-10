import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAssignments } from "@/lib/services/assignment-service";
import { sendReportReadyEmail, sendRoundStartedEmail } from "@/lib/services/email-service";
import { writeAuditLog } from "@/lib/services/audit-service";
import { one } from "@/lib/utils/relations";

export async function startReviewRound(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data: round, error } = await supabase
    .from("review_rounds")
    .select("*, projects(*, workspace_members:workspaces(workspace_members(*, profiles(*))))")
    .eq("id", roundId)
    .single();
  if (error) throw error;

  if (!["planned", "active"].includes(round.status)) return round;

  const { count: existingAssignmentCount, error: countError } = await supabase
    .from("review_assignments")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  if (countError) throw countError;

  const assignments =
    existingAssignmentCount === 0 ? await generateAssignments(supabase, roundId) : [];

  const { data: updated, error: updateError } =
    round.status === "planned"
      ? await supabase
          .from("review_rounds")
          .update({ status: "active", started_at: new Date().toISOString() })
          .eq("id", roundId)
          .select("*, projects(*)")
          .single()
      : await supabase
          .from("review_rounds")
          .select("*, projects(*)")
          .eq("id", roundId)
          .single();
  if (updateError) throw updateError;

  const reviewerIds = [...new Set(assignments.map((a) => a.reviewer_id))];
  const { data: reviewers } = await supabase
    .from("profiles")
    .select("*")
    .in("id", reviewerIds);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { count: startEmailCount } = await supabase
    .from("notification_logs")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .eq("type", "round_started")
    .eq("status", "sent");

  if (assignments.length > 0 && !startEmailCount) {
    await Promise.all(
      (reviewers ?? []).map((reviewer) =>
        sendRoundStartedEmail(supabase, {
        to: reviewer.email,
        projectName: updated.projects?.name ?? "Peer review project",
        reviewCount: assignments.filter((a) => a.reviewer_id === reviewer.id).length,
        dueAt: new Date(updated.due_at).toLocaleString(),
        url: `${appUrl}/my-reviews`,
        workspaceId: updated.projects?.workspace_id ?? "",
        projectId: updated.project_id,
        roundId: updated.id,
        }),
      ),
    );
  }

  await writeAuditLog(supabase, {
    workspaceId: updated.projects?.workspace_id,
    action: "round.started",
    entityType: "review_round",
    entityId: updated.id,
    metadata: { assignmentCount: assignments.length },
  });

  return updated;
}

export async function completeRoundIfReady(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const progress = await getRoundProgress(supabase, roundId);
  if (progress.total > 0 && progress.submitted === progress.total) {
    const { data, error } = await supabase
      .from("review_rounds")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", roundId)
      .select("*, projects(*)")
      .single();
    if (error) throw error;
    await notifyReportReady(supabase, data, progress.completionRate);
    return data;
  }
  return null;
}

export async function closeRound(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data, error } = await supabase
    .from("review_rounds")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", roundId)
    .in("status", ["active", "planned"])
    .select("*, projects(*)")
    .single();
  if (error) throw error;
  const progress = await getRoundProgress(supabase, roundId);
  await notifyReportReady(supabase, data, progress.completionRate);
  return data;
}

async function notifyReportReady(
  supabase: SupabaseClient<any>,
  round: { id: string; title: string; project_id: string; projects?: { workspace_id: string; name: string } | null },
  completionRate: number,
) {
  const { data: admins } = await supabase
    .from("workspace_members")
    .select("profiles(*)")
    .eq("workspace_id", round.projects?.workspace_id ?? "")
    .eq("role", "admin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await Promise.all(
    (admins ?? []).map((admin) => {
      const profile = one(admin.profiles);
      return profile?.email
        ? sendReportReadyEmail(supabase, {
            to: profile.email,
            projectName: round.projects?.name ?? "Peer review project",
            roundTitle: round.title,
            completionRate,
            url: `${appUrl}/projects/${round.project_id}/rounds/${round.id}/report`,
            workspaceId: round.projects?.workspace_id ?? "",
            projectId: round.project_id,
            roundId: round.id,
          })
        : Promise.resolve();
    }),
  );
}

export async function getRoundProgress(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data: assignments, error } = await supabase
    .from("review_assignments")
    .select("*, reviewer:profiles!review_assignments_reviewer_id_fkey(*)")
    .eq("round_id", roundId);
  if (error) throw error;

  const total = assignments?.length ?? 0;
  const submitted = assignments?.filter((a) => a.status === "submitted").length ?? 0;
  const overdue = assignments?.filter((a) => a.status === "overdue").length ?? 0;
  const pending = total - submitted - overdue;
  const missingReviewers = [
    ...new Map(
      (assignments ?? [])
        .filter((a) => a.status !== "submitted")
        .map((a) => [a.reviewer_id, one(a.reviewer)]),
    ).values(),
  ];

  return {
    total,
    submitted,
    overdue,
    pending,
    completionRate: total === 0 ? 0 : Math.round((submitted / total) * 100),
    missingReviewers,
  };
}

export async function cancelRound(
  supabase: SupabaseClient<any>,
  roundId: string,
) {
  const { data, error } = await supabase
    .from("review_rounds")
    .update({ status: "cancelled" })
    .eq("id", roundId)
    .in("status", ["active", "planned"])
    .select("*, projects(*)")
    .single();

  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId: data.projects?.workspace_id,
    action: "round.cancelled",
    entityType: "review_round",
    entityId: data.id,
  });

  return data;
}
