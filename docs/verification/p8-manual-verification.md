# P8 manual verification — Sync

> Honesty rule (CLAUDE.md "Simulator evidence"): everything below ran on the development Mac
> (jest / Deno / a rolled-back pgTAP run against the hosted database) or on the hosted Supabase
> project itself (the live smoke). Nothing ran on a handset; the Google Calendar half ran against
> the real Google Calendar on 2026-08-29 (§2.3) from a headless test user, not from the app. Each
> section says what it establishes and what it does not.

## 1. Gates (2026-08-28, `phase/P8-sync`)

| Gate                                                    | Result                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check`    | clean                                                                                                                                                                               |
| `pnpm test` (apps/mobile jest)                          | **344 passed / 42 suites** (P7: 290) — +merge rule table, +pull applier, +engine round trips + hardening (#5–#8, #13), +account transitions, +Today/Settings surfaces, +schema pins |
| `npx expo-doctor` (apps/mobile)                         | 21/21 (`expo-network` 57.0.1 added via `expo install`)                                                                                                                              |
| `deno fmt --check` · `deno lint` · `deno check` · tests | clean · clean · clean · **155 passed** (before P8: 110) — +sync-resolve, +scenario, +gcal mapping, +webhook/connect/callback handlers, +drift guard, +lease/CAS                     |
| pgTAP `p8_sync_test.sql`                                | **85 assertions, 85 ok** via `scripts/pgtap-linked.sh` (migrations + suite inside one rolled-back transaction on the hosted database); CI's db job re-runs it                       |
| `uv run pytest` (recsys, training)                      | untouched by P8 — CI runs it                                                                                                                                                        |
| `supabase db push`                                      | `20260828120000_p8_sync.sql` + `20260828140000_p8_adversarial.sql` applied to the hosted project; `database.ts` regenerated (`--linked`) and committed                              |
| `supabase functions deploy`                             | six functions deployed (`sync-resolve`, `gcal-connect`, `gcal-callback`, `gcal-webhook`, `plan-request`, `attribute-rewards`)                                                       |
| Live smoke `docs/verification/p8-live-smoke.mjs`        | **27 PASS / 0 FAIL** on the hosted project after the adversarial fixes were deployed (§2; incl. the confirm-aware `gcal-connect` build fingerprint)                                 |

## 2. What is established

### 2.1 Tests (requirement → evidence)

- **NFR-R1 "duplicate op replay is a no-op"** (PLAN §3 P8 acceptance) — three layers:
  `p8_sync_test.sql` (the same batch replayed → every op `duplicate`, versions/events/ledger
  unchanged), `sync-resolve/scenario_test.ts` (a second reconnect with the same ops → all
  `duplicate`, no second tuple), `engine.test.ts` (acked ops are never re-sent), and live (§2.2).
- **File 05 §2 scenario incl. the counterfactual branch** (PLAN §3 P8 acceptance) —
  `scenario_test.ts` chains the real webhook handler and the real sync handler over an
  in-memory server with the real reward mapping: meeting during the offline window →
  `displaced_pending`; on reconnect ops 41/42 replay, the task moves 7 → 8, the row becomes
  `completed` + `conflict_flag`, the tuple is EXCLUDED (`concurrent_external_conflict`, value
  kept), the pull carries the meeting; without facts → `displaced`, no tuple; a stale task edit
  → `conflict` + server row. Re-run live in §2.2.
- **Three conflict classes** (File 05 §2) — pgTAP: class 1 events append-only with ownership
  checks (an event naming another user's task is `rejected`); class 2 `base_version` (`applied`
  → bumped version; stale → `conflict` carrying the server row; not ledgered); class 3
  plan-review statuses state-checked (`completed` rejected, a status op on a
  `displaced_pending` row `superseded`). Deno: `sync-resolve/handler_test.ts` (lease 409, poll
  gating, cursor max-semantics, has_more, closed outcome vocabulary, lease released on throw).
- **Field-level merge** (ADR-0012 §4) — `merge.test.ts` rule table (LWW by edit time on
  user-owned fields, ties to the device, done/archived monotone, earliest `done_at`, max
  `postpone_count`, `deleted_at` user-owned, earliest `created_at`; profiles row-level LWW with
  onboarding completion never regressing); `engine.test.ts` proves the round trip: conflict →
  merged row written locally → op rewritten against the server version → replayed in the same
  sync → applied; a second queued op of the same entity collapses into the merged one.
- **Pull** (ADR-0012 §5) — `pull.test.ts` on real SQLite: column-for-column landing, idempotent
  re-apply, entities with unacked ops skipped, displaced placements send the task back to the
  Inbox through the outbox (status only, `postpone_count` untouched), the `conflict_flag`
  completion reported once for the toast, cancelled meetings as tombstones that leave the busy
  query, foreign rows never applied. `sync_pull()` under RLS: pgTAP shows B pulls none of A's
  rows and the max cursor returns nothing.
- **Dead-lettering** (ADR-0012 §6) — `engine.test.ts`: `rejected` acked at once with the reason
  and a Sentry breadcrumb; `error` retried and dead-lettered on the fifth attempt; offline leaves
  the queue intact and marks the store; 409 → `busy`; no session → no network call; the pre-plan
  sync is skipped when nothing is pending and the last pull is < 30 s old; a concurrent caller
  coalesces into one follow-up round.
- **Displacement resolution** (ADR-0012 §9, H3) — `rewards_test.ts`: completion evidence →
  `completed` + `conflict_flag` with an EXCLUDED tuple; no evidence after the slot → `displaced`,
  NO tuple; before the slot can be resumed → untouched; daily mode finalises; a move on a void
  placement is ignored; an already-resolved row is skipped. pgTAP: `attribution_due` includes
  `displaced_pending`, never `displaced`.
- **Atomic plan persistence** (ADR-0008 §4 revisit) — pgTAP: `persist_plan` writes plan + rows
  in slot order with the exact propensity; a FK failure leaves no plan row. Live: `plan-request`
  answers `planned` through the RPC (§2.2).
- **Lease** (ADR-0012 §7) — pgTAP: acquire / second acquire null / wrong token no release /
  right token / expired lease re-acquirable. Live: two concurrent syncs answer 200/409 or 200/200.
- **Google Calendar half** (FR-03, UC-09) — against a fake Google: `gcal_test.ts` (consent URL
  parameters, scope resolution, event → row mapping incl. transparent / declined / working
  location / birthday, all-day opaque vs free, cancellations, our own marker, title cap,
  overlap, the write-back window); `gcal-webhook/handler_test.ts` (channel auth 404/403, "sync"
  ack, incremental list → busy import → displacement of open FUTURE blocks only, 410 → wipe +
  full sync with pagination, token refresh, error containment 200 + `last_error`, sweep renews
  channels < 24 h and syncs stale users only, not_configured skip, write-back insert / patch on
  move / delete on close, read scope does nothing); `gcal-connect/handler_test.ts` (status,
  start nonce + 10-min expiry + 503 without credentials, disconnect stops/revokes/drops/wipes,
  write-back needs the write scope); `gcal-callback/handler_test.ts` (one-shot nonce, expiry,
  replay, denied, exchange failure, happy path token storage, write scope opts in and never
  downgrades, missing refresh token, initial-sync failure keeps the connection).
- **Drift guard** — `sync_types_test.ts` pins the client `OP_TYPES`, the wire `SYNC_OP_TYPES`,
  the RPC's dispatch `when` list and outcome vocabulary, and the `sync_pull` table list.
- **Account change** (ADR-0012 §11) — `accountTransition.test.ts`: immediate wipe when nothing
  is unsynced (all mirrored tables incl. plans/calendar cleared, cursor reset); deferred wipe
  when unacked ops exist (cursor reset, rows kept, banner state); owner signing back in cancels
  it; discard removes only the previous identity's rows and ops; keep clears the question.
- **UI** — `today.test.tsx`: busy rows with title/time and a11y label, "Busy" for untitled,
  timeline shown for meetings-only days, File 05 §2 notices with dismissal and a one-minute
  TTL, the deferred-wipe banner's two actions, the neutral displaced caption;
  `settings.test.tsx`: sync status/never/pending lines + "Sync now", relative last-sync time,
  Connect → read scope, write-back asks for the write scope, disconnect confirms first, off
  uses `set_write_back`, the not-configured message.

### 2.2 Live on the hosted project (2026-08-28, `p8-live-smoke.mjs`, 25/25)

Anonymous sign-in → profile through RLS → `sync-resolve` push of two tasks + a fact → all
`applied`, the pull returned the profile and tasks, cursor advanced, **`x-sb-edge-region:
eu-west-1`** (ADR-0011 region pin verified live) → the same ops replayed → all `duplicate`,
nothing new to pull → a stale `base_version` → `conflict` with the server row (version 1) →
`plan-request` `planned` through `persist_plan` (learned engine, 1 002 ms) → rec A set
`displaced_pending` + a busy meeting over its slot (the webhook's write, injected via
`supabase db query` — the Google hop is gated) → offline facts (`focus_start`, `focus_end`
finished in-window, task done with base 1) synced: all `applied`, the reward pass wrote a tuple,
**rec A pulled as `completed` + `conflict_flag`**, the meeting pulled as a `calendar_events`
row, the task pulled as `done` (version 2), and `feedback_rewards` holds the outcome tuple with
**`excluded = true`, `excluded_reason = concurrent_external_conflict`, reward 1.0** (H3: a row
for audit, never an update) → counterfactual on rec B (slot moved into the past, no facts) →
pulled as **`displaced`, no tuple** → two concurrent syncs serialised by the lease →
`gcal-connect` status `connected: false`, `start` → 503 `not_configured` (no Google
credentials yet), `gcal-webhook` sweep without the backend key → 401, `gcal-callback` with a
bad state → 302 to `hourwell://gcal-callback?status=…`.

