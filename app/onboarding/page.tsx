import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { acceptInvite } from "@/lib/services/invite-service";
import { ensureProfile, getCurrentWorkspace, joinDefaultWorkspace } from "@/lib/services/workspace-service";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  const inviteQuery = params.invite ? `?invite=${params.invite}` : "";
  const { supabase, user } = await requireUser(`/onboarding${inviteQuery}`);
  await ensureProfile(supabase, user);

  if (params.invite) {
    await acceptInvite(supabase, params.invite, user.id);
    redirect("/dashboard");
  }

  const existing = await getCurrentWorkspace(supabase, user.id);
  if (existing) {
    redirect("/dashboard");
  } else {
    const joined = await joinDefaultWorkspace(supabase, user.id);
    if (joined) redirect("/dashboard");
  }

  return (
    <AppShell>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Workspace access required</CardTitle>
          <CardDescription>
            Your account is not currently an active member of the BuildableLabs workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ask a workspace admin to invite or reactivate you before continuing.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
