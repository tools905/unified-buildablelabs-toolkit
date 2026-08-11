# Secret Rotation

## Why & when

Rotate secrets quarterly, or immediately if one is suspected of being
exposed (leaked in a commit, shared over an insecure channel, an engineer
who had access leaves). Rotation is routine maintenance, not a sign
something is wrong — treat it as a checklist, not a fire drill.

## Supabase Service Role Key

1. Supabase dashboard → Project Settings → API Keys.
2. Reveal the current `service_role` key and save it somewhere secure as a
   backup in case rollback is needed.
3. Click **Rotate** to generate a new key.
4. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production + Preview
   environments).
5. Redeploy the app.
6. Watch logs for 5 minutes for auth/database errors.
7. Once confirmed healthy, delete the old key from the Supabase dashboard.

## CRON_SECRET

1. Generate a new value: `openssl rand -hex 32`
2. Update `CRON_SECRET` in Vercel.
3. Redeploy.
4. Verify a cron endpoint accepts the new secret:
   ```bash
   curl -H "Authorization: Bearer <new-secret>" https://your-app/api/cron/<job>
   ```

## OPENROUTER_API_KEY / DEEPSEEK_API_KEY

1. Regenerate the key in the provider's dashboard.
2. Update the corresponding env var in Vercel.
3. Redeploy and confirm AI-backed features (e.g. reports, scoring) still work.
4. Revoke the old key in the provider dashboard.

## RESEND_API_KEY

1. Regenerate in the Resend dashboard.
2. Update `RESEND_API_KEY` in Vercel.
3. Redeploy and send a test email to confirm delivery.
4. Revoke the old key.

## Checklist (per secret)

- [ ] Back up the old value somewhere secure
- [ ] Rotate in the provider's dashboard
- [ ] Update Vercel environment variables
- [ ] Redeploy
- [ ] Verify the app is functioning (check logs / send a test request)
- [ ] Revoke the old value in the provider dashboard
- [ ] Note the rotation date in the team's ops channel

## If a leak is suspected

1. Rotate the affected secret immediately, following the steps above.
2. Rotate any other secret it could have exposed access to.
3. Review provider logs for unauthorized usage in the prior 24–48 hours.
4. Let the team know what was rotated and why.