Timings (client-measured from the Mac, one sample each unless stated): first `sync-resolve`
push 751 ms; `plan-request` 1 002 ms; bare-poll `sync-resolve` ×5: min 336 / median 391 /
max 511 ms. The bare poll is one lease + one `sync_pull` round trip — comfortably inside
NFR-P3's 300 ms once the function is warm on the server side; the Mac-to-Ireland hop is most
of the number. Not a handset measurement (§3).

### 2.3 Live against Google Calendar (2026-08-29, runbook §3, the owner's own account)

Setup: Google Cloud project with the Calendar API, an External consent screen in **Testing**
status with both calendar scopes and the owner as test user, a Web OAuth client with the
redirect `…/functions/v1/gcal-callback`; the three secrets set with
`supabase secrets set --env-file` (file deleted afterwards, names confirmed with
`supabase secrets list`), the three gcal functions redeployed (same code as `71caaa6`). Test
subject: an anonymous Supabase user driven from the Mac with plain `fetch` (no app), the
owner's real primary calendar (UTC+3 / Europe/Kyiv, as read back from stored rows vs the
times shown in Google). Timestamps UTC, 2026-08-29.

| §   | Check                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | `start` with a user JWT                 | 200 + `auth_url` (accounts.google.com; `redirect_uri` = the callback; scope `calendar.events.readonly`; `access_type=offline&prompt=consent`) + `expires_at` (+10 min). Was 503 `not_configured` before the secrets.                                                                                                                                                                                                                                                                                                                                                                                              |
| 3.2 | consent → callback → confirm            | Google's "unverified app" page (Testing) → consent at 05:25:08 → `gcal-callback` exchanged the code and stored refresh + access tokens **unconfirmed** (`scope=read`, `calendar_id=primary`, `oauth_state` cleared, confirm token +10 min) → 302 to `hourwell://gcal-callback?status=ok&confirm=…`. Chrome on the Mac shows a spinner and never navigates (no handler for the scheme). The confirm token was read from `gcal_sync_state` and `confirm` sent with the **same** user's JWT at 05:31:03 → 200 `connected: true`; initial sync + channel registration + write-back pass ran under the lease in 3.1 s. |
| 3.3 | `status`                                | `connected: true`, `last_synced_at` 05:31:03, `channel_expires_at` 2026-09-05 05:31 (7 days), `sync_token` and `channel_id/resource_id/channel_token` set, `last_error: null`. The `timeMin`-only initial sync mirrored the calendar's two upcoming events.                                                                                                                                                                                                                                                                                                                                                       |
| 3.4 | event 20 days out (adversarial #2)      | `Hourwell 20-day check` (Fri 2026-09-18, 08:00–09:00Z) in `calendar_events` at 05:33:46 — between the 05:30 and 05:35 sweep ticks, i.e. **by push**. The sync token carries no time restriction. Closed.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3.5 | meeting over a planned block            | Profile (Europe/Kyiv) + one task via `sync-resolve` + `plan-request` (learned engine, 1 779 ms) → rec `5706937a` `shown`, 07:45–08:45Z on 2026-08-30. A first meeting at 07:00–07:30Z (instruction given in the wrong zone → no overlap) synced and displaced nothing — correct. The meeting **edited** to 07:00–08:15Z synced at 05:49:10 (push, between ticks) → rec **`displaced_pending`** at 05:49:11; `feedback_rewards`, `recsys_applied_tuples`, `bandit_state`: 0 rows (invariant 4). The app-side busy row + "meeting" caption stay on the device checklist (headless user).                            |
| 3.6 | sweep                                   | `gcal-sweep` every 5 min `succeeded`, 200s in `net._http_response`; `users: 0` before the confirm, `users: 1` from 05:35; `synced: 1` at 05:40 (the first meeting), `renewed: 0`, `errors: 0` throughout.                                                                                                                                                                                                                                                                                                                                                                                                         |
| +   | all-day events (the assumption from §3) | A default all-day event (`Hourwell all-day check`, Mon 2026-08-31) triggered a sync at 05:52:08 and produced **no row** — Google sent it `transparent` and `mapGoogleEvent` dropped it (a birthday never blocks a day). The same event marked Busy → row `busy = true`, 2026-08-30T21:00Z → 2026-08-31T21:00Z at 05:55:00 (push; the coinciding sweep reported `synced: 0`) — midnight to midnight in the calendar zone Google reports with the feed.                                                                                                                                                             |
| +   | `disconnect`                            | 200 in 2.1 s: token revoked at Google, `gcal_sync_state` row gone, the 5 mirrored rows tombstoned (`deleted_at`, 0 live), the recommendation stays `displaced_pending` (plan state outlives the connection), task untouched. `status` → `connected: false`.                                                                                                                                                                                                                                                                                                                                                       |

Not exercised live: write-back (the connection stayed read-only), push-channel renewal at
day 7 and the Testing-status refresh-token expiry (both need a week on a real account), a
cancelled meeting, the device redirect (§3). Lesson recorded in the runbook: state the slot to
cover in the calendar's own zone, derived from a stored event (time shown in Google vs stored
UTC) — a UTC+2 guess put the first meeting 15 min before the block.

