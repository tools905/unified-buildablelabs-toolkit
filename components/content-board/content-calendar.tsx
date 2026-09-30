"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeaDetail } from "@/components/content-board/idea-detail";
import { IdeaPanel } from "@/components/content-board/idea-panel";
import {
  PLATFORM_META,
  PLATFORM_OPTIONS,
  type ContentIdeaWithRelations,
} from "@/components/content-board/types";
import { cn } from "@/lib/utils/cn";

const WEEK_STARTS_ON = 1; // Monday
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VISIBLE_PER_DAY = 3;

export function ContentCalendar({ ideas }: { ideas: ContentIdeaWithRelations[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [platformFilter, setPlatformFilter] = useState("");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [panelIdeaId, setPanelIdeaId] = useState<string | null>(null);
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);

  const visibleIdeas = useMemo(
    () => ideas.filter((idea) => !platformFilter || idea.platform === platformFilter),
    [ideas, platformFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, ContentIdeaWithRelations[]>();
    for (const idea of visibleIdeas) {
      if (!idea.scheduled_for) continue;
      map.set(idea.scheduled_for, [...(map.get(idea.scheduled_for) ?? []), idea]);
    }
    return map;
  }, [visibleIdeas]);

  const unscheduled = useMemo(
    () => visibleIdeas.filter((idea) => !idea.scheduled_for && idea.status !== "posted"),
    [visibleIdeas],
  );

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(month, { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
      }),
    [month],
  );

  const agendaDays = days.filter((day) => isSameMonth(day, month) && byDay.has(format(day, "yyyy-MM-dd")));

  const today = startOfToday();
  const panelIdea = ideas.find((idea) => idea.id === panelIdeaId) ?? null;
  const editIdea = ideas.find((idea) => idea.id === editIdeaId) ?? null;
  const scheduledThisMonth = days.filter((day) => isSameMonth(day, month)).reduce(
    (total, day) => total + (byDay.get(format(day, "yyyy-MM-dd"))?.length ?? 0),
    0,
  );

  function renderChip(idea: ContentIdeaWithRelations) {
    const meta = PLATFORM_META[idea.platform];
    const Icon = meta.icon;
    const posted = idea.status === "posted";
    const overdue = !posted && idea.scheduled_for ? isBefore(parseISO(idea.scheduled_for), today) : false;
    return (
      <button
        key={idea.id}
        type="button"
        onClick={() => setPanelIdeaId(idea.id)}
        title={`${meta.label} · ${idea.title}${overdue ? " (overdue)" : ""}`}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1 text-left text-xs transition-colors hover:border-primary/50",
          posted && "text-muted-foreground",
          overdue && "border-amber-500/60",
        )}
      >
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="h-2.5 w-2.5" />
        </span>
        <span className={cn("min-w-0 flex-1 truncate", posted && "line-through")}>{idea.title}</span>
        {posted ? <Check className="h-3 w-3 shrink-0" /> : null}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[9rem] text-center text-base font-semibold">{format(month, "MMMM yyyy")}</h2>
          <Button type="button" variant="outline" size="sm" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {scheduledThisMonth === 0 ? "Nothing scheduled this month" : `${scheduledThisMonth} scheduled this month`}
          </span>
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            aria-label="Filter by platform"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Every platform</option>
            {PLATFORM_OPTIONS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_META[platform].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 sm:hidden">
        {agendaDays.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing scheduled in {format(month, "MMMM")}.
          </p>
        ) : (
          agendaDays.map((day) => (
            <section key={format(day, "yyyy-MM-dd")} aria-label={format(day, "EEEE d MMMM")}>
              <h3
                className={cn(
                  "mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  isToday(day) && "text-primary",
                )}
              >
                {format(day, "EEE d MMM")}
                {isToday(day) ? " · today" : ""}
              </h3>
              <div className="space-y-1.5">{(byDay.get(format(day, "yyyy-MM-dd")) ?? []).map(renderChip)}</div>
            </section>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <div className="min-w-[44rem] overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-2 py-2 text-xs font-medium text-muted-foreground">
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const key = format(day, "yyyy-MM-dd");
              const dayIdeas = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const expanded = expandedDay === key;
              const shown = expanded ? dayIdeas : dayIdeas.slice(0, VISIBLE_PER_DAY);
              const hidden = dayIdeas.length - shown.length;
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[7.5rem] space-y-1 border-border p-1.5",
                    index % 7 !== 6 && "border-r",
                    index < days.length - 7 && "border-b",
                    !inMonth && "bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      inMonth ? "text-foreground" : "text-muted-foreground/60",
                      isToday(day) && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  {shown.map(renderChip)}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(key)}
                      className="px-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      +{hidden} more
                    </button>
                  ) : expanded && dayIdeas.length > VISIBLE_PER_DAY ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(null)}
                      className="px-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Show less
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section aria-label="Not scheduled" className="mt-6">
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Not scheduled yet</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{unscheduled.length}</span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every open idea has a date.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Open an idea and choose Edit to give it a posting day.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{unscheduled.map(renderChip)}</div>
          </>
        )}
      </section>

      {panelIdea ? (
        <IdeaPanel
          key={panelIdea.id}
          idea={panelIdea}
          keyboardActive={!editIdea}
          onClose={() => setPanelIdeaId(null)}
          onEdit={() => setEditIdeaId(panelIdea.id)}
        />
      ) : null}
      {editIdea ? <IdeaDetail idea={editIdea} onClose={() => setEditIdeaId(null)} /> : null}
    </div>
  );
}
