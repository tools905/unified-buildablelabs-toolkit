"use client";

import { useCallback, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/app/tools/content-board/actions";
import { indiaTomorrow, needMessage, type ScheduleNeed } from "@/lib/utils/posting-slots";

export type ScheduleAnswer = { scheduledFor?: string; overLimitReason?: string };
// Returned when the person backs out of the dialog: undo the change quietly, no error to show.
export const SCHEDULE_CANCELLED = "__schedule_cancelled__";

// Asks for what a change needs before it can go through (see lib/utils/posting-slots.ts): the day a
// Newsletter (or other non-Instagram/LinkedIn) post goes out, or why a day is getting more than 2
// Instagram or LinkedIn posts. Render `dialog` somewhere on the page; `ask` waits for the answer.
export function useSchedulePrompt() {
  const [open, setOpen] = useState<{ need: ScheduleNeed; resolve: (answer: ScheduleAnswer | null) => void } | null>(null);
  const ask = useCallback((need: ScheduleNeed) => new Promise<ScheduleAnswer | null>((resolve) => setOpen({ need, resolve })), []);
  const finish = (answer: ScheduleAnswer | null) => {
    open?.resolve(answer);
    setOpen(null);
  };
  const dialog = open ? <ScheduleDialog key={JSON.stringify(open.need)} need={open.need} onDone={finish} /> : null;

  // Runs `action`; if it needs a day or a reason, asks and runs it again with the answer.
  const withPrompt = useCallback(
    async (action: (answer: ScheduleAnswer) => Promise<ActionResult>): Promise<ActionResult> => {
      let answer: ScheduleAnswer = {};
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await action(answer);
        if (result.ok || !result.need) return result;
        const more = await ask(result.need);
        if (!more) return { ok: false, error: SCHEDULE_CANCELLED };
        answer = { ...answer, ...more };
      }
      return { ok: false, error: "That still couldn't be saved. Please try again." };
    },
    [ask],
  );

  return { ask, withPrompt, dialog };
}

function ScheduleDialog({ need, onDone }: { need: ScheduleNeed; onDone: (answer: ScheduleAnswer | null) => void }) {
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  // Today in India: the earliest day it can go out.
  const [today] = useState(() => indiaTomorrow(new Date(Date.now() - 86_400_000)));
  const asksDay = need.kind === "day";
  const ready = asksDay ? Boolean(day) : reason.trim().length >= 5;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(event) => event.target === event.currentTarget && onDone(null)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-prompt-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onDone(asksDay ? { scheduledFor: day } : { overLimitReason: reason.trim() });
        }}
        className="popover-shadow w-full border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md"
      >
        <h2 id="schedule-prompt-title" className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4 text-primary-hover" />
          {asksDay ? "When does this go out?" : "This day is full"}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {asksDay ? (
            <>
              <span className="text-foreground">&ldquo;{need.ideaTitle || "Untitled"}&rdquo;</span> isn&apos;t an Instagram or LinkedIn post, so it doesn&apos;t
              get a day by itself. Pick the day it goes out, so everyone knows.
            </>
          ) : (
            needMessage(need)
          )}
        </p>
        {asksDay ? (
          <Input type="date" required min={today} value={day} onChange={(event) => setDay(event.target.value)} className="mt-4" autoFocus />
        ) : (
          <>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why does this need to go out on this day?"
              className="mt-4"
              autoFocus
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">The admins get an email with your reason.</p>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onDone(null)}>
            {asksDay ? "Cancel" : "Pick another day"}
          </Button>
          <Button type="submit" disabled={!ready}>
            {asksDay ? "Save the day" : "Add anyway"}
          </Button>
        </div>
      </form>
    </div>
  );
}
