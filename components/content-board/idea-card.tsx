"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarDays, Check, Clock, ExternalLink, Link as LinkIcon, FileText, ImageIcon, Link2, MessageSquare, Paperclip, UserCheck } from "lucide-react";
import { format, isBefore, parseISO, startOfToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { setPostUrlAction } from "@/app/tools/content-board/actions";
import { cn } from "@/lib/utils/cn";
import { formatWhen } from "@/components/content-board/activity";
import { prefetchPanel } from "@/components/content-board/panel-cache";
import {
  assigneeLabel,
  assigneeProfile,
  ideaPlatforms,
  platformMeta,
  type ContentIdeaWithRelations,
} from "@/components/content-board/types";

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name || email || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Thumbnail({ thumbnail }: { thumbnail: NonNullable<ContentIdeaWithRelations["thumbnail"]> }) {
  if (thumbnail.kind === "image" && thumbnail.url) {
    return (
      <div className="mt-2 h-24 overflow-hidden border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host */}
        <img src={thumbnail.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
    );
  }
  const Icon = thumbnail.kind === "link" ? Link2 : thumbnail.kind === "pdf" ? FileText : ImageIcon;
  const label = thumbnail.kind === "link" ? "Design link" : thumbnail.kind === "pdf" ? "PDF carousel" : "Image";
  return (
    <div className="mt-2 flex h-12 items-center gap-2 border border-border bg-muted px-3 text-xs text-muted-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

// Fixed to IST so the server render and the browser render agree and the time reads the same for everyone.
const createdFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const isWebUrl = (value: string | null): value is string => Boolean(value && /^https?:\/\//i.test(value));

// Shown on a Posted card that has no link yet, so the post link can be pasted
// right on the card instead of inside the Edit window.
function PostUrlInline({ ideaId }: { ideaId: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setPostUrlAction(ideaId, value);
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <div className="flex items-center gap-1">
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste the post link…"
          aria-label="Link to the published post"
          draggable={false}
          className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" className="h-8 px-2 text-xs" disabled={pending || value.trim().length < 8}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function IdeaCard({
  idea,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
  currentUserId,
}: {
  idea: ContentIdeaWithRelations;
  currentUserId: string;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  isDragging: boolean;
}) {
  const platforms = ideaPlatforms(idea);
  const referenceCount = idea.reference_links?.length ?? 0;
  const assignees = idea.assignees ?? [];
  const assignedToMe = assignees.some((assignee) => assignee.user_id === currentUserId);
  const shownAssignees = assignees.slice(0, 3);
  const scheduled = idea.scheduled_for ? parseISO(idea.scheduled_for) : null;
  const overdue = scheduled !== null && idea.status !== "posted" && isBefore(scheduled, startOfToday());
  // A posted idea with a link opens the live post in a new tab; everything else opens the panel.
  const postUrl = idea.status === "posted" && isWebUrl(idea.post_url) ? idea.post_url : null;

  function activate() {
    if (postUrl) window.open(postUrl, "_blank", "noopener,noreferrer");
    else onOpen();
  }

  // Resting the pointer on a card loads its panel ahead of the click, so the click opens it at once.
  // The short delay stops a quick sweep across the board from loading every card it passes.
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function warmUp() {
    if (postUrl || warmTimer.current) return;
    warmTimer.current = setTimeout(() => {
      warmTimer.current = null;
      prefetchPanel(idea.id);
    }, 150);
  }
  function cancelWarmUp() {
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={activate}
      onMouseEnter={warmUp}
      onMouseLeave={cancelWarmUp}
      onFocus={warmUp}
      onBlur={cancelWarmUp}
      onTouchStart={warmUp}
      onKeyDown={(event) => {
        if (event.key === "Enter") activate();
      }}
      title={postUrl ? "Opens the post in a new tab" : undefined}
      className={cn(
        "card-shadow card-hover-effect flex min-h-[9rem] cursor-pointer flex-col rounded-lg border border-border bg-card p-3",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {platforms.map((platform) => {
            const meta = platformMeta(platform);
            const PlatformIcon = meta.icon;
            return (
              <span
                key={platform}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ backgroundColor: meta.color }}
              >
                {PlatformIcon ? <PlatformIcon className="h-3 w-3" /> : null}
                {meta.label}
              </span>
            );
          })}
        </div>
        {idea.creator ? (
          <span
            title={`Proposed by ${idea.creator.full_name || idea.creator.email}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
          >
            {initials(idea.creator.full_name, idea.creator.email)}
          </span>
        ) : null}
      </div>
      {idea.thumbnail ? <Thumbnail thumbnail={idea.thumbnail} /> : null}
      <p className="mt-2 flex-1 text-sm font-medium leading-snug">{idea.title}</p>
      {assignees.length > 0 ? (
        <p
          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
          title={`Assigned to ${assignees.map(assigneeLabel).join(", ")}`}
        >
          <UserCheck className="h-3 w-3 shrink-0" />
          <span className="flex -space-x-1">
            {shownAssignees.map((assignee) => {
              const profile = assigneeProfile(assignee);
              return (
                <span
                  key={assignee.user_id}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border border-card text-[9px] font-semibold",
                    assignee.user_id === currentUserId ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                  )}
                >
                  {initials(profile?.full_name, profile?.email)}
                </span>
              );
            })}
          </span>
          {assignees.length > shownAssignees.length ? <span>+{assignees.length - shownAssignees.length}</span> : null}
          {assignedToMe ? <span className="font-medium text-primary">You</span> : null}
        </p>
      ) : null}
      {scheduled ? (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs",
            overdue ? "font-medium text-amber-500" : "text-muted-foreground",
          )}
          title={overdue ? "This date has passed and the idea isn't posted yet" : "Planned posting day"}
        >
          <CalendarDays className="h-3 w-3" />
          {format(scheduled, "d MMM")}
          {overdue ? " · overdue" : ""}
        </p>
      ) : null}
      {idea.attachment_count > 0 || idea.review_count > 0 || idea.reviewed_at || referenceCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {referenceCount > 0 ? (
            <span className="inline-flex items-center gap-1" title={`${referenceCount} reference ${referenceCount === 1 ? "post" : "posts"}`}>
              <LinkIcon className="h-3 w-3" />
              {referenceCount}
            </span>
          ) : null}
          {idea.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-1" title={`${idea.attachment_count} attached`}>
              <Paperclip className="h-3 w-3" />
              {idea.attachment_count}
            </span>
          ) : null}
          {idea.open_review_count > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-amber-500">
              <MessageSquare className="h-3 w-3" />
              {idea.open_review_count} to change
            </span>
          ) : idea.reviewed_at ? (
            <span className="inline-flex items-center gap-1" title="Marked as reviewed">
              <Check className="h-3 w-3" />
              Reviewed
            </span>
          ) : idea.review_count > 0 ? (
            <span className="inline-flex items-center gap-1" title="Every review point is done">
              <Check className="h-3 w-3" />
              All fixed
            </span>
          ) : null}
        </div>
      ) : null}
      {postUrl ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 font-medium text-primary">
            View post <ExternalLink className="h-3 w-3" />
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Details
          </button>
        </div>
      ) : idea.status === "posted" ? (
        <PostUrlInline ideaId={idea.id} />
      ) : isWebUrl(idea.post_url) ? (
        <a
          href={idea.post_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View post <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      <time
        dateTime={idea.created_at}
        title={`Created ${formatWhen(idea.created_at)}`}
        className="mt-2 inline-flex items-center gap-1 self-start text-[11px] text-muted-foreground"
      >
        <Clock className="h-3 w-3" />
        {createdFormat
          .format(new Date(idea.created_at))
          .replace("Sept", "Sep")
          .replace(/ (am|pm|AM|PM)$/, (m) => m.toLowerCase())}
      </time>
    </div>
  );
}
