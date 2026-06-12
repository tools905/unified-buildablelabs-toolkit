# Unified BuildableLabs Toolkit Development Log

## Current Status

The app is now the `unified-buildablelabs-toolkit` project, built from the original Peer Review codebase.

The first implementation pass created a shared internal toolkit shell while keeping the Peer Review functionality intact. LinkedIn Assessor and HR Bot currently exist as route/module shells for future build-out.

Repository:

```txt
https://github.com/tools905/unified-buildablelabs-toolkit.git
```

Latest implementation commit:

```txt
3048c2f Build unified toolkit skeleton
```

## Current Directory Structure

```txt
unified-buildablelabs-toolkit/
|-- app/
|   |-- dashboard/
|   |-- admin/
|   |   |-- page.tsx
|   |   |-- tools/page.tsx
|   |   |-- settings/page.tsx
|   |   `-- audit-logs/page.tsx
|   |-- tools/
|   |   |-- page.tsx
|   |   |-- peer-review/
|   |   |   |-- page.tsx
|   |   |   |-- layout.tsx
|   |   |   |-- admin/
|   |   |   |-- member/
|   |   |   `-- reports/
|   |   |-- linkedin-assessor/
|   |   |   |-- page.tsx
|   |   |   |-- admin/page.tsx
|   |   |   `-- reports/page.tsx
|   |   `-- hr-bot/
|   |       |-- page.tsx
|   |       |-- admin/page.tsx
|   |       `-- chat/page.tsx
|   |-- projects/
|   `-- my-reviews/
|-- modules/
|   |-- core/
|   |   |-- tools/registry.ts
|   |   `-- workspace/default-workspace.ts
|   |-- peer-review/index.ts
|   |-- linkedin-assessor/index.ts
|   |-- hr-bot/index.ts
|   `-- shared/
|       |-- ai/index.ts
|       `-- reports/index.ts
|-- components/
|   |-- dashboard/app-shell.tsx
|   `-- ui/
|-- lib/
|   |-- auth/
|   |-- services/
|   |-- supabase/
|   |-- validation/
|   `-- utils/
|-- supabase/migrations/
|   |-- 001_initial_schema.sql
|   |-- ...
|   `-- 009_toolkit_core.sql
`-- tests/
```

## Architecture Rules

- One internal app.
- One Supabase project/database.
- One default internal workspace.
- Two roles: `admin` and `member`.
- Shared auth, shell, dashboard, reports, and tool registry.
- Tools live under `app/tools/{tool-slug}` for routes and `modules/{tool-slug}` for business logic.
- Do not build separate auth, users, databases, or standalone apps per tool.
- Do not commit real Supabase, Resend, Vercel, AI, cron, or database secrets.

## Important Files

```txt
modules/core/tools/registry.ts
components/dashboard/app-shell.tsx
modules/core/workspace/default-workspace.ts
supabase/migrations/009_toolkit_core.sql
```

`modules/core/tools/registry.ts` is the central tool registry. It defines the known tools and reads the `tools` table when Supabase is configured.

`components/dashboard/app-shell.tsx` controls shared navigation and changes visible links based on whether the current user is an admin or member.

`modules/core/workspace/default-workspace.ts` keeps the old Peer Review workspace schema compatible while treating the product as one internal BuildableLabs workspace.

`supabase/migrations/009_toolkit_core.sql` adds shared toolkit tables:

```txt
tools
tool_settings
notifications
jobs
```

## Current Routes

```txt
/dashboard
/tools
/tools/peer-review
/tools/peer-review/admin
/tools/peer-review/member
/tools/peer-review/reports
/tools/linkedin-assessor
/tools/linkedin-assessor/admin
/tools/linkedin-assessor/reports
/tools/hr-bot
/tools/hr-bot/admin
/tools/hr-bot/chat
/admin
/admin/tools
/admin/settings
/admin/audit-logs
```

Legacy Peer Review routes still exist as redirects:

```txt
/projects -> /tools/peer-review/admin
/my-reviews -> /tools/peer-review/member
```

## How To Add A New Tool

### 1. Add The Module

Create:

```txt
modules/my-new-tool/
|-- index.ts
|-- services/
|-- types/
|-- reports/
`-- workflows/
```

