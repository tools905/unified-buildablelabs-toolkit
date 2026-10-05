import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { getUserSession } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { getUnreadNotificationCount } from "@/lib/services/notification-service";

async function getShellContext() {
  try {
    const { supabase, user } = await getUserSession();

    if (!user) return { admin: false, unreadCount: 0 };

    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) return { admin: false, unreadCount: 0 };

    const [admin, unreadCount] = await Promise.all([
      isWorkspaceAdmin(workspace.id, user.id, supabase),
      getUnreadNotificationCount(supabase, user.id),
    ]);

    return { admin, unreadCount };
  } catch {
    return { admin: false, unreadCount: 0 };
  }
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { admin, unreadCount } = await getShellContext();

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm backdrop-blur">
          <Link href="/dashboard" className="block min-w-0">
            <div className="truncate text-base font-bold tracking-tight text-foreground">
              BuildableLabs
            </div>
            <div className="text-xs text-muted-foreground">Team Connect</div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Badge>{admin ? "Admin" : "Member"}</Badge>
            <NotificationBell unreadCount={unreadCount} />
            <LogoutButton />
            <MobileNav admin={admin} />
          </div>
        </header>
      </div>
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border bg-card/80 lg:flex">
          <div className="border-b border-border/60 px-5 py-5">
            <Link href="/dashboard" className="block">
              <div className="text-base font-bold tracking-tight text-foreground">
                BuildableLabs
              </div>
              <div className="text-xs text-muted-foreground">Team Connect</div>
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <Badge>{admin ? "Admin" : "Member"}</Badge>
              <NotificationBell unreadCount={unreadCount} />
              <LogoutButton />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <SidebarNav admin={admin} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
