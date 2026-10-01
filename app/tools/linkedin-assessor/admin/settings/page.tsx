import { AnalysisWindowPicker } from "@/components/linkedin-assessor/analysis-window-picker";
import { SubmitButton } from "@/components/dashboard/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { updateLinkedInSettingsAction } from "../../actions";

export default async function LinkedInSettingsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);
  const settings = data.settings;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">LinkedIn Settings</h1>
        <p className="text-muted-foreground">Choose how far back the dashboard looks and what members can do.</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Changes apply to the whole workspace straight away.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateLinkedInSettingsAction} className="grid gap-4">
            <AnalysisWindowPicker defaultValue={settings?.analysis_window_days ?? 30} />
            <Check name="memberInsightsEnabled" label="Members can see the AI feedback on their own posts" defaultChecked={settings?.member_insights_enabled ?? true} />
            <Check name="memberSubmissionsEnabled" label="Members can submit posts" defaultChecked={settings?.member_submissions_enabled ?? true} />
            <div><SubmitButton>Save settings</SubmitButton></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
