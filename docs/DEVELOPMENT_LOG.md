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

### Connector and scoring guidance

- Removed `linkedin_oauth` from the application and database connector options
  because the required LinkedIn member-post access is not available for this use case.
- Existing OAuth selections migrate to the unconfigured `fallback` boundary.
- Added in-product explanations for volume weight, quality weight, the final-score
  formula, rolling analysis duration, mock test data, fallback collection, and the
  future third-party API/Apify path.

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

## Local Demo Verification

A local production instance was prepared on port `3210` with a completed demo
workspace state for hands-on testing. The fixture contains:

- one demo administrator and six linked toolkit members;
- a completed peer-review project with one completed round;
- 30 submitted all-to-all review assignments and generated member reports;
- 18 LinkedIn posts across original and collaborative post types;
- connector and manual-submission examples, scored post breakdowns, an override,
  an excluded quality score, sync logs, and stored LinkedIn reports; and
- a rolling 45-day LinkedIn analysis configuration using 40% volume and 60%
  quality weighting.

Verification covered demo-admin password authentication, the live peer-review
report service, the LinkedIn dashboard analytics service, stored report loading,
processing logs, and the host-accessible `/login` route. The test fixture passed
with 30 of 30 reviews submitted, six reviewees reported, and all 18 LinkedIn posts
available in the active analysis window.

## Peer Review Production Readiness Fixes

The peer-review start flow was updated for the production workspace shape where
only Nitai and Aditi are active members.

- Two-person projects are now supported without requiring a dev-only test flag.
- Starting a round creates the two reciprocal assignments for a two-person team.
- New-project validation and copy now use the same environment-aware minimum.
- Email and AI callback URLs now use a shared app URL resolver that falls back to
  Vercel deployment URLs when `NEXT_PUBLIC_APP_URL` is empty.
- Round-start, report-ready, reminder, overdue-summary, invite, and OpenRouter
  links no longer degrade to empty or relative URLs in production.
- Review reminders are grouped by reviewer so each reviewer receives one reminder
  per round with the correct pending count instead of one email per assignment.
- Project admin progress now loads all round assignment progress in one query
  instead of one query per round, reducing lag on projects with many planned
  rounds.
- Demo users, demo LinkedIn profiles, demo review data, and previous test
  projects were removed from the configured Supabase project. Remaining auth
  profiles are Nitai and Aditi only.
- An empty duplicate `BuildableLabs` workspace was removed so the app consistently
  lands on the production workspace with Nitai and Aditi.
- Current-workspace selection is now ordered by oldest membership to avoid
  nondeterministic workspace selection if duplicate memberships are ever created.

Verification:

- `npm test` passed with 24 tests.
- `npm run build` passed with the production Next.js build.
- A live Supabase smoke test created a temporary Nitai/Aditi project, started
  the round, verified two assignments, verified two grouped reminder attempts,
  and deleted the temporary project. The smoke process blanked `RESEND_API_KEY`
  to avoid sending real inbox traffic while still exercising the notification
  logging path.
- Real Resend delivery was checked and is currently blocked by deployment
  configuration: `toolkit@example.com` is not a verified sender, and the Resend
  account is still restricted to testing emails until a domain is verified. The
  app now fails placeholder senders visibly in `notification_logs` instead of
  making doomed provider calls.

## Manual-Only LinkedIn Assessor And Performance Pass

The LinkedIn Assessor collection model is now manual-only.

- Removed active sync/scraping controls from the admin dashboard and member
  profile pages.
- Removed connector selection from settings, tracked-profile creation, and
  tracked-profile editing.
- Updated member-facing and admin copy so the workflow is: member submits the
  LinkedIn post URL and post writing, then the toolkit scores that exact post.
- Added migration `014_linkedin_manual_only_and_post_summary.sql` to constrain
  LinkedIn collection to manual submissions and add the
  `linkedin_post_summary` notification log type.
- Changed manual submission to score only the submitted post instead of running a
  broad unscored-post batch after every submission.
- Added private Resend coaching emails after submission with score, summary,
  strengths, weaknesses, and next-step suggestions.
