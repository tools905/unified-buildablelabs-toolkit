"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QaResult } from "@/components/resources/qa-result";
import { endQaAttemptEarlyAction, submitQaAnswerAction } from "@/app/tools/resources/qa-actions";
import type { QaAttemptPublic } from "@/lib/services/qa-service";
import type { QaEndReason } from "@/lib/validation/qa-schema";

// Any fullscreen/visibility churn in the moment the session opens (the
// fullscreen transition from the Start click, React re-mounting the effect in
// development) would otherwise register as the user "leaving" before they've
// even seen the first question.
const PROCTOR_SETTLE_MS = 1000;

function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function QaSession({
  initialAttempt,
  onExit,
}: {
  initialAttempt: QaAttemptPublic;
  onExit: () => void;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [endReason, setEndReason] = useState<QaEndReason | null>(null);
  const [isPending, startTransition] = useTransition();

  // Anti-cheat proctoring: a web page can't actually prevent tab/app switching
  // (no browser API grants that), so this detects it instead — one warning,
  // then the attempt is force-completed on the next violation. Refs (not
  // state) so the event handlers below always see current values without
  // re-subscribing on every render.
  const violationCountRef = useRef(0);
  const endingRef = useRef(false);
  const coalesceRef = useRef(false);

  const deadlineMs = useMemo(
    () => new Date(attempt.startedAt).getTime() + attempt.timeLimitSeconds * 1000,
    [attempt.startedAt, attempt.timeLimitSeconds],
  );
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (attempt.status !== "in_progress") return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !endingRef.current) {
        endingRef.current = true;
        setEndReason("timeout");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [attempt.status, deadlineMs]);

  // Single place that actually closes out the attempt, whichever way it ended.
  // The server action is idempotent, so a duplicate call (React re-running
  // this effect in development) is harmless.
  useEffect(() => {
    if (!endReason || attempt.status !== "in_progress") return;
    startTransition(async () => {
      try {
        const result = await endQaAttemptEarlyAction(attempt.id, endReason);
        setAttempt(result);
      } catch {
        // best-effort — the session is over locally either way
      }
    });
  }, [endReason, attempt.status, attempt.id]);

  useEffect(() => {
    if (attempt.status !== "in_progress") return;

    violationCountRef.current = 0;
    endingRef.current = false;
    let settled = false;
    const settleTimer = setTimeout(() => {
      settled = true;
    }, PROCTOR_SETTLE_MS);

    function triggerViolation() {
      if (!settled || endingRef.current || coalesceRef.current) return;
      // Leaving fullscreen and hiding the tab often fire together for the same
      // physical action (e.g. Alt+Tab) — coalesce so that counts once.
      coalesceRef.current = true;
      setTimeout(() => {
        coalesceRef.current = false;
      }, 500);

      violationCountRef.current += 1;
      if (violationCountRef.current === 1) {
        setShowLeaveWarning(true);
        return;
      }

      endingRef.current = true;
      setEndReason("violation");
    }

    function handleVisibilityChange() {
      if (document.hidden) triggerViolation();
    }
    function handleFullscreenChange() {
      // Exiting fullscreen while still on this tab (e.g. pressed Escape) is its
      // own violation; when it's a side effect of switching tabs,
      // visibilitychange above already counted it.
      if (!document.fullscreenElement && !document.hidden) triggerViolation();
    }
    function preventClipboardOrContextMenu(event: Event) {
      event.preventDefault();
    }
    function confirmBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", preventClipboardOrContextMenu);
    document.addEventListener("copy", preventClipboardOrContextMenu);
    document.addEventListener("paste", preventClipboardOrContextMenu);
    window.addEventListener("beforeunload", confirmBeforeUnload);

    return () => {
      clearTimeout(settleTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("contextmenu", preventClipboardOrContextMenu);
      document.removeEventListener("copy", preventClipboardOrContextMenu);
      document.removeEventListener("paste", preventClipboardOrContextMenu);
      window.removeEventListener("beforeunload", confirmBeforeUnload);
    };
  }, [attempt.status, attempt.id]);

  // Deliberately not part of the proctoring cleanup above: exiting fullscreen
  // there would fire `fullscreenchange` right as the listeners are being
  // re-attached, which reads as a violation the moment the test opens.
  useEffect(() => {
    if (attempt.status === "in_progress") return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [attempt.status]);

  function resumeAfterWarning() {
    setShowLeaveWarning(false);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (attempt.status === "completed") {
    return <QaResult attempt={attempt} onRetake={onExit} />;
  }

  const pendingTurn = attempt.turns.find((turn) => turn.selectedOptionId === null);

  if (!pendingTurn) {
    return <p className="text-muted-foreground">Something went wrong loading this question.</p>;
  }

  const answeredCount = attempt.turns.filter((turn) => turn.selectedOptionId !== null).length;
  const isRunningOut = secondsLeft <= 60;

  function handleSubmit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitQaAnswerAction(attempt.id, selected);
        setAttempt(result);
        setSelected(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit your answer.");
      }
    });
  }

  return (
    // Covers the app shell — the sidebar and page chrome are a way out of the
    // test, and a distraction from it.
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Question {pendingTurn.turnNumber} of {attempt.totalQuestions}
          </span>
          <div className="flex items-center gap-2">
            {pendingTurn.isChallenge ? (
              <Badge className="border-primary/40 bg-primary/10 text-primary">Follow-up challenge</Badge>
            ) : null}
            <span
              className={`rounded-md border px-2 py-1 font-mono text-sm tabular-nums ${
                isRunningOut ? "border-destructive/40 text-destructive" : "border-border text-foreground"
              }`}
              aria-label="Time remaining"
            >
              {formatRemaining(secondsLeft)}
            </span>
          </div>
        </div>
        <p className="mb-4 text-lg font-medium">{pendingTurn.question}</p>
        <div className="mb-4 space-y-2">
          {pendingTurn.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              className={`block w-full rounded-md border px-4 py-2 text-left text-sm transition-colors ${
                selected === option.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
              }`}
            >
              <span className="mr-2 font-semibold">{option.id}.</span>
              {option.text}
            </button>
          ))}
        </div>
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {answeredCount} of {attempt.totalQuestions} answered
          </span>
          <Button onClick={handleSubmit} disabled={!selected || isPending}>
            {isPending ? "Submitting…" : "Submit answer"}
          </Button>
        </div>
      </div>

      {showLeaveWarning && !endReason ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-card p-6 text-center shadow-lg">
            <p className="mb-2 text-lg font-semibold text-destructive">Don&apos;t leave the test</p>
            <p className="mb-5 text-sm text-muted-foreground">
              You switched away or exited fullscreen. This is your only warning — doing it again will end this
              session immediately and score it as-is.
            </p>
            <Button onClick={resumeAfterWarning}>Resume test</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
