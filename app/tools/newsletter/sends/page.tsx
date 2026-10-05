import Link from "next/link";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { CancelSendButton } from "@/components/newsletter/cancel-send-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSends, type NewsletterSend, type NewsletterSendStats } from "@/lib/services/newsletter-send-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { cn } from "@/lib/utils/cn";
import { formatISTShortDateTime } from "@/lib/utils/dates";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<NewsletterSend["status"], string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function when(send: NewsletterSend) {
  if (send.status === "scheduled") return `For ${formatISTShortDateTime(send.scheduled_at)}`;
  if (send.status === "cancelled") return `Was for ${formatISTShortDateTime(send.scheduled_at)}`;
  return formatISTShortDateTime(send.completed_at ?? send.started_at ?? send.scheduled_at);
}

// Anything that didn't simply go out, in plain words under the issue's title.
function notes(stats: NewsletterSendStats | null) {
  if (!stats) return [];
  return [
    stats.queued ? `${stats.queued} still queued` : "",
    stats.failed ? `${stats.failed} failed` : "",
    stats.skipped ? `${stats.skipped} not sent (printed to the server log, or no longer subscribed)` : "",
    stats.complained ? `${stats.complained} marked it as spam` : "",
  ].filter(Boolean);
}

export default async function NewsletterSendsPage() {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await requireUser("/tools/newsletter/sends");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const [admin, sends] = await Promise.all([
    isWorkspaceAdmin(workspace.id, user.id, supabase),
    listSends(createAdminClient(), workspace.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="The Buildable Labs Times — Newsroom"
        title="Sends"
        description="Every issue emailed to subscribers, and how it did. Opens are approximate: some mail apps load images for privacy, which counts as an open, so clicks are the surer signal."
        actions={
          <Button asChild variant="outline">
            <Link href="/tools/newsletter">Posts</Link>
          </Button>
        }
      />

      {sends.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-muted py-20 text-center">
          <Mail className="h-8 w-8 text-quiet" strokeWidth={1.3} />
          <p className="text-base font-semibold text-foreground">No issues emailed yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Open a published post in the Posts list and choose the mail icon to email it to subscribers.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Opened</TableHead>
              <TableHead className="text-right">Clicked</TableHead>
              <TableHead className="text-right">Bounced</TableHead>
              <TableHead className="text-right">Unsubscribed</TableHead>
              <TableHead className="w-0" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sends.map(({ send, stats }) => (
              <TableRow key={send.id} className={cn(send.status === "cancelled" && "text-muted-foreground")}>
                <TableCell className="max-w-[280px]">
                  <p className="truncate font-semibold text-foreground">{send.subject}</p>
                  {send.subject !== send.post_title ? (
                    <p className="truncate text-xs text-muted-foreground">{send.post_title}</p>
                  ) : null}
                  {notes(stats).map((note) => (
                    <p key={note} className="text-xs text-muted-foreground">
                      {note}
                    </p>
                  ))}
                </TableCell>
                <TableCell>
                  <Badge className={cn(send.status === "failed" && "border-destructive/40 text-destructive")}>
                    {STATUS_LABELS[send.status]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{when(send)}</TableCell>
                <TableCell className="text-right tabular-nums">{stats?.recipients ?? send.recipient_count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {stats ? `${stats.delivered} · ${percent(stats.delivered, stats.sent)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {stats ? `${stats.opened} · ${percent(stats.opened, stats.delivered)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {stats ? `${stats.clicked} · ${percent(stats.clicked, stats.delivered)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{stats?.bounced ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{stats?.unsubscribed ?? "—"}</TableCell>
                <TableCell>
                  {admin && send.status === "scheduled" ? <CancelSendButton sendId={send.id} title={send.post_title} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
