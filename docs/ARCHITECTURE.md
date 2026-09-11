# Architecture

## System overview

```
Unified BuildableLabs Toolkit
├── Web UI (Next.js App Router, React, Tailwind)
│   ├── Server Components — data fetching, auth checks
│   ├── Server Actions ("use server") — mutations, in *actions.ts files
│   └── Client Components — interactive widgets (kanban board, notification bell)
├── API routes (app/api) — cron jobs + inbound webhooks
├── Services (lib/services) — business logic, one file per domain
├── Database — Supabase Postgres, RLS-enforced
├── Auth — Supabase Auth (email/password), one profile per auth.users row
└── Scheduled jobs — Supabase pg_cron + pg_net, calling app/api/cron/* over HTTP
```

There is one workspace ("BuildableLabs") in practice — `workspaces` /
`workspace_members` exist as real tables with RLS, but onboarding always
joins/creates the single default workspace (`modules/core/workspace/default-workspace.ts`).

## Data model

Core:
- `workspaces`, `workspace_members` (role: admin/member), `profiles`, `invites`

Peer Review (360-style peer assessment — reviewers rate reviewees on a
recurring cadence, unrelated to ticket "reviews"):
- `projects`, `project_members`, `review_rounds`, `review_assignments`,
  `review_responses`

LinkedIn Assessor:
- see `010_linkedin_assessor.sql` and later LinkedIn migrations

Shared toolkit primitives (`009_toolkit_core.sql`):
- `tools` / `tool_settings` — feature registry, read by `modules/core/tools/registry.ts`
- `notifications` — in-platform notifications (bell in `AppShell`)
- `jobs` — generic job-status table (not yet used by any service)
- `audit_logs` / `notification_logs` — audit trail and email delivery log

Tickets (`017_tickets_core.sql`, `018_ticket_reviews.sql`):
- `tickets` — title/description/status/assignee/due date, plus
  `claimed_progress_percent` / `verified_progress_percent` / `review_status` /
  `reviewer_id` for the progress-review workflow
- `ticket_comments` — discussion thread per ticket
- `ticket_review_settings` — one configurable reviewer per workspace (who
  verifies claimed progress — currently the project lead)

Resources (`019_resources.sql`):
- `resources`, `learning_roadmaps`, `resource_roadmap_mapping`

Meetings (`020_meetings.sql`, extended by `021_meeting_ticket_pipeline.sql`):
- `meetings` — recap data ingested from Granola (title, summary, attendees,
  calendar event time), keyed by `granola_note_id`; also tracks
  `tickets_extracted_at`/`extracted_tickets_count` once the meeting→ticket
  pipeline has scanned it
- `tickets.linked_meeting_id` — nullable FK back to the meeting a ticket was
  auto-extracted from (null for manually created tickets)

Linear integration (`022_linear_integration.sql`) — link-only, see
`docs/LINEAR_INTEGRATION.md` and `docs/PRD_LINEAR_INTEGRATION.md`:
- `tickets.linear_issue_id`/`linear_issue_identifier`/`linear_issue_url` — the
  linked Linear issue, if any (unique per workspace via a partial index —
  one Linear issue maps to at most one ticket)
- `tickets.linear_link_source`/`linear_link_confidence` — how the link was
  made (`auto_identifier`, `suggestion_accepted`, `manual`); only identifier
  matches link automatically, everything else requires a human click
- `ticket_linear_suggestions` — borderline semantic matches awaiting a
  human decision (not yet populated by any writer as of this phase — the
  detection logic that fills this table ships in a later phase)
- `linear_integration_settings` — one row per workspace: which Linear teams
  are searchable (also the privacy boundary, since one shared API key sees
  everything, see `linear-client.ts`) and the suggestion confidence threshold

## Services (`lib/services`)

- `ticket-service.ts` — ticket CRUD, filtering, bulk operations, comments
- `ticket-review-service.ts` — claimed/verified progress workflow, reviewer
  settings, performance accuracy metric (named separately from the
  pre-existing `review-service.ts`, which is peer-review's submission logic —
  same word, different domain)
- `meeting-parser-service.ts` — extracts action items from a meeting's
  Granola summary and creates linked tickets. Tries the LLM first via
  `requestIntelligenceJson` (same OpenRouter→DeepSeek fallback chain as
  `ai-report-service.ts`); falls back to a regex-based
  "`<Name> will/should/needs to <action>`" match if no provider is
  configured or the call fails — so it degrades instead of blocking
- `resource-service.ts` — resource + roadmap CRUD and filtered search
- `calendar-service.ts` — upserts meetings from Granola notes, builds and
  sends the recap digest
- `granola-client.ts` — Granola API fetch + Standard Webhooks signature
  verification