Use `services/` for database/service logic, `types/` for tool-specific TypeScript types, `reports/` for report generation, and `workflows/` for multi-step jobs.

### 2. Add The Routes

Create:

```txt
app/tools/my-new-tool/
|-- page.tsx
|-- admin/page.tsx
|-- member/page.tsx
`-- reports/page.tsx
```

Use `app/tools/my-new-tool/page.tsx` as the default landing or redirect page.

Use `admin/page.tsx` for admin-only controls.

Use `member/page.tsx` for logged-in member workflows.

Use `reports/page.tsx` for report dashboards.

### 3. Register The Tool In Code

Update `modules/core/tools/registry.ts`:

```ts
{
  name: "My New Tool",
  slug: "my-new-tool",
  description: "What this tool does.",
  enabled: true,
  adminOnly: false,
}
```

If adding a new slug, also extend the `ToolkitToolSlug` union type.

### 4. Register The Tool In Supabase

Add a new migration, for example:

```txt
supabase/migrations/010_my_new_tool.sql
```

Seed the tool:

```sql
insert into public.tools (name, slug, description, enabled)
values ('My New Tool', 'my-new-tool', 'What this tool does.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  enabled = excluded.enabled,
  updated_at = now();
```

### 5. Add Tool Tables If Needed

Add tool-specific tables in the same migration. Prefer names scoped to the tool:

```txt
my_new_tool_runs
my_new_tool_items
my_new_tool_reports
```

Keep shared concepts in shared tables only when they are truly cross-tool.

### 6. Add Background Jobs If Needed

For scheduled or long-running workflows, add:

```txt
app/api/cron/my-new-tool-job/route.ts
modules/my-new-tool/services/job-service.ts
```

Use the existing cron secret pattern from the Peer Review cron routes.

If the workflow should be tracked, insert/update rows in the shared `jobs` table.

### 7. Add Shared AI Only Once

Provider/client handling belongs in:

```txt
modules/shared/ai/
```

Tool-specific prompt templates and scoring rules belong in:

```txt
modules/my-new-tool/
```

Do not duplicate API client logic in each tool.

### 8. Add Tests

Place tests under:

```txt
tests/
```

Recommended test types:

- validation tests
- service tests
- scoring/report tests
- workflow/job tests
- permission tests for admin vs member behavior

## Suggested Future LinkedIn Assessor Build Path

1. Create LinkedIn schema migration.
2. Add `modules/linkedin-assessor/services`.
3. Add profile management in `/tools/linkedin-assessor/admin`.
4. Add tracking runs and post ingestion as isolated services.
5. Add scoring/report generation under `modules/linkedin-assessor/reports`.
6. Show member-safe insights under `/tools/linkedin-assessor`.
7. Keep scraping/OAuth/provider logic isolated from dashboards.

## Suggested Future HR Bot Build Path

1. Create HR knowledge base schema migration.
2. Add `modules/hr-bot/services`.
3. Add admin knowledge-base editor in `/tools/hr-bot/admin`.
4. Add controlled chat UI in `/tools/hr-bot/chat`.
5. Use `modules/shared/ai` for the AI client.
6. Keep HR Bot constrained to approved content, not unrestricted chat.
7. Add feedback and audit logging for assistant answers.

## Verification Commands

Run these before committing:

```bash
npx pnpm@9.15.4 lint
npx pnpm@9.15.4 test
npx pnpm@9.15.4 build
```

Current verification after toolkit implementation:

```txt
lint: passed
test: passed, 4 files / 16 tests
build: passed
```

## Deployment Notes

Configure these in Vercel, not in Git:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
DIRECT_URL
RESEND_API_KEY
EMAIL_FROM
OPENROUTER_API_KEY
OPENROUTER_MODEL
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
NEXT_PUBLIC_APP_URL
CRON_SECRET
```

After deployment:

- Update Supabase auth redirect URLs.
- Apply all Supabase migrations.
- Configure Resend sender/domain.
- Update cron callback URL and `CRON_SECRET`.
- Rotate any secrets that were shared outside a secret manager.

## Known Local Caveat

There is a local unstaged deletion of:

```txt
supabase/migrations/008_auto_join_workspace.sql
```

That deletion existed before the toolkit implementation commit and was intentionally not committed. Review it before future commits.
