"use client";

import { useState } from "react";
import { buildActivity, formatWhen } from "@/components/content-board/activity";
import type { IdeaPanelData } from "@/components/content-board/types";

const COLLAPSED_COUNT = 6;

export function ActivityTimeline({ data }: { data: IdeaPanelData }) {
  const [showAll, setShowAll] = useState(false);
  const events = buildActivity(data);
  const visible = showAll ? events : events.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-label="Activity" className="space-y-2">
      <h3 className="text-sm font-semibold">Activity</h3>
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
      {events.length > COLLAPSED_COUNT ? (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="text-xs text-muted-foreground hover:text-foreground">
          {showAll ? "Show less" : `Show all ${events.length}`}
        </button>
      ) : null}
    </section>
  );
}
