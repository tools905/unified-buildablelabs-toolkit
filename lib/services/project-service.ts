import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlannedRoundsFromDates } from "@/lib/utils/dates";
import { projectSchema, type ProjectInput } from "@/lib/validation/project-schema";
import { writeAuditLog } from "@/lib/services/audit-service";

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

  await generatePlannedRounds(supabase, project.id);
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
  input: Partial<Pick<ProjectInput, "name" | "description" | "reviewDueHours">>,
) {
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      description: input.description,
      review_due_hours: input.reviewDueHours,
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
    .select("*, project_members(*, profiles(*)), review_rounds(*)")
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
    .select("*, review_rounds(*)")
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

  const planned = generatePlannedRoundsFromDates(
    new Date(project.start_date),
    new Date(project.end_date),
    project.cadence,
    project.review_due_hours,
  );

  if (planned.length === 0) return [];

  const { data, error: insertError } = await supabase
    .from("review_rounds")
    .upsert(
      planned.map((round) => ({
        project_id: projectId,
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
