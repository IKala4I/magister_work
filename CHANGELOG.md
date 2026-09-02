# Changelog

## v0.1.0 rollup — release-notes substrate (P12, 2026-08-31)

Everything below condenses P0–P11 for release notes and the thesis; per-phase detail follows.

- **Plan your day around your real energy.** Tasks are placed by learned personal completion
  probability (decayed Beta energy cells + a LinUCB/TS contextual bandit, blended), solved
  under hard calendar constraints by CP-SAT; every placement carries a one-sentence rationale;
  uncertain blocks literally render less solid, experiment blocks are labeled.
- **Zero-guilt loop.** Focus sessions, one-tap ratings, skip/move/finish facts; a skip is a
  data point (never red); lapses return tasks to the Inbox; corrections ("actually did it",
  7 days) rebuild model state from stored tuples; duration estimates learn (EWMA ≥ 3 sessions).
- **Quick-add in plain language** (dates chrono-node, durations an on-device grammar),
  offline-first everything (SQLite + op outbox, push-then-pull sync, field-level merge),
  Google Calendar (server-held OAuth, push + 5-min sweep, optional write-back, displacement
  without false rewards).
- **Trust surfaces:** energy heatmap (OKLCH, text alternative), "what Hourwell believes"
  with ✓/✗ corrections (one prior's worth, full rebuild), weekly review on facts-only PAR,
  trade-off sheet on over-committed days.
- **Notifications with a hard ≤ 5/day cap** (conservative delivered-ledger), evening
  "plan tomorrow" ritual, per-category mute — all local, no push relay.
- **Privacy:** EU-only processing, RLS everywhere, in-app export + synchronous audited
  erasure (cascade pgTAP-proven), 30-day anonymous retention, analytics opt-out; cross-user
  training sees categorical features only — never task text.
- **Research substrate:** exact logged propensities on the randomized slice (both arms,
  matched randomization), nightly in-region training (EB priors behind an eval gate, ALS +
  k-means + fold-in ≥ 30), K=32 MC propensity backfill, OPE family (replay/IPS/clip/SNIPS/DR,
  ESS gate), aggregate nightly report (min cell 5), ABAB/BABA study mode.
- **Ops:** Supabase (eu-west-1) + Oracle A1 VM (eu-marseille-1) with pull-based rollout,
  hardened SSH + Tailscale admin path, nightly training timer, runbooks for every timer.

## Post-P12 — hardware pass fixes (2026-09-02, fix/recsys-legacy-tz)

- **fix(recsys, training): legacy IANA timezone ids resolve inside the containers.** Found on
  the Pixel 7a (hardware pass, day 2): Android reports `Europe/Kiev` (a tzdata backward link)
  and the service validates the id with `ZoneInfo`; `python:3.12-slim` ships those links only
  in `tzdata-legacy`, so every `/plan` from the device answered 422 and the edge function served
  the `fallback:http` heuristic — the learned engine was unreachable from a real Ukrainian
  Android device while the Mac smoke (`Europe/Kyiv`) passed (30 zero-block plan rows on
  2026-09-01; reproduced live with two throwaway users, `docs/verification/hw-tz-repro.mjs`).
  Fix: the `tzdata` wheel (2026.3) as an unconditional dependency of both Python projects
  (zoneinfo consults it after TZPATH), a build-time `ZoneInfo('Europe/Kiev')` assertion in both
  Dockerfiles, and tests that empty TZPATH so a runner's system tzdata cannot mask a missing
  wheel. The training image's `iso_week` (PAR) had the same exposure. Refs: NFR-R2, UC-03,
  File 04 §2 (H1 — arm B must be reachable on every device).
- **chore(mobile): Expo SDK 57 patch drift** — `expo install --fix` (9 packages, expo 57.0.19) so expo-doctor passes CI again; the device APK under measurement stays the 57.0.18 build (`docs/versions.md`).

## Post-P12 — hardware pass client fixes (2026-09-02, fix/mobile-hardware-pass-batch)

Client-side batch from the Pixel 7a pass (`docs/verification/device-pass/android-2026090[12]-*/notes.md`);
the measured APK stays constant until the batch lands, then cold start ×20 and the affected
screens are re-verified on the device.

- **fix(mobile): every cold start re-planned (UC-03 "exactly one plan request per plan day";
  thesis-critical, broke in P6).** Server rows showed one `trigger=first_open` plan per cold
  start while today's plan was persisted (day 2 #15; day 1's 30 zero-block rows had the same
  cause and tripped the 30/24 h limit). Root cause: `useLiveRows` starts as `[]` and reads in
  an effect, the Today screen passed `latestAnyRows[0]?.planDate ?? null` (null = "never
  planned") into `usePlanTrigger`, whose mount effect decided before the first read — and the
  per-day dedup key lived only in the ephemeral Zustand store. Fix at the root:
  `useLiveRowsState` exposes `{ rows, ready }` (false until the first read resolves; the plain
  `useLiveRows` signature stays), `decidePlanTrigger` takes `ready` and decides nothing until
  both plan reads are ready, and the dedup key moved to MMKV (`plan.lastRequestedDay`,
  `src/sync/planRequestDay.ts`) so a cold start on a day that already requested does not
  request again even when the read is slow or the plan had zero blocks. Manual re-plan still
  bypasses the dedup; the evening ritual (plans tomorrow) never writes today's key; an account
  change clears it. Tests: `planTrigger.test.ts` (not ready → no request),
  `usePlanTrigger.test.ts` (persisted plan → no request on mount; dedup survives a simulated
  cold start; manual still requests; ritual leaves the key alone), `useLiveRows.test.ts`
  (unread ≠ empty). Refs: UC-03, NFR-R2, FR-26.
- **fix(ui): Today time gutter scales with the font scale (NFR-A2 / FR-22).** At font scale 2.0
  the fixed 64 px gutter broke "12:00 PM" into "12:0" / "0 PM" (day 2 #14a). New
  `useFontScale()` (the OS multiplier clamped to the ThemedText cap, live via
  `useWindowDimensions`) drives `gutterWidthFor(scale) = ceil(64 × scale)` as the gutter's
  `minWidth` (`flexShrink: 0`; a longer locale clock widens its own gutter instead of
  clipping), and the clock text is `numberOfLines={1}`. Tests: `useFontScale.test.ts` (clamp),
  `today.test.tsx` (64 px at 1×, ≥ 128 px at 2×, one-line clock).
- **fix(ui): Insights heatmap weekday header no longer wraps mid-word (FR-40 / NFR-A2).** At
  font scale 2.0 the seven "Mon…Sun" columns wrapped as "M/on", "Tu/e", "W/ed" (day 2 #14b).
  From `COMPACT_WEEKDAY_FONT_SCALE = 1.5` the header uses two-letter catalog labels
  (`weekday.short.*`: Mo…Su); every header label is `numberOfLines={1}`; the grid's accessible
  summary label is untouched (the header stays `importantForAccessibility="no"`). Test:
  `insights.test.tsx` (Mon at 1× and 1.3×, We at 2×, summary label unchanged).

## P11 — Training pipeline + OPE + study mode (2026-08-31, phase/P11-training)

**Database (ADR-0015).** Migration `20260831120000_p11_training`: `cluster_cells`
(versioned per-cluster EB aggregates; RLS on, no policies — service only); private Storage
bucket `models` (ADR-0011: EU artifact home); `recommendations.context_bucket` CHECK pinned
to the 14 φ ids (NOT VALID — new rows only; five out-of-vocabulary ids in old test fixtures
surfaced and were corrected); seed priors v0 got a promoted `model_registry` row and
`instantiate_user_priors` now follows the **highest PROMOTED priors version** (the eval
gate, closing the ADR-0005 §6 note); `enroll_participant` (File 06 §1.2: 4 × 2-week phases
from ABAB|BABA, stamps `research_cohort` + the G6 EU/EEA answer, raises on re-enrollment);
`diagnose_user` (privacy §7: counts/timestamps only). pgTAP `p11_training_test.sql` (26):
NFR-S3 closed-vocab rule (every whitelisted text column CHECK-constrained), the
unpromoted-refresh-inert / promoted-takes-over pair, the full BABA phase table, leak checks.

**Training package** (`training/`, 73 pytest). NFR-S3 whitelist as data — the ONLY SQL
producer, pinned four ways (pgTAP fixture, forbidden names, SQL reconstruction, the
client's `CLIENT_EVENT_TYPES`); export gates count refused rows (`DroppedRows`) and never
let them leave the DB. OPE (File 04 §2): replay hard-restricted to the randomized slice
(no logged A_m(x) / exact propensity ⇒ raise), IPS / clipped (M=10) / SNIPS / DR; **every
estimate carries ESS, < 100 rendered NON-EVIDENCE**; on synthetic ground truth the
estimators RECOVER the closed-form value (DR stays unbiased under a deliberately wrong
reward model). PAR mirror of `_shared/par.ts` (H2; AST source lock). ALS on decayed cell
aggregates (items = 48 cells, `implicit`, one confidence convention — k=1 hand case exact,
library parity within the honest 2 % bound), silhouette k-means, closed-form fold-in ≥ 30
outcomes; cluster switches refresh **unvisited cells only** (invariant 5, `succ = 0 and
fail = 0` in SQL). EB refresh (moments + guards) behind a held-out log-loss gate — no
artifact, no promotion. MC propensity backfill (K = 32) scoring **through the service's own
modules** (path dependency + `py.typed`); Laplace floor, deterministic per-row seeds,
LinUCB skipped (L3), exact slice propensities never touched. Aggregate report (min cell 5):
drop rate per arm, personal-by-label counts, scaling-active users, interference probe (L4),
OPE table.

**Deploy + CI.** `training/Dockerfile` (repo-root context, arm64, libgomp1); one-shot
compose service `training` (profile-gated, 2-cpu cap); `hourwell-train.timer` nightly 00:30
UTC — the keep-busy timer STAYS (runbook §7 forecast corrected; ADR-0015 §1); rollout pulls
both images. `train.yml`: the same pipeline **on a synthetic cohort only** (G3 — no hosted
secret), end-to-end asserted (registry rows, no-credentials-no-promotion, full backfill
coverage, M-01 row = telemetry cross-check). `deploy-training.yml`: native arm64 build with
an in-image `implicit` ALS smoke (the ADR-0011 wheel check).

**Study mode.** Blocked randomization (block 4, seeded audit list) +
`docs/study/enrollment-checklist.md` with the G6 gate (an EU/EEA resident cannot be
enrolled before a Union representative exists).

**Tooling.** `pgtap-linked.sh` parser rewritten to the shared db-query rule (the CLI now
nests the TAP text two JSON layers deep) + env-gated raw tee.


## P10 — Notifications, privacy, a11y, performance (2026-08-30, phase/P10-notify)

**Database (ADR-0014).** Migration `20260830120000_p10_privacy`: `deletion_audit.reason`
(`user_request` | `operator` | `anonymous_retention`); `anonymous_purge_candidates()` — anonymous
accounts with no sign-in and no event for 30 days (the Appendix A window read as inactivity, not
age; service-only); `retention_sweep_tick()` + a daily pg_cron job (Vault-held key →
`delete-account {mode: retention}`); `sync_apply_profile` now merges `profiles.settings` (the P8
body dropped the column). pgTAP `p10_privacy_test.sql` (36): every FK to `auth.users` cascades,
the 18 user-owned tables are pinned, one user's row in every table is gone after one
`auth.users` delete while the bystander and the audit row survive, the purge rule, the settings
merge on both replay branches. Run against the linked project inside a rolled-back transaction
(36/36; `pgtap-linked.sh` parses the CLI's new `{message}` shape).

**Edge functions.** `export-data` (user JWT): the FR-42 document read under the USER's client so
RLS is the filter — profile, tasks, calendar events **without titles**, plans, placements,
events, reward tuples, belief labels, study assignments and the learned parameters (Beta cells
with priors, bandit state, blend weights, duration estimates, cluster assignment); pages of
1 000, a 200 k-row ceiling flagged; a contract test pins exported ∪ server-only = the 18 tables.
`delete-account`: `self` (JWT) / `operator` (backend key + uid — the privacy README §7 path) /
`retention` (backend key) — best-effort Google teardown (`disconnectGoogle`, now shared with
`gcal-connect`), `deletion_audit` row, `auth.admin.deleteUser` (the cascade), `completed_at`;
responses carry audit references only. `plan-request` accepts `trigger: evening_ritual`.
187 Deno. Deployed 2026-08-30 (redeployed after the adversarial fixes).

**Mobile — notifications (FR-50, FR-26, FR-32).** Local notifications only (ADR-0011): a pure
planner picks at most **5 per local day** — block reminders at `slot_start − 10 min`, earliest
first, the evening ritual reserving one slot — against a conservative **delivered-ledger**
(MMKV) that counts every past-due request as delivered, so the cap holds across re-plans,
settings changes, restarts and the day boundary (storm tests) — **per device, per local
calendar day** (two devices of one account each keep their own ledger). The scheduler runs on mount,
foreground and table changes only (invariant 7); the OS permission is asked once from a Today
card. Per-category mute and the ritual time (presets 19–22:00) live in `profiles.settings` and
ride the `profile_update` op. Every tap/action is a `notification_response` fact (kind, action,
latency) through the outbox; the ritual's **Accept plans tomorrow** (`plan-request` +1 d),
**Adjust** opens the Inbox, a Sunday tap opens the weekly review (UC-08). The UC-03 trigger now
asks "is today planned", so an evening plan never re-plans the current day. Today shows the
tomorrow line ("Tomorrow is planned: N blocks, first at …") and, after the ritual time with
tasks waiting, the one-tap card. `expo-notifications ~57.0.15`.

**Mobile — privacy (FR-42, UC-10, NFR-S2).** Settings → My data: **Export** (document → cache
file → OS share sheet, `expo-sharing ~57.0.16`) and **Delete account and data** (two
confirmations → `delete-account` → every local row, the outbox, the cursor, the insights cache,
the notification ledger and all pending notifications are forgotten → local sign-out → a
confirmation screen with the audit reference and the completion time; no e-mail —
thesis-corrections #43). Settings → Privacy: analytics off at once (the toggle is the last
event), crash reports off at the next launch.

**Accessibility (NFR-A1/A2).** `a11yAudit.test.ts` pins on every commit: every pressable
carries a role, every switch a label, no raw `<Text>` outside the primitives, `ThemedText` keeps
scaling with the 200 % cap, the palette rules (body pairs ≥ 4.5:1 in both schemes; secondary
text on the primary container is large-text only; accents are fills, never text). Three real
AA misses found and fixed: white on the dark primary (2.98:1 → the dark surface colour, 6.3:1),
the green "Done" caption (2.4:1) and the warning captions in Settings / sign-in (2.7:1) →
secondary text. `e2e/p10-a11y-sweep.yaml` walks every screen at max text size + reduced
motion; `scripts/device-pass.sh` drives the hardware pass. Audit table:
`docs/verification/p10-a11y-audit.md`.

**Performance (NFR-P1/P3, measured from Node → eu-west-1, 2026-08-30).** Wire floor 73 ms p95;
PostgREST read 88 / write 82 ms p95 ✅ (NFR-P3 holds for the core CRUD API); `sync-resolve`
477 ms, `insights` 714 ms, `export-data` 736 ms p95 ❌ (composite function round trips — reported,
revisit: one RPC for lease + replay + pull); `plan-request` 965 ms p95 ✅ (NFR-P1). No device
number claimed; NFR-P2 stays at the P2 simulator value pending the hardware pass.

**Adversarial pass** (fresh-context subagent): 2 MAJOR + 12 MINOR, both MAJORs and 10 MINORs
fixed the same day — `settings` now survive the client's profile-conflict merge (a second device
could silently revert a mute); the analytics opt-out calls `optOut()` on the live instance and
lifecycle capture is off (the typed catalog is complete); sign-out / account switch / erasure
cancel pending notifications; the ritual plans the day after its own plan day (a tap at 00:30);
Today follows the 06:00 anchor before dawn; cancel-before-settle; no ritual without a profile;
a failed audit stamp after the delete no longer strands the device; constant-time backend-key
compare rejecting empty keys (shared); the permission re-reads on foreground; radios announce
`checked`; a brace-aware a11y scanner. Two MINORs documented (cap per install; non-preset
ritual times show no selected chip) — `docs/verification/p10-manual-verification.md` §4.

**Tests.** 461 jest (56 suites) · 188 Deno · 149 pytest (unchanged) · 36 pgTAP.

**Live (2026-08-30, after the owner's migration push).** `p10-live-smoke.mjs` **25/25** on the
hosted project: the export document and the full self-erasure round trip observed service-side
(zero rows for the uid in every user-owned table incl. `auth.users`; audit row completed). Two
findings fixed first: the stateless JWT outlived the deleted account (the account functions now
verify the session server-side via `auth.getUser`; the delete handler re-checks existence —
never a second audit row), and the smoke's `db query` parser broke on the CLI's new output
shape for the second phase running — replaced by ONE shared shape-tolerant parser
(`docs/verification/lib/db-query.mjs`) used by the P9 and P10 smokes.

## P9 — Trust surfaces (2026-08-29, phase/P9-trust)

**Service (ADR-0013).** `POST /labels`: a belief label (FR-41 ✓/✗, FR-33 correction) is one
prior's worth of pseudo-observations on the named Beta cell (`correct` → S, `incorrect` → F,
`none` clears; weight = α₀ + β₀ — File 04 §3.3's n₀ — decaying like evidence); every delivery
stores the labels (upsert by id) and runs the **full rebuild** from stored tuples + the label in
force per cell, interleaved by timestamp (invariant 6 — a flipped or cleared toggle is never a
downdate; invariant 5 — the prior is untouched). Labels touch Beta cells only (no feature
vector → bandit and blend replay unchanged). `GET /insights` adds `beliefs` (one per category ×
day type, the daypart the posterior favours, with the label in force), per-cell `personal`
(rung 2; a labelled cell is personal by definition), `learning_mode`, `labels`. `api.ts`
regenerated. 149 pytest.

**Database.** Migration `20260829120000_p9_trust`: `belief_labels` (delivery ledger between the
`belief_label` event and the service, id = the event's op_id, RLS select-own, no client writes)
materialised by a trigger on `events` that enforces the closed `state_ref`/label vocabularies
(a malformed label fails the op — nothing half-applied). pgTAP `p9_trust_test.sql`: 23
assertions (run against the linked project inside a rolled-back transaction; `labeled_at` clamped to `now()`). Pushed to the
hosted project by the owner on 2026-08-30 (the session's permission classifier had refused
`db push`).

**Edge functions.** New `insights` (user JWT): the service document with the backend key +
weekly PAR (File 06 §1.4 per block; `_shared/par.ts` reads `recommendations` + `focus_end`
facts only — a source-level test guards H2; displaced/`expired`/open blocks out of the
denominator; ISO weeks in the profile zone) + the chronotype class the priors assume; 503 when
the service is unreachable. `attribute-rewards`/`sync-resolve` reward pass: undelivered
`belief_labels` rows are POSTed to `/labels` after the tuples and marked delivered (re-sent on
failure). A ledger read failure (e.g. the migration not yet applied) never takes the sync down: logged, `labels_delivery: failed`, retried next pass (found by the live smoke). 166 Deno.

**Mobile.** Insights tab: learning-mode badge + prior provenance; the FR-40 hour × weekday
heatmap (native Views, OKLCH interpolation between `energyLow`/`energyHigh`, cell alpha =
evidence solidity n/(n+8), one accessible summary + a full text view, category chips);
"What Hourwell believes about you" (population vs personal phrasing, ✓/✗ toggles, evidence
line; a toggle is a `belief_label` fact through the outbox, shown immediately and marked
pending until acked; the device's newer fact wins over the server label); weekly review (PAR
bars per ISO week + trend, top-3 learnings with toggles, "tell Hourwell" daypart picker = a ✓ on
the chosen cell, done → `weekly_review_completed`). Document cached in MMKV (offline/outage
render with an "as of" line). Today: the FR-24/UC-05 trade-off sheet from
`plans.telemetry.infeasible` — ranked options with consequence sentences; the pick becomes the
matching task edit (drop → not today + postpone; shrink → est − Δ; move → deadline + slip;
unpin → `recommendation_status`) + `tradeoff_decision`, then a manual re-plan; "keep as is" →
`tradeoff_rejected`; once per plan. Analytics: `belief_labeled`, `tradeoff_decided`,
`weekly_review_completed`, `insights_viewed` (categorical). 382 jest (47 suites).

**Live (2026-08-29 → 30, `p9-live-smoke.mjs`).** 2026-08-29 (migration pending): 10/10 + 2 SKIP — functions deployed, image rolled out, FR-24 verified live. **2026-08-30 (migration applied): 31/31, no skips** — the full label round trip: `belief_label` fact → trigger row (id = op_id) → delivered to `/labels` → rebuild (`succ = α₀ + β₀`) → `/insights` shows the label in force, the belief moves from the DM early-morning prior (0.78) to the labelled morning cell (0.87), personal → replay = duplicate → `none` clears the evidence and the belief returns → malformed state_ref rejected with nothing half-applied → FR-24 two pins → ranked `unpin`, decision fact synced. **Live finding, fixed (`phase/P9-smoke-close`):** one ✓ on a day-0 user switched the learning-mode badge off (the labelled cell was the only active one) — labelled cells are now outside the badge's count (ADR-0013 §2 amended); the smoke's side-query gate that skipped the round trip in the owner's shell is gone.

**Adversarial pass (fresh-context subagent → `7c7c238`).** 4 MAJOR + 10 MINOR: acked facts
never got `server_ts` (the "pending" caption was permanent); the insights cache outlived an
account switch; FR-24 `drop` looped the sheet (a deferred task stayed critical + unplaceable →
`plan-request` now filters tasks deferred past the horizon and the planner marks them
non-critical); the belief card's `accessible` wrapper hid the toggles from VoiceOver. Plus: unpin
finds the live pin on the previous plan, `labeled_at` clamped, ordered PAR queries, label
tie-break by delivery order, deleted-task fallback, today-only sheet, widths, copy. Two MINORs
and one note in revisit.md. `p9-manual-verification.md` §4.

**Docs.** ADR-0013; traceability (7 rows); device checklist (heatmap at 200 %, VoiceOver/
TalkBack on the grid summary + text view, toggle targets, reduced motion); revisit (P9 lines
closed or re-scheduled: proportional timeline / chunk-level displacement / week horizon not
built — no Skia consumer, no week view); thesis-corrections #40–#42; explainer P9 section.

## P8 — Sync (2026-08-28, phase/P8-sync)

**Server (ADR-0012).** Migration `20260828120000_p8_sync`: `sync_ops` replay ledger (PK
`(user_id, op_id)` — a duplicate op is a no-op by constraint), `sync_replay(p_user_id, p_ops)`
(one transaction per batch, one subtransaction per op; class 1 events append-only with
ownership checks, class 2 tasks/profile `base_version` checks answering `conflict` + the server
row, class 3 plan-review statuses state-checked; outcomes `applied | duplicate | conflict |
superseded | rejected | error`), `sync_pull(cursor, limit)` (security INVOKER — RLS is the
filter — one `server_seq`-ordered stream over profiles/tasks/plans/recommendations/
calendar_events), `persist_plan()` (atomic plan + rows + supersede; the P6 compensating delete
is gone), per-user `sync_leases` with a 30 s TTL, `calendar_events.deleted_at`,
`gcal_sync_state` OAuth/channel columns (server-only), `recommendations.gcal_event_id` /
`gcal_synced_slot_start`, `profiles.eu_eea_resident`, `attribution_due` incl.
`displaced_pending`, `gcal_sweep_tick()` on pg_cron every 5 min (no-op without connected
calendars). The `updated_at` touch trigger now fires only when the writer did not set it (the
merge needs edit times). pgTAP `p8_sync_test.sql`: 83 assertions; `scripts/pgtap-linked.sh` runs
a pgTAP file + pending migrations against the linked project inside a rolled-back transaction
(no Docker on the dev Mac).

**Edge functions.** `sync-resolve`: replay → the P7 instant reward pass (`processUser`, same
module) → pull, under the lease (409 `busy`), bare polls skip the reward pass. `rewards.ts`:
a `displaced_pending` row with completion evidence becomes `completed` + `conflict_flag` and its
tuple is written **EXCLUDED** (`concurrent_external_conflict`, value kept — H3); without
evidence, once the slot cannot be resumed or at the daily job, `displaced` with **no tuple**.
Google Calendar (FR-03/UC-09): fetch-based API + OAuth client (`_shared/gcal.ts`), sync core
(`_shared/gcal_sync.ts`: token refresh, incremental sync with 410 full resync, busy import —
timed events, opaque all-day, transparent/declined/working-location never busy, cancellations as
tombstones, our own marker skipped — displacement of open FUTURE blocks only, channel renewal
< 24 h, opt-in write-back insert/patch/delete), `gcal-connect` (status / start → consent URL
with a one-shot 10-min nonce / disconnect stops-revokes-drops-wipes / set_write_back needs the
write scope), `gcal-callback` (server-side code exchange, refresh token never on the device,
initial sync, redirect to `hourwell://gcal-callback`), `gcal-webhook` (push with a constant-time
channel token check; sweep renews channels and re-syncs users not synced in 5 min). 148 Deno
tests (before: 110) incl. the File 05 §2 scenario end to end with the counterfactual branch and
a wire-vocabulary drift guard (client `OP_TYPES` ↔ wire ↔ SQL dispatch ↔ pull tables).

**Client.** `src/sync/engine.ts` replaces the P4/P6/P7 bridges (deleted): single-flight push of
≤ 200 ops of the signed-in identity → `sync-resolve` pinned to `FunctionRegion.EuWest1`
(`src/sync/invoke.ts`, every function call — ADR-0011 G4 closed) → acks (conflict → field-level
merge `merge.ts`: user-owned fields LWW by edit time, done/archived monotone, `postpone_count`
max; the entity's queued ops collapse into one rewritten op replayed in the same sync; rejected
dead-lettered at once, error after 5 attempts with a Sentry breadcrumb) → `pull.ts` (one
transaction per page; entities with unacked ops skipped; displaced placements send the task back
to the Inbox through the outbox; `conflict_flag` completions raise the File 05 §2 notice) →
cursor (MMKV, max-semantics). Triggers: foreground, 2 s after any write, `expo-network`
reconnect, 60 s poll while active, before every plan request (skipped when fresh). Local
migration `0004_p8_sync` (`calendar_events` mirror); busy rows on the Timeline; Today notices +
the deferred-wipe banner (ADR-0012 §11 — an account change with unsynced ops of the previous
account keeps its rows namespaced and asks Keep/Discard; the owner signing back in cancels it);
Settings sync section (status, last synced, queued changes, Sync now) + Google Calendar section
(connect, write-back opt-in via incremental consent, disconnect with confirm);
`app/gcal-callback.tsx`. Analytics `sync_completed`, `gcal_connection`. 336 jest (P7: 290).

**Verified live** (`docs/verification/p8-live-smoke.mjs`, 25/25 on the hosted project): push /
duplicate no-op / stale `base_version` → conflict / `persist_plan` / File 05 §2 with the
displacement injected as the webhook writes it → `completed` + `conflict_flag` + EXCLUDED tuple,
meeting and done task pulled / counterfactual → `displaced`, no tuple / lease under concurrent
syncs / `x-sb-edge-region: eu-west-1` / Google function fingerprints without credentials.
`p8-manual-verification.md`.

**Verified against Google Calendar** (2026-08-29, the owner's account, `p8-manual-verification.md`
§2.3): consent → server-side code exchange → device-bound confirm → initial sync; push delivery
within seconds; an event 20 days out arrives (adversarial #2 closed); a meeting over a planned
block → `displaced_pending` with no reward tuple; sweep with one connected calendar; default
all-day events free, Busy ones block the local day; disconnect revokes + tombstones.

**Adversarial fixes (fresh-context pass, 2026-08-28 → 29).** 3 MAJOR + 12 MINOR; all MAJORs and
eleven MINORs fixed with regression tests (`p8-manual-verification.md` §4): lease for every
reward writer + compare-and-set patches, `timeMin`-only initial calendar sync, device-bound
consent confirm, write-back cleanup, 410-only resync, status ops carrying `user_id`, and the
engine hardening — one debounced retry on `busy`, backlog drain within a sync, an error boundary
in `run()`, dead-letter refetch, `ack.version`/`server_seq` adoption. 344 jest / 155 Deno / 85
pgTAP.

**Docs.** ADR-0012; spec-conflicts L19 closed, L28–L33; thesis-corrections #38–39; revisit: five
P4–P7 lines closed, six P8 lines; privacy README G4 closed + G7 (Google as an independent
controller, production-status gate), `docs/privacy/consent-clause.md` (draft for the owner);
`docs/runbooks/google-calendar.md` (the ⛔ owner steps); device checklist: NFR-R1 full
obligation, two-device merge, background→foreground timing, Google consent on device,
deferred-wipe banner; versions.md P8 pins.

## P7.1b — SSH access model + ADR-0011 accepted (2026-08-28, phase/P7-hosting-ssh)

**SSH access model reworked (owner request: laptop, changing networks, never "locked out and
confused").** Runbook `docs/runbooks/oracle-vm.md` §0 states what is and is not address-bound:
80/443 are open to the world (edge functions, phones, CI, monitoring — nothing in the running
app depends on the owner's IP); only port 22 is locked, by **two independent lists that are both
edited from any browser**: the OCI Security List (network layer) and the instance freeform tag
`ssh-allow` (host layer — `hourwell-ssh-allow.timer` reads it from IMDS every minute and rewrites
the `HOURWELL-SSH` iptables chain; fail-safe: missing/unreadable tag ⇒ keep the current list,
never empty). `harden.sh apply <IP> [<IP>…]` takes a list and installs the chain + timer; the
separate "persist" step is gone (`rules.v4` is regenerated from a host-only template — Docker
chains are no longer persisted, a reboot hazard); GRUB shows a 3-second menu on the serial
console; `harden.sh console-password` sets a **console-only** password for `ubuntu` (sshd keeps
password auth off; root stays locked) — without it the serial console is a login prompt nobody
can pass (both accounts were locked). Owner-side `deploy/ssh-allow.sh` (`me | init | list | add |
remove | selftest`) edits both locks in one line once the OCI CLI is configured (optional;
transforms self-tested, CLI calls exercised at first use). `verify.sh` re-checks the chain, its
persistence, the timer, IMDS, the tag, the recovery path (GRUB, serial getty, console
password). Runbook §5 is the **lockout recovery ladder** written for a stressed reader: A
(address, with how to tell which lock from the ssh error), B (serial console via Cloud Shell,
click by click, out-of-band — bypasses both locks), C (GRUB `init=/bin/bash` password reset), D
(laptop gone). §0 states the trade-off: the box holds `DATABASE_URL`; an internet-open 22 is the
wrong risk; the cost is list management.

**ADR-0011 accepted (owner decisions 2026-08-28).** Population = recruited in Ukraine, EU
residents possible and not designed against; **Art. 27 representative = conditional obligation**
triggered by the first EU/EEA-resident participant (privacy README G6, enrollment checklist);
**option A** — analysis + training on the EU VM, `train.yml` on synthetic data only, registry in
Supabase Storage, aggregates only to the researcher, Art. 49(1)(a) clause in the consent form;
release = synthetic dataset + replay harness (public) + restricted-access deposit on OSF
Frankfurt; thesis-corrections #34–36 now carry the exact replacement wording (incl. the
"anonymized" over-claim); **privacy README §7 = the operator access rule for path 4** (what may /
may not be opened from the Mac once a real participant exists; RPCs for erasure/diagnosis;
access log outside the repo); PAYG stays deferred. PLAN P11 amended; spec-conflicts H5 resolved;
revisit follow-ups per phase.

**Steps 2–4 completed (2026-08-28, later).** Locks set and tag propagation proven; serial-console
login proven; `DATABASE_URL` corrected from the Direct-connection DSN (IPv6-only) to the
Transaction pooler `aws-1-eu-west-1:6543` + `sslmode=require`; stack up, certificate obtained,
`/healthz` live with `storage: postgres` on the `main` build; `verify.sh` ALL OK; `RECSYS_HOST`
variable set. **Fix:** `PostgresRepo` disables psycopg server-side prepared statements
(`prepare_threshold=None`, DB-free test) — required by the transaction pooler; `.env.example` +
runbook §6 corrected (pooler cluster is project-specific; never the Direct tab).

**Rollout + measurement 3 (2026-08-28, evening).** First real run of the rollout job: the VM
switched to the merged build ~5 min after the push (pull-based, no SSH from CI). Container bench
on the box (`p5-manual-verification.md` §2.1–2.3): day plan OPTIMAL 20/20, 135 ms p50 / 487 ms
p90 end-to-end (NFR-P1 with margin); the 50-task week stress instance is presolve-bound at
3.6·10³ literals under the Mac-fitted threshold (UNKNOWN 19/20, 2.1 s p50) → sweep
8000/4000/3000/2000/1000 → **`PRACTICAL_LITERAL_THRESHOLD` = 3 000** (ADR-0007 §11 addendum;
FEASIBLE 12/20, 1.39 s p50). Claim-level: ≈ 40 % of 50-task week runs stay UNKNOWN on every
rung on this box — thesis-corrections #37 qualifies File 04 §1.5; revisit.md (week-horizon
budget before P9). `bench_solve.py`'s environment note now reports the actual box. Re-measured
with the rolled-out image (§2.3): week FEASIBLE 13/20, 1.35 s p50 / 1.92 s p90; day unchanged.

**Steps 5–7 (2026-08-28, night) — service wired, all measurements done, P7.1 closed.** Function
secrets set (CLI token still valid, no login needed); Vault secrets created from the box; learned
path live — P6 smoke 18/18 twice, **NFR-P1 p95 1.5 s** from the Mac (`p6-manual-verification.md`
§3.1). **Bug:** `config.toml` `[functions.attribute-rewards]` had `entrypoint = plan-request`
(P7 copy-paste) — the function had never run on the hosted project and its 401s were
plan-request's; found via a throwaway env/header diagnostic + `functions download`, fixed,
redeployed. Then: daily mode 200 (24 due → 24 delivered, `delivery: ok`), cron tick → pg_net 200,
pg_cron's own runs `succeeded`, `feedback_rewards` 0 undelivered, service `recsys_applied_tuples`
= 24 (`p7-manual-verification.md` §2b correction + §2c). UC-03 A1 outage test (§2c). HANDOFF
refreshed for P8.

**Box state (2026-08-28, earlier):** deployed and applied from the owner's address; fresh-connection SSH
re-check OK; console password set (stored in `~/.hourwell/console-password`, to be copied to the
password manager); `verify.sh` — see HANDOFF for the exact remaining FAILs (app checks pending
`DATABASE_URL` + install). DuckDNS `hourwell-recsys.duckdns.org → 84.235.238.25` verified.

## P7.1 — RecSys hosting on the Oracle VM (2026-08-27, phase/P7-hosting)

**ADR-0009 accepted (option A).** The owner provisioned an Oracle Cloud Always Free Ampere A1 VM
(2 OCPU / 12 GB, Ubuntu 24.04 arm64) in France South / Marseille (`eu-marseille-1`). Decisions:
DuckDNS hostname (PSL-listed, free) + Caddy automatic HTTPS; **pull-based rollout** (CI builds on
a native arm64 runner, verifies a CP-SAT solve with the aarch64 OR-Tools wheel inside the image,
pushes to GHCR; the VM's systemd timer pulls every 5 min — no SSH from CI, no GitHub secrets,
port 22 stays owner-only); container pinned to `cpus: 2` (File 04 §1.5's box); PAYG upgrade
recommended for support access (G1); the keep-busy timer stays on — Oracle's docs state no
reclamation exemption for PAYG.

**Repo.** `services/recsys/Dockerfile` (multi-arch bases, `RECSYS_BUILD`, scripts in the image),
`/healthz` reports `build` + `arch` (api.ts regenerated), `services/recsys/deploy/` (compose,
Caddyfile, `.env.example`, `hourwell-rollout`, systemd units, `harden.sh`, `install.sh`,
`verify.sh`), `.github/workflows/deploy-recsys.yml` rewritten, `docs/runbooks/oracle-vm.md`.

**Data protection (treated as a finding, not plumbing).** `docs/privacy/README.md` rewritten:
processors table with verified instruments (Oracle DPA v14082025 incorporated by the CSA,
Supabase DPA, PostHog/Sentry EU, Let's Encrypt, DuckDNS, GHCR), the self-hosted VM section (what
personal data touches the box — transient only; credentials; patching = ours), and DPIA gaps:
G1 Oracle sub-processor list behind My Oracle Support (no support on Always Free), **G2 exports
to the researcher's machine in Ukraine are Chapter V transfers (EDPB 05/2021 Example 10)**, G3
GitHub-hosted training runners (US), G4 Edge Functions region pinning. thesis-corrections
#33–#34, revisit lines, CLAUDE.md §7 (verification depth, never model choice).

**Session 2026-08-27 (evening) — remote steps + transfer analysis.** PR #9 opened; box hardened
(`harden.sh apply` → new-session SSH re-check → `persist`; sshd key-only/no-root/`AllowUsers
ubuntu`; iptables 22 from the owner /32 only, persisted; security updates applied), `.env`
created with the backend key; `verify.sh` fixed (root-only `rules.v4` read with sudo) — all
non-app checks OK. **ADR-0011 (proposed, owner decision):** cross-border data flows path by
path (what moves, identifiability, Chapter V under EDPB 05/2021 Examples 6/10, Ukrainian law
2297-VI Art. 29), lawful bases (no adequacy for Ukraine; no Art. 46 instrument for an Art. 3(2)
importer; Art. 49(1)(a) consent; anonymous aggregates), four options + public-release options;
recommended A = in-region analysis + training on the EU VM, participant data never on CI,
aggregates only to the researcher. Privacy README G2–G6, thesis-corrections #34–36,
spec-conflicts H5. Owner decisions recorded: PAYG deferred until before enrollment (keep-busy
stays on).

## P7 — Feedback loop (2026-08-27, phase/P7-feedback-loop)

**Hosting assumption falsified (spec-conflicts H4, ADR-0009 — owner decision).** Hugging Face
withdrew free Docker Spaces in July 2026 (verified against the provider's docs); free/PRO Spaces
run in the US only. Recorded as an external change with what it invalidates (NFR-Sc1's $0
envelope, the deploy path, the "2 vCPU Space" measurement box), options evaluated (Oracle Always
Free EU, Cloud Run Tier-1 EU, Scaleway/Azure grants, Vercel Hobby, HF PRO, a Supabase-only
restructure without Python — each against NFR-S2, cost, NFR-P1, migration), recommendation
written, nothing created. `deploy-recsys.yml` suspended; the live learned-path smoke, warm NFR-P1
p95 and container timing stay on the verification backlog.

**Server (specs/07 §3.4–3.5, File 05 §1).** Migration `20260827150000_p7_feedback`: pg_net;
`duration_estimates`; `feedback_rewards.delivered_at`/`source` (tuples are stored first and
delivered to `/feedback` afterwards — a service outage delays learning, never loses it);
`attribution_due(p_now)` — the 23:55-local day boundary in SQL, pgTAP-tested across the
Europe/Kyiv fall-back and spring-forward and a second zone; `attribution_sweep_tick()` scheduled
every 15 min (pg_cron → pg_net POST with Vault-held URL/key; no-op until the owner sets them).
Edge function `attribute-rewards` (Deno): pure facts→tuples mapping in `_shared/rewards.ts`
(rows 1–9, M-02 exclusion, corrections within 7 days, idempotent by `(recommendation_id,
kind)`), instant mode (user JWT after the client pushes facts; backend key + `user_id` for P8's
`sync-resolve`), daily mode (rows 4–5 over the due slice + re-delivery of undelivered tuples),
override target context from the shared grid/φ/feature modules, the UC-06 A2 duration estimator
(EWMA α 0.3) applied by `plan-request` to both engines once n ≥ 3. 41 new Deno tests.

**Service.** Blend weights learn online: projected SGD on ½(pred − r)² per applied tuple
(lr 0.05, exact 1-simplex projection), River pinned as the CI oracle for the unprojected step
(spec-conflicts L23), rebuild replays the trajectory; `blend_state` persisted in the same
transaction; rung-2 constants + `is_personal`/`learning_mode` helpers (§3.6). 135 pytest, 92 %
coverage.

**Client.** Focus tab (FR-30: start/pause/resume/finish/stop with duration telemetry; the
session row survives restarts; FR-31 inline 1-tap energy rating + optional difficulty, never
modal); Today block actions (Start → Focus, Done, Skip — never red, Move… start-time picker on
the 15-min grid, "I did it" on a lapsed block), neutral status captions (no guilt UI), lazy lapse
scan on open/foreground (DST-safe by construction), UC-04 A2 third-consecutive-skip diagnostic
(too big → splittable; wrong time → logged; not important → archived; "ask me later"), facts
bridge (`src/sync/factsPush.ts`: events through RLS with `ignoreDuplicates`, then
`attribute-rewards` instant, server statuses mirrored back). Local migration
`0003_p7_feedback` (`focus_sessions`, local-only `tasks.skip_streak`). Every fact payload is
categorical/numeric (NFR-S3, tested). Expo SDK 57 patch alignment (`expo install --fix`).

**Adversarial pass (fresh context).** 7 MAJOR + 14 MINOR; all MAJORs fixed before merge: late
facts after the daily job now upgrade a stored lapse/off-slot/partial as a correction; row 3 waits
until the slot cannot be resumed; the latest move always re-places the row (pair once) and
composes with a session in the same batch; bucket-less targets still move; patches are gated
against the stored tuple (daily/instant race); `recommendation_status` ops are pushed and facts
go up before a re-plan. Plus: total tuple order, device zone on every fact (`timezone_mismatch`
exclusion), midnight-safe `local_day` + `slot_end + grace` guard (migration
`20260827170000_p7_attribution_guards`, timezone validation), stale-session auto-abandon,
sessions by task in the lapse scan, unified diagnostic rule, past-proof Move picker. Details:
`docs/verification/p7-manual-verification.md` §4.

**Docs.** ADR-0009 (hosting, proposed), ADR-0010 (P7 decisions), spec-conflicts H4, M10,
L23–L27, thesis-corrections #26–#32, revisit (5 lines), device-checklist "Feedback loop (P7)",
explainer, traceability, `docs/verification/p7-manual-verification.md`.

## P6 — Plan E2E (2026-08-26, phase/P6-plan-e2e)

**Edge function** `plan-request` **(specs/07 §5, UC-03, NFR-R2).** Deno function under
`supabase/functions/plan-request/`: in-function JWT verification (`auth.getClaims`, asymmetric
keys; `verify_jwt = false` at the gateway), context assembled through the USER-scoped client (profile
hours, open tasks, busy calendar events — may be empty, previous plan for AddHint, client-pinned
blocks → `pinned_start`, current study arm, the user's beta_cells), rate limit 30 per rolling 24 h,
`empty_inbox` without a plan row. Arm A never calls the service; otherwise `/plan` under the
1.9 s fallback budget (Appendix A) and, on timeout / network / HTTP / invalid response / missing
secrets, the same heuristic answers tagged `engine = heuristic` with `telemetry.ef.reason = fallback:<kind>` plus a fire-and-forget `/healthz` wake probe. Persists every assignment field
(M-01 `propensity` included) with the service role, puts `A_m(x)3`, drops, degradation, tick size and seed in `plans.telemetry`, and supersedes still-`shown` rows of earlier plans for the date
(`expired`). Migrations `20260827120000_p6_plan_request` (rate-limit index, telemetry key
contract) and `20260827130000_p6_propensity_double` (M-01 `propensity` → double precision: 1/3 does
not round-trip in float4 — found by the live smoke; spec-conflicts L22); pgTAP
`p6_plan_request_test.sql`; new CI `edge` job (deno fmt/lint/check/test, 50 tests).

**Arm A — "heuristic + matched randomization" (spec-conflicts H1; ADR-0008 §2).** TypeScript
mirrors of the service's grid, F_τ, φ (|C| = 14, fatigue rule), 17-feature snapshot, Beta posterior
and ε-draw (`supabase/functions/_shared/`), pinned to the Python side by a generated parity fixture
(`scripts/gen_grid_parity.py`; both suites assert it) and a params pin across the boundary. The
scheduler: pinned first → the matched ε-draw with the heuristic's own ranking (earliest reachable
bucket) → critical tasks by EDF → the rest by priority tier / deadline / duration at the earliest
free start, greedy chunking for splittable tasks; `q_hat`/`confidence` NULL; rationale subset;
`model_version = heuristic-p6.0`.

**Experiment eligibility (owner decision 2026-08-26; ADR-0008 §1).** Service and EF: a task needs
≥ 2 reachable buckets (was ≥ m = 4); the bucket is uniform over the top-min(m, |A(x)|) set and the
logged propensity is the exact per-row `ε/|A_m(x)|` (1/2, 1/3, 1/4). Measured with
`scripts/experiment_rate.py`: P(plan has an eligible task) 0.57 → 0.86 at three tasks/day on a plain
09–18 weekday, 0.00 → 0.22–0.48 on a four-meeting day; ≈ 4.3 experiments per user-week on plain
weeks — recorded for the OSF power recomputation (thesis-corrections #21).

**Client (FR-20/21/22, NFR-P1, NFR-O1).** Local `plans` mirror (drizzle migration `0002_p6_plans`);
`applyPlanResponse` mirrors a plan in one transaction (rows, expirations, task status
placed ⇒ `scheduled` / unplaced ⇒ `inbox` through the outbox, one `recommendation_shown` event per
block with model version, engine, experiment flag and propensity); task-push bridge before every
request (P8-lite, last-write-wins); lazy UC-03 triggers (first open / foreground on a plan day,
06:00 boundary — invariant 7); Today screen with a row-list timeline, time gutter, "Now" marker,
glass blocks (confidence = solidity; NULL confidence renders at a constant 0.7 without an a11y
percentage), FR-21 sentences from the closed vocabulary, "Experiment" tag, optimistic planning banner,
NFR-R2 notice only for fallback plans (never arm A), deferred-task line, manual re-plan, calm
rate-limit/error notices; `plan_requested` analytics event with the client-measured round trip.

**Docs.** ADR-0008; spec-conflicts M9, L17–L21; thesis-corrections #17 rewritten as the empirical
presolve finding, #21–#25 added; revisit.md (eligibility entry closed; 4 new); versions.md (Deno
2.9.5, supabase-js 2.112.4 in Deno, @std/assert 1.0.19); explainer updated; device checklist P6
entries; `docs/verification/p6-manual-verification.md` + `p6-live-smoke.mjs`.

## P5 — RecSys service (2026-08-26, phase/P5-recsys)

**Service (File 04 §1, specs/07 §5).** FastAPI 0.141 on Python 3.12: `POST /plan`, `POST /feedback`,
`GET /insights`, `POST /parse-preview`, `GET /healthz`; user JWTs verified against the project JWKS
(ES256, `aud = authenticated`, `sub` must equal `user_id`), `X-Service-Key` for the edge functions;
strict Pydantic schemas (`extra = forbid`) whose OpenAPI document generates
`packages/shared/src/api.ts` (openapi-typescript 7.13, new CI `api-contract` job). Per-user state
lives only in Postgres through the pooler (`PostgresRepo`, psycopg 3 pool); an in-memory repo backs
tests and local runs. Dockerfile + HF Spaces README + `deploy-recsys.yml` ready for the Space (⛔).

**Planning pipeline.** DST-safe tick grid (92/100-tick days handled; empty busy set valid —
decision 5); F_τ exactly as File 04 §1.2 writes it (buffer inside W, may pass the deadline, L2);
φ with |C| = 14 and the 90-min/15-min fatigue rule; x_{τ,c} d = 17 in the §3.2.4 order; Beta cells
with 28-day decay on evidence only; LinUCB/TS linear-Gaussian state (Sherman–Morrison, one TS draw
per category per plan, LinUCB arm deterministic); convex blend (w_B = 1 recovers File 04). CP-SAT:
optional intervals + `AddNoOverlap`, pinned tasks, splittable chunk chains with duration-proportional
weights (ADR-0007 §3), criticality-only deferral, urgency g(u), soft run-length (deep) and
fragmentation penalties, `AddHint` warm start with a 1e-4 stability unit (CP-SAT hints do not keep
ties — spec-conflicts M7), 1.5 s anytime cap as a plan-level budget, degradation ladder
30-min → day-by-day with telemetry. FR-24 trade-off options (drop/shrink/move/unpin) ranked by
utility loss when a critical task cannot be honoured.

**Propensity exactness (M-01, M2).** One Bernoulli(ε) experiment per plan: eligible task drawn
uniformly (non-critical, unpinned, ≤ 2 h, ≥ m feasible buckets), bucket drawn uniformly from its
top-m, pinned into the solve unsplit; `propensity = ε/m` is a pure function of settings, tested for
value (0.25), uniformity (χ²), eligibility, and that no non-slice row ever carries a propensity;
requests whose ε/m differ from the constants are rejected (422).

**Reward paths (H3).** `/feedback`: `excluded = true` → counted, never touches state (spy-tested);
lapse → r = 0.0 applied; external displacement → not representable (`reason` has no such value,
422); `(recommendation_id, kind)` id-set makes re-delivery a no-op (`recsys_applied_tuples`,
migration + pgTAP); `correction = true` → full rebuild A = I + Σxxᵀ, b = Σrx and Beta recount with
decay as of each tuple (never a downdate), tested ≡ from-scratch.

**Measured, honestly.** Week instances (50 tasks) were presolve-bound UNKNOWN 20/20 under the
spec's literal-count trigger; after probing/symmetry presolve off, a practical 8·10³ threshold and
UNKNOWN escalation: day OPTIMAL 20/20 (solve p50 70 ms), week FEASIBLE 20/20 (solve p50 1.0 s,
end-to-end p90 1.95 s) — on an M-series Mac, not the 2 vCPU Space (spec-conflicts M8; checklist).
MABWiser 2.7.4 is the CI oracle: LinUCB expectations match to 1e-6, LinTS moments match.

**Adversarial pass.** 2 MAJOR (top-m ranking over chunk-only buckets silently dropped
experiments → biased slice propensity; an excluded correction never triggered the rebuild) +
11 MINOR, all fixed with regression tests (`docs/verification/p5-manual-verification.md` §6);
`Assignment.experiment_top_m` added for File 04 §2.2 replay.

**Tracking.** ADR-0007 (+§15 amendments); spec-conflicts M7, M8, L14–L16; thesis-corrections 4 items; revisit 3
entries; device-checklist "Service environment" section; CLAUDE.md invariant 16 (never run
package-manager commands from the root).

## P4 — Onboarding (2026-08-26, phase/P4-onboarding)

**Cold start (File 04 §3, the first thesis-reported numbers).** `instantiate_user_priors`
copies prior_cells v0 (the day-zero bootstrap — version 0 of an empirical-Bayes-refreshed
object, File 04 §3.5) into per-user `beta_cells` with the per-user n₀ multipliers: ×0.5
outside declared working hours (spec-conflicts M5, fixed as ≥50%-overlap + strict-majority in
ADR-0005) and ×0.5 on survey skip (= the UC-01 A1 wider-exploration mechanism, L8). Seed
cluster = rMEQ class (DM..DE → 0..4). Fires by trigger when `onboarding_completed_at` first
lands; EXECUTE revoked from clients (invariant 1); `ON CONFLICT DO NOTHING` (invariant 5).
rMEQ→class cutoffs are enforced twice: `classFromScore` on the client and a `profiles` CHECK
in the schema. Tests assert spec values, not implementation output: pgTAP checks all 240
prior cells against an independently generated fixture (`scripts/gen-prior-cells-expected.mjs`)
plus hand-computed α₀/β₀ for in/out/skip/weekend/majority/50%-boundary cases; jest checks all
10 class boundaries. A live smoke (`docs/verification/p4-live-smoke.mjs`) verified the whole
path 9/9 on the hosted EU project.

**Auth (FR-01).** Env-gated supabase-js v2 (PKCE, processLock, AppState auto-refresh);
sessions in the official LargeSecureStore pattern (AES key in expo-secure-store, ciphertext
in MMKV — ADR-0006). Anonymous trial auto-created on first launch, convertible via
`updateUser` (uid retained); magic-link sign-in with a deep-link callback route handling both
?code= and #token forms; Google OAuth code-complete but inert behind the ⛔ consent-screen
gate. The P3 binding contracts are implemented and tested: first sign-in rewrites every local
row and outbox payload (adopt); a different uid wipes the mirror and resets the pull cursor.
`enable_anonymous_sign_ins` + deep-link redirect allow-list pushed via `supabase config push`;
magic-link email rate set deliberately to 1/min.

**Onboarding (FR-02, UC-01).** Welcome → 5-item rMEQ survey (published instrument structure,
per-item skip by deselect; any blank item = unscored survey → INT at half prior strength — no
prorating exists for the instrument, ADR-0005) → working hours + sleep window steppers
(defaults Mon–Fri 09:00–18:00, 23:00–07:00; screen-reader operable) → top categories → seed
tasks via the P3 quick-add. Completion persists the profile locally through the outbox, then
a P4-only bridge push upserts it so the server trigger instantiates priors (P8 replaces the
bridge with sync-resolve replay). Tab shell gates on a completed profile (no onboarding flash:
synchronous first-render read). Funnel analytics carry steps and enums only — never answers,
scores as text, or emails.

**Docs/process.** Simulator-evidence rule (owner directive 2026-08-26): simulator runs are
smoke checks; device-conditioned requirements flip ✅ only at the owner-run hardware pass
before P12 — running list seeded in `docs/verification/device-checklist.md`; PLAN row 11.

Updated at each phase gate. Lines end with the requirement IDs they serve.

## P3 — Tasks (2026-08-26, phase/P3-tasks)



### Added

- Single write surface for the local mirror (`src/db/writes.ts` + `src/db/tasks.ts`): every
mutation is ONE SQLite transaction carrying the row change, its outbox op (server-shaped
snake_case payload, client-monotonic op_id, base_version), and — on create — the append-only
`task_created` event; soft-delete tombstones with idempotent first-class restore. — FR-10,
NFR-R1 (local half), invariants 2/8
- Task CRUD with all FR-10 fields: full task sheet (`app/task/new.tsx`, `app/task/[id].tsx`)
over a validated draft layer. — FR-10, UC-02
- chrono-node NL quick-add with preview and disambiguation chips: chrono owns dates, a local
duration grammar runs first (chrono reads a bare "2h" as a relative clock time, which would
turn every estimate into a deadline); every recognized ambiguity — bare weekday, am/pm-less
clock time, multiple dates, multiple durations — renders as chips, never a silent guess. —
FR-11, UC-02
- FlashList v2 Inbox reading the mirror through a direct change-listener hook
(`src/db/useLiveRows.ts`); deletes undoable for 6 s via a snackbar restore. — FR-10,
invariant 14
- Env-gated PostHog analytics beside Sentry: EU host read from env and never hardcoded — a key
without a host stays OFF rather than falling back to the US cloud; GeoIP, autocapture and
session replay disabled; typed event catalog makes the model-version tag structurally
required on recommendation events. — NFR-O1, NFR-S2
- Pre-auth local identity (`src/sync/localUser.ts`): device-derived placeholder owner for
offline rows, with a binding rewrite contract for P4 sign-in; nothing pushes before P8. —
FR-01 groundwork, NFR-R1



### Fixed

- Three Inbox interaction bugs from the on-device UC-02 walk: first tap after quick-add only
dismissed the keyboard (keyboardShouldPersistTaps), the undo bar rendered under the open
keyboard leaving a destructive action with no reachable undo, and restore ran inside a
setState updater (React may re-run updaters → replayed op). — FR-10, FR-11, invariant 14
- Tab-shell header title scaled unbounded at accessibility-XXXL and clipped; header chrome is
now pinned at 1× while content scales to the 200% cap. Closed both P2 carry-overs: NFR-P2
cold start p90 = 1075 ms on HEAD (≤2000 ms target) and the NFR-A2 sweep 27/27 ×2 (Maestro
flow committed). — NFR-A2, NFR-P2
- (fresh-context adversarial pass — 3 MAJOR) "at 2" was silently guessed as 2 AM tomorrow with
the clock time hidden by the day-only preview — meridiem-less hours 1–11 now surface am/pm
chips and the preview shows the time; consecutive deletes truncated each other's 6 s undo
window (single snackbar timer) — now one timer per deleted row, Undo restores all still
undoable; earliestStart > deadline passed form validation and the DAO throw was uncaught in
onPress (reachable release crash) — the cross-field rule is enforced in the form. — FR-11,
UC-02 A1, FR-10, invariant 14
- (adversarial pass, minor) Inbox row a11y label now carries the deadline; undo bar announced
to iOS VoiceOver; radio chips use accessibilityState.checked; analytics engine tag aligned
to the schema vocabulary ('learned', not 'bandit'); "0m" no longer becomes a deadline of
now; dangling connectors stripped from titles; write-path atomicity proven by a forced
mid-transaction failure test; P4 account-binding contract names the outbox payload rewrite.
— NFR-A1, NFR-O1, NFR-R1, FR-11



## P2 — Mobile shell (2026-08-24, phase/P2-mobile-shell)



### Added

- Expo Router tab shell (Today · Inbox · Focus · Insights + Settings modal) on the
expo-router/entry entry point; typed routes; scheme `hourwell`; smoke tests include a real
router mount. — File 02 §3.5, NFR-A1
- File 02 §3 design tokens, byte-exact: light/dark palette (WCAG AA proven by test for the
text/surface/glass/primary-container pairings, incl. the composited confidence floor), Inter + JetBrains Mono type scale, 16–20 px radii, ≤250 ms springs with
reduced-motion collapse, 8–12 px glass band. — NFR-A1, NFR-A2
- Confidence-as-solidity primitives: ConfidenceBlock (panel-background solidity ∝
confidence, dashed "Experiment" treatment, composed screen-reader label), GlassPanel (iOS
blur, opaque Android/Reduce-Transparency fallback, recommendation-layer only). — FR-22
groundwork, NFR-A1
- Local Drizzle/SQLite schema mirroring specs/07 §4 for tasks, recommendations (incl. M-01
propensity + M-02 conflict_flag/displacement statuses), append-only events; op outbox with
unique client-monotonic op ids and base_version; startup migrations with a visible failure
state. — NFR-R1, M-01, M-02, invariants 1/8
- MMKV scaffold: never-rewind pull cursor (max server_seq seen), install-scoped device id,
monotonic op counter, appearance flag. — NFR-R1
- i18n scaffolding: typed English catalog + expo-localization resolution + ESLint ban on raw
JSX text in components (decision 6). — NFR-A1
- Sentry crash reporting, env-gated (disabled without EXPO_PUBLIC_SENTRY_DSN — tested),
sendDefaultPii off, tracing off; EU org creation is the open ACTION-REQUIRED item. —
NFR-O1, NFR-S2
- Startup instrumentation (js-start → first-frame) + on-device cold-start measurement
protocol. — NFR-P2



### Fixed

- (fresh-context adversarial pass) Confidence-as-solidity faded block copy below WCAG AA at
the exploration floor — solidity now scales only the panel chrome; composited-floor
contrast test added; iOS Reduce Transparency honored; a11y label composes block content. —
NFR-A1, FR-22
- Splash screen could never hide on a font-load failure; the shell now opens on the system
fallback stack and the whole splash/migration flow is under test. — NFR-P2, File 02 §3.3
- i18n lint guard missed string/template-literal JSX children (probe-verified fixed);
standing UI review checklist added for what linting cannot see. — decision 6



### Changed

- @sentry/react-native pinned to the SDK-57-validated 7.11.0 line (expo-doctor rejects 8.x);
react-native-mmkv held at 3.3.3 (4.x needs the Nitro runtime). — NFR-M1
- Inter Variable → static Inter instances (RN has no variable-axis text API); recorded as
spec-conflicts L12. — File 02 §3.3



## P1 — Data layer (2026-08-24, phase/P1-data-layer)



### Added

- Base Postgres schema (16 tables) with RLS on every table, grants trimmed to the specs/07
§4.4 catalog, append-only events, sync cursor sequence, version/updated_at triggers, and a
client status-whitelist guard on recommendations — applied to the linked EU (Ireland)
project. — NFR-S1, NFR-S2, NFR-R1, FR-42
- Migrations M-01 (`recommendations.propensity`) and M-02 (displaced statuses +
`conflict_flag`), layered on the base as the specs require. — M-01, M-02
- `prior_cells` v0 seeded computationally from the File 04 §3.2–3.3 tables (logit-affine
transform, AF bonus, weekend blend); remote spot-checks match hand-computed values. — FR-02
- Generated `Database` types committed to `packages/shared`; CI regenerates from a local
stack and fails on drift (contract sync). — File 03 §6
- pgTAP suite: RLS bypass denial, append-only enforcement, duplicate op_id rejection,
status-guard, M-01/M-02 shape, prior seed values; new CI `db` job. — NFR-S1, NFR-R1, NFR-M1
- MIT LICENSE; privacy evidence file (Supabase eu-west-1 verified; PostHog EU requirement
pinned before any SDK wiring). — NFR-S2
- Appendix A parameter constants in all three services with spec-value tests. — NFR-M1
- Spec-integrity audit (spec-conflicts.md), thesis-corrections worklist, Ukrainian explainer
(pojasnennia.uk.md). — process



### Fixed

- TypeScript 6.0 → 5.9.3: openapi-typescript peers `^5.x`; restores File 03's stated TS 5.x
line (ADR-0004). — NFR-M1



### Changed

- Study arm A redefined as **"heuristic + matched randomization"** (owner-approved H1 fix):
the ε-randomized slot runs in both arms with identical rendering, preserving the blind and
giving baseline traffic exact propensities. — FR-22, File 06 §1.1



## P0 — Bootstrap (2026-08-24, phase/P0-bootstrap)



### Added

- pnpm + Node 24 LTS monorepo: `apps/mobile` (Expo SDK 57, RN 0.86 New Arch, TS 6 strict),
`packages/shared` (reserved for generated types), `services/recsys` + `training`
(Python 3.12, uv, ruff, mypy, pytest). — NFR-M1
- Expo app shell carrying the Hourwell identity (`com.hourwell.app`). — naming decision
- CI pipeline running typecheck, lint, format, tests, expo-doctor, ruff, mypy, pytest on
every PR. — NFR-M1
- Seed domain modules with math tests: tick grid (specs/04 §1.2), daypart table (specs/04
§3.2), ESS with the <100 non-evidence floor (specs/04 §2.3).
- Project docs: PLAN, CLAUDE.md invariants, naming map, pinned versions, traceability
skeleton, ADRs 0001–0003.
- `specs/07_engine_internals_and_schema.md` — reconstruction of the superseded v1.0 content
(base schema, engine stages, reward shaping, feedback, cold-start rungs, API schemas,
security specifics); awaiting owner approval before P1.



### Fixed

- (none — first phase)



### Changed

- (none — first phase)

