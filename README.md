# Peer Review Webapp

A webapp-only MVP for recurring peer reviews in small teams. Admins create workspaces, invite members, create projects, start review rounds, track completion, and view anonymous role-weighted reports.

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- shadcn-style UI primitives
- Supabase Auth, Postgres, and RLS
- Resend for transactional email
- Vercel Cron routes
- Zod, React Hook Form-ready schemas, date-fns
- Vitest for unit tests

## Local Setup

```bash
npx pnpm@9.15.4 install
cp .env.example .env.local
```

Fill `.env.local` with local Supabase values. For the first pass, use Supabase CLI local development. Hosted Supabase and Resend credentials are only needed for live deployment and email testing.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_FROM="Peer Reviews <reviews@example.com>"
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=
NODE_ENV=development
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code. It is imported only from server-only modules.

## Supabase Setup

Apply migrations from `supabase/migrations` in order:

1. `001_initial_schema.sql`
2. `002_functions.sql`
3. `003_rls_policies.sql`

The schema includes workspaces, profiles, workspace members, invites, projects, project members, review rounds, review assignments, review responses, notification logs, and audit logs.

## Development

```bash
npx pnpm@9.15.4 dev
npx pnpm@9.15.4 lint
npx pnpm@9.15.4 test
npx pnpm@9.15.4 build
```

## Cron

Vercel cron invokes:

- `GET /api/cron/start-rounds`
- `GET /api/cron/send-reminders`
- `GET /api/cron/close-overdue-rounds`

Each cron route requires:

```http
Authorization: Bearer $CRON_SECRET
```

## Email

Email sending uses Resend and logs each send attempt in `notification_logs`. Missing `RESEND_API_KEY` skips sending and logs the skipped status so local development can proceed without real email credentials.

## Security Notes

- Dashboard routes require auth through middleware.
- Admin-only operations are enforced in pages/services and RLS.
- Members can only read and submit their own review assignments.
- Reports hide reviewer identity in feedback sections.
- Private notes are only displayed in admin reports.
- Cron routes reject invalid or missing secrets.

## MVP Limitations

- Custom cadence is safely skipped for MVP.
- Project settings are read-mostly after creation.
- No Telegram, Slack, OpenClaw, billing, AI analysis, PDF export, chat, mobile app, or HRMS features.
