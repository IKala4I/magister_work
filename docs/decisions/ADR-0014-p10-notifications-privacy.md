# ADR-0014 — P10: local notifications with a hard cap, the evening ritual, export + erasure, retention

- **Date:** 2026-08-30
- **Status:** accepted
- **Phase:** P10
- **Spec anchors:** specs/02 FR-26, FR-32 ("notification response"), FR-42, FR-50, NFR-A1/A2,
  NFR-P1–P3, NFR-S2, UC-08, UC-09, UC-10; specs/03 §2 stack row "Notifications"; specs/05 §1
  (lazy lapse, invariant 7); specs/07 §4.1 `profiles.settings`, `deletion_audit`, §4.4, §7
  (erasure, export, retention), Appendix A rows "notification lead", "daily notification cap",
  "retention windows"; ADR-0011 (local notifications only; EU-only data paths); ADR-0012 §9–§11.

## Context

The specs fix the notification cap (5/day, spec-fixed), leave the lead time to P10 (proposed
10 min, "v1 static"), and describe FR-42 as "a single auth-admin call + `deletion_audit` row;
completion email within 30 days" with an `export-data` edge function. Invariant 7 forbids any
correctness that depends on background execution, ADR-0011 rules out push infrastructure
(participant data must not transit a US push relay; the free tier has none anyway), so every
notification is **local**, scheduled by the app while it is in the foreground. The retention
windows (events 24 months, anonymous accounts 30 days) are [INFERRED] in specs/07 and marked
"fixed by ADR in P10". The consent clause promises an export in Settings and a deletion that
"removes your records within 30 days … you receive a confirmation e-mail".

## Decisions

1. **Block-start reminders are local notifications planned by a pure scheduler
   (`apps/mobile/src/notifications/plan.ts`).** Input: the open placements of the plan day
   (`shown`/`accepted`/`pinned`/`moved` with `slot_start − lead > now`), the task per placement
   (category → mute), the profile's notification settings, the day's **delivered ledger** and
   `now`. Output: at most `NOTIFICATION_DAILY_CAP − delivered_today` requests, **earliest fire
   time first**, each `id = block:<recommendation_id>` firing at `slot_start − 10 min`
   (Appendix A "notification lead", v1 static — FR-50's "smart" lead time is FR-51's flag-gated
   extension and is out of scope). The evening ritual (decision 3), when enabled and still
   ahead, reserves one of the remaining slots. A muted category, a placement whose reminder
   time has passed, or a task that no longer exists yields nothing.
2. **The cap is enforced against a conservative ledger, so it holds across re-plans
   (`ledger.ts`, MMKV).** The app remembers what it asked the OS to schedule (`scheduled`,
   with fire times). On every scheduler run it first _settles_: every scheduled request whose
   fire time is ≤ now is counted as **delivered** (whether or not the OS actually presented
   it — counting an undelivered one keeps the cap a ceiling, never a floor), then the plan is
   recomputed from scratch and re-scheduled. The OS-side cancel runs **before** the settle, so
   nothing can fire in between and go uncounted. The ledger keys on the **local calendar day
   of the fire time** (not the 06:00 plan day) and keeps today + yesterday. The cap is **per
   install**: two devices of one account each hold their own ledger and may both remind about
   the same block (revisit.md). A pass without a profile row (erased account) schedules
   nothing, not even the ritual. "Storm" = twenty placements, three re-plans and a settings
   change in one day → never more than five requests scheduled+delivered (jest `plan.test.ts`,
   `ledger.test.ts`, `scheduler.test.ts`).
3. **The evening ritual (FR-26) is one local notification per day at the user's ritual time
   (default 20:00 local, Settings) with two actions:** `accept` ("Plan tomorrow") requests
   tomorrow's plan (`plan-request` already accepts `plan_date` up to seven days ahead; new
   trigger value `evening_ritual` persisted in `plans.telemetry.request.trigger`), `adjust`
   ("Adjust tasks") opens the Inbox. On Sundays the copy invites the weekly review and the tap
   opens Insights (UC-08 "Sunday-evening notification, FR-26 cadence"). "Tomorrow" is the day
   after the ritual's **own plan day** (`nextPlanDayOf(scheduled_for)`): a 22:00 ritual tapped
   at 00:30 still plans the coming day. A plan for tomorrow made tonight is what Today shows
   after 06:00 — before 06:00 the previous plan day's plan stays on screen (the 06:00 anchor);
   the UC-03 trigger now asks "is there a plan for **today**", not "is the latest plan
   today's", so an evening plan never re-plans the current day at 21:00.
