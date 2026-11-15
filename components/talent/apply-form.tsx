"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Paperclip, Plus, X } from "lucide-react";
import { ApplyBackdrop } from "@/components/talent/apply-backdrop";
import { fileProblem } from "@/components/talent/upload";
import { createClient } from "@/lib/supabase/client";
import { BASE_PATH } from "@/lib/utils/app-url";
import { ACCEPT_ATTRIBUTE, MAX_LINKS, MAX_WORK_FILES, RESUME_ACCEPT_ATTRIBUTE } from "@/lib/utils/talent";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { code: "01", label: "Identity" },
  { code: "02", label: "Signal" },
  { code: "03", label: "Focus" },
  { code: "04", label: "Proof of work" },
  { code: "05", label: "Intent" },
];
const ROLES = ["Design", "Engineering", "AI / ML", "Content", "Growth", "Operations"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Answers = { fullName: string; email: string; phone: string; role: string; location: string; linkedinUrl: string; built: string; why: string };

// The application form behind Talent Bank's link: five short steps on a dark, quietly moving
// backdrop, then the files go straight to private storage and the answers to the New shelf.
export function ApplyForm({ token }: { token: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ fullName: "", email: "", phone: "", role: "", location: "", linkedinUrl: "", built: "", why: "" });
  const [links, setLinks] = useState<string[]>([""]);
  const [resume, setResume] = useState<File | null>(null);
  const [work, setWork] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "sending" | "done">("form");
  const [log, setLog] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const startedAt = useRef(0);
  const resumeInput = useRef<HTMLInputElement>(null);
  const workInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const set = (key: keyof Answers) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setAnswers((current) => ({ ...current, [key]: event.target.value }));
  const first = answers.fullName.trim().split(/\s+/)[0] ?? "";

  // What stops this step from going on, if anything.
  function blocker(index: number) {
    if (index === 0 && answers.fullName.trim().length < 2) return "Tell us your name to begin.";
    if (index === 1 && !EMAIL.test(answers.email.trim())) return "We need an email we can reach you on.";
    if (index === 4 && !consent) return "Tick the box so we can keep your details.";
    return null;
  }

  function next() {
    const problem = blocker(step);
    if (problem) return setError(problem);
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else void send();
  }

  async function send() {
    setPhase("sending");
    setError(null);
    const say = (line: string) => setLog((current) => [...current, line]);
    setLog(["Opening a secure channel"]);
    try {
      const files = [...(resume ? [{ file: resume, kind: "resume" as const }] : []), ...work.map((file) => ({ file, kind: "work" as const }))];
      const prepared = await fetch(`${BASE_PATH}/api/apply/${token}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.map(({ file, kind }) => ({ name: file.name, size: file.size, type: file.type, kind })) }),
      }).then((response) => response.json());
      if (!prepared.ok) throw new Error(prepared.message);

      const storage = createClient().storage.from("talent-files");
      const sent: { path: string; name: string; kind: "resume" | "work" }[] = [];
      for (const [index, { file, kind }] of files.entries()) {
        say(kind === "resume" ? `Uploading your resume · ${file.name}` : `Uploading work · ${file.name}`);
        const target = prepared.uploads[index];
        const { error: uploadError } = await storage.uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
        if (uploadError) throw new Error(`We couldn't upload ${file.name}. Please try again.`);
        sent.push({ path: target.path, name: file.name, kind });
      }

      say("Writing your profile");
      const result = await fetch(`${BASE_PATH}/api/apply/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: prepared.candidateId,
          answers: { ...answers, links: links.filter((link) => link.trim()), consent },
          files: sent,
          website: honeypot,
          elapsedMs: Date.now() - startedAt.current,
        }),
      }).then((response) => response.json());
      if (!result.ok) throw new Error(result.message);
      say("Transmitted");
      setReference(result.reference);
      setTimeout(() => setPhase("done"), 700);
    } catch (sendError) {
      setPhase("form");
      setError(sendError instanceof Error && sendError.message ? sendError.message : "Something went wrong. Please try again.");
    }
  }

  function chooseResume(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file, "resume");
    if (problem) return setError(problem);
    setError(null);
    setResume(file);
  }

  function chooseWork(files: FileList | null) {
    const chosen = Array.from(files ?? []).slice(0, MAX_WORK_FILES - work.length);
    const problem = chosen.map((file) => fileProblem(file, "work")).find(Boolean);
    if (problem) return setError(problem);
    setError(null);
    setWork((current) => [...current, ...chosen]);
  }

  const label = "font-mono text-[11px] uppercase tracking-[0.22em] text-[#7a8296]";
  const input = "apply-input mt-2 w-full py-3 text-lg text-[#f5f6f8] sm:text-xl";

  if (phase === "done") {
    return (
      <main className="relative grid min-h-dvh place-items-center px-6 py-16 text-[#f5f6f8]">
        <ApplyBackdrop />
        <div className="apply-step relative max-w-lg text-center">
          <div className="relative mx-auto grid h-24 w-24 place-items-center">
            <span className="absolute inset-0 rounded-full border border-[#275bff]/40" />
            <span className="apply-orbit absolute inset-0 rounded-full border-t-2 border-[#7c8cff]" />
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#0b3fde] shadow-[0_0_60px_rgba(39,91,255,0.7)]">
              <Check className="h-7 w-7" />
            </span>
          </div>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-[#275bff]">Application received</p>
          <h1 className="mt-4 font-serif text-4xl italic leading-tight sm:text-5xl">Signal received{first ? `, ${first}` : ""}.</h1>
          <p className="mt-5 text-[#9aa1b2]">
            A person on our team reads every application. If there&apos;s a fit now, we&apos;ll reach out. If not yet, strong profiles stay with us for the roles that come next.
          </p>
          <div className="mx-auto mt-8 inline-flex items-center gap-3 border border-[#275bff]/40 bg-[#0b3fde]/10 px-5 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a8296]">Your reference</span>
            <span className="font-mono text-lg tracking-widest text-[#c9d2ff]">{reference}</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh text-[#f5f6f8]">
      <ApplyBackdrop />
      {/* Progress along the very top. */}
      <div className="fixed inset-x-0 top-0 z-20 h-[2px] bg-white/5">
        <div className="h-full bg-gradient-to-r from-[#0b3fde] via-[#275bff] to-[#7c8cff] shadow-[0_0_12px_#275bff] transition-[width] duration-500" style={{ width: `${((step + (phase === "sending" ? 1 : 0)) / STEPS.length) * 100}%` }} />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 pt-8 sm:px-10">
        <span className="flex items-center gap-3">
          <span className="font-mono text-xs font-medium tracking-[0.32em]">BUILDABLELABS</span>
          <span className="hidden items-center gap-1.5 border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a8296] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Intake open
          </span>
        </span>
        <span className="font-mono text-xs tabular-nums text-[#7a8296]">
          <span className="text-[#f5f6f8]">{STEPS[step].code}</span> / 0{STEPS.length}
        </span>
      </header>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-24 pt-14 sm:px-10 lg:grid-cols-[220px_1fr] lg:pt-24">
        {/* The steps, as a rail of nodes. */}
        <ol className="hidden lg:block" aria-label="Steps">
          {STEPS.map((item, index) => (
            <li key={item.code} className="relative flex items-center gap-4 pb-9 last:pb-0">
              {index < STEPS.length - 1 ? <span aria-hidden className={cn("absolute left-[7px] top-5 h-full w-px", index < step ? "bg-[#275bff]" : "bg-white/10")} /> : null}
              <span
                className={cn(
                  "relative grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border",
                  index < step ? "border-[#275bff] bg-[#275bff]" : index === step ? "border-[#7c8cff] shadow-[0_0_14px_#275bff]" : "border-white/20",
                )}
              >
                {index === step ? <span className="h-1.5 w-1.5 rounded-full bg-[#c9d2ff]" /> : null}
              </span>
              <button
                type="button"
                disabled={index > step || phase !== "form"}
                onClick={() => setStep(index)}
                className={cn("whitespace-nowrap text-left font-mono text-[11px] uppercase tracking-[0.2em]", index === step ? "text-[#f5f6f8]" : index < step ? "text-[#9aa1b2] hover:text-white" : "text-[#4a5162]")}
              >
                {item.code} · {item.label}
              </button>
            </li>
          ))}
        </ol>

        <form
          key={step}
          className="apply-step max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            next();
          }}
        >
          {/* Left empty by people; filled by bots. */}
          <input tabIndex={-1} autoComplete="off" aria-hidden name="website" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#275bff]">
            {STEPS[step].code} — {STEPS[step].label}
          </p>

          {phase === "sending" ? (
            <div className="mt-6" aria-live="polite">
              <h1 className="font-serif text-4xl italic leading-[1.1] sm:text-6xl">Transmitting.</h1>
              <ul className="mt-8 space-y-3 font-mono text-sm">
                {log.map((line, index) => (
                  <li key={index} className="apply-step flex items-center gap-3 text-[#9aa1b2]">
                    {index === log.length - 1 && line !== "Transmitted" ? (
                      <span className="apply-orbit h-3.5 w-3.5 rounded-full border-2 border-[#275bff] border-t-transparent" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-[#7c8cff]" />
                    )}
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {step === 0 ? (
                <>
                  <h1 className="mt-6 font-serif text-4xl italic leading-[1.1] sm:text-6xl">First, who are we meeting?</h1>
                  <p className="mt-4 max-w-lg text-[#9aa1b2]">Five short steps. Your answers go straight to the people who build BuildableLabs, nowhere else.</p>
                  <label className="mt-10 block">
                    <span className={label}>Full name</span>
                    <input autoFocus value={answers.fullName} onChange={set("fullName")} autoComplete="name" placeholder="Ada Lovelace" className={input} />
                  </label>
                </>
              ) : step === 1 ? (
                <>
                  <h1 className="mt-6 font-serif text-4xl italic leading-[1.1] sm:text-6xl">Where can we reach you{first ? `, ${first}` : ""}?</h1>
                  <div className="mt-10 grid gap-8 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Email</span>
                      <input autoFocus type="email" value={answers.email} onChange={set("email")} autoComplete="email" placeholder="you@domain.com" className={input} />
                    </label>
                    <label className="block">
                      <span className={label}>Phone · optional</span>
                      <input type="tel" value={answers.phone} onChange={set("phone")} autoComplete="tel" placeholder="+91 98765 43210" className={input} />
                    </label>
                  </div>
                </>
              ) : step === 2 ? (
                <>
                  <h1 className="mt-6 font-serif text-4xl italic leading-[1.1] sm:text-6xl">What do you want to build here?</h1>
                  <div className="mt-8 flex flex-wrap gap-2">
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setAnswers((current) => ({ ...current, role: current.role === role ? "" : role }))}
                        className={cn(
                          "border px-4 py-2 text-sm transition-all",
                          answers.role === role ? "border-[#275bff] bg-[#0b3fde]/30 text-white shadow-[0_0_20px_-6px_#275bff]" : "border-white/15 text-[#9aa1b2] hover:border-white/40 hover:text-white",
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <div className="mt-8 grid gap-8 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={label}>Role, in your words · optional</span>
                      <input value={answers.role} onChange={set("role")} placeholder="e.g. Product designer for AI tools" className={input} />
                    </label>
                    <label className="block">
                      <span className={label}>City · optional</span>
                      <input value={answers.location} onChange={set("location")} autoComplete="address-level2" placeholder="Bengaluru" className={input} />
                    </label>
                    <label className="block">
                      <span className={label}>LinkedIn · optional</span>
                      <input value={answers.linkedinUrl} onChange={set("linkedinUrl")} placeholder="linkedin.com/in/you" className={input} />
                    </label>
                  </div>
                </>
              ) : step === 3 ? (
                <>
                  <h1 className="mt-6 font-serif text-4xl italic leading-[1.1] sm:text-6xl">Show us the work.</h1>
                  <p className="mt-4 max-w-lg text-[#9aa1b2]">A resume, and anything that shows how you think: a portfolio, a repo, a live product. All optional, all private.</p>
                  <input ref={resumeInput} type="file" accept={RESUME_ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => chooseResume(event.target.files?.[0])} />
                  <button
                    type="button"
                    onClick={() => resumeInput.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      chooseResume(event.dataTransfer.files?.[0]);
                    }}
                    className={cn(
                      "group relative mt-8 flex w-full items-center gap-5 border p-6 text-left transition-all",
                      resume ? "border-[#275bff]/60 bg-[#0b3fde]/10" : "border-white/10 bg-white/[0.02] hover:border-[#275bff]/50 hover:bg-[#0b3fde]/5",
                    )}
                  >
                    {/* Corner brackets, like a viewfinder. */}
                    {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((corner) => (
                      <span key={corner} aria-hidden className={cn("absolute h-3 w-3 border-[#7c8cff]", corner)} />
                    ))}
                    <span className="grid h-12 w-12 shrink-0 place-items-center border border-[#275bff]/40 bg-[#0b3fde]/20">
                      {resume ? <Check className="h-5 w-5 text-[#c9d2ff]" /> : <FileText className="h-5 w-5 text-[#7c8cff]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base">{resume ? resume.name : "Drop your resume"}</span>
                      <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a8296]">{resume ? "Tap to replace" : "PDF or Word · up to 15 MB"}</span>
                    </span>
                    {resume ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Remove resume"
                        onClick={(event) => {
                          event.stopPropagation();
                          setResume(null);
                        }}
                        className="ml-auto grid h-8 w-8 place-items-center text-[#7a8296] hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>

                  <div className="mt-8">
                    <span className={label}>Links to your work</span>
                    {links.map((link, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          value={link}
                          onChange={(event) => setLinks((current) => current.map((item, i) => (i === index ? event.target.value : item)))}
                          placeholder="github.com/you · behance.net/you · yourproduct.com"
                          className={input}
                        />
                        {links.length > 1 ? (
                          <button type="button" aria-label="Remove link" onClick={() => setLinks((current) => current.filter((_, i) => i !== index))} className="mt-2 text-[#7a8296] hover:text-white">
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {links.length < MAX_LINKS ? (
                      <button type="button" onClick={() => setLinks((current) => [...current, ""])} className="mt-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#7c8cff] hover:text-white">
                        <Plus className="h-3.5 w-3.5" />
                        Another link
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-8">
                    <span className={label}>Work files · up to {MAX_WORK_FILES}</span>
                    <input ref={workInput} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => chooseWork(event.target.files)} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {work.map((file, index) => (
                        <span key={index} className="flex items-center gap-2 border border-white/15 px-3 py-1.5 text-sm">
                          <Paperclip className="h-3.5 w-3.5 text-[#7c8cff]" />
                          <span className="max-w-[12rem] truncate">{file.name}</span>
                          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setWork((current) => current.filter((_, i) => i !== index))} className="text-[#7a8296] hover:text-white">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      {work.length < MAX_WORK_FILES ? (
                        <button type="button" onClick={() => workInput.current?.click()} className="border border-dashed border-white/20 px-3 py-1.5 text-sm text-[#9aa1b2] hover:border-[#275bff] hover:text-white">
                          + Add files
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="mt-6 font-serif text-4xl italic leading-[1.1] sm:text-6xl">Last thing. Why us, why now?</h1>
                  <label className="mt-10 block">
                    <span className={label}>Something you built that you&apos;re proud of · optional</span>
                    <textarea autoFocus value={answers.built} onChange={set("built")} rows={3} maxLength={2000} placeholder="What it was, what you did, what happened." className={cn(input, "resize-none text-base sm:text-lg")} />
                  </label>
                  <label className="mt-8 block">
                    <span className={label}>Why BuildableLabs · optional</span>
                    <textarea value={answers.why} onChange={set("why")} rows={3} maxLength={2000} placeholder="Be honest. We read every word." className={cn(input, "resize-none text-base sm:text-lg")} />
                  </label>
                  <label className="mt-8 flex cursor-pointer items-start gap-3 text-sm text-[#9aa1b2]">
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#275bff]" />
                    <span>BuildableLabs may keep my details and files to consider me for this and future roles. I can ask for them to be deleted at any time.</span>
                  </label>
                </>
              )}

              {error ? (
                <p role="alert" className="mt-6 text-sm text-[#ff8197]">
                  {error}
                </p>
              ) : null}

              <div className="mt-12 flex items-center gap-4">
                <button
                  type="submit"
                  className="group relative inline-flex items-center gap-3 overflow-hidden bg-gradient-to-r from-[#0b3fde] to-[#275bff] px-7 py-4 text-sm font-semibold tracking-wide shadow-[0_10px_40px_-12px_#275bff] transition-shadow hover:shadow-[0_14px_50px_-10px_#275bff]"
                >
                  <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <span className="relative">{step === STEPS.length - 1 ? "Transmit application" : "Continue"}</span>
                  <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(step - 1);
                    }}
                    className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a8296] hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                ) : (
                  <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-[#4a5162] sm:inline">Press Enter ↵</span>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
