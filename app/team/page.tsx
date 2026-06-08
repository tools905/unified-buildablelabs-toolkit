import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/require-user";
import { isDevTestingEnabled, seedDummyWorkspaceMembers } from "@/lib/services/dev-testing-service";
import { createInvite } from "@/lib/services/invite-service";
import { getCurrentWorkspace, getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { inviteSchema } from "@/lib/validation/invite-schema";

export default async function TeamPage() {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) redirect("/dashboard");
  const devTestingEnabled = isDevTestingEnabled();

  async function inviteAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");
    const input = inviteSchema.parse({
      email: formData.get("email"),
      role: formData.get("role") || "member",
    });
    await createInvite(supabase, {
      workspaceId: workspace.id,
      email: input.email,
      role: input.role,
      invitedBy: user.id,
    });
    redirect("/team");
  }

  async function seedDummyMembersAction() {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");
    if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) {
      throw new Error("Admin access required.");
    }
    await seedDummyWorkspaceMembers(workspace.id);
    redirect("/team?seeded=1");
  }

  const [members, { data: invites }] = await Promise.all([
    getWorkspaceMembers(supabase, workspace.id),
    supabase.from("invites").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
  ]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Team</h1>
        <p className="text-muted-foreground">Manage members and invitations.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.profiles?.full_name ?? "Unnamed"}</TableCell>
                    <TableCell>{member.profiles?.email}</TableCell>
                    <TableCell><Badge>{member.role}</Badge></TableCell>
                    <TableCell>{member.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {devTestingEnabled ? (
            <Card>
              <CardHeader>
                <CardTitle>Local testing panel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTitle>Dummy reviewers</AlertTitle>
                  <AlertDescription>
                    Add two confirmed dummy members to this workspace. Use them
                    to create a 3-person project, start a round, then log in as
                    each dummy member to submit assigned reviews.
                  </AlertDescription>
                </Alert>
                <form action={seedDummyMembersAction}>
                  <Button className="w-full" type="submit">
                    Add dummy members
                  </Button>
                </form>
                <div className="rounded-md border border-border bg-muted p-3 text-sm">
                  <div className="font-medium">Dummy password</div>
                  <code>TestReview123!</code>
                  <p className="mt-2 text-muted-foreground">
                    The generated emails appear in the member list after seeding.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Invite member</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={inviteAction} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select id="role" name="role" className="h-10 w-full rounded-md border border-border bg-card px-3">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button className="w-full">Send invite</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Invites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(invites ?? []).map((invite) => (
                <div key={invite.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium">{invite.email}</div>
                  <div className="text-muted-foreground">{invite.status}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
