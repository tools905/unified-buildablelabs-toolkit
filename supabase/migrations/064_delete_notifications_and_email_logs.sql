-- People can delete their own notifications, and admins can delete their workspace's email history
-- (Notifications page and Workspace logs: tick items, then the dustbin).

create policy "users delete own notifications" on public.notifications for delete to authenticated
using (user_id = auth.uid());

create policy "admins delete notification logs" on public.notification_logs for delete to authenticated
using (workspace_id is not null and public.is_workspace_admin(workspace_id, auth.uid()));

-- Rollback:
-- drop policy if exists "users delete own notifications" on public.notifications;
-- drop policy if exists "admins delete notification logs" on public.notification_logs;
