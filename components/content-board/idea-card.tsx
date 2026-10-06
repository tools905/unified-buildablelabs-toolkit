"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarDays, Check, Clock, History, ExternalLink, Link as LinkIcon, FileText, ImageIcon, Link2, MessageSquare, Paperclip, UserCheck } from "lucide-react";
import { CardMenu } from "@/components/content-board/card-menu";
import { format, formatDistanceToNowStrict, isBefore, parseISO, startOfToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { setPostUrlAction } from "@/app/tools/content-board/actions";
import { describeActivity } from "@/lib/utils/content-board";
import type { ContentIdeaStatus } from "@/lib/db/types";
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

// A look at the post itself: the first picture, or the first page of a PDF carousel.
function Thumbnail({
  thumbnail,
  fileCount,
}: {
  thumbnail: NonNullable<ContentIdeaWithRelations["thumbnail"]>;
  fileCount: number;
}) {
  if (thumbnail.kind !== "link" && thumbnail.url) {
    return (
      <div className="relative mt-2 h-48 overflow-hidden rounded-sm border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host */}
        <img
          src={thumbnail.url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
        {thumbnail.kind === "pdf" || fileCount > 1 ? (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {thumbnail.kind === "pdf" ? <FileText className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {[thumbnail.kind === "pdf" ? "PDF" : null, fileCount > 1 ? `${fileCount} files` : null].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
    );
  }
  const Icon = thumbnail.kind === "link" ? Link2 : thumbnail.kind === "pdf" ? FileText : ImageIcon;
  const label = thumbnail.kind === "link" ? "Design link" : thumbnail.kind === "pdf" ? "PDF carousel" : "Image";
  return (
    <div className="mt-2 flex h-12 items-center gap-2 rounded-sm border border-border bg-muted px-3 text-xs text-muted-foreground">
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
  onEdit,
  onAssign,
  onMove,
  onDragStart,
  onDragEnd,
  isDragging,
  canDrag,
  active,
  isAdmin,
  currentUserId,
}: {
  idea: ContentIdeaWithRelations;
  currentUserId: string;
  isAdmin: boolean;
  // Its side panel is open: shown with the same highlight as a card under the pointer.
  active: boolean;
  // Only admins drag cards between columns; everyone else uses the next-step buttons.
  canDrag: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onMove: (status: ContentIdeaStatus) => void;
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
  const postUrl = isWebUrl(idea.post_url) ? idea.post_url : null;

  // Resting the pointer on a card loads its panel ahead of the click, so the click opens it at once.
  // The short delay stops a quick sweep across the board from loading every card it passes.
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function warmUp() {
    if (warmTimer.current) return;
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
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onClick={onOpen}
      data-active={active ? "true" : undefined}
      aria-current={active ? "true" : undefined}
      onMouseEnter={warmUp}
      onMouseLeave={cancelWarmUp}
      onFocus={warmUp}
      onBlur={cancelWarmUp}
      onTouchStart={warmUp}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "card-shadow card-hover-effect card-zoom flex min-h-[9rem] cursor-pointer flex-col rounded-lg border border-border bg-card p-3",
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
      {idea.thumbnail ? <Thumbnail thumbnail={idea.thumbnail} fileCount={idea.file_count} /> : null}
      <p className="mt-2 flex-1 text-sm font-medium leading-snug">{idea.title}</p>
      {idea.latest_activity ? (
        // Why this card sits where it does in its column: its latest activity.
        <p
          className="mt-1.5 flex items-start gap-1 text-xs font-medium leading-snug text-primary"
          title={`Latest activity: ${formatWhen(idea.latest_activity.at)}`}
        >
          <History className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">
            {describeActivity(idea.latest_activity)} ·{" "}
            <span suppressHydrationWarning>{formatDistanceToNowStrict(new Date(idea.latest_activity.at), { addSuffix: true })}</span>
          </span>
        </p>
      ) : null}
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
      {idea.status === "posted" && !postUrl ? <PostUrlInline ideaId={idea.id} /> : null}
      {postUrl ? (
        // Only this link opens the live post; the card itself opens the preview and its feedback.
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          draggable={false}
          className="mt-2 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
        >
          Live post <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <time
          dateTime={idea.created_at}
          title={`Created ${formatWhen(idea.created_at)}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        >
          <Clock className="h-3 w-3" />
          {createdFormat
            .format(new Date(idea.created_at))
            .replace("Sept", "Sep")
            .replace(/ (am|pm|AM|PM)$/, (m) => m.toLowerCase())}
        </time>
        <CardMenu
          idea={idea}
          isAdmin={isAdmin}
          isAssignee={assignedToMe}
          onOpen={onOpen}
          onEdit={onEdit}
          onAssign={onAssign}
          onMove={onMove}
        />
      </div>
    </div>
  );
}
