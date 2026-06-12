import Link from "next/link";
import {
  Bot,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  Settings,
  Share2,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

const memberLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tools/peer-review/member", label: "Peer Reviews", icon: ClipboardCheck },
  { href: "/tools/linkedin-assessor", label: "LinkedIn Insights", icon: Share2 },
  { href: "/tools/hr-bot", label: "HR Bot", icon: Bot },
];

const adminLinks = [
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/tools/peer-review/admin", label: "Peer Review", icon: ClipboardCheck },
  { href: "/admin", label: "Reports", icon: FileBarChart },
  { href: "/team", label: "Team", icon: Users },
  { href: "/admin/tools", label: "Tool Settings", icon: Settings },
];

async function getShellContext() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { admin: false };

    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) return { admin: false };

    return {
      admin: await isWorkspaceAdmin(workspace.id, user.id, supabase),
    };
  } catch {
    return { admin: false };
  }
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { admin } = await getShellContext();
  const links = admin ? [...memberLinks, ...adminLinks] : memberLinks;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-lg font-bold tracking-tight text-foreground">
              Unified BuildableLabs Toolkit
            </Link>
            <Badge>{admin ? "Admin" : "Member"}</Badge>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Button key={link.href} asChild variant="ghost" size="sm">
                  <Link href={link.href}>
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{link.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
