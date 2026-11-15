"use client";

import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_FILES, MAX_FILE_BYTES, RESUME_TYPES, storageName } from "@/lib/utils/talent";

export type UploadedFile = { path: string; name: string; size: number; kind: "resume" | "work" };

// What's wrong with a file before it's uploaded, or null when it's fine.
export function fileProblem(file: File, kind: "resume" | "work") {
  if (!ACCEPTED_FILES[file.type] || (kind === "resume" && !RESUME_TYPES.includes(file.type))) {
    return kind === "resume" ? `${file.name}: resumes can be PDF or Word.` : `${file.name}: use PDF, Word, images or ZIP.`;
  }
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 15 MB.`;
  return null;
}

// Uploads a file for a candidate (admins only) straight to the private Talent Bank storage.
export async function uploadTalentFile(workspaceId: string, candidateId: string, file: File, kind: "resume" | "work"): Promise<UploadedFile> {
  const path = `${workspaceId}/${candidateId}/${kind}-${Date.now().toString(36)}-${storageName(file.name)}`;
  const { error } = await createClient().storage.from("talent-files").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Couldn't upload ${file.name}. Please try again.`);
  return { path, name: file.name, size: file.size, kind };
}