- Kept the daily LinkedIn cron useful for scoring any unscored manual posts, but
  removed automated collection from that job.

Performance and production cleanup:

- Project creation now inserts planned rounds from the newly created project
  object instead of refetching the project from Supabase.
- Project list/detail queries now select only the fields used by the UI.
- LinkedIn dashboard member statistics now group posts by member once instead of
  filtering the full post list once per member.
- The Team page no longer exposes the dummy-member seeding panel.
- README and settings copy now reflect manual-only LinkedIn submission and the
  need for a verified Resend sender.

Verification:

- `npm test` passed with 24 tests.
- `npm run build` passed with the production Next.js build.
- A scan of active app/README copy found no remaining mock/fallback/sync scraping
  prompts.

## LinkedIn Submit Post Cleanup

The LinkedIn Assessor active workflow now presents post submission as the only
member-facing path.

- Removed the remaining LinkedIn connector module, export, and tests.
- Removed the disabled automated-member sync service surface from the active
  module.
- Renamed member and admin post entry points to `Submit post`.
- Updated settings and empty-state copy to refer to submitted posts rather than
  missing, fetched, or collected posts.
- Trimmed connector and last-sync fields out of app-facing LinkedIn types and
  dashboard settings queries.
- Updated migration `014_linkedin_manual_only_and_post_summary.sql` so legacy
  connector defaults are changed to `manual` for future rows.

Database deployment:

- Applied migration `014` to the Supabase production database and recorded it in
  `supabase_migrations.schema_migrations`.
- Verified LinkedIn tracked-member, settings, and post defaults now resolve to
  `manual`.
- Verified all existing LinkedIn member/settings/post rows use manual-only
  values.
- Cleared stale LinkedIn processing logs and weekly reports that no longer
  corresponded to active tracked members or submitted posts.
- Confirmed production data baseline remains one BuildableLabs workspace with
  only Nitai and Aditi as active workspace members.

## LinkedIn Writing Quality Rubric Expansion

LinkedIn post scoring now makes writing-quality parameters more explicit.

- Added a stored `hashtag_score` dimension for LinkedIn post scores.
- Rebalanced the 100-point rubric so hook, originality, hashtag use, and writing
  quality are first-class scoring inputs alongside clarity, specificity, reader
  value, depth, relevance, storytelling, authority, and engagement.
- Updated the AI scoring prompt and deterministic scorer to score hashtag
  relevance, restraint, discoverability, and fit.
- Added hook, hashtag, originality, and writing-quality breakdowns to private
  member coaching emails.
- Updated the admin settings explainer to document the full post quality rubric.
- Applied migration `015_linkedin_hashtag_score.sql` to Supabase and verified the
  `linkedin_post_scores.hashtag_score` column is present.

Smoke verification:

- Created temporary LinkedIn tracked profiles for Nitai and Aditi in Supabase.
- Submitted one original post and one collaborative post through the manual
  submission data path.
- Scored both posts with the current rubric, including hook, hashtag,
  originality, and writing-quality dimensions.
- Verified dashboard summary and member statistics were calculated from the
  submitted posts.
- Verified the private coaching notification log path without sending real
  emails.
- Removed the temporary tracked profiles, posts, scores, activities, and
  notification logs after the smoke test.

## Team Member Removal

Admins can now remove active workspace members from the Team page.

- Added a destructive, confirmed Remove action beside each active member except
  the current user.
- Removal soft-updates `workspace_members.status` to `removed` so historical
  reviews, reports, and audit references stay intact.
- Blocked self-removal and last-admin removal at the service layer.
- Wrote `workspace.member_removed` audit logs with the removed user's previous
  role and profile metadata.
- Filtered team/admin member counts and role updates to active workspace
  memberships only.
- Prevented removed users from silently rejoining the default workspace through
  onboarding.

Database deployment:

- Added and applied migration `016_workspace_member_removal.sql`.
- Replaced the profile peer-read policy so users can only read active workspace
  peers.
- Updated `is_project_member` so project membership also requires active
  workspace membership.
- Verified Supabase migration history records `016_workspace_member_removal`
  and the live policy/function changes are present.