- `linear-client.ts` — Linear GraphQL API client (issue search, identifier
  lookup, team list); read-only, no writes to Linear in v1
- `linear-link-service.ts` — link/unlink a ticket to a Linear issue, workspace
  Linear settings, and the pure `extractLinearIdentifier()` used for
  deterministic (Tier 1) matching
- `notification-service.ts` — generic in-platform notifications (create via
  the admin client since one user notifies another; read/mark-read via the
  caller's own client so RLS still applies)
- `workspace-service.ts` — workspace membership, roles, default-workspace
  bootstrap
- `audit-service.ts` — generic `audit_logs` writer, used by every service
  above for its own domain's mutations
- `project-service.ts`, `round-service.ts`, `assignment-service.ts`,
  `scoring-service.ts`, `review-service.ts` — peer review (360 assessment)
- `email-service.ts`, `reminder-service.ts` — peer review's email
  notifications (Resend) — Tickets/Meetings use in-platform notifications
  instead, not email
- `report-service.ts`, `ai-report-service.ts`, `openrouter-service.ts` —
  AI-assisted report generation

## API routes

- `/api/cron/*` — protected by `CRON_SECRET` (`lib/utils/cron.ts`), invoked by
  Supabase pg_cron via `invoke_toolkit_cron()` (`011_supabase_cron.sql`,
  extended by later migrations for new jobs)
- `/api/webhooks/granola` — inbound webhook from Granola, verified via
  Standard Webhooks HMAC signature (not `CRON_SECRET` — this is a different
  trust boundary, an external service calling us, not our own cron)
- `/api/meetings/[id]/convert-to-tickets` — user-triggered (not cron), admin
  only, session-authenticated. Supports `{"dry_run": true}` in the body to
  preview extracted tickets without creating them

## Cron jobs

Per `cron.schedule(...)` calls actually present in the migrations:

| Job | Schedule | Route |
|---|---|---|
| `daily-review-cron` (legacy, `005_scheduler.sql`) | 03:30 UTC daily | `/api/cron/daily` |
| `toolkit-daily` | 01:00 UTC daily | `/api/cron/daily` |
| `toolkit-linkedin-daily` | 02:00 UTC daily | `/api/cron/linkedin-daily` |
| `toolkit-linkedin-weekly` | 03:00 UTC Monday | `/api/cron/linkedin-weekly` |
| `toolkit-meeting-digest-daily` | 08:00 UTC daily | `/api/cron/meeting-digests?type=daily` |
| `toolkit-meeting-digest-weekly` | 17:00 UTC Friday | `/api/cron/meeting-digests?type=weekly` |
| `toolkit-process-new-meetings` | 01:30 UTC daily | `/api/cron/process-new-meetings` |

`005_scheduler.sql`'s `daily-review-cron` and `011_supabase_cron.sql`'s
`toolkit-daily` both call `/api/cron/daily` on different schedules and via
different config sources (`system_settings` table vs. Supabase Vault) —
`011` never unscheduled the older job by name, so if both migrations ran on
the same project, `/api/cron/daily` may currently fire twice a day. This is
pre-existing, not something introduced here; worth confirming in the
Supabase dashboard (`select * from cron.job;`) before relying on either
schedule.

`/api/cron/send-reminders`, `/api/cron/start-rounds`, and
`/api/cron/close-overdue-rounds` each run a subset of what `/api/cron/daily`
already does in one call — none of them have their own `cron.schedule` entry,
so they're either called manually/ad hoc or are dead routes. Worth
confirming with whoever built the original peer-review cron setup rather
than assuming.

## Notifications: two separate mechanisms

- **Peer Review** sends real emails via Resend (`email-service.ts` +
  `reminder-service.ts`), logged to `notification_logs`.
- **Tickets and Meetings** use the generic in-platform `notifications` table
  and the bell in `AppShell` — no email. This was a deliberate choice per
  product decision, not a limitation; if email is wanted later for these, it
  would reuse the existing `email-service.ts` pattern.

## Authentication & authorization

- Supabase Auth (email/password via `lib/supabase/*`)
- Every table with workspace-scoped data has RLS policies using the
  `is_workspace_member(workspace_id, user_id)` / `is_workspace_admin(...)`
  SQL functions (`002_functions.sql`) — new tables should reuse these rather
  than writing bespoke membership checks
- Writes made on behalf of another user (notifications, Granola-ingested
  meetings) go through `createAdminClient()` (service role, bypasses RLS) —
  by design, since RLS models what *a user* can do with *their own* session,
  not what the system does on their behalf

## Error handling & logging

- Services throw on Supabase errors; API routes catch and return 4xx/5xx with
  a message
- No Sentry/external error tracking is wired up currently — errors go to
  standard Next.js/Vercel function logs
