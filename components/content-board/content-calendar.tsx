"use client";

import { useMemo, useState, useTransition } from "react";
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
import { AssignDialog } from "@/components/content-board/assign-dialog";
import { useIdeaMoves } from "@/components/content-board/use-idea-moves";
import { useUrlState } from "@/components/dashboard/use-url-state";
import { scheduleIdeaAction } from "@/app/tools/content-board/actions";
import {
  CONTENT_COLUMNS,
  PLATFORM_META,
  ideaPlatforms,
  platformMeta,
  PLATFORM_OPTIONS,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";
import { cn } from "@/lib/utils/cn";

const WEEK_STARTS_ON = 1; // Monday
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VISIBLE_PER_DAY = 3;
const URL_KEYS = ["idea", "view"] as const;

// Shortlisted and in-progress ideas are the ones planned to go out, so they belong on the calendar.
const PLANNED: ContentIdeaWithRelations["status"][] = ["approved", "in_progress"];

// Puts one idea on the calendar straight from the list, without opening the Edit window.
function ScheduleField({ ideaId }: { ideaId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <input
        type="date"
        aria-label="Choose the posting day"
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          setError(null);
          startTransition(async () => {
            const result = await scheduleIdeaAction(ideaId, value);
            if (!result.ok) setError(result.error);
          });
        }}
        className="h-9 rounded-sm border border-border bg-background px-2 text-xs"
      />
      {error ? (
        <span role="alert" className="mt-0.5 text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function ContentCalendar({
  ideas,
  members,
  isAdmin,
  currentUserId,
}: {
  ideas: ContentIdeaWithRelations[];
  members: ContentMemberOption[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [platformFilter, setPlatformFilter] = useState("");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const { ideas: liveIdeas, moveIdea, setOptimisticStatus, moveError, clearMoveError } = useIdeaMoves(ideas);
  // The open idea lives in the address, so the phone's Back button closes it (see useUrlState).
  const { values, push, pop } = useUrlState(URL_KEYS);

  const visibleIdeas = useMemo(
    () => liveIdeas.filter((idea) => !platformFilter || ideaPlatforms(idea).includes(platformFilter)),
    [liveIdeas, platformFilter],
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
    () => visibleIdeas.filter((idea) => !idea.scheduled_for && PLANNED.includes(idea.status)),
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
  const panelIdea = liveIdeas.find((idea) => idea.id === values.idea) ?? null;
  const view = panelIdea ? values.view : null;
  const scheduledThisMonth = days.filter((day) => isSameMonth(day, month)).reduce(
    (total, day) => total + (byDay.get(format(day, "yyyy-MM-dd"))?.length ?? 0),
    0,
  );

  function renderChip(idea: ContentIdeaWithRelations) {
    const platformList = ideaPlatforms(idea).map(platformMeta);
    const posted = idea.status === "posted";
    const overdue = !posted && idea.scheduled_for ? isBefore(parseISO(idea.scheduled_for), today) : false;
    return (
      <button
        key={idea.id}
        type="button"
        onClick={() => push({ idea: idea.id, view: null })}
        title={`${platformList.map((meta) => meta.label).join(", ")} · ${idea.title} · ${CONTENT_COLUMNS.find((column) => column.status === idea.status)?.label ?? idea.status}${overdue ? " (overdue)" : ""}`}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1 text-left text-xs transition-colors hover:border-primary/50",
          posted && "text-muted-foreground",
          PLANNED.includes(idea.status) && "border-primary/50",
          overdue && "border-amber-500/60",
        )}
      >
        <span className="flex shrink-0 -space-x-1">
          {platformList.slice(0, 3).map((meta) => {
            const Icon = meta.icon;
            return (
              <span
                key={meta.label}
                className="flex h-4 w-4 items-center justify-center rounded-full border border-card text-white"
                style={{ backgroundColor: meta.color }}
              >
                {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
              </span>
            );
          })}
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

      <section aria-label="Shortlisted, not on the calendar yet" className="mt-6">
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Shortlisted, not on the calendar yet</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{unscheduled.length}</span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every shortlisted and in-progress post has a posting day.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Pick a day to put a post on the calendar.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unscheduled.map((idea) => (
                <div key={idea.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">{renderChip(idea)}</div>
                  <ScheduleField ideaId={idea.id} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {moveError ? (
        <div role="alert" className="mt-4 flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>{moveError}</span>
          <button type="button" onClick={clearMoveError} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      ) : null}

      {panelIdea ? (
        <IdeaPanel
          key={panelIdea.id}
          idea={panelIdea}
          keyboardActive={!view}
          onClose={() => pop({ idea: null, view: null })}
          onEdit={() => push({ view: "edit" })}
          onMove={moveIdea}
          onOptimisticStatus={setOptimisticStatus}
        />
      ) : null}
      {panelIdea && view === "edit" ? (
        <IdeaDetail
          idea={panelIdea}
          members={members}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onClose={() => pop({ view: null })}
        />
      ) : null}
      {panelIdea && view === "assign" && isAdmin ? (
        <AssignDialog idea={panelIdea} members={members} currentUserId={currentUserId} onClose={() => pop({ view: null })} />
      ) : null}
    </div>
  );
}
