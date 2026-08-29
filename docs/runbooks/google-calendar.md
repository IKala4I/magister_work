# Runbook — Google Calendar credentials (FR-03; ADR-0012 §10)

> Owner steps (⛔ human-action gate, PLAN §3 P8). Everything the code needs is three secrets;
> everything Google needs is one OAuth client and a consent screen. Nothing here costs money.
> The session verifies each step (HANDOFF "one step at a time").

## 0. What the code expects

| Secret (Edge Functions)    | Value                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `GCAL_CLIENT_ID`           | the OAuth client id (`…apps.googleusercontent.com`)                                     |
| `GCAL_CLIENT_SECRET`       | its secret — server-side only, never in the app                                         |
| `GCAL_WEBHOOK_BASE`        | the functions URL, `https://<project-ref>.supabase.co/functions/v1` (no trailing slash) |
| `GCAL_APP_REDIRECT` (opt.) | where the browser is sent after consent; default `hourwell://gcal-callback`             |

Redirect URI to register on the OAuth client: `<GCAL_WEBHOOK_BASE>/gcal-callback`.
Push-channel address the code registers: `<GCAL_WEBHOOK_BASE>/gcal-webhook` (must be a public
HTTPS URL — the functions URL is).

Scopes requested: `https://www.googleapis.com/auth/calendar.events.readonly` (connect) and,
only when the user opts into write-back, `https://www.googleapis.com/auth/calendar.events`
(incremental authorization — both appear on the consent screen).

## 1. Google Cloud project (console.cloud.google.com)

1. Create a project (any name; "Hourwell" is fine) — free.
2. **APIs & Services → Library → Google Calendar API → Enable.**
3. **APIs & Services → OAuth consent screen:** user type **External**; app name "Hourwell";
   support e-mail = yours; app domain / privacy policy: the repo's `docs/privacy/README.md`
   URL is acceptable for testing, a real page is needed before verification; **Scopes → Add:**
   the two calendar scopes above (both are "sensitive"); **Test users:** add your own Google
   account(s) while the app is in Testing.
4. **Credentials → Create credentials → OAuth client ID → Web application:** authorised
   redirect URI = `https://<project-ref>.supabase.co/functions/v1/gcal-callback`. Copy the
   client id and secret.

## 2. Secrets on the hosted project (session runs this once you paste the values into a file)

```bash
# from the repo root; the file is never committed
cat > /tmp/gcal.env <<'EOF'
GCAL_CLIENT_ID=…
GCAL_CLIENT_SECRET=…
GCAL_WEBHOOK_BASE=https://<project-ref>.supabase.co/functions/v1
EOF
supabase secrets set --env-file /tmp/gcal.env && rm /tmp/gcal.env
supabase functions deploy gcal-connect && supabase functions deploy gcal-callback && supabase functions deploy gcal-webhook
```

Secrets are read at module load — redeploy after setting them (HANDOFF gotcha).
`supabase secrets list` must show the three names (it prints digests, never values).

## 3. Verify (session) — done 2026-08-29 against the owner's calendar

Results with timestamps: `docs/verification/p8-manual-verification.md` §2.3. Keep this list
for re-runs (a new Google project, a rotated secret, the device pass).

1. `gcal-connect {action: start}` with a test user's JWT → 200 with `auth_url` (was 503).
2. Open the URL in a browser signed in as a test user (the state nonce lives 10 min — mint the
   URL when the owner is ready) → Google's "unverified app" page while in Testing → consent →
   Google hits `gcal-callback`, which stores the tokens UNCONFIRMED and 302s the browser to
   `hourwell://gcal-callback?status=ok&confirm=…`. **On a desktop browser without the app this
   looks like a hang**: Chrome shows a spinner after the consent click and never navigates
   (no handler for the scheme). That is success — `gcal_sync_state` for the user now has
   tokens + `confirm_token` (10-min TTL); the session reads the token there
   (`select confirm_token from gcal_sync_state where user_id = …`) and confirms itself. On a
   phone the app opens and confirms by itself. The connection is **not active yet** until
   `gcal-connect {action: confirm, token}` with the SAME account's JWT (a different account
   purges the tokens — adversarial #10). Expo Go cannot receive the redirect (its scheme is
   `exp://`); use a dev-client or release build with the `hourwell` scheme.
3. `gcal-connect {action: status}` → `connected: true`, `last_synced_at` set,
   `channel_expires_at` ≈ 7 days ahead.
4. **Must pass before enrollment (adversarial #2):** create a meeting **20 days out** in that
   calendar → it appears in `calendar_events` on the next push/sweep. If it does not, the sync
   token carried a time restriction and `syncUser` must be changed to force a periodic full
   resync.
5. Create a meeting in that Google Calendar over a planned block → within seconds the push
   arrives, the block is `displaced_pending` (and `feedback_rewards` gains no row — invariant
   4); the app shows the busy row and the "meeting" caption at its next foreground. **State the
   slot in the calendar's own zone**, derived from a stored event (time shown in Google vs
   `start_at` in UTC) — the profile zone is not the calendar zone by construction, and a wrong
   guess puts the meeting next to the block instead of over it (2026-08-29).
6. `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using
(jobid) where j.jobname = 'gcal-sweep' order by d.start_time desc limit 3` → `succeeded`
   (`job_run_details` has no `jobname` column); `net._http_response` shows 200s from the sweep
   with `users: 1` once a calendar is connected.
7. All-day rule: a default all-day event must produce **no** `calendar_events` row (Google
   sends it `transparent`); the same event marked Busy must produce a `busy` row spanning the
   local day in the calendar's zone.
8. `gcal-connect {action: disconnect}` → 200, the `gcal_sync_state` row is gone, mirrored rows
   are tombstoned, and Hourwell disappears from the Google account's third-party access list.

## 4. Before enrollment (ADR-0012 Consequences; privacy README G7)

- **Publish the consent screen ("In production").** In **Testing** status Google expires
  refresh tokens after **7 days** — every participant would be silently disconnected in week 2.
  Unverified production apps show a warning page and are capped at 100 users; that is enough
  for the study. The verification review (sensitive scopes) is optional and needs a privacy
  policy URL and a demo video; decide by the OSF freeze.
- The sweep handles users serially in one invocation (`loadConnected` limit 500): fine below
  ~50 connected calendars; beyond that split the sweep by user cohort (pg_net's 60 s timeout).
- Keep the OAuth client secret out of every log, screenshot and chat.
- Rotate the secret if it is ever pasted anywhere but the secrets command.
