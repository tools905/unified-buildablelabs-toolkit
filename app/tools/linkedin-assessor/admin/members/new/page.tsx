import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWorkspaceMembers } from "@/lib/services/workspace-service";
import { getLinkedInDashboardData, linkedinConnectorLabels, linkedinConnectors, linkedinMemberRoles } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { createTrackedMemberAction } from "../../../actions";

export default async function NewLinkedInMemberPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const [members, data] = await Promise.all([getWorkspaceMembers(supabase, workspace.id), getLinkedInDashboardData(supabase, workspace.id)]);
  const settings = data.settings;
  return <AppShell><div className="mb-6"><h1 className="text-3xl font-semibold">Add LinkedIn profile</h1><p className="text-muted-foreground">Link a toolkit user when personal member insights should be available.</p></div>
    <Card className="max-w-3xl"><CardHeader><CardTitle>Tracking details</CardTitle><CardDescription>Mock creates synthetic test posts. Fallback is not configured. Third-party API is reserved for the future Apify integration.</CardDescription></CardHeader><CardContent>
      <form action={createTrackedMemberAction} className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" required />
        <Field label="Email" name="email" type="email" />
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="profileId">Toolkit account</Label><select id="profileId" name="profileId" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"><option value="">Not linked</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.profiles?.full_name ?? member.profiles?.email}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="memberRole">Role</Label><select id="memberRole" name="memberRole" defaultValue="other" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">{linkedinMemberRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="connectorPreference">Connector</Label><select id="connectorPreference" name="connectorPreference" defaultValue={settings?.connector_preference ?? "mock"} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">{linkedinConnectors.map((connector) => <option key={connector} value={connector}>{linkedinConnectorLabels[connector]}</option>)}</select></div>
        <Field label="LinkedIn profile URL" name="linkedinProfileUrl" placeholder="linkedin.com/in/profile" required className="sm:col-span-2" />
        <Field label="Monthly post target" name="monthlyPostTarget" type="number" defaultValue={settings?.default_monthly_post_target ?? 12} min="1" max="100" required />
        <div />
        <Field label="Volume weight (posting consistency)" name="volumeWeight" type="number" defaultValue={settings?.default_volume_weight ?? 0.45} min="0" max="1" step="0.05" required />
        <Field label="Quality weight (average post score)" name="qualityWeight" type="number" defaultValue={settings?.default_quality_weight ?? 0.55} min="0" max="1" step="0.05" required />
        <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Weights must total 1.00. A 0.45 / 0.55 split means consistency contributes 45% and average content quality contributes 55% of the final score.</p>
        <div className="sm:col-span-2"><Button>Create tracked profile</Button></div>
      </form>
    </CardContent></Card>
  </AppShell>;
}

function Field({ label, name, className, ...props }: { label: string; name: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className={`space-y-2 ${className ?? ""}`}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>;
}
