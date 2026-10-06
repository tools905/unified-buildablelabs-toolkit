"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  History,
  KanbanSquare,
  LayoutDashboard,
  MessageCircle,
  Newspaper,
  Plug,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

// The Dashboard is the one place for every tool (it replaced the separate Tools catalog) and,
// for admins, the workspace overview that used to be Admin Reports.
const baseLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/connected-apps", label: "Connected apps", icon: Plug, exact: true },
];

// Only admins see these, and each page also turns non-admins away on the server.
const adminLinks: NavItem[] = [
  { href: "/team", label: "Team", icon: Users, exact: true },
  { href: "/team/logs", label: "Workspace Logs", icon: Activity },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: History },
];

const toolNav: Array<{
  match: string;
  title: string;
  items: Array<NavItem & { adminOnly?: boolean }>;
}> = [
  {
    match: "/tools/peer-review",
    title: "Peer Review",
    items: [
      { href: "/tools/peer-review", label: "Overview", icon: ClipboardCheck, exact: true },
      { href: "/tools/peer-review/admin", label: "Admin", icon: Settings, adminOnly: true },
      { href: "/tools/peer-review/member", label: "My Reviews", icon: ClipboardCheck },
      { href: "/tools/peer-review/reports", label: "Reports", icon: FileBarChart, adminOnly: true },
    ],
  },
  {
    match: "/tools/linkedin-assessor",
    title: "LinkedIn Assessor",
    items: [
      { href: "/tools/linkedin-assessor", label: "Overview", icon: Share2, exact: true },
      { href: "/tools/linkedin-assessor/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: true, exact: true },
      { href: "/tools/linkedin-assessor/admin/posts", label: "Posts", icon: Newspaper, adminOnly: true },
      { href: "/tools/linkedin-assessor/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
  {
    match: "/tools/hr-bot",
    title: "HR Bot",
    items: [
      { href: "/tools/hr-bot", label: "Overview", icon: Bot, exact: true },
      { href: "/tools/hr-bot/chat", label: "Chat", icon: MessageCircle },
      { href: "/tools/hr-bot/admin", label: "Admin", icon: Settings, adminOnly: true },
    ],
  },
  {
    match: "/tools/tickets",
    title: "Tickets",
    items: [
      { href: "/tools/tickets", label: "Board", icon: KanbanSquare, exact: true },
      { href: "/tools/tickets/reviews", label: "Reviews", icon: ClipboardCheck },
      { href: "/tools/tickets/admin", label: "Admin", icon: Settings, adminOnly: true },
    ],
  },
  {
    match: "/tools/resources",
    title: "Upskill",
    items: [
      { href: "/tools/resources", label: "Browse", icon: BookOpen, exact: true },
      { href: "/tools/resources/admin", label: "Admin", icon: Settings, adminOnly: true },
    ],
  },
  {
    match: "/tools/meetings",
    title: "Meetings",
    items: [{ href: "/tools/meetings", label: "Recaps", icon: CalendarClock, exact: true }],
  },
  {
    match: "/tools/newsletter",
    title: "Newsletter",
    items: [{ href: "/tools/newsletter", label: "Posts", icon: Newspaper, exact: true }],
  },
  {
    match: "/tools/content-board",
    title: "Content Board",
    items: [
      { href: "/tools/content-board", label: "Board", icon: KanbanSquare, exact: true },
      { href: "/tools/content-board/calendar", label: "Calendar", icon: CalendarDays, exact: true },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const Icon = item.icon;
  const active = isActive(pathname, item);

  return (
    <Link
      href={item.href}
      prefetch
      aria-current={active ? "page" : undefined}
      // Collapsed to icons: the name shows on hover and is read out by screen readers.
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? null : <span>{item.label}</span>}
    </Link>
  );
}

export function SidebarNav({ admin, collapsed = false }: { admin: boolean; collapsed?: boolean }) {
  const pathname = usePathname();
  const globalLinks = admin ? [...baseLinks, ...adminLinks] : baseLinks;
  const activeTool = toolNav.find((tool) => pathname.startsWith(tool.match));
  const activeToolItems =
    activeTool?.items.filter((item) => admin || !item.adminOnly) ?? [];

  return (
    <nav className="space-y-5">
      <div>
        {collapsed ? null : (
          <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">Workspace</div>
        )}
        <div className="grid gap-1">
          {globalLinks.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </div>
      </div>
      {activeTool && activeToolItems.length > 0 ? (
        <div>
          {collapsed ? (
            <div className="mx-2 mb-2 border-t border-border" aria-hidden="true" />
          ) : (
            <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">{activeTool.title}</div>
          )}
          <div className="grid gap-1">
            {activeToolItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
