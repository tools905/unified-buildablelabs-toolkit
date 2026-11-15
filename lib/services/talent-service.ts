import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPdfText } from "@/lib/mcp/pdf-pages";
import { isOpenRouterConfigured, requestOpenRouterJson } from "@/lib/services/openrouter-service";
import { sendEmail, PRODUCT_NAME } from "@/lib/services/email-service";
import { getAppLink } from "@/lib/utils/app-url";
import { ACCEPTED_FILES, contactsFromText, MAX_FILE_BYTES, MAX_WORK_FILES, REJECTED_KEEP_DAYS, RESUME_TYPES, storageName, type TalentShelf } from "@/lib/utils/talent";
import { candidateSchema, applicationSchema, type CandidateInput } from "@/lib/validation/talent-schema";

// Talent Bank (admin only; see migration 068). Admin screens use the signed-in client, so the
// database's admin-only rules apply; the public application form uses the service role after
// checking the shared link is on.

export const TALENT_BUCKET = "talent-files";
const LINK_TTL_SECONDS = 10 * 60;
// Gets every new application by email, whoever the workspace admins are.
const TALENT_ALWAYS_NOTIFY = { full_name: "Aditi Chourasia", email: "aditi@buildablelabs.com" };

export type TalentFile = { id: string; kind: "resume" | "work"; storage_path: string; file_name: string; size_bytes: number; created_at: string };
export type TalentCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  location: string | null;
  linkedin_url: string | null;
  source: string | null;
  notes: string | null;
  links: string[];
  answers: { built?: string | null; why?: string | null };
  shelf: TalentShelf;
  added_via: "manual" | "form";
  reference_code: string;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  files: TalentFile[];
};

const SELECT = "id, full_name, email, phone, role, location, linkedin_url, source, notes, links, answers, shelf, added_via, reference_code, rejected_at, created_at, updated_at, files:talent_files(id, kind, storage_path, file_name, size_bytes, created_at)";

const toRow = (input: ReturnType<typeof candidateSchema.parse>) => ({
  full_name: input.fullName,
  email: input.email ?? null,
  phone: input.phone ?? null,
  role: input.role ?? null,
  location: input.location ?? null,
  linkedin_url: input.linkedinUrl ?? null,
  source: input.source ?? null,
  notes: input.notes ?? null,
  links: input.links,
});

export async function listCandidates(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase.from("talent_candidates").select(SELECT).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as TalentCandidate[];
}

// A file the screen uploaded straight to storage, listed under the candidate. Only files inside this
// candidate's own folder are accepted.
type UploadedFile = { path: string; name: string; size: number; kind: "resume" | "work" };
function checkUploads(workspaceId: string, candidateId: string, files: UploadedFile[]) {
  return files.filter((file) => file.path.startsWith(`${workspaceId}/${candidateId}/`) && !file.path.includes(".."));
}

export async function createCandidate(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; userId: string; candidateId?: string; fields: CandidateInput; files?: UploadedFile[] },
) {
  const fields = candidateSchema.parse(input.fields);
  const id = input.candidateId ?? randomUUID();
  const { error } = await supabase
    .from("talent_candidates")
    .insert({ id, workspace_id: input.workspaceId, created_by: input.userId, added_via: "manual", ...toRow(fields) });
  if (error) throw error;
  await addFiles(supabase, input.workspaceId, id, input.files ?? []);
  return id;
}

