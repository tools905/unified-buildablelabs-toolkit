"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { BASE_PATH } from "@/lib/utils/app-url";
import { cn } from "@/lib/utils/cn";

export const SIDEBAR_COOKIE = "tc-sidebar";

// The desktop sidebar. It can be collapsed to a slim strip of icons to give the page more room; the
// choice is kept in a cookie, so this device opens the same way next time without a flash.
export function DesktopSidebar({
  admin,
  unreadCount,
  initialCollapsed,
}: {
  admin: boolean;
  unreadCount: number;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=${BASE_PATH || "/"}; max-age=31536000; samesite=lax`;
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expand the sidebar" : "Collapse the sidebar to icons";

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card/80 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[4.5rem]" : "w-72",
      )}
    >
      <div className={cn("border-b border-border/60", collapsed ? "flex flex-col items-center gap-2 px-2 py-4" : "px-5 py-5")}>
        <div className={cn("flex items-start", collapsed ? "flex-col items-center gap-2" : "justify-between gap-2")}>
          <Link href="/dashboard" className="block min-w-0" title={collapsed ? "BuildableLabs Team Connect" : undefined}>
            {collapsed ? (
              <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-sm font-bold text-primary">BL</span>
            ) : (
              <>
                <div className="text-base font-bold tracking-tight text-foreground">BuildableLabs</div>
                <div className="text-xs text-muted-foreground">Team Connect</div>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            title={toggleLabel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("flex gap-2", collapsed ? "flex-col items-center" : "mt-3 items-center")}>
          {collapsed ? null : <Badge>{admin ? "Admin" : "Member"}</Badge>}
          <NotificationBell unreadCount={unreadCount} />
          <LogoutButton />
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto py-5", collapsed ? "px-2" : "px-5")}>
        <SidebarNav admin={admin} collapsed={collapsed} />
      </div>
    </aside>
  );
}
