# Unified BuildableLabs Toolkit

An internal toolkit web app for BuildableLabs. The app uses one shared auth system,
one Supabase Postgres database, one default internal workspace, and modular tool
areas for current and future team workflows.

## Current Modules

- Peer Review: functional module migrated from the original Peer Review app.
- LinkedIn Assessor: profile tracking, mock-first collection, original-post filtering,
  AI scoring, leaderboards, coaching insights, analysis windows, and weekly reports.
- HR Bot: route and module shell ready for future knowledge-base/chat work.

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth, Postgres, SQL migrations, and RLS
- shadcn-style UI primitives
- Resend for transactional email
- Vercel Cron-compatible API routes
- Zod, date-fns, React Hook Form-ready schemas
- Vitest for unit tests

## Local Setup

```bash
npx pnpm@9.15.4 install
cp .env.example .env.local
npx pnpm@9.15.4 dev
```

Real credentials belong in `.env.local` and Vercel environment variables only.
Do not commit Supabase service role keys, database passwords, Resend keys, cron
secrets, or AI provider keys.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

DATABASE_URL=
DIRECT_URL=

RESEND_API_KEY=
EMAIL_FROM="BuildableLabs Toolkit <toolkit@example.com>"

OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash

NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=

NODE_ENV=development
```

The current Supabase project ref is `zvqyldecmclgoddukmnl`.

## Supabase Setup

Apply migrations from `supabase/migrations` in order. The existing Peer Review
schema remains intact. `009_toolkit_core.sql` adds shared toolkit tables and
`010_linkedin_assessor.sql` adds the workspace-aware LinkedIn workflow.

- `tools`
- `tool_settings`
- `notifications`
- `jobs`

The first authenticated user who reaches onboarding can create or join the
default `BuildableLabs` workspace. The workspace tables are kept for compatibility,
but the product treats this as one internal workspace.

## Main Routes

- `/dashboard`
- `/tools`
- `/tools/peer-review`
- `/tools/peer-review/admin`
- `/tools/peer-review/member`
- `/tools/peer-review/reports`
- `/tools/linkedin-assessor`
- `/tools/linkedin-assessor/admin`
- `/tools/linkedin-assessor/admin/posts`
- `/tools/linkedin-assessor/admin/leaderboards`
- `/tools/linkedin-assessor/admin/settings`
- `/tools/linkedin-assessor/reports`
- `/tools/hr-bot`
- `/admin`
- `/admin/tools`
- `/admin/settings`
- `/admin/audit-logs`

Legacy Peer Review routes under `/projects` and `/my-reviews` redirect to the
new toolkit routes.

## Verification

```bash
npx pnpm@9.15.4 lint
npx pnpm@9.15.4 test
npx pnpm@9.15.4 build
```

## Deployment Notes

Create a new Vercel project from this repository and configure environment
variables in Vercel. After deployment, update:

- `NEXT_PUBLIC_APP_URL`
- Supabase auth redirect URLs
- cron callback URL and `CRON_SECRET`
- Resend sender/domain configuration

If credentials were shared outside a secret manager, rotate the Supabase database
password and service role key before using the app in production.

LinkedIn collection defaults to the deterministic mock connector. The OAuth,
fallback, and third-party connector boundaries are present but intentionally return
no activities until a compliant data provider is configured. Vercel schedules daily
sync/scoring and Monday report generation through the protected cron routes.
