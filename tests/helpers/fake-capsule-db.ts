// A tiny in-memory stand-in for the Supabase client, covering only the calls the capsule service
// makes: select / update with eq / neq filters, order, limit, single / maybeSingle, the embedded
// atoms select, the seal RPC and audit inserts. Each workspace sees only its own rows, like RLS.

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

export function createFakeCapsuleDb({ workspaceId, posts }: { workspaceId: string; posts: Row[] }) {
  const tables: Tables = { newsletter_posts: posts, newsletter_capsules: [], newsletter_capsule_atoms: [], audit_logs: [] };
  let ids = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  let clock = 0;
  const visible = (row: Row) => !("workspace_id" in row) || row.workspace_id === workspaceId;

  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let embedAtoms = false;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limit = Infinity;

    function rows() {
      let found = tables[table].filter(visible).filter((row) => filters.every((test) => test(row)));
      if (patch) {
        for (const row of found) Object.assign(row, patch);
        found = found.map((row) => ({ ...row }));
      }
      if (orderBy) {
        const { column, ascending } = orderBy;
        found = [...found].sort((a, b) => (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1));
      }
      return found.slice(0, limit).map((row) =>
        embedAtoms ? { ...row, newsletter_capsule_atoms: tables.newsletter_capsule_atoms.filter((a) => a.capsule_id === row.id) } : { ...row },
      );
    }

    const builder: any = {
      select(columns = "*") {
        embedAtoms = columns.includes("newsletter_capsule_atoms(");
        return builder;
      },
      update(values: Row) {
        patch = values;
        return builder;
      },
      insert(values: Row) {
        tables[table].push(values);
        return Promise.resolve({ error: null });
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      order(column: string, { ascending }: { ascending: boolean }) {
        orderBy = { column, ascending };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      single() {
        const [row] = rows();
        return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } });
      },
      maybeSingle() {
        const [row] = rows();
        return Promise.resolve({ data: row ?? null, error: null });
      },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from: query,
    async rpc(name: string, args: Row) {
      if (name !== "seal_newsletter_capsule") return { data: null, error: { message: `unknown rpc ${name}` } };
      const post = tables.newsletter_posts.find((row) => row.id === args.target_post_id && visible(row));
      if (!post) return { data: null, error: { code: "P0002", message: "newsletter post not found" } };
      const id = nextId();
      // Seals in the same millisecond still sort in the order they were made.
      const sealedAt = new Date(Date.UTC(2026, 9, 5, 12, 0, 0, ++clock)).toISOString();
      tables.newsletter_capsules.push({
        id,
        workspace_id: post.workspace_id,
        post_id: post.id,
        draft_version: args.target_draft_version,
        canonical_url: args.target_canonical_url ?? "",
        sealed_at: sealedAt,
      });
      for (const atom of args.target_atoms as Row[]) {
        tables.newsletter_capsule_atoms.push({
          capsule_id: id,
          workspace_id: post.workspace_id,
          status: "sealed",
          platform_url: null,
          opened_at: null,
          posted_at: null,
          ...atom,
        });
      }
      return { data: id, error: null };
    },
  };

  return { client: client as never, tables };
}
