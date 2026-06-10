import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/require-user";
import { acceptInvite } from "@/lib/services/invite-service";
import { createWorkspace, ensureProfile, getCurrentWorkspace, joinDefaultWorkspace } from "@/lib/services/workspace-service";

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
    await joinDefaultWorkspace(supabase, user.id);
    redirect("/dashboard");
  }

  async function createWorkspaceAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    await createWorkspace(supabase, {
      name: String(formData.get("name") ?? ""),
      userId: user.id,
    });
    redirect("/dashboard");
  }

  return (
    <AppShell>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Create workspace</CardTitle>
          <CardDescription>
            Set up the team space where projects and peer reviews will live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createWorkspaceAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <Button>Create workspace</Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
