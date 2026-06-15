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

## LinkedIn Assessor Implementation

The standalone LinkedIn Assessor workflow was migrated into the unified toolkit.
The source snapshot remains available in the separate `linkedin-assessor` Git
repository, but ongoing development now belongs here.

Implemented routes:

```txt
/tools/linkedin-assessor
/tools/linkedin-assessor/admin
/tools/linkedin-assessor/admin/members/new
/tools/linkedin-assessor/admin/members/[id]
/tools/linkedin-assessor/admin/posts
/tools/linkedin-assessor/admin/leaderboards
/tools/linkedin-assessor/admin/settings
/tools/linkedin-assessor/reports
```

Implemented workflow:

1. Admin creates a tracked LinkedIn profile and may link it to a toolkit user.
2. Daily sync selects the configured connector and stores all fetched activities.
3. Only activities classified as `original_post` become assessable posts.
4. Unscored posts use the shared intelligence layer: OpenRouter first, DeepSeek
   second, and the deterministic local scorer if both are unavailable.
5. Member statistics combine prorated posting volume and average post quality.
6. Admins can view team dashboards, post intelligence, leaderboards, settings,
   analysis windows, and weekly reports.
7. Members can only view their own linked profile, and only when member insights
   are enabled.

Module structure:

```txt
modules/linkedin-assessor/
  analytics.ts
  connectors.ts
  context.ts
  fallback-scoring.ts
  scoring.ts
  service.ts
  types.ts
  validation.ts
```

Database migration:

```txt
supabase/migrations/010_linkedin_assessor.sql
```

The migration was applied to Supabase project `zvqyldecmclgoddukmnl` and verified
through the migration history and REST table endpoints.

Connector status:

- `mock`: functional and deterministic for end-to-end testing.
- `linkedin_oauth`: boundary exists; provider implementation still required.
- `third_party_api`: boundary exists; provider implementation still required.
- `fallback`: boundary exists; compliant collection implementation still required.

Scheduled routes:

```txt
/api/cron/linkedin-daily
/api/cron/linkedin-weekly
```

Both require `Authorization: Bearer $CRON_SECRET`. Scheduling is owned by Supabase
through `pg_cron`, with asynchronous calls made by `pg_net`. The deployment URL and
token are stored in Vault as `toolkit_app_url` and `toolkit_cron_secret`.

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

## Navigation Performance

Section navigation was optimized by:

- caching the Supabase server client, authenticated user, workspace, and membership
  once per server-render request;
- caching the shared tool registry for 30 seconds;
- prefetching sidebar destinations;
- reducing Peer Review queries to only the fields rendered;
- reducing LinkedIn score payloads and loading reports only on the reports page;
- parallelizing independent LinkedIn database requests;
- adding route-level loading feedback.

Local production navigation checks after the optimization:

```txt
Tools directory: about 69 ms
Peer Review dashboard: about 939 ms
LinkedIn dashboard: about 894 ms
Mobile horizontal overflow at 390 px: none
```

Current verification after LinkedIn Assessor migration:

```txt
lint: passed
test: passed, 5 files / 19 tests
build: passed
```

## LinkedIn Assessor Functionality Expansion

### Data model and access controls

- Added migration `012_linkedin_assessor_functionality.sql`.
- Added a configurable rolling analysis duration from 7 to 365 days.
- Added workspace control for member-submitted posts.
- Added `collaborative_post` as an assessable activity type.
- Added post provenance for connector, manual, and browser-extension ingestion.
- Added submitter and collaboration-context metadata to posts.
- Tightened member post, activity, and score RLS so disabling member insights is
  enforced by Postgres as well as the application UI.

### Analytics and service behavior

- Made unconfigured production connectors fail visibly instead of recording a
  misleading successful sync with zero activities.
- Added collaborative posts to connector classification and persistence.
- Added direct manual/browser-extension post ingestion with workspace and member
  ownership checks.
- Added effective-score calculation using the latest admin override, including
  exclusion from quality averages.
- Restored best-post and weakest-post analytics from the standalone assessor.
- Fixed weekly reports so their calculations use the report's actual seven-day
  period and disabled workspaces are skipped.
- Connected rolling-window and member-submission settings to the service layer.

### Admin and member workflows

- Added a live 7-365 day analysis-duration slider.
- Applied workspace defaults when admins or members create tracked profiles.
- Added member self-connection for a LinkedIn profile.
- Added manual missing-post submission for admins and linked members, including
  original/collaborative classification and immediate scoring.
- Restored full member score breakdowns, best/weakest post markers, editable
  profile settings, pause/resume/archive controls, and per-profile sync history.
- Added detailed post score components, AI provider metadata, LinkedIn links,
  score correction, archetype override, admin notes, and quality exclusion.
- Added recent sync diagnostics to the admin dashboard.
- Expanded weekly reports from one-line summaries to stored member breakdowns.

### Scoring reliability

- Restored the standalone assessor's 85% common / 15% role-sensitive scoring
  philosophy and added explicit guidance for each member role.
- Added scoring-version persistence for future rubric/model migrations.
- Made repeat manual submissions update and rescore the existing post instead of
  failing on the unique LinkedIn URL constraint.
- Added scoring-job logs with provider usage so deterministic fallbacks are visible
  to administrators.
- Enforced member-submission enablement in the service layer, not only in the UI.
- Added private post-by-post member coaching with summaries, strengths, weaknesses,
  improvements, and source-post links.
- Added score-schema validation that rejects AI totals which do not match the
  component rubric before falling back to deterministic scoring.

### Live Supabase verification

Migration `012_linkedin_assessor_functionality.sql` was applied to the configured
Supabase project and confirmed in remote migration history.

An isolated disposable workspace was used to verify the complete live workflow:

- admin and linked-member manual submissions;
- collaborative-post persistence and duplicate URL updates;
- mock connector collection and activity exclusion;
- AI or deterministic scoring, rescoring, and provider logs;
- rolling 45-day dashboard analytics;
- score overrides and quality-average exclusions;
- previous-week report generation with original and collaborative posts;
- member RLS visibility when insights are enabled and hidden results when disabled;
- service-layer blocking when member submissions are disabled; and
- cascade cleanup of all disposable test records and the temporary auth user.

The weekly report wording now uses `assessed posts` because reports include both
original and collaborative posts.

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
