# Deployment

## Pre-deployment checklist

- [ ] All env vars from `.env.example` set in Vercel (Production + Preview)
- [ ] All migrations in `supabase/migrations/` applied, in order
- [ ] Supabase Vault has `toolkit_app_url` and `toolkit_cron_secret` (must
      match `CRON_SECRET`)
- [ ] Resend sender domain verified
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` all pass locally
- [ ] If using the Granola integration: `GRANOLA_API_KEY` set, webhook
      registered (see `docs/GRANOLA_INTEGRATION.md`), and
      `GRANOLA_WEBHOOK_SIGNING_SECRET` set

## Environment variables

Copy every var from `.env.example` into Vercel. Never commit real values.
`GRANOLA_API_KEY` / `GRANOLA_WEBHOOK_SIGNING_SECRET` are optional — the app
starts fine without them, and the Granola webhook just returns 401 until
they're configured (see `lib/utils/env-validation.ts`).

## Supabase setup

- Migrations live in `supabase/migrations/`, applied in numeric order
- RLS policies are part of the migrations — no manual policy setup needed
- Supabase Vault must contain:
  ```
  toolkit_app_url      — the deployed app's base URL
  toolkit_cron_secret  — must match CRON_SECRET
  ```
- Before relying on any cron schedule, check what's actually registered:
  ```sql
  select jobname, schedule, command from cron.job;
  ```
  (see `docs/ARCHITECTURE.md` for a known duplicate-schedule caveat on
  `/api/cron/daily`)

## Vercel deployment

1. Push to the deployed branch — Vercel auto-deploys
2. Watch the deployment log for build errors
3. Once live, verify:
   - Supabase Auth → Redirect URLs includes `https://<app>/auth/callback`
   - `NEXT_PUBLIC_APP_URL` matches the deployed URL exactly (used to build
     links in emails/notifications)
   - This app runs under a `/teams` base path (`lib/utils/app-url.ts`) — all
     routes are `https://<app>/teams/...`, including API routes

## Post-deployment smoke test

```bash
# A cron route — should 200
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/teams/api/cron/daily

# Should 401 (proves the secret check actually works)
curl https://<app>/teams/api/cron/daily
```

Log in, confirm `/teams/tools` lists all modules, and each new module loads:
`/teams/tools/tickets`, `/teams/tools/resources`, `/teams/tools/meetings`.

## Monitoring & troubleshooting

- App logs: Vercel → Deployments → Functions
- Database/RLS errors: Supabase → Logs → Postgres/API logs
- Cron: Supabase → Database → check `cron.job_run_details` for run history
  and failures, not just `cron.job` for what's scheduled
- Granola webhook: if meetings aren't appearing, check the Vercel function
  log for `/api/webhooks/granola` — a 401 means signature verification
  failed (secret mismatch), a 400 means the note id couldn't be found in the
  payload (see `docs/GRANOLA_INTEGRATION.md`)

## Rollback

- Bad deploy: Vercel → Deployments → Rollback to the previous deployment
- Bad migration: there's no automated down-migration runner in this repo —
  each migration file ends with a commented-out reverse SQL block as a
  reference; run it manually against Supabase if a migration needs undoing
- Compromised secret: rotate immediately per `docs/SECRET_ROTATION.md`
