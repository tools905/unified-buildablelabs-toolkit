# Contributing

## Development setup

```bash
pnpm install
cp .env.example .env.local   # fill in real values — never commit this file
pnpm dev
```

Open `http://localhost:3000/teams` — the app runs under a `/teams` base path
(`lib/utils/app-url.ts`), so `/teams/dashboard`, `/teams/tools`, etc.

## Pre-commit hook (secret scanning)

```bash
./scripts/setup-hooks.sh   # one-time
```

This installs `scripts/pre-commit-hook.sh`, which blocks commits that look
like they contain a secret or an untracked env/data file. If it produces a
false positive, fix the pattern in that script rather than routinely using
`git commit --no-verify`.

## Code style

- TypeScript strict mode — avoid `any` where a real type is available
  (services use `SupabaseClient<any>` throughout since `lib/db/types.ts` is a
  hand-maintained reference, not a strictly-enforced generic — match that
  existing pattern rather than introducing a different typing style)
- ESLint config: `eslint.config.mjs` — includes the React Compiler
  `react-hooks/set-state-in-effect` and purity rules; prefer deriving state
  during render over `useEffect` + `setState` where possible
- Naming: kebab-case files (`ticket-service.ts`), PascalCase components,
  camelCase functions/vars

## Adding a new feature/module

Follow the pattern of the Tickets/Resources/Meetings modules added in this
round of work:

1. Migration: `supabase/migrations/NNN_description.sql`
   - Table(s), indexes, `enable row level security`, policies
   - Reuse `is_workspace_member(workspace_id, auth.uid())` /
     `is_workspace_admin(...)` for RLS instead of writing new membership logic
   - If it's a user-facing module, insert a row into `public.tools` and add
     the slug to `ToolkitToolSlug` + `toolkitTools` in
     `modules/core/tools/registry.ts`
   - End the file with a commented-out reverse-SQL block (there's no
     automated down-migration runner — see `docs/DEPLOYMENT.md`)
2. Types: extend `lib/db/types.ts` (Row/Insert/Update per table)
3. Validation: `lib/validation/<feature>-schema.ts` (Zod)
4. Service: `lib/services/<feature>-service.ts` — functions take
   `(supabase, ...)` as the first arg(s), throw on Supabase errors, call
   `writeAuditLog()` for mutations
   - **Check for a name collision before creating a service file** — e.g.
     `review-service.ts` already exists for peer review's 360 assessment;
     the ticket progress-review service is `ticket-review-service.ts`. The
     Write tool will refuse to overwrite an unread existing file, which is
     what caught this the first time.
5. Server actions: `app/<route>/actions.ts` (`"use server"`), each wrapped
   in a `require<Feature>Context()` helper that resolves the workspace and,
   where needed, checks admin (mirror `requireTicketsAdminContext` in
   `app/tools/tickets/actions.ts`)
6. Pages/components: Server Components fetch data and call `requireUser()` /
   `requireEnabledTool()` / `requireDefaultWorkspace()`; interactive pieces
   are separate `"use client"` components
7. Nav: add the module to `components/dashboard/sidebar-nav.tsx`'s `toolNav`
8. Verify:
   ```bash
   pnpm lint && pnpm test && pnpm build
   ```

## Testing

```bash
pnpm test        # run once
pnpm test:watch  # watch mode
```

Services that `import "server-only"` need the `server-only` alias in
`vitest.config.ts` (already set up) — Vitest runs in plain Node, not
Next's bundler, so the real package isn't resolvable otherwise.

## Database migrations

- File naming: `NNN_description.sql`, next number after the highest existing
- Never edit an already-applied migration — write a new one
- Every migration should end with a commented-out block showing how to
  reverse it (see any `017`+ migration for the format)

## PR checklist

- [ ] New migrations included and use existing RLS helper functions
- [ ] No hardcoded secrets (pre-commit hook should catch this)
- [ ] `pnpm lint && pnpm test && pnpm build` all pass
- [ ] New module registered in `modules/core/tools/registry.ts` and nav (if
      user-facing)
- [ ] Docs updated if the change affects `docs/ARCHITECTURE.md` or
      `docs/DEPLOYMENT.md`
