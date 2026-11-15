"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, Plus, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCandidateAction, discardUploadsAction, readResumeAction, updateCandidateAction } from "@/app/tools/talent-bank/actions";
import { fileProblem, uploadTalentFile, type UploadedFile } from "@/components/talent/upload";
import type { TalentCandidate } from "@/lib/services/talent-service";
import { ACCEPT_ATTRIBUTE, MAX_LINKS, MAX_WORK_FILES, RESUME_ACCEPT_ATTRIBUTE } from "@/lib/utils/talent";
import { cn } from "@/lib/utils/cn";

type Fields = { fullName: string; email: string; phone: string; role: string; location: string; linkedinUrl: string; source: string; notes: string; links: string[] };

const fromCandidate = (candidate?: TalentCandidate): Fields => ({
  fullName: candidate?.full_name ?? "",
  email: candidate?.email ?? "",
  phone: candidate?.phone ?? "",
  role: candidate?.role ?? "",
  location: candidate?.location ?? "",
  linkedinUrl: candidate?.linkedin_url ?? "",
  source: candidate?.source ?? "",
  notes: candidate?.notes ?? "",
  links: candidate?.links?.length ? candidate.links : [""],
});

// Adding someone by hand (drop their resume first and the details fill themselves in, to check), or
// editing a candidate's details. Only the name is needed.
export function CandidateForm({ workspaceId, candidate, onClose }: { workspaceId: string; candidate?: TalentCandidate; onClose: () => void }) {
  const editing = Boolean(candidate);
  const [candidateId] = useState(() => candidate?.id ?? crypto.randomUUID());
  const [fields, setFields] = useState<Fields>(() => fromCandidate(candidate));
  const [resume, setResume] = useState<UploadedFile | null>(null);
  const [work, setWork] = useState<UploadedFile[]>([]);
  const [reading, setReading] = useState<"idle" | "uploading" | "reading" | "filled" | "unreadable">("idle");
  const [uploadingWork, setUploadingWork] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [filledKeys, setFilledKeys] = useState<Set<keyof Fields>>(new Set());
  const resumeInput = useRef<HTMLInputElement>(null);
  const workInput = useRef<HTMLInputElement>(null);

  const set = (key: keyof Fields, value: string) => setFields((current) => ({ ...current, [key]: value }));

  async function chooseResume(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file, "resume");
    if (problem) return setError(problem);
    setError(null);
    setReading("uploading");
    try {
      if (resume) void discardUploadsAction([resume.path]);
      const uploaded = await uploadTalentFile(workspaceId, candidateId, file, "resume");
      setResume(uploaded);
      setReading("reading");
      const result = await readResumeAction(uploaded.path);
      if (!result.ok || !result.found.readable) return setReading("unreadable");
      // Fills only what's still empty, and marks what it filled so it can be checked.
      const found = result.found;
      const filled = new Set<keyof Fields>();
      setFields((current) => {
        const next = { ...current };
        for (const key of ["fullName", "email", "phone", "linkedinUrl", "role", "location"] as const) {
          const value = found[key];
          if (value && !current[key].trim()) {
            next[key] = value;
            filled.add(key);
          }
        }
        return next;
      });
      setFilledKeys(filled);
      setReading("filled");
    } catch (uploadError) {
      setReading("idle");
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload that resume.");
    }
  }

  async function chooseWork(files: FileList | null) {
    const chosen = Array.from(files ?? []).slice(0, MAX_WORK_FILES - work.length);
    const problem = chosen.map((file) => fileProblem(file, "work")).find(Boolean);
    if (problem) return setError(problem);
    setError(null);
    setUploadingWork(true);
    try {
      const uploaded = await Promise.all(chosen.map((file) => uploadTalentFile(workspaceId, candidateId, file, "work")));
      setWork((current) => [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload those files.");
    } finally {
      setUploadingWork(false);
    }
  }

  function cancel() {
    const uploaded = [resume, ...work].filter((file): file is UploadedFile => Boolean(file)).map((file) => file.path);
    if (!editing && uploaded.length) void discardUploadsAction(uploaded);
    onClose();
  }

  function save() {
    setError(null);
    startSave(async () => {
      const payload = { ...fields, links: fields.links.filter((link) => link.trim()) };
      const result = editing
        ? await updateCandidateAction(candidateId, payload)
        : await createCandidateAction({ candidateId, fields: payload, files: [resume, ...work].filter((file): file is UploadedFile => Boolean(file)) });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  const field = (key: keyof Omit<Fields, "links" | "notes">, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {label}
        {filledKeys.has(key) ? <span className="font-mono text-[9px] uppercase tracking-wider text-[#a9b8ff]">from resume</span> : null}
      </span>
      <Input
        value={fields[key]}
        onChange={(event) => set(key, event.target.value)}
        className={cn("mt-1", filledKeys.has(key) && "border-primary/60")}
        {...props}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && cancel()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit candidate" : "Add a candidate"}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="popover-shadow flex max-h-[94dvh] w-full flex-col border border-border bg-card sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="eyebrow">Talent Bank</p>
            <h2 className="mt-1 text-lg font-semibold">{editing ? `Edit ${candidate!.full_name}` : "Add a candidate"}</h2>
          </div>
          <button type="button" onClick={cancel} aria-label="Close" className="grid h-9 w-9 place-items-center hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {!editing ? (
            <div>
              <input ref={resumeInput} type="file" accept={RESUME_ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => void chooseResume(event.target.files?.[0])} />
              <button
                type="button"
                onClick={() => resumeInput.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void chooseResume(event.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex w-full items-center gap-4 border border-dashed p-4 text-left transition-colors",
                  reading === "filled" ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center border border-primary/40 bg-primary/15">
                  {reading === "uploading" || reading === "reading" ? <Loader2 className="h-5 w-5 animate-spin text-primary-hover" /> : <ScanText className="h-5 w-5 text-[#a9b8ff]" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {resume ? resume.name : "Drop their resume here"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {reading === "uploading"
                      ? "Uploading…"
                      : reading === "reading"
                        ? "Reading it and filling in what it says…"
                        : reading === "filled"
                          ? filledKeys.size
                            ? `Filled in ${filledKeys.size} ${filledKeys.size === 1 ? "detail" : "details"}, marked below. Check them before saving.`
                            : "Read it, but found nothing new to fill in."
                          : reading === "unreadable"
                            ? "Saved, but it can't be read automatically (Word files and scans). Fill in the details."
                            : "PDF or Word. A PDF fills in the name, email, phone and more for you."}
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("fullName", "Name (needed)", { required: true, autoFocus: editing, placeholder: "Full name" })}</div>
            {field("email", "Email", { type: "email", placeholder: "name@example.com" })}
            {field("phone", "Phone", { type: "tel", placeholder: "+91 …" })}
            {field("role", "Role they fit", { placeholder: "e.g. Content designer" })}
            {field("location", "City", { placeholder: "e.g. Bengaluru" })}
            {field("linkedinUrl", "LinkedIn", { placeholder: "linkedin.com/in/…" })}
            {field("source", "Where they came from", { placeholder: "Referral, LinkedIn, event…" })}
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Proof of work: links</p>
            <div className="mt-1 space-y-2">
              {fields.links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={link}
                    placeholder="Portfolio, GitHub, Behance, a live project…"
                    onChange={(event) => setFields((current) => ({ ...current, links: current.links.map((item, i) => (i === index ? event.target.value : item)) }))}
                  />
                  {fields.links.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setFields((current) => ({ ...current, links: current.links.filter((_, i) => i !== index) }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {fields.links.length < MAX_LINKS ? (
                <button type="button" onClick={() => setFields((current) => ({ ...current, links: [...current.links, ""] }))} className="flex items-center gap-1 text-xs text-primary-hover hover:underline">
                  <Plus className="h-3.5 w-3.5" />
                  Another link
                </button>
              ) : null}
            </div>
          </div>

          {!editing ? (
            <div>
              <p className="text-xs text-muted-foreground">Proof of work: files (up to {MAX_WORK_FILES})</p>
              <input ref={workInput} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => void chooseWork(event.target.files)} />
              <div className="mt-1 flex flex-wrap gap-2">
                {work.map((file) => (
                  <span key={file.path} className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    {file.name}
                  </span>
                ))}
                {work.length < MAX_WORK_FILES ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploadingWork} onClick={() => workInput.current?.click()}>
                    {uploadingWork ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Add files
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="block text-xs text-muted-foreground">
            Notes
            <Textarea value={fields.notes} onChange={(event) => set("notes", event.target.value)} rows={3} placeholder="First impressions, salary talk, when to reach out again…" className="mt-1" />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p role="alert" className="min-w-0 text-xs text-destructive">
            {error}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !fields.fullName.trim() || reading === "uploading" || reading === "reading" || uploadingWork}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add to New"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
