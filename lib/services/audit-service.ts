import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Records who did what. The audit table lets signed-in users read it (admins only) but not write
// to it, so a write made with the person's own connection is refused. Those refused entries used
// to vanish without a trace; now the server's own connection writes them instead. A failure to
// log is reported in the server log but never fails the action that triggered it.
export async function writeAuditLog(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId?: string | null;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const row = {
    workspace_id: input.workspaceId ?? null,
    actor_id: input.actorId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  };

  const first = await supabase.from("audit_logs").insert(row);
  if (!first?.error) return;

  try {
    const retry = await createAdminClient().from("audit_logs").insert(row);
    if (retry.error) console.error(`Could not write the "${input.action}" audit entry:`, retry.error.message);
  } catch (failure) {
    console.error(`Could not write the "${input.action}" audit entry:`, failure);
  }
}
