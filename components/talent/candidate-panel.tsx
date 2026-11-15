"use client";

import { useRef, useState, useTransition } from "react";
import { Download, ExternalLink, Eye, FileText, Link2, Loader2, Mail, MapPin, Paperclip, Pencil, Phone, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/talent/avatar";
import { CandidateForm } from "@/components/talent/candidate-form";
import { fileProblem, uploadTalentFile } from "@/components/talent/upload";
import { addFilesAction, deleteCandidateAction, fileLinkAction, removeFileAction, setShelfAction } from "@/app/tools/talent-bank/actions";
import type { TalentCandidate, TalentFile } from "@/lib/services/talent-service";
import { ACCEPT_ATTRIBUTE, daysUntilPurge, hostLabel, MAX_WORK_FILES, purgeDate, SHELVES, type TalentShelf } from "@/lib/utils/talent";
import { formatBytes } from "@/lib/utils/downloads";
import { cn } from "@/lib/utils/cn";

// One candidate, in a panel from the right (full screen on phones): their shelf, how to reach them,
// their resume and work, what they wrote on the form, and notes. Rejecting starts the 60-day clock.
export function CandidatePanel({ candidate, workspaceId, onClose }: { candidate: TalentCandidate; workspaceId: string; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resume = candidate.files.find((file) => file.kind === "resume");
  const work = candidate.files.filter((file) => file.kind === "work");

  const act = (work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else after?.();
    });
  };

  async function openFile(file: TalentFile, inline: boolean) {
    const result = await fileLinkAction(file.id, inline);
    if (!result.ok) return setError(result.error);
    if (inline) window.open(result.url, "_blank", "noopener");
    else window.location.assign(result.url);
  }

  async function addFiles(files: FileList | null, kind: "resume" | "work") {
    const chosen = Array.from(files ?? []);
    const problem = chosen.map((file) => fileProblem(file, kind)).find(Boolean);
    if (problem) return setError(problem);
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(chosen.map((file) => uploadTalentFile(workspaceId, candidate.id, file, kind)));
      const result = await addFilesAction(candidate.id, uploaded);
      if (!result.ok) setError(result.error);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't upload that.");
    } finally {
      setUploading(false);
    }
  }

  if (editing) return <CandidateForm workspaceId={workspaceId} candidate={candidate} onClose={() => setEditing(false)} />;

  const contact = [
    candidate.email ? { icon: Mail, label: candidate.email, href: `mailto:${candidate.email}` } : null,
    candidate.phone ? { icon: Phone, label: candidate.phone, href: `tel:${candidate.phone.replace(/\s/g, "")}` } : null,
    candidate.linkedin_url ? { icon: Link2, label: hostLabel(candidate.linkedin_url) + new URL(candidate.linkedin_url).pathname, href: candidate.linkedin_url } : null,
    candidate.location ? { icon: MapPin, label: candidate.location, href: null } : null,
  ].filter(Boolean) as { icon: typeof Mail; label: string; href: string | null }[];

  const fileRow = (file: TalentFile) => (
    <li key={file.id} className="flex items-center gap-3 border border-border px-3 py-2">
      {file.kind === "resume" ? <FileText className="h-4 w-4 shrink-0 text-[#a9b8ff]" /> : <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{file.file_name}</span>
        <span className="block text-[11px] text-muted-foreground">{formatBytes(file.size_bytes)}</span>
      </span>
      <Button type="button" size="icon" variant="ghost" aria-label={`View ${file.file_name}`} onClick={() => void openFile(file, true)}>
        <Eye className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`Download ${file.file_name}`} onClick={() => void openFile(file, false)}>
        <Download className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${file.file_name}`} disabled={pending} onClick={() => act(() => removeFileAction(file.id))}>
        <X className="h-4 w-4" />
      </Button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={candidate.full_name} className="popover-shadow flex h-full w-full flex-col border-l border-border bg-card sm:max-w-xl">
        <div className="relative border-b border-border px-5 pb-4 pt-5">
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary-hover via-accent to-transparent" />
          <div className="flex items-start gap-4">
            <Avatar name={candidate.full_name} large />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] tracking-wider text-muted-foreground">BL-{candidate.reference_code}</p>
              <h2 className="truncate text-xl font-semibold">{candidate.full_name}</h2>
              <p className="truncate text-sm text-muted-foreground">{candidate.role || "No role yet"}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Which shelf they're on. */}
          <div className="mt-4 grid grid-cols-4 border border-border p-0.5 text-[11px] sm:text-xs" role="radiogroup" aria-label="Shelf">
            {SHELVES.map((shelf) => (
              <button
                key={shelf.key}
                type="button"
                role="radio"
                aria-checked={candidate.shelf === shelf.key}
                disabled={pending}
                onClick={() => candidate.shelf !== shelf.key && act(() => setShelfAction(candidate.id, shelf.key as TalentShelf))}
                className={cn(
                  "px-1 py-1.5 transition-colors",
                  candidate.shelf === shelf.key
                    ? shelf.key === "rejected"
                      ? "bg-destructive/80 text-white"
                      : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {shelf.label}
              </button>
            ))}
          </div>
          {candidate.shelf === "rejected" && candidate.rejected_at ? (
            <p className="mt-2 text-xs text-amber-400" suppressHydrationWarning>
              Deleted for good on {purgeDate(candidate.rejected_at).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} ({daysUntilPurge(candidate.rejected_at)} days). Move them to another shelf to keep them.
            </p>
          ) : null}
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <section>
            <h3 className="eyebrow mb-2">Contact</h3>
            {contact.length ? (
              <ul className="space-y-1.5">
                {contact.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm">
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {item.href ? (
                      <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="truncate hover:text-primary-hover hover:underline">
                        {item.label}
                      </a>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No contact details yet.</p>
            )}
            {candidate.source ? <p className="mt-2 text-xs text-muted-foreground">Came from: {candidate.source}</p> : null}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="eyebrow">Resume and work</h3>
              <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => void addFiles(event.target.files, resume ? "work" : "resume")} />
              {work.length < MAX_WORK_FILES ? (
                <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()} className="gap-1.5">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {resume ? "Add work file" : "Add resume"}
                </Button>
              ) : null}
            </div>
            {candidate.files.length ? <ul className="space-y-1.5">{[...(resume ? [resume] : []), ...work].map(fileRow)}</ul> : <p className="text-sm text-muted-foreground">No files yet.</p>}
            {candidate.links.length ? (
              <ul className="mt-3 space-y-1.5">
                {candidate.links.map((link) => (
                  <li key={link}>
                    <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:text-primary-hover">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {candidate.answers?.built || candidate.answers?.why ? (
            <section className="space-y-3">
              <h3 className="eyebrow">From their application</h3>
              {candidate.answers.built ? (
                <div>
                  <p className="text-xs text-muted-foreground">Something they built and are proud of</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{candidate.answers.built}</p>
                </div>
              ) : null}
              {candidate.answers.why ? (
                <div>
                  <p className="text-xs text-muted-foreground">Why BuildableLabs</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{candidate.answers.why}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section>
            <h3 className="eyebrow mb-2">Notes</h3>
            <p className={cn("whitespace-pre-wrap text-sm", !candidate.notes && "text-muted-foreground")}>{candidate.notes || "No notes yet. Use Edit to add some."}</p>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-[11px] text-quiet" suppressHydrationWarning>
            {candidate.added_via === "form" ? "Applied through the link" : "Added by hand"} · {new Date(candidate.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs">Delete for good, with files?</span>
              <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => act(() => deleteCandidateAction(candidate.id), onClose)}>
                Delete
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete now
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
