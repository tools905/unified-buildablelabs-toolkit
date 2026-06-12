import Link from "next/link";
import { Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

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

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/dashboard" className="block min-w-0">
            <div className="truncate text-base font-bold tracking-tight text-foreground">
              BuildableLabs
            </div>
            <div className="text-xs text-muted-foreground">Unified Toolkit</div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Badge>{admin ? "Admin" : "Member"}</Badge>
            <details className="relative">
              <summary
                aria-label="Open navigation"
                className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-card p-4 shadow-xl">
                <SidebarNav admin={admin} />
              </div>
            </details>
          </div>
        </header>
      </div>
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-border bg-card/80 px-5 py-5 lg:block">
          <div className="mb-6">
            <Link href="/dashboard" className="block">
              <div className="text-base font-bold tracking-tight text-foreground">
                BuildableLabs
              </div>
              <div className="text-xs text-muted-foreground">Unified Toolkit</div>
            </Link>
            <Badge className="lg:mt-3">{admin ? "Admin" : "Member"}</Badge>
          </div>
          <SidebarNav admin={admin} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
