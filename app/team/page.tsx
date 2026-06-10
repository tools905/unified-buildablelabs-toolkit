import Link from "next/link";
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
import { getCurrentWorkspace, getWorkspaceMembers, isWorkspaceAdmin, setWorkspaceRole } from "@/lib/services/workspace-service";
import { inviteSchema } from "@/lib/validation/invite-schema";
import type { WorkspaceRole } from "@/lib/db/types";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    email?: string;
    error?: string;
    seeded?: string;
  }>;
}) {
  const params = await searchParams;
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
    
    let success = false;
    let errorMsg = "";
    try {
      await createInvite(supabase, {
        workspaceId: workspace.id,
        email: input.email,
        role: input.role,
        invitedBy: user.id,
      });
      success = true;
    } catch (err: any) {
      if (err && err.digest && err.digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      errorMsg = err instanceof Error ? err.message : "Failed to send invite";
    }

    if (success) {
      redirect(`/team?success=invited&email=${encodeURIComponent(input.email)}`);
    } else {
      redirect(`/team?error=${encodeURIComponent(errorMsg)}`);
    }
  }

  async function resendInviteAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");
    if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) {
      throw new Error("Admin access required.");
    }
    
    const inviteId = String(formData.get("inviteId"));
    const { data: invite, error: fetchErr } = await supabase
      .from("invites")
      .select("*")
      .eq("id", inviteId)
      .single();

    if (fetchErr || !invite) {
      redirect(`/team?error=${encodeURIComponent("Invite not found")}`);
    }

    let success = false;
    let errorMsg = "";
    try {
      await createInvite(supabase, {
        workspaceId: workspace.id,
        email: invite.email,
        role: invite.role,
        invitedBy: user.id,
      });
      success = true;
    } catch (err: any) {
      if (err && err.digest && err.digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      errorMsg = err instanceof Error ? err.message : "Failed to resend invite";
    }

    if (success) {
      redirect(`/team?success=resent&email=${encodeURIComponent(invite.email)}`);
    } else {
      redirect(`/team?error=${encodeURIComponent(errorMsg)}`);
    }
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

  async function toggleRoleAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");
    if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) {
      throw new Error("Admin access required.");
    }
    const targetUserId = String(formData.get("userId"));
    const newRole = String(formData.get("role")) as WorkspaceRole;
    if (targetUserId === user.id) {
      throw new Error("You cannot change your own role.");
    }
    await setWorkspaceRole(supabase, workspace.id, targetUserId, newRole);
    redirect("/team");
  }

  const [members, { data: invites }] = await Promise.all([
    getWorkspaceMembers(supabase, workspace.id),
    supabase.from("invites").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
  ]);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Team</h1>
          <p className="text-muted-foreground">Manage members and invitations.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/team/logs">View logs</Link>
        </Button>
      </div>

      {params.success === "invited" && params.email && (
        <Alert className="mb-6 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            An invitation email has been sent to <strong>{params.email}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {params.success === "resent" && params.email && (
        <Alert className="mb-6 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <AlertTitle>Invite Resent</AlertTitle>
          <AlertDescription>
            The invitation email for <strong>{params.email}</strong> has been resent.
          </AlertDescription>
        </Alert>
      )}

      {params.error && (
        <Alert className="mb-6 border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{params.error}</AlertDescription>
        </Alert>
      )}

      {params.seeded === "1" && (
        <Alert className="mb-6 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <AlertTitle>Seeded Successfully</AlertTitle>
          <AlertDescription>
            Dummy workspace members have been added for local testing.
          </AlertDescription>
        </Alert>
      )}

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
                    <TableCell className="flex items-center gap-2">
                      <Badge>{member.role}</Badge>
                      {admin && member.user_id !== user.id ? (
                        <form action={toggleRoleAction}>
                          <input type="hidden" name="userId" value={member.user_id} />
                          <input
                            type="hidden"
                            name="role"
                            value={member.role === "admin" ? "member" : "admin"}
                          />
                          <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]">
                            {member.role === "admin" ? "Demote" : "Promote"}
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
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
              {(invites ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No pending invites.</p>
              ) : (
                (invites ?? []).map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                    <div>
                      <div className="font-medium">{invite.email}</div>
                      <div className="text-xs text-muted-foreground capitalize">{invite.status} ({invite.role})</div>
                    </div>
                    {invite.status === "pending" ? (
                      <form action={resendInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          Resend
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
