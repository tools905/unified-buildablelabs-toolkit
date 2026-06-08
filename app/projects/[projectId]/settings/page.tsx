import { AppShell } from "@/components/dashboard/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireUser } from "@/lib/auth/require-user";

export default async function ProjectSettingsPage() {
  await requireUser();
  return (
    <AppShell>
      <Alert>
        <AlertTitle>Project settings</AlertTitle>
        <AlertDescription>
          MVP settings are managed during project creation. Member and cadence editing can be added after the first release.
        </AlertDescription>
      </Alert>
    </AppShell>
  );
}
