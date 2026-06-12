"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Share2,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const baseLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tools", label: "Tools", icon: Wrench },
];

const adminLinks: NavItem[] = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/admin/tools", label: "Tool Settings", icon: Settings },
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
      { href: "/tools/linkedin-assessor/admin", label: "Admin", icon: Settings, adminOnly: true },
      { href: "/tools/linkedin-assessor/reports", label: "Reports", icon: FileBarChart, adminOnly: true },
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
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const globalLinks = admin ? [...baseLinks, ...adminLinks] : baseLinks;
  const activeTool = toolNav.find((tool) => pathname.startsWith(tool.match));
  const activeToolItems =
    activeTool?.items.filter((item) => admin || !item.adminOnly) ?? [];

  return (
    <nav className="space-y-6">
      <div>
        <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
          Workspace
        </div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {globalLinks.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </div>
      {activeTool && activeToolItems.length > 0 ? (
        <div>
          <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
            {activeTool.title}
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {activeToolItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
