import Link from "next/link";
import { CalendarDays, Sheet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentCalendar } from "@/components/content-board/content-calendar";
import { LiveWorkbook } from "@/components/content-board/sheet/live-workbook";
import { WORKBOOK_TITLE } from "@/components/content-board/sheet/types";
import { requireUser } from "@/lib/auth/require-user";
import { attachCardPreviews, listContentIdeas } from "@/lib/services/content-idea-service";
import { loadWorkbook } from "@/lib/services/content-sheet-service";
import { getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { BASE_PATH } from "@/lib/utils/app-url";
import { cn } from "@/lib/utils/cn";
import { toMemberOptions } from "@/lib/utils/content-board";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

// Two tabs: the posting calendar, and the team's shared "Creators Profiles Ideas" spreadsheet.
function PageTabs({ sheet }: { sheet: boolean }) {
  const tabs = [
    { href: "/tools/content-board/calendar", label: "Calendar", icon: CalendarDays, active: !sheet },
    { href: "/tools/content-board/calendar?view=sheet", label: WORKBOOK_TITLE, icon: Sheet, active: sheet },
  ];
  return (
    <nav aria-label="Calendar views" className="mb-5 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default async function ContentCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireEnabledTool("content-board");
  const { view } = await searchParams;
  const sheet = view === "sheet";
  const { supabase, user } = await requireUser(sheet ? "/tools/content-board/calendar?view=sheet" : "/tools/content-board/calendar");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  if (sheet) {
    const [workbook, members] = await Promise.all([loadWorkbook(supabase, workspace.id), getWorkspaceMembers(supabase, workspace.id)]);
    const people = Object.fromEntries(toMemberOptions(members).map((member) => [member.id, member.label]));
    return (
      <>
        <PageHeader
          eyebrow="Content Board"
          title="Calendar"
          description="Every post with a posting day, and the team's shared sheet of creators to learn from."
        />
        <PageTabs sheet />
        <LiveWorkbook
          initial={workbook}
          workspaceId={workspace.id}
          currentUserId={user.id}
          people={people}
          exportUrl={`${BASE_PATH}/api/content-board/sheet/export`}
        />
      </>
    );
  }

  const [rawIdeas, members, admin] = await Promise.all([
    listContentIdeas(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
  ]);
  const ideas = await attachCardPreviews(supabase, rawIdeas);

  return (
    <>
      <PageHeader
        eyebrow="Content Board"
        title="Calendar"
        description="Every post with a posting day, plus shortlisted posts still waiting for one."
      />
      <PageTabs sheet={false} />
      <ContentCalendar ideas={ideas} members={toMemberOptions(members)} isAdmin={admin} currentUserId={user.id} />
    </>
  );
}
