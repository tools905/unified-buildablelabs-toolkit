# Granola Integration

## What this actually does

Granola's public API only exposes a meeting note once it has a **generated
AI summary and transcript** — there is no endpoint for upcoming/scheduled
meetings. So this integration is a **recap of meetings that already
happened**, not a preview of what's coming up. (A true "you have 3 meetings
today" digest would require the Google Calendar API directly, with its own
OAuth setup — not part of this integration.)

Flow:
1. Granola generates a summary for a meeting → sends a `note.generated` (or
   `note.regenerated`) webhook to this app.
2. The webhook handler (`app/api/webhooks/granola/route.ts`) verifies the
   signature, fetches the full note from Granola's API, and upserts it into
   the `meetings` table.
3. Two cron jobs (`app/api/cron/meeting-digests`) send an in-platform
   notification to every workspace member: daily at 08:00 UTC (recapping the
   last 24h) and weekly Friday 17:00 UTC (recapping the last 7 days).
4. `/tools/meetings` lists all ingested recaps.

## One-time setup

### 1. Env vars

Add to `.env.local` (see `.env.example`):
- `GRANOLA_API_KEY` — your Granola API key (`grn_...`)
- `GRANOLA_WEBHOOK_SIGNING_SECRET` — filled in after step 2 below

### 2. Register the webhook

Granola only shows the webhook's signing secret once, at creation time.

```bash
curl -X POST https://public-api.granola.ai/v1/webhook-endpoints \
  -H "Authorization: Bearer $GRANOLA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-deployed-app>/api/webhooks/granola",
    "events": ["note.generated", "note.regenerated"],
    "scopes": ["public"]
  }'
```

Copy the `signing_secret` from the response into `GRANOLA_WEBHOOK_SIGNING_SECRET`
(both locally and in Vercel), then redeploy.

> The `scopes` field accepts `personal` or `public` — Granola's docs don't
> spell out the exact difference between the two for API webhooks. `public`
> is used here on the assumption it means "workspace-visible" rather than
> tied to one person's account; if meetings aren't showing up as expected,
> check with Granola support on which scope your account needs.

### 3. Verify it's working

Have someone hold a short meeting with Granola recording. Once Granola
finishes generating the summary (usually within a few minutes of the
meeting ending), check:
- Supabase → `meetings` table has a new row
- `/tools/meetings` shows the recap

## Signature verification

Granola signs webhook deliveries per the [Standard Webhooks
spec](https://www.standardwebhooks.com/) (confirmed in their API docs, but
the exact payload shape for webhook events isn't documented anywhere public
we could find). `lib/services/granola-client.ts` implements verification
against that public spec: HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`,
keyed by the base64-decoded signing secret (after its `whsec_` prefix).

Because the exact webhook payload shape isn't documented, the handler
defensively looks for a note id in a few plausible locations (`data.id`,
`data.note.id`, `note_id`, `id`) rather than assuming one fixed shape. If
webhooks arrive but nothing gets ingested, check the Vercel function logs
for the actual payload and adjust `extractNoteId()` in
`app/api/webhooks/granola/route.ts` to match.
