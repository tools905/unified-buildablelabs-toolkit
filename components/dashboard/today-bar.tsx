import Link from "next/link";
import { cn } from "@/lib/utils/cn";

// The top of every page: today's greeting (lib/utils/greeting.ts) in the serif face, the person's
// name set apart in light blue, and on the right the date in India time with the unread count.
export function TodayBar({
  greeting,
  date,
  unreadCount,
}: {
  greeting: { before: string; name: string; after: string };
  date: string;
  unreadCount: number;
}) {
  return (
    <div className="greet-in relative mb-6 flex items-end justify-between gap-4 border-b border-border pb-4 lg:mb-8">
      {/* A short blue line under the greeting, fading out along the hairline. */}
      <span aria-hidden className="absolute -bottom-px left-0 h-px w-48 bg-gradient-to-r from-primary-hover to-transparent" />
      <p className="min-w-0 font-serif text-[1.5rem] italic leading-tight text-foreground sm:text-[1.75rem] lg:text-[2rem]">
        {greeting.before}
        <span className="bg-gradient-to-r from-[#a9b8ff] to-accent bg-clip-text pr-[0.1em] text-transparent">{greeting.name}</span>
        {greeting.after}
      </p>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-chrome">{date}</span>
        <Link
          href="/notifications"
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors",
            unreadCount ? "text-foreground hover:text-primary-hover" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", unreadCount ? "bg-primary-hover shadow-[0_0_8px_2px_rgba(39,91,255,0.6)]" : "bg-quiet")} />
          {unreadCount ? `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}` : "You're all caught up"}
        </Link>
      </div>
    </div>
  );
}
