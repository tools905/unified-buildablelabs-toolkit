"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { activityTone, buildActivity, formatWhen } from "@/components/content-board/activity";
import { CONTENT_COLUMNS, type IdeaPanelData } from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

const COLLAPSED_COUNT = 6;

const TONE_STYLES = {
  waiting: {
    card: "border-red-500/50 bg-red-500/10",
    text: "text-red-400",
    Icon: CircleAlert,
  },
  shortlisted: {
    card: "border-emerald-500/50 bg-emerald-500/10",
    text: "text-emerald-400",
    Icon: CircleCheck,
  },
} as const;

export function ActivityTimeline({ data, status }: { data: IdeaPanelData; status: ContentIdeaStatus }) {
  const [showAll, setShowAll] = useState(false);
  const events = buildActivity(data);
  const tone = activityTone(status, data.points.length);
  // With a highlight, the newest event is shown on its own coloured card above the rest:
  // red while reviewed work waits in Feedback, green once it has been shortlisted.
  const latest = tone ? events[0] : undefined;
  const rest = latest ? events.slice(1) : events;
  const visible = showAll ? rest : rest.slice(0, latest ? COLLAPSED_COUNT - 1 : COLLAPSED_COUNT);
  const columnLabel = CONTENT_COLUMNS.find((column) => column.status === status)?.label ?? status;
  const style = tone ? TONE_STYLES[tone] : null;
  const ToneIcon = style?.Icon;

  return (
    <section aria-label="Activity" className="space-y-2">
      <h3 className="text-sm font-semibold">Activity</h3>

      {style && ToneIcon && latest ? (
        <div className={cn("border px-3 py-2.5", style.card)}>
          <p className={cn("mb-1 flex items-center gap-1.5 text-xs font-semibold", style.text)}>
            <ToneIcon className="h-3.5 w-3.5" />
            {tone === "waiting"
              ? "Reviewed, still in Feedback: not shortlisted yet"
              : status === "approved"
                ? "Shortlisted"
                : `Shortlisted · now ${columnLabel}`}
          </p>
          <p className="text-sm">{latest.label}</p>
          {latest.detail ? <p className="break-words text-xs text-muted-foreground">{latest.detail}</p> : null}
          <p className="text-xs text-muted-foreground">{formatWhen(latest.at)}</p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ol className="space-y-3 border-l border-border pl-4">
          {visible.map((event) => (
            <li key={event.id} className="relative">
              <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              <p className="text-sm">{event.label}</p>
              {event.detail ? <p className="break-words text-xs text-muted-foreground">{event.detail}</p> : null}
              <p className="text-xs text-muted-foreground">{formatWhen(event.at)}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {rest.length > visible.length || showAll ? (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="text-xs text-muted-foreground hover:text-foreground">
          {showAll ? "Show less" : `Show all ${events.length}`}
        </button>
      ) : null}
    </section>
  );
}