4. **A notification response is a fact (FR-32).** Every tap/action appends a
   `notification_response` event (`kind` ∈ {block_reminder, evening_ritual}, `action`,
   `recommendation_id`, `scheduled_for`, `latency_ms`) through the op outbox — categorical
   only. Scheduling itself is not a fact (it would log the plan twice); analytics get a
   categorical `notifications_planned` (scheduled/capped/muted counts) and
   `notification_opened`.
5. **Per-category mute and the ritual settings live in `profiles.settings`** (specs/07 §4.1
   "notification prefs incl. per-category mute") under a typed `notifications` key with
   defaults (`block_reminders: true`, `lead_minutes: 10`, `muted_categories: []`,
   `evening_ritual: true`, `evening_ritual_time: "20:00"`). The `profile_update` op now carries
   `settings`; the replay RPC `sync_apply_profile` merges it (it silently dropped the column
   before — spec-conflicts L34); the client's conflict merge (`merge.ts`) carries `settings`
   with the row-level winner too (adversarial M1). Reminders are only ever scheduled after the
   OS permission was granted; the app asks once from a Today card, never at launch. Sign-out,
   an account switch and erasure cancel every pending notification and forget the ledger.
6. **No displacement notification.** ADR-0012 §10's "≤ 5 min" is server-side; the device
   learns of a displacement at its next foreground — at which moment the user is looking at
   the app and the existing Today notice is the right surface. A push would need a relay
   (ADR-0011: none). UC-09's "replacement suggestion notification (respecting FR-50 cap)"
   is satisfied by the next block reminder of the re-planned day; revisit.md line closed.
