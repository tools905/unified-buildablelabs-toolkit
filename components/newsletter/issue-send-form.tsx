"use client";

import { useEffect, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { scheduleIssueSendAction, sendTestIssueAction } from "@/app/tools/newsletter/actions";

const MAX_SUBJECT_LENGTH = 200;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Subject, preview text and timing for emailing one published post, with a test send and a
// confirmation step before it goes to everyone.
export function IssueSendForm({
  postId,
  title,
  defaultSubject,
  defaultPreviewText,
  recipients,
  previewHtml,
  cadenceNote,
  cadenceWarning,
}: {
  postId: string;
  title: string;
  defaultSubject: string;
  defaultPreviewText: string;
  recipients: number;
  previewHtml: string;
  cadenceNote: string;
  cadenceWarning: string | null;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [previewText, setPreviewText] = useState(defaultPreviewText);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!confirming) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setConfirming(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming, pending]);

  function scheduledDate() {
    return when === "later" && scheduledFor ? new Date(scheduledFor) : null;
  }

  function problem() {
    if (recipients === 0) return "There are no confirmed subscribers yet, so there's no one to email.";
    if (!subject.trim()) return "Add a subject line.";
    if (subject.length > MAX_SUBJECT_LENGTH) return `Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`;
    if (when === "later") {
      const date = scheduledDate();
      if (!date || Number.isNaN(date.getTime())) return "Pick the date and time to send it.";
      if (date.getTime() <= Date.now()) return "Pick a time in the future, or choose Send now.";
    }
    return null;
  }

  function sendTest() {
    setNotice(null);
    startTransition(async () => {
      const result = await sendTestIssueAction(postId, { subject, previewText });
      setNotice({ tone: result.ok ? "ok" : "error", text: result.message });
    });
  }

  function review() {
    const issue = problem();
    if (issue) {
      setNotice({ tone: "error", text: issue });
      return;
    }
    setNotice(null);
    setConfirming(true);
  }

  function send() {
    const date = scheduledDate();
    startTransition(async () => {
      const result = await scheduleIssueSendAction(postId, {
        subject,
        previewText,
        scheduledAt: date ? date.toISOString() : null,
      });
      // On success the action moves on to the Sends page; only a problem comes back here.
      if (result?.error) {
        setNotice({ tone: "error", text: result.error });
        setConfirming(false);
      }
    });
  }

  const date = scheduledDate();
  const formattedDate = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-6">
        <div className="border border-border bg-card px-5 py-4 text-sm">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-muted-foreground">
            Goes to {plural(recipients, "confirmed subscriber")} as a teaser with a link to the full issue on the
            website. {cadenceNote}
          </p>
          {cadenceWarning ? <p className="mt-2 text-muted-foreground">{cadenceWarning}</p> : null}
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Subject</span>
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={MAX_SUBJECT_LENGTH} />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Preview text</span>
          <span className="mb-1.5 block text-muted-foreground">Shown after the subject in most inboxes.</span>
          <Input value={previewText} onChange={(event) => setPreviewText(event.target.value)} maxLength={200} />
        </label>

        <fieldset className="text-sm">
          <legend className="mb-1.5 font-medium text-foreground">When</legend>
          <div className="flex gap-1">
            {(["now", "later"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWhen(option)}
                aria-pressed={when === option}
                className={cn(
                  "border border-transparent px-4 py-2.5 font-semibold text-muted-foreground transition-colors",
                  when === option && "border-border bg-card text-foreground",
                )}
              >
                {option === "now" ? "Send now" : "Schedule"}
              </button>
            ))}
          </div>
          {when === "later" ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-muted-foreground">Date and time ({timeZone})</span>
              <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
            </label>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={review} disabled={pending}>
            <Send className="h-3.5 w-3.5" />
            {when === "now" ? "Send to subscribers…" : "Schedule…"}
          </Button>
          <Button type="button" variant="outline" onClick={sendTest} disabled={pending}>
            Send a test to me
          </Button>
        </div>

        <p
          aria-live="polite"
          className={cn("text-sm", notice?.tone === "error" ? "text-destructive" : "text-muted-foreground")}
        >
          {notice?.text ?? ""}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Preview <span className="text-quiet">· subject: {subject.trim() || defaultSubject}</span>
        </p>
        <iframe
          title="Email preview"
          srcDoc={previewHtml}
          sandbox=""
          className="h-[720px] w-full border border-border bg-white"
        />
      </div>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-send-title"
        >
          <div className="popover-shadow w-full max-w-md border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h2 id="confirm-send-title" className="text-base font-semibold">
                {when === "now" ? "Email this issue now?" : "Schedule this issue?"}
              </h2>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-muted-foreground">
              {when === "now" ? (
                <p>
                  <span className="font-semibold text-foreground">{title}</span> goes to{" "}
                  {plural(recipients, "subscriber")} straight away. This can&apos;t be undone.
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-foreground">{title}</span> goes out {formattedDate} to everyone
                  subscribed at that moment (currently {plural(recipients, "subscriber")}). You can cancel it until then.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" onClick={send} disabled={pending} autoFocus>
                {pending ? "Working…" : when === "now" ? "Send now" : "Schedule"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
