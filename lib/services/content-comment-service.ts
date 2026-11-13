import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/services/notification-service";
import { sendContentCommentEmail } from "@/lib/services/email-service";
import { getAppLink } from "@/lib/utils/app-url";
import { commentNotice, commentRecipients, emailAllowedSince, type CommentKind } from "@/lib/utils/comment-notify";

type PersonRow = { id: string; full_name: string | null; email: string | null };

// Tells the people on a post about a new comment (see lib/utils/comment-notify.ts): a bell
// notification every time, and an email within the limits. Best effort: the comment is saved
// whatever happens here, so failures are only logged.
export async function notifyPostComment(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; ideaId: string; actorId: string; kind: CommentKind },
) {
  try {
    const { data: idea, error } = await supabase
      .from("content_ideas")
      .select("id, title, status, status_changed_at, created_at, created_by, assignees:content_idea_assignees(user_id), attachments:content_idea_attachments(created_by)")
      .eq("id", input.ideaId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!idea) return;

    const recipients = commentRecipients({
      createdBy: idea.created_by,
      uploaders: (idea.attachments ?? []).map((row: { created_by: string | null }) => row.created_by),
      assignees: (idea.assignees ?? []).map((row: { user_id: string }) => row.user_id),
      actorId: input.actorId,
    });
    if (recipients.length === 0) return;

    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", [input.actorId, ...recipients]);
    const find = (id: string) => (people as PersonRow[] | null)?.find((person) => person.id === id);
    const actor = find(input.actorId);
    const notice = commentNotice(input.kind, actor?.full_name || actor?.email || "Someone", idea.title ?? "");
    const since = emailAllowedSince(idea);
    const url = getAppLink(`/tools/content-board?idea=${idea.id}`);
    const admin = createAdminClient();

    const results = await Promise.allSettled(
      recipients.map(async (userId) => {
        await createNotification({
          userId,
          type: input.kind === "pencil" ? "content_idea_markup" : "content_idea_comment",
          title: notice.bellTitle,
          message: notice.bellMessage,
        });
        const person = find(userId);
        if (!person?.email) return;
        const { data: allowed, error: claimError } = await admin.rpc("claim_content_comment_email", { p_idea: idea.id, p_user: userId, p_since: since });
        if (claimError) throw claimError;
        if (!allowed) return;
        await sendContentCommentEmail(supabase, {
          to: person.email,
          recipientName: person.full_name?.split(/\s+/)[0] || person.email,
          subject: notice.subject,
          line: notice.line,
          url,
          workspaceId: input.workspaceId,
        });
      }),
    );
    for (const result of results) if (result.status === "rejected") console.error("comment notification failed", result.reason);
  } catch (error) {
    console.error("comment notifications failed", error);
  }
}
