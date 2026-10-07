import "server-only";

import type { McpAuditRow } from "@/lib/mcp/contract";
import { createAdminClient } from "@/lib/supabase/admin";

// The record of every tool call, and the per-person speed limit that is counted from it. Both use the
// server's own database connection: people can read their own rows but nothing can write or change them
// from a token (see migration 050).

const FOREIGN_KEY_VIOLATION = "23503";

export type AuditEntry = Omit<McpAuditRow, "id" | "created_at">;

export type AuditStore = {
  record: (entry: AuditEntry) => Promise<void>;
  callsInLastMinute: (userId: string) => Promise<number>;
};

export function createAuditStore(): AuditStore {
  return {
    async record(entry) {
      const table = createAdminClient().from("mcp_audit_log");
      const { error } = await table.insert(entry);
      if (!error) return;
      // A call about an idea that doesn't exist (the idea id was made up or already deleted) still has to
      // be recorded: keep everything except the link to the idea.
      if (error.code === FOREIGN_KEY_VIOLATION && entry.idea_id) {
        const retry = await table.insert({ ...entry, idea_id: null });
        if (!retry.error) return;
        throw retry.error;
      }
      throw error;
    },
    async callsInLastMinute(userId) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count, error } = await createAdminClient()
        .from("mcp_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
  };
}
