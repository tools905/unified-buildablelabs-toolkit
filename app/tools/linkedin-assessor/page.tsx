import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function LinkedInAssessorPage() {
  await requireUser("/tools/linkedin-assessor");
  await requireEnabledTool("linkedin-assessor");

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">LinkedIn Assessor</h1>
        <p className="text-muted-foreground">Profile tracking and content scoring will live here.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Module shell ready</CardTitle>
          <CardDescription>
            The toolkit now has a dedicated LinkedIn Assessor module boundary for future scoring,
            post collection, reports, and admin settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No LinkedIn scraping, OAuth, or scoring job is active in this skeleton.
        </CardContent>
      </Card>
    </AppShell>
  );
}