## 3. What is NOT established (and where it is tracked)

- **Google Calendar, what §2.3 leaves open.** Write-back against Google (the live connection
  stayed read-only), push-channel renewal at day 7 and the Testing-status refresh-token expiry
  (a week on a real account — the device pass), a cancelled meeting, and the browser →
  `hourwell://` redirect landing in the app on both platforms (device checklist; a desktop
  browser silently stalls on it, §2.3 row 3.2).
- **Real radios.** Offline → reconnect with airplane mode, flaky handoffs, the `expo-network`
  reconnect trigger, background → foreground timing — device checklist (NFR-R1 entry, now the
  full obligation).
- **Multi-device.** The conflict path is proven with a faked second device (tests + the stale
  `base_version` live check); two real installs of one account have not been run.
- **UC-09 "≤ 5 min"** is a server-side statement (push channel + the 5-min sweep); the client
  learns at its next foreground/poll (invariant 7). The sweep tick ran live with one connected
  calendar (§2.3 row 3.6); pushes arrived within seconds of each change.
- **NFR-P3** for the sync round trip is measured from a Mac (§2.2), not a handset.
- **Write-back events are not removed from Google on disconnect** (revisit.md) and a cancelled
  meeting does not un-displace a block (ADR-0012 §9 [INFERRED]).