7. **FR-42 export = `export-data` edge function (user JWT).** Reads every user-owned table
   under the **user's** client so RLS is the filter (no service role in the read path):
   profile, tasks, calendar_events **without `title`** (specs/07 §4.1 "display only; never
   exported"), plans, recommendations, events, feedback_rewards, belief_labels, and the
   learned parameters (beta_cells with their priors, bandit_state, blend_state,
   duration_estimates, cluster_assignments) plus study_assignments; server-only ledgers
   (`sync_ops`, `sync_leases`, `gcal_sync_state`, `recsys_applied_tuples`) are not personal
   data of the user's making and stay out. Pages of 1 000 rows, `truncated: true` past
   200 000 rows of one table (`truncated` lists the cut tables). The document is
   `{ format: "hourwell-export", version: 1 }`; the app writes it to its cache directory and
   opens the OS share sheet (expo-sharing).
8. **FR-42 erasure = `delete-account` edge function**, three modes: `self` (user JWT), `operator`
   (service key + `user_id`; the privacy README §7 path for a request by e-mail — the operator
   resolves the id, never browses rows), `retention` (service key; decision 9). Per user, in
   order: best-effort Google disconnect (write-back mirror removed, channel stopped, token
   revoked — the code path `gcal-connect` uses, now shared as `_shared/gcal_sync.ts
disconnectGoogle`), a `deletion_audit` row (`user_hash` = SHA-256 of the uid, `reason`),
   `auth.admin.deleteUser(uid)` — the cascade through every user-owned table (pgTAP
   `p10_privacy_test.sql` inserts a row in **every** table that references `auth.users` and
   proves all are gone while a second user's rows survive; a structural assertion checks that
   every FK to `auth.users` in `public` is `ON DELETE CASCADE`), then `completed_at`. A failure
   to stamp `completed_at` after the delete is logged, not surfaced — the user is gone and the
   device must not be stranded with a dead session (the open audit row is the evidence). The
   backend-key check for operator/retention is constant-time and rejects an empty key
   (`_shared/auth.ts`, shared with the other cron-called functions). Erasure completes
   synchronously — "≤ 30 days" is the bound, seconds is the practice. The app then cancels
   every scheduled notification, wipes the local mirror and MMKV state, signs out locally and
   shows a confirmation with the audit reference.
9. **Confirmation is in-app, not by e-mail.** The free tier has no transactional mail (the
   auth mailer only sends its own templates), a mail provider would be a new processor
   (Art. 28) and anonymous accounts have no address at all. The confirmation screen shows the
   `deletion_audit` id and the completion time; the consent clause is reworded
   (thesis-corrections). If the owner wants e-mail confirmation for the study, it needs an
   EU mail processor — owner decision, revisit.md.
10. **Retention (Appendix A, fixed here).** Anonymous accounts: purged after **30 days of
    inactivity** (no sign-in and no **synced** event for 30 days — an anonymous session's
    `last_sign_in_at` does not advance on token refresh, so a device offline for 30 days is a
    candidate) — the [INFERRED] "unconverted after 30
    days" would destroy an active trial user's data mid-trial, which the hygiene rationale
    never intended; a daily pg_cron tick (`retention_sweep_tick`, 03:10 UTC) calls
    `delete-account {mode: retention}`, which lists candidates through the service-only RPC
    `anonymous_purge_candidates` and runs the same erasure path (audit `reason =
anonymous_retention`). Raw events: the 24-month window starts at **study end** and is executed
    by the P11 archive job (pseudonymised Parquet on EU storage, ADR-0011 §3) — a delete-only
    sweep before the archive exists would destroy the study; no such job is scheduled.
11. **Accessibility and performance are "prepare for device verification".** WCAG 2.2 AA
    evidence that can be mechanical is: token contrast for every text/surface pairing in both
    schemes (test), a source-level audit that every pressable carries a role and every text
    goes through `ThemedText` (test), composed labels on new components (component tests), a
    Maestro sweep over every shipped screen at maximum text size with reduced motion
    (`e2e/p10-a11y-sweep.yaml`). Everything device-conditioned (VoiceOver/TalkBack order,
    Android font scale + display size, delivery timing, Doze, real radios) is on
    `device-checklist.md` with the protocol and the script that drives the hardware pass
    (`scripts/device-pass.sh`). Performance numbers in `p10-manual-verification.md` are
    labelled by where they were taken; NFR-P3 is measured from Node against the hosted
    project (`p10-perf.mjs`), never claimed for a handset.
12. **Analytics and crash reporting get an opt-out** (Settings → Privacy; MMKV flag read at
    init; PostHog: the toggle event is sent, then `optOut()` on the live instance — persisted by
    the SDK and gating its own listeners — then the client is dropped; the instance is created
    with `captureAppLifecycleEvents: false` so the typed catalog in `events.ts` is the complete
    list of what the app emits (adversarial M2); Sentry at next launch, said in the hint). Off by
    default stays "on when keys are present" — the study needs the events (File 06), the consent
    clause discloses them.

## Rejected

- **Remote push (Expo push / FCM / APNs) for displacement or reminders** — needs a relay
  outside the EU or a paid one; ADR-0011.
- **Background fetch to (re)schedule reminders** — invariant 7; the foreground scheduler with a
  conservative ledger is sufficient because a reminder only ever concerns the plan the user
  last saw.
- **Undo window (6 s) on account deletion** — the 6-s undo protects frequent in-app actions
  against slips; a deletion is confirmed twice and its execution must not depend on the app
  staying alive for six more seconds.
- **`erase_user(email)` SQL RPC** — cannot revoke a Google token; the edge function's operator
  mode is the equivalent with the same audit row.

## Consequences

- Acceptance (PLAN §3): cap under storm — `plan.test.ts`/`scheduler.test.ts`; export contains
  tasks/events/learned params — `export-data/handler_test.ts` + live smoke; deletion cascades —
  `p10_privacy_test.sql` (every table) + live smoke on the hosted project; a11y audit —
  `p10-a11y-audit.md`; before/after perf table — `p10-manual-verification.md` §2.3; device
  checklist runnable — `scripts/device-pass.sh`.
- Owner gates (⛔): the migration push (`retention_sweep_tick`, `deletion_audit.reason`,
  `anonymous_purge_candidates`, `sync_apply_profile` settings merge), the two function deploys,
  the Vault secrets already set for the attribution tick are reused; a development build with
  `expo-notifications` for the device pass (Expo Go supports local notifications but not the
  notification icon/channel config).
- Revisit: FR-51 smart lead time (flag); e-mail confirmation (owner); two-device ritual
  (a ritual accepted on one device plans tomorrow for both — fine); Android exact-alarm
  semantics for the DATE trigger on API 31+ (device pass).