export async function updateCandidate(supabase: SupabaseClient<any>, candidateId: string, raw: CandidateInput) {
  const fields = candidateSchema.parse(raw);
  const { error } = await supabase
    .from("talent_candidates")
    .update({ ...toRow(fields), updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
}

export async function addFiles(supabase: SupabaseClient<any>, workspaceId: string, candidateId: string, files: UploadedFile[]) {
  const accepted = checkUploads(workspaceId, candidateId, files);
  if (!accepted.length) return;
  const { error } = await supabase.from("talent_files").insert(
    accepted.map((file) => ({
      candidate_id: candidateId,
      workspace_id: workspaceId,
      kind: file.kind,
      storage_path: file.path,
      file_name: file.name.slice(0, 200),
      size_bytes: Math.max(0, Math.round(file.size)),
    })),
  );
  if (error) throw error;
}

export async function removeFile(supabase: SupabaseClient<any>, fileId: string) {
  const { data, error } = await supabase.from("talent_files").delete().eq("id", fileId).select("storage_path");
  if (error) throw error;
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from(TALENT_BUCKET).remove([path]);
}

// Rejecting starts the 60-day clock; moving back off Rejected stops it.
export async function setShelf(supabase: SupabaseClient<any>, candidateId: string, shelf: TalentShelf) {
  const { error } = await supabase
    .from("talent_candidates")
    .update({ shelf, rejected_at: shelf === "rejected" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
}

// Deletes a candidate and every file of theirs, for good.
export async function deleteCandidate(supabase: SupabaseClient<any>, workspaceId: string, candidateId: string) {
  const { data: files } = await supabase.from("talent_files").select("storage_path").eq("candidate_id", candidateId);
  const { data, error } = await supabase.from("talent_candidates").delete().eq("id", candidateId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That candidate is already gone.");
  await removeFolder(supabase, workspaceId, candidateId, (files ?? []).map((file: { storage_path: string }) => file.storage_path));
}

async function removeFolder(supabase: SupabaseClient<any>, workspaceId: string, candidateId: string, known: string[] = []) {
  const storage = supabase.storage.from(TALENT_BUCKET);
  const { data: listed } = await storage.list(`${workspaceId}/${candidateId}`, { limit: 100 });
  const paths = [...new Set([...known, ...(listed ?? []).map((item) => `${workspaceId}/${candidateId}/${item.name}`)])];
  if (paths.length) await storage.remove(paths);
}

export async function fileLink(supabase: SupabaseClient<any>, fileId: string, inline: boolean) {
  const { data, error } = await supabase.from("talent_files").select("storage_path, file_name").eq("id", fileId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: signed, error: signError } = await supabase.storage
    .from(TALENT_BUCKET)
    .createSignedUrl(data.storage_path, LINK_TTL_SECONDS, inline ? undefined : { download: data.file_name });
  if (signError) throw signError;
  return signed.signedUrl;
}

// What a resume says: name, email, phone, LinkedIn, role and city, for the admin to check before
// saving. Contact details are read directly from the text; the AI service (when set up) fills in the
// rest. Only PDFs can be read; Word files come back empty.
export async function readResume(supabase: SupabaseClient<any>, path: string) {
  const { data, error } = await supabase.storage.from(TALENT_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Couldn't open that resume.");
  if (data.type && data.type !== "application/pdf" && !path.endsWith(".pdf")) return { readable: false as const };
  const text = await readPdfText(new Uint8Array(await data.arrayBuffer()));
  if (!text) return { readable: false as const };
  const found = contactsFromText(text);
  type ResumeFields = { full_name?: string; role?: string; location?: string; email?: string; phone?: string; linkedin_url?: string };
  let ai: ResumeFields | null = null;
  if (isOpenRouterConfigured()) {
    ai = await requestOpenRouterJson<ResumeFields>({
      system:
        "You read resumes. Reply with JSON only: {\"full_name\": string|null, \"role\": string|null (their current or most recent job title, short), \"location\": string|null (city, country), \"email\": string|null, \"phone\": string|null, \"linkedin_url\": string|null}. Use only what the text says; null when it isn't there.",
      user: { resume: text.slice(0, 6000) },
      temperature: 0,
    }).catch(() => null);
  }
  const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null);
  return {
    readable: true as const,
    fullName: clean(ai?.full_name) ?? clean(text.split("\n")[0]?.split(/[|·•,]/)[0]),
    email: found.email ?? clean(ai?.email),
    phone: found.phone ?? clean(ai?.phone),
    linkedinUrl: found.linkedin_url ?? clean(ai?.linkedin_url),
    role: clean(ai?.role),
    location: clean(ai?.location),
  };
}

// --- The shared application link -------------------------------------------------------------

export async function getFormLink(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase.from("talent_form_links").select("token, active, updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  return data as { token: string; active: boolean; updated_at: string } | null;
}

const newToken = () => randomBytes(9).toString("base64url");

// Turns the link on (making one the first time) or off. `fresh` replaces it with a new one, so the old
// link stops working.
export async function setFormLink(supabase: SupabaseClient<any>, workspaceId: string, userId: string, change: { active?: boolean; fresh?: boolean }) {
  const current = await getFormLink(supabase, workspaceId);
  const row = {
    workspace_id: workspaceId,
    token: !current || change.fresh ? newToken() : current.token,
    active: change.active ?? current?.active ?? true,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("talent_form_links").upsert(row, { onConflict: "workspace_id" });
  if (error) throw error;
  return row;
}

// For the public form (service role): the workspace whose link this is, if it's on.
export async function findOpenLink(admin: SupabaseClient<any>, token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const { data } = await admin.from("talent_form_links").select("workspace_id, active").eq("token", token).maybeSingle();
  return data?.active ? (data.workspace_id as string) : null;
}

type PlannedFile = { name: string; size: number; type: string; kind: "resume" | "work" };

// Step one of applying: where each chosen file may be uploaded. The candidate's id is chosen here, so
// the files go into their own folder before the form is sent.
export async function prepareApplication(admin: SupabaseClient<any>, token: string, files: PlannedFile[]) {
  const workspaceId = await findOpenLink(admin, token);
  if (!workspaceId) return { ok: false as const, message: "This application link isn't open any more." };
  const resumes = files.filter((file) => file.kind === "resume");
  const work = files.filter((file) => file.kind === "work");
  if (resumes.length > 1 || work.length > MAX_WORK_FILES) return { ok: false as const, message: `One resume and up to ${MAX_WORK_FILES} work files.` };
  for (const file of files) {
    if (!ACCEPTED_FILES[file.type] || (file.kind === "resume" && !RESUME_TYPES.includes(file.type))) {
      return { ok: false as const, message: `${file.name} isn't a file type we take. Resumes: PDF or Word. Work: PDF, Word, images or ZIP.` };
    }
    if (file.size > MAX_FILE_BYTES) return { ok: false as const, message: `${file.name} is over 15 MB.` };
  }
  const candidateId = randomUUID();
  const uploads = await Promise.all(
    files.map(async (file, index) => {
      const path = `${workspaceId}/${candidateId}/${file.kind}-${index + 1}-${storageName(file.name)}`;
      const { data, error } = await admin.storage.from(TALENT_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return { path, token: data.token, signedUrl: data.signedUrl };
    }),
  );
  return { ok: true as const, candidateId, uploads };
}

// Step two: the answers. Files are listed only if they really were uploaded into this candidate's
// folder. Admins are emailed.
export async function submitApplication(
  admin: SupabaseClient<any>,
  token: string,
  input: { candidateId: string; answers: unknown; files: { path: string; name: string; kind: "resume" | "work" }[] },
) {
  const workspaceId = await findOpenLink(admin, token);
  if (!workspaceId) return { ok: false as const, message: "This application link isn't open any more." };
  if (!/^[0-9a-f-]{36}$/.test(input.candidateId)) return { ok: false as const, message: "Something went wrong. Please start again." };
  const parsed = applicationSchema.safeParse(input.answers);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Please check your answers." };

  // A burst of applications from one link is someone misusing it.
  const { count } = await admin
    .from("talent_candidates")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("added_via", "form")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= 40) return { ok: false as const, message: "We're getting a lot of applications right now. Please try again in an hour." };

  const { data: stored } = await admin.storage.from(TALENT_BUCKET).list(`${workspaceId}/${input.candidateId}`, { limit: 20 });
  const sizes = new Map((stored ?? []).map((item) => [`${workspaceId}/${input.candidateId}/${item.name}`, Number(item.metadata?.size ?? 0)]));
  const files = checkUploads(workspaceId, input.candidateId, input.files.map((file) => ({ ...file, size: sizes.get(file.path) ?? 0 }))).filter((file) => sizes.has(file.path));

  const answers = parsed.data;
  const { data: row, error } = await admin
    .from("talent_candidates")
    .insert({
      id: input.candidateId,
      workspace_id: workspaceId,
      full_name: answers.fullName,
      email: answers.email.toLowerCase(),
      phone: answers.phone ?? null,
      role: answers.role ?? null,
      location: answers.location ?? null,
      linkedin_url: answers.linkedinUrl ?? null,
      links: answers.links,
      answers: { built: answers.built ?? null, why: answers.why ?? null },
      source: "Application form",
      added_via: "form",
    })
    .select("reference_code")
    .single();
  if (error) {
    console.error("talent application not saved", error);
    return { ok: false as const, message: "We couldn't save your application. Please try again." };
  }
  await addFiles(admin, workspaceId, input.candidateId, files);
  await emailAdmins(admin, workspaceId, { name: answers.fullName, role: answers.role ?? null, files: files.length }).catch((emailError) =>
    console.error("talent application email failed", emailError),
  );
  return { ok: true as const, reference: `BL-${row.reference_code}` };
}

async function emailAdmins(admin: SupabaseClient<any>, workspaceId: string, applicant: { name: string; role: string | null; files: number }) {
  const { data: admins } = await admin
    .from("workspace_members")
    .select("profile:profiles!workspace_members_user_id_fkey(full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("role", "admin")
    .eq("status", "active");
  const url = getAppLink("/tools/talent-bank");
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  type Profile = { full_name: string | null; email: string | null };
  // Workspace admins, plus Aditi, who always receives new applications even if she is not an admin.
  const recipients = new Map<string, Profile>([[TALENT_ALWAYS_NOTIFY.email, TALENT_ALWAYS_NOTIFY]]);
  for (const row of (admins ?? []) as { profile: Profile | Profile[] | null }[]) {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (profile?.email) recipients.set(profile.email.toLowerCase(), profile);
  }
  await Promise.allSettled(
    [...recipients.values()].map((profile) => {
      if (!profile.email) return Promise.resolve();
      const first = profile.full_name?.split(/\s+/)[0] || "there";
      return sendEmail(admin, {
        to: profile.email,
        subject: `New application: ${applicant.name}${applicant.role ? ` (${applicant.role})` : ""}`,
        html: `<p>Hi ${escape(first)},</p><p><strong>${escape(applicant.name)}</strong> applied through the Talent Bank link${applicant.role ? ` for <strong>${escape(applicant.role)}</strong>` : ""}${applicant.files ? `, with ${applicant.files} ${applicant.files === 1 ? "file" : "files"}` : ""}.</p><p>They're on the New shelf.</p><p><a href="${url}" style="background:#1f6f5b;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Open Talent Bank</a></p><p style="color:#666;font-size:12px">Sent by ${PRODUCT_NAME} to admins when someone applies.</p>`,
        type: "talent_application",
        workspaceId,
      });
    }),
  );
}

// The daily cleanup: rejected people past their 60 days, with their files; and folders of
// applications that were started but never sent (older than a day).
export async function purgeTalent(admin: SupabaseClient<any>, now = new Date()) {
  const cutoff = new Date(now.getTime() - REJECTED_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due, error } = await admin.from("talent_candidates").select("id, workspace_id").eq("shelf", "rejected").lte("rejected_at", cutoff).limit(200);
  if (error) throw error;
  for (const row of due ?? []) {
    await removeFolder(admin, row.workspace_id, row.id);
    await admin.from("talent_candidates").delete().eq("id", row.id);
  }

  let abandoned = 0;
  const { data: workspaces } = await admin.storage.from(TALENT_BUCKET).list("", { limit: 100 });
  for (const workspace of workspaces ?? []) {
    const { data: folders } = await admin.storage.from(TALENT_BUCKET).list(workspace.name, { limit: 1000 });
    const ids = (folders ?? []).map((folder) => folder.name).filter((name) => /^[0-9a-f-]{36}$/.test(name));
    if (!ids.length) continue;
    const { data: known } = await admin.from("talent_candidates").select("id").in("id", ids);
    const knownIds = new Set((known ?? []).map((row: { id: string }) => row.id));
    for (const id of ids.filter((candidateId) => !knownIds.has(candidateId))) {
      const { data: files } = await admin.storage.from(TALENT_BUCKET).list(`${workspace.name}/${id}`, { limit: 100 });
      const old = (files ?? []).every((file) => new Date(file.created_at ?? now).getTime() < now.getTime() - 24 * 60 * 60 * 1000);
      if (old && files?.length) {
        await admin.storage.from(TALENT_BUCKET).remove(files.map((file) => `${workspace.name}/${id}/${file.name}`));
        abandoned++;
      }
    }
  }
  return { rejectedRemoved: due?.length ?? 0, abandonedUploadsRemoved: abandoned };
}
