import { format } from "date-fns";
import { FileBarChart } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { generateLinkedInReportAction } from "../actions";

export default async function LinkedInReportsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin("/tools/linkedin-assessor/reports");
  const data = await getLinkedInDashboardData(supabase, workspace.id, { includeReports: true });
  return <AppShell><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-semibold">LinkedIn Reports</h1><p className="text-muted-foreground">Weekly summaries of posting consistency, quality, and coaching focus.</p></div><form action={generateLinkedInReportAction}><Button><FileBarChart className="h-4 w-4" />Generate report</Button></form></div><div className="space-y-4">{data.reports.map((report) => <Card key={report.id}><CardHeader><CardTitle>{format(new Date(report.start_date), "MMM d")} - {format(new Date(report.end_date), "MMM d, yyyy")}</CardTitle><CardDescription>Generated {format(new Date(report.created_at), "MMM d, yyyy h:mm a")}</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{report.report_summary}</p></CardContent></Card>)}{data.reports.length === 0 ? <Card><CardHeader><CardTitle>No weekly reports yet</CardTitle><CardDescription>Generate the first report after syncing and scoring posts.</CardDescription></CardHeader></Card> : null}</div></AppShell>;
}