## 4. Adversarial pass (fresh-context subagent, 2026-08-28 → fixes 2026-08-29)

**3 MAJOR + 12 MINOR + 5 notes.** All three MAJORs and eleven MINORs fixed before merge (the
five engine items #5–#8/#13 on 2026-08-29, `engine.test.ts` +7); one documented residual.

| #   | Sev   | Finding (short)                                                                                                                          | Outcome                                                                                                                                                                                                                                                                  |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | MAJOR | Daily sweep never took the lease; a plan-side `displaced` patch could overwrite a facts-side `completed` (invariant 2)                   | **Fixed** — daily/instant paths run under `acquire_sync_lease` (busy users skipped, `skipped_busy` reported; instant → 409); every patch carries `expected_status` and `patchRecs` is compare-and-set. Deno tests (4) incl. the stale-read race.                         |
| 2   | MAJOR | Initial full sync bounded by `timeMax`; Google's sync token inherits the initial filters → the feed would end two weeks after connecting | **Fixed** — `timeMin` only (Google's own sample); runbook §3 adds the "event 20 days out" must-pass check before enrollment.                                                                                                                                             |
| 3   | MAJOR | "Discard them" destroyed another account's unsynced ops in one tap (invariant 14)                                                        | **Fixed** — `Alert` confirm with a destructive button; jest asserts nothing is discarded before the confirm.                                                                                                                                                             |
| 4   | MINOR | Task→Inbox mirror + notice fired on `displaced_pending` (a block possibly being worked)                                                  | **Fixed** — only the final `displaced` moves the task; pending renders "A meeting now overlaps this block — it still counts if you do it".                                                                                                                               |
| 5   | MINOR | 409 `busy` not retried                                                                                                                   | **Fixed** — a `busy` outcome schedules exactly one debounced retry (`retryingBusy`; the 2 s debounce is the backoff), a new trigger starts afresh; test with fake timers.                                                                                                |
| 6   | MINOR | Backlog > 200 ops drains one batch per trigger                                                                                           | **Fixed** — the round loop continues while unacked ops not yet sent in this sync remain (a `Set` of sent op ids), still bounded by `MAX_ROUNDS`; test: 101 tasks = 202 ops → 2 rounds, all acked.                                                                        |
| 7   | MINOR | No error boundary in `run()` (status stuck `syncing`, unhandled rejection)                                                               | **Fixed** — `try/catch` around the loop → status `error`, `Sentry.captureException`, outcome `failed`; the single-flight slot is released (test: thrown invoke, then a normal sync).                                                                                     |
| 8   | MINOR | A dead-lettered op leaves its entity permanently stale locally                                                                           | **Fixed** — `applyAcks` returns the dead-lettered ops; task/profile entities with no later unacked op are re-read through the user client (`from('tasks')…maybeSingle()`) and applied as a one-row pull page (tests: applied; skipped while a later op owns the entity). |
| 9   | MINOR | `recommendation_status` ops carried no `user_id` → after a deferred wipe pushed under the wrong account and rejected                     | **Fixed** — payload stamps `user_id`; the RPC rejects a foreign one (pgTAP).                                                                                                                                                                                             |
| 10  | MINOR | OAuth consent not bound to the starting device (a phished consent could link a victim's calendar to another account)                     | **Fixed** — tokens stored unconfirmed; a one-shot confirm token travels only in the redirect; `gcal-connect {confirm}` under the starting account's JWT activates, a mismatch purges (migration `confirmed_at`/`confirm_token`; 5 Deno tests).                           |
| 11  | MINOR | Write-back events outlived disconnect / write-back off                                                                                   | **Fixed** — `clearWriteBack` deletes every mirrored event before the revoke and on switch-off.                                                                                                                                                                           |
| 12  | MINOR | ADR §10 write-back vocabulary vs code                                                                                                    | **Fixed in the ADR** (every non-open status deletes its event).                                                                                                                                                                                                          |
| 13  | MINOR | ADR §2 "applied ops converge without a pull" vs the client ignoring `ack.version`                                                        | **Fixed** — an `applied` ack sets the local row's `version`/`server_seq` when no later unacked op owns the entity (tests: adopted; left to the later op). ADR §2 updated.                                                                                                |
| 14  | MINOR | `server_seq` assigned at statement time: a pull between a writer's seq assignment and commit could skip a row                            | **Mitigated** — plan persistence, the calendar sync and the reward sweep now run under the per-user lease that the pull also holds; residual: a writer that could not obtain the lease within 3 s proceeds (logged) — revisit.md.                                        |
| 15  | MINOR | A 200 with an empty body treated as 410 → mirror wiped                                                                                   | **Fixed** — only HTTP 410 is `gone`; an empty body throws into `last_error`.                                                                                                                                                                                             |

Notes acted on: Expo Go's `exp://` scheme cannot receive the callback (device checklist + runbook); the
60 s poll budget stated in ADR §6; `pinned` blocks are displaced like `shown` ones (ADR §9); the
sweep's serial ceiling (runbook); chunk-level displacement coarseness (revisit.md).

Re-verified after the fixes: Deno 155, jest 337, pgTAP 85, live smoke 27/27 on the redeployed
functions (the `gcal-connect` build fingerprinted by its action list — P7.1 lesson).
