import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlannedRoundsFromDates } from "@/lib/utils/dates";
import { projectSchema, type ProjectInput } from "@/lib/validation/project-schema";
import { writeAuditLog } from "@/lib/services/audit-service";
import type { ProjectStatus } from "@/lib/db/types";
import { minimumProjectMembers } from "@/lib/utils/team-size";

export async function createProject(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  createdBy: string,
  rawInput: ProjectInput,
) {
  const input = projectSchema.parse(rawInput);
  const reviewsPerPerson = input.memberIds.length - 1;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      description: input.description ?? null,
      cadence: input.cadence,
      reviews_per_person: reviewsPerPerson,
      review_due_hours: input.reviewDueHours,
      start_date: input.startDate.toISOString().slice(0, 10),
      end_date: input.endDate.toISOString().slice(0, 10),
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;

  const members = input.memberIds.map((userId) => ({
    project_id: project.id,
    user_id: userId,
    role_label: input.roleLabels[userId] || null,
  }));

  const { error: memberError } = await supabase
    .from("project_members")
    .insert(members);
  if (memberError) throw memberError;

  await insertPlannedRounds(supabase, project);
  await writeAuditLog(supabase, {
    workspaceId,
    actorId: createdBy,
    action: "project.created",
    entityType: "project",
    entityId: project.id,
  });

  return project;
}

export async function updateProject(
  supabase: SupabaseClient<any>,
  projectId: string,
  input: Partial<Pick<ProjectInput, "name" | "description" | "reviewDueHours">> & { status?: ProjectStatus },
) {
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      description: input.description,
      review_due_hours: input.reviewDueHours,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getProject(
  supabase: SupabaseClient<any>,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_members(id, user_id, role_label, is_active, profiles(id, full_name, email)), review_rounds(id, title, round_number, status, scheduled_start_at, started_at, due_at, completed_at, closed_at)")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data;
}

export async function listProjects(
  supabase: SupabaseClient<any>,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, status, cadence, created_at, review_rounds(id)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addProjectMembers(
  supabase: SupabaseClient<any>,
  projectId: string,
  userIds: string[],
) {
  const { error } = await supabase.from("project_members").upsert(
    userIds.map((userId) => ({ project_id: projectId, user_id: userId })),
    { onConflict: "project_id,user_id" },
  );
  if (error) throw error;
}

export async function generatePlannedRounds(
  supabase: SupabaseClient<any>,
  projectId: string,
) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error) throw error;

  return insertPlannedRounds(supabase, project);
}

async function insertPlannedRounds(
  supabase: SupabaseClient<any>,
  project: {
    id: string;
    start_date: string;
    end_date: string;
    cadence: string;
    review_due_hours: number;
  },
) {
  const planned = generatePlannedRoundsFromDates(
    new Date(project.start_date),
    new Date(project.end_date),
    project.cadence as ProjectInput["cadence"],
    project.review_due_hours,
  );

  if (planned.length === 0) return [];

  const { data, error: insertError } = await supabase
    .from("review_rounds")
    .upsert(
      planned.map((round) => ({
        project_id: project.id,
        title: round.title,
        round_number: round.roundNumber,
        scheduled_start_at: round.scheduledStartAt.toISOString(),
        due_at: round.dueAt.toISOString(),
      })),
      { onConflict: "project_id,round_number" },
    )
    .select();

  if (insertError) throw insertError;
  return data ?? [];
}

export async function deleteProject(
  supabase: SupabaseClient<any>,
  projectId: string,
) {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) throw error;
}

export async function removeProjectMember(
  supabase: SupabaseClient<any>,
  projectId: string,
  userId: string,
  actorId: string,
) {
  // Count current active members in the project
  const { count, error: countError } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (countError) throw countError;

  const minMembers = minimumProjectMembers();
  if ((count ?? 0) <= minMembers) {
    throw new Error(`Cannot remove member. A project must have at least ${minMembers} active members.`);
  }

  // Soft-remove by setting is_active = false
  const { error: updateError } = await supabase
    .from("project_members")
    .update({ is_active: false })
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (updateError) throw updateError;

  // Clean up assignments in active rounds where the user is reviewer or reviewee
  const { data: activeRounds, error: roundsError } = await supabase
    .from("review_rounds")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active");

  if (roundsError) throw roundsError;

  if (activeRounds && activeRounds.length > 0) {
    const activeRoundIds = activeRounds.map((r) => r.id);

    const { error: deleteReviewerError } = await supabase
      .from("review_assignments")
      .delete()
      .in("round_id", activeRoundIds)
      .eq("reviewer_id", userId)
      .neq("status", "submitted");

    if (deleteReviewerError) throw deleteReviewerError;

    const { error: deleteRevieweeError } = await supabase
      .from("review_assignments")
      .delete()
      .in("round_id", activeRoundIds)
      .eq("reviewee_id", userId)
      .neq("status", "submitted");

    if (deleteRevieweeError) throw deleteRevieweeError;

    // Check round progress and complete round if all remaining assignments are submitted
    const { completeRoundIfReady } = await import("@/lib/services/round-service");
    for (const roundId of activeRoundIds) {
      await completeRoundIfReady(supabase, roundId);
    }
  }

  const project = await getProject(supabase, projectId);
  await writeAuditLog(supabase, {
    workspaceId: project.workspace_id,
    actorId,
    action: "project.member_removed",
    entityType: "project",
    entityId: projectId,
    metadata: { userId },
  });
}

export async function addProjectMember(
  supabase: SupabaseClient<any>,
  projectId: string,
  userId: string,
  roleLabel: string | null,
  actorId: string,
) {
  const { error } = await supabase
    .from("project_members")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        role_label: roleLabel || null,
        is_active: true,
      },
      { onConflict: "project_id,user_id" },
    );

  if (error) throw error;

  const project = await getProject(supabase, projectId);
  await writeAuditLog(supabase, {
    workspaceId: project.workspace_id,
    actorId,
    action: "project.member_added",
    entityType: "project",
    entityId: projectId,
    metadata: { userId, roleLabel },
  });
}
