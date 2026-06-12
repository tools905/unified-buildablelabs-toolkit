import Link from "next/link";
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-border bg-card/80 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5">
          <div className="mb-5 flex items-center justify-between gap-3 lg:block">
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
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
