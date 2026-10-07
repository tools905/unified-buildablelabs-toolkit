import { randomUUID } from "node:crypto";

// A small in-memory stand-in for the Content Board's tables, for testing tools that read and write
// through the Supabase client. It applies filters and ordering, hides rows of workspaces the person isn't
// in (like the database rules do) and fills in the embedded parts the board's own queries ask for.

export type Row = Record<string, any>;

export type BoardSeed = {
  content_ideas?: Row[];
  content_idea_attachments?: Row[];
  content_idea_review_points?: Row[];
  content_idea_assignees?: Row[];
  profiles?: Row[];
  mcp_upload_links?: Row[];
  mcp_audit_log?: Row[];
  memberOf: string[];
  // The server's own connection: no row rules.
  admin?: boolean;
  // Files already in storage, by path.
  objects?: Record<string, Uint8Array>;
};

export function fakeBoardDb(seed: BoardSeed) {
  const tables: Record<string, Row[]> = {
    content_ideas: (seed.content_ideas ?? []).map((r) => ({ ...r })),
    content_idea_attachments: (seed.content_idea_attachments ?? []).map((r) => ({ ...r })),
    content_idea_review_points: (seed.content_idea_review_points ?? []).map((r) => ({ ...r })),
    content_idea_assignees: (seed.content_idea_assignees ?? []).map((r) => ({ ...r })),
    profiles: (seed.profiles ?? []).map((r) => ({ ...r })),
    mcp_upload_links: (seed.mcp_upload_links ?? []).map((r) => ({ ...r })),
    mcp_audit_log: (seed.mcp_audit_log ?? []).map((r) => ({ ...r })),
  };
  const objects: Record<string, Uint8Array> = { ...(seed.objects ?? {}) };
  const storageCalls = { removed: [] as string[], uploaded: [] as string[], signed: [] as string[] };
  const visible = (table: string) =>
    tables[table].filter(
      (row) => seed.admin || table === "profiles" || row.workspace_id === undefined || seed.memberOf.includes(row.workspace_id),
    );

  function builder(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let wantsRow = false;
    let patch: Row = {};
    let inserted: Row = {};
    let columns = "";
    const filters: ((row: Row) => boolean)[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;

    const shape = (row: Row) => {
      const out: Row = { ...row };
      if (table === "content_ideas") {
        if (columns.includes("attachments:content_idea_attachments(")) out.attachments = visible("content_idea_attachments").filter((a) => a.idea_id === row.id);
        if (columns.includes("review_points:content_idea_review_points(")) out.review_points = visible("content_idea_review_points").filter((p) => p.idea_id === row.id);
        if (columns.includes("assignees:content_idea_assignees(")) out.assignees = visible("content_idea_assignees").filter((a) => a.idea_id === row.id);
      }
      if (table === "content_idea_review_points" && columns.includes("author:profiles")) {
        out.author = tables.profiles.find((p) => p.id === row.created_by) ?? null;
      }
      return out;
    };
    const matching = () => {
      let rows = visible(table).filter((row) => filters.every((test) => test(row)));
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows = [...rows].sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * (ascending ? 1 : -1));
      }
      return rows;
    };
    const run = () => {
      if (op === "insert") {
        if (!seed.admin && inserted.workspace_id && !seed.memberOf.includes(inserted.workspace_id)) {
          return { data: null, error: new Error("row-level security") };
        }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), is_resolved: false, resolved_at: null, ...inserted };
        tables[table].push(row);
        return { data: wantsRow ? [shape(row)] : null, error: null };
      }
      if (op === "delete") {
        const hit = matching();
        tables[table] = tables[table].filter((row) => !hit.includes(row));
        return { data: hit.map(shape), error: null };
      }
      if (op === "update") {
        const hit = matching();
        hit.forEach((row) => Object.assign(row, patch));
        return { data: hit.map(shape), error: null };
      }
      return { data: matching().map(shape), error: null };
    };

    const api: Record<string, any> = {
      select: (cols: string) => {
        columns = cols;
        wantsRow = true;
        return api;
      },
      insert: (row: Row) => {
        op = "insert";
        inserted = row;
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (value === null ? row[column] == null : row[column] === value));
        return api;
      },
      gt: (column: string, value: string) => {
        filters.push((row) => row[column] != null && String(row[column]) > value);
        return api;
      },
      lt: (column: string, value: string) => {
        filters.push((row) => row[column] != null && String(row[column]) < value);
        return api;
      },
      limit: () => api,
      single: async () => {
        const result = run();
        const row = (result.data as Row[] | null)?.[0] ?? null;
        return { data: row, error: row ? result.error : (result.error ?? new Error("no row")) };
      },
      update: (next: Row) => {
        op = "update";
        patch = next;
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      gte: (column: string, value: string) => {
        filters.push((row) => row[column] != null && String(row[column]) >= value);
        return api;
      },
      lte: (column: string, value: string) => {
        filters.push((row) => row[column] != null && String(row[column]) <= value);
        return api;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orderBy = { column, ascending: options?.ascending ?? true };
        return api;
      },
      maybeSingle: async () => {
        const result = run();
        return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return api;
  }

  const storage = {
    from: () => ({
      createSignedUploadUrl: async (path: string) => {
        storageCalls.signed.push(path);
        return { data: { path, token: `token-for-${path}`, signedUrl: `https://storage.test/${path}` }, error: null };
      },
      download: async (path: string) =>
        path in objects ? { data: new Blob([objects[path] as BlobPart]), error: null } : { data: null, error: new Error("Object not found") },
      upload: async (path: string, body: Uint8Array) => {
        objects[path] = new Uint8Array(body);
        storageCalls.uploaded.push(path);
        return { data: { path }, error: null };
      },
      list: async (folder: string, options?: { search?: string }) => ({
        data: Object.keys(objects)
          .filter((path) => path.startsWith(`${folder}/`) && (!options?.search || path.slice(folder.length + 1).includes(options.search)))
          .map((path) => ({ name: path.slice(folder.length + 1) })),
        error: null,
      }),
      remove: async (paths: string[]) => {
        for (const path of paths) {
          storageCalls.removed.push(path);
          delete objects[path];
        }
        return { data: paths, error: null };
      },
    }),
  };

  return { client: { from: (table: string) => builder(table), storage } as never, tables, objects, storageCalls };
}
