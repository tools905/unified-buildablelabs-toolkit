import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The safety migration (057) can only be run against the real database, so these checks keep its three lists
// from drifting apart from each other and from what the connector's tools actually use.

const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "057_mcp_connector_safety_rules.sql"), "utf8");

// The tables the connector's tools touch with the person's own connection (the server's connection is not limited).
const TABLES_THE_TOOLS_USE = [
  "content_ideas",
  "content_idea_attachments",
  "content_idea_review_points",
  "content_idea_assignees",
  "profiles",
  "workspace_members",
  "workspaces",
];

function listIn(name: string): string[] {
  const match = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql);
  if (!match) throw new Error(`no list called ${name} in the migration`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

function allowedPaths(): string[] {
  const match = /path !~ '\^\/\(([^)]*)\)\$'/.exec(sql);
  if (!match) throw new Error("no path check in the migration");
  return match[1].split("|");
}

describe("the connector safety migration", () => {
  it("lets a connector token reach exactly the tables the tools use, in the row rules and in the request check", () => {
    const rowRules = [...listIn("board_open"), ...listIn("read_only")].sort();
    expect(rowRules).toEqual([...TABLES_THE_TOOLS_USE].sort());
    expect(allowedPaths().sort()).toEqual([...TABLES_THE_TOOLS_USE].sort());
  });

  it("never lets a token change who is in a workspace, a person's profile, files or assignments", () => {
    const readOnly = listIn("read_only");
    for (const table of ["profiles", "workspace_members", "workspaces", "content_idea_attachments", "content_idea_assignees"]) {
      expect(readOnly).toContain(table);
    }
    expect(listIn("board_open")).toEqual(["content_ideas", "content_idea_review_points"]);
  });

  it("keeps the connector's own tables, the audit records and every other tool's data out of reach", () => {
    const reachable = new Set(allowedPaths());
    for (const table of ["mcp_audit_log", "mcp_upload_links", "audit_logs", "tickets", "newsletter_posts", "linkedin_posts", "system_settings"]) {
      expect(reachable.has(table)).toBe(false);
    }
  });

  it("only affects tokens that carry a client_id, and does nothing when it can't read one", () => {
    expect(sql).toContain("coalesce(auth.jwt() ->> 'client_id', '') <> ''");
    expect(sql).toMatch(/if claims is null or coalesce\(claims ->> 'client_id', ''\) = '' then\s+return;/);
    expect(sql).toMatch(/exception when others then\s+return;/);
  });

  it("can be run again, and says how to undo it", () => {
    expect(sql).toContain("drop policy if exists %I on public.%I");
    expect(sql).toContain("create or replace function public.is_connector_token()");
    expect(sql).toContain("-- Rollback");
    expect(sql).toContain("alter role authenticator reset pgrst.db_pre_request;");
  });

  it("keeps the checks that list unprotected tables away from signed-in people", () => {
    expect(sql).toContain("revoke all on function public.mcp_unprotected_tables() from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.mcp_unprotected_tables() to service_role;");
  });
});
