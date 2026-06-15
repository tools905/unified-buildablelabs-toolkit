import { format, subDays } from "date-fns";
import { AppShell } from "@/components/dashboard/app-shell";
import { AnalysisWindowSlider } from "@/components/linkedin-assessor/analysis-window-slider";
import { LinkedInScoringExplainer } from "@/components/linkedin-assessor/scoring-explainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLinkedInDashboardData, linkedinConnectorLabels, linkedinConnectors } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { createAnalysisWindowAction, updateLinkedInSettingsAction } from "../../actions";

export default async function LinkedInSettingsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);
  const settings = data.settings;
  return <AppShell>
    <div className="mb-6"><h1 className="text-3xl font-semibold">LinkedIn Settings</h1><p className="text-muted-foreground">Scoring defaults, connector behavior, member visibility, and analysis windows.</p></div>
    <LinkedInScoringExplainer />
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Tool defaults</CardTitle><CardDescription>These values govern new profiles, visibility, submissions, and dashboard calculations.</CardDescription></CardHeader><CardContent>
        <form action={updateLinkedInSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly post target" name="monthlyPostTarget" type="number" min="1" defaultValue={settings?.default_monthly_post_target ?? 12} />
          <Field label="Volume weight" name="volumeWeight" type="number" min="0" max="1" step="0.05" defaultValue={settings?.default_volume_weight ?? 0.45} />
          <Field label="Quality weight" name="qualityWeight" type="number" min="0" max="1" step="0.05" defaultValue={settings?.default_quality_weight ?? 0.55} />
          <div className="space-y-2"><Label htmlFor="connectorPreference">Connector</Label><select id="connectorPreference" name="connectorPreference" defaultValue={settings?.connector_preference ?? "mock"} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">{linkedinConnectors.map((connector) => <option key={connector} value={connector}>{linkedinConnectorLabels[connector]}</option>)}</select></div>
          <AnalysisWindowSlider defaultValue={settings?.analysis_window_days ?? 30} />
          <Check name="weeklyReportsEnabled" label="Generate weekly reports" defaultChecked={settings?.weekly_reports_enabled ?? true} />
          <Check name="memberInsightsEnabled" label="Members can view personal insights" defaultChecked={settings?.member_insights_enabled ?? true} />
          <Check name="memberSubmissionsEnabled" label="Members can submit missing posts" defaultChecked={settings?.member_submissions_enabled ?? true} />
          <div className="sm:col-span-2"><Button>Save settings</Button></div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Saved comparison periods</CardTitle><CardDescription>The rolling slider controls the live dashboard. Save fixed periods for future comparisons and reporting.</CardDescription></CardHeader><CardContent>
        <form action={createAnalysisWindowAction} className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2" label="Period name" name="name" defaultValue="Campaign period" /><Field label="Start date" name="startDate" type="date" defaultValue={format(subDays(new Date(), 30), "yyyy-MM-dd")} /><Field label="End date" name="endDate" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} /><div className="sm:col-span-2"><Button>Save period</Button></div></form>
        <div className="mt-6 space-y-2">{data.windows.map((window) => <div key={window.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{window.name}</span><span className="text-muted-foreground">{format(new Date(window.start_date), "MMM d")} - {format(new Date(window.end_date), "MMM d, yyyy")}</span></div>)}</div>
      </CardContent></Card>
    </div>
  </AppShell>;
}

function Field({ label, name, className, ...props }: { label: string; name: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <div className={`space-y-2 ${className ?? ""}`}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required {...props} /></div>; }
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) { return <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={defaultChecked} />{label}</label>; }
