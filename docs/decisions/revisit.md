# Revisit — non-blocking findings against settled decisions

One line each, appended when concrete evidence (a bug, a spec contradiction, a measurement that
doesn't hold) casts doubt on a decided question but does not block the current phase. Batched for
owner review; surfaced in the phase report that adds them. Blocking findings never land here —
they stop the phase. (CLAUDE.md "Context efficiency" rule 5.)

Format: `- [Pn, YYYY-MM-DD] <decision touched> — <evidence> — <suggested action>`

- [P4, 2026-08-26] cursor contract (wipe on account change) — the sign-in screen now confirms
  before a potentially different-account magic link is SENT, but the deep-link/OAuth arrival
  path still applies the wipe without confirmation (the session is already established when the
  transition runs). Pre-P8 blast radius = the previous account's unsynced tasks. — P8: hold the
  wipe behind a deferred-transition confirm when unacked ops exist. — **DONE P8** (ADR-0012
  §11: deferred wipe, Today banner Keep/Discard, owner sign-back-in cancels).
- [P4, 2026-08-26] ADR-0005 §6 (instantiate from max prior_cells version) — fine while only v0
  exists; once P11's empirical-Bayes refresh lands, "highest version" should probably become
  "highest PROMOTED version" via model_registry. — **DONE P11** (ADR-0015 §7; migration
  20260831: promoted-version join with fallback; pgTAP proves an unpromoted refresh is inert).
- [P5, 2026-08-26] Appendix A λ_f = 0.5 (fragmentation penalty) — equals the whole weight of a
  v = 1, q̂ = 0.5 task, so such tasks are deferred rather than split (spec-conflicts L15). — P7:
  retune λ_f against observed q̂ scales (e.g. proportional to v·q̂) with an ADR.
- [P5, 2026-08-26] File 04 §1.5 "4·10⁴ literals" trigger — measured presolve-bound UNKNOWN at
  ~10⁴ on the P5 model (spec-conflicts M8); the service uses a practical 8·10³ threshold plus
  UNKNOWN escalation. — P6/P12: re-measure on the 2 vCPU Space and fix the threshold by ADR.
  — **DONE P7.1** (re-fitted 3·10³ on the deployment box, ADR-0007 §11 addendum; corrections
  #37); closed.
- [P5, 2026-08-26] PostgresRepo connects as the pooler's `postgres` role (RLS-bypassing). Fine
  for a trusted backend, but least privilege wants a dedicated `recsys_service` role limited to
  model-state tables. — P12 runbook: create the role + grants, rotate the DSN. — **DONE P12**
  (migration `20260831150000_p12_recsys_role.sql` + pgTAP `p12_role_test.sql` + compose
  fallback override; runbook §18); ⛔ owner: push, role password, `RECSYS_DATABASE_URL`.
- [P5, 2026-08-26] ADR-0007 §5 eligibility "≥ m feasible buckets" — on a plain 09–18 weekday
  without busy blocks only tasks ≤ 45 min have four reachable buckets (EV.wd holds ≤ 3 ticks +
  buffer), so the "1 slot/day" default often yields no experiment: an RQ4 data-rate risk
  (adversarial NOTE). — Owner call before OSF freeze: keep p = ε/m with the strict rule, or allow
  |A_m(x)| ∈ {2, 3} with the exact per-row p = ε/|A_m(x)| (still uniform within the slice; File
  04 §2.2 replay restricted to A_m(x) works per row; `experiment_top_m` is now logged for it).
  — **DECIDED 2026-08-26 (owner):** |A_m(x)| ∈ {2, 3, 4}, p = ε/|A_m(x)| — ADR-0008 §1; rate
  measured and recorded (thesis-corrections #21); closed.
- [P5, 2026-08-26] Slice selection — every INFEASIBLE-after-pin drop and every UNKNOWN rung is a
  selection on the randomized slice; `experiment_dropped`/`degradation`/`tick_minutes` live only
  in /plan telemetry. — P6: persist plan telemetry per recommendation row; P11: report drop rate.
  — **DONE P6:** persisted in `plans.telemetry.ef` (one experiment per plan). — **DONE P11:**
  the nightly report emits `experiment_drop_rate_by_arm` (min cell 5).
- [P6, 2026-08-26] Appendix A "/plan EF fallback budget 1.9 s" — calibrated for the DAY horizon
  (P5 day p90 170 ms on a Mac); the week horizon takes 1.5–2 s in the service (M8) and would
  fall back most of the time. — P9/P10: if a week view is built, add an async plan path or a
  horizon-specific budget by ADR; re-measure on the 2 vCPU Space first. — **P9: no week view
  was built** (the trust surfaces render the model, not a week plan); stays open for P10/P12.
  — **P10: no week view either** (notifications and privacy); P12. — **P12: closed for v1** —
  no week view ships (PLAN §3 defers FR-27/weekly UI); the budget decision travels with the
  feature; the capacity limit is recorded for the thesis (corrections #37).
- [P6, 2026-08-26] Task-push bridge (`apps/mobile/src/sync/taskPush.ts`) is last-write-wins by
  design (ADR-0008 §5). — P8: replace with op replay (base_version checks) and delete the bridge.
  — **DONE P8** (bridges deleted; `sync_replay()` + `src/sync/engine.ts`).
- [P6, 2026-08-26] Timeline as a row list (ADR-0008 §7) — reads fine but loses the "shape of
  the day" a proportional canvas gives. — P9 (Skia work): evaluate a proportional timeline that
  still passes the 200 % font-scale and screen-reader checks. — **P9: not built.** The heatmap
  (the phase's only canvas candidate) went to native Views for per-cell font scaling and a
  one-element screen-reader summary (ADR-0013 §5), so Skia still has no consumer; re-evaluate
  in P12 with the focus ring, or drop the proportional timeline as a product-only nicety.
  — **P12: dropped for v1** (owner-visible): Skia gained no consumer through P11 (heatmap =
  native Views, ADR-0013 §5); the row list passes NFR-A1/A2 and ships; a proportional canvas
  stays product roadmap.
- [P6, 2026-08-26] `NULL_CONFIDENCE_RENDER = 0.7` — chosen to match day-0 learned confidence
  under the flat prior; once real confidence distributions exist, arm-A blocks may look
  systematically different (a residual blinding cue). — P9/P11: compare rendered solidity
  distributions across arms; consider rendering learned rows in a compressed band. — P9: the
  Insights beliefs render solidity from the belief's own confidence (both arms see the same
  model document — the tab is not arm-specific), so no new cue; the Today comparison stays —
  **re-dated 2026-08-31**: needs real per-arm rendering data; run at the first-real-data review
  (pre-OSF-freeze), not in P11 (no participants exist).
- [P6, 2026-08-26] `persist.ts` writes plans + recommendations + supersede as three PostgREST
  calls with a compensating delete (ADR-0008 §4). — P8 (sync-resolve needs transactional writes
  anyway): one `security definer` RPC, service-role only, for plan persistence. — **DONE P8**
  (`persist_plan()`; pgTAP proves atomicity).
- [P6, 2026-08-26] Drop rates on the randomized slice differ by arm by construction (the EF drops
  only on pinned occupancy; the service on any INFEASIBLE). — **DONE P11:** the report groups
  the drop rate per arm; slice rows carry `arm` in context so every estimator conditions on it
  (the File 06 analysis filters; `ope.py` policies see the arm).
- [P7, 2026-08-27] Appendix A λ_f = 0.5 retune (the P5 line above, scheduled "P7") — no live
  feedback exists yet (the service host is the open ADR-0009 decision), so there are no observed
  q̂ scales to retune against; retuning on synthetic data would be invention. — **re-dated
  2026-08-31 (P11 has no participants):** first-real-data review, pre-OSF-freeze; keep 0.5.
- [P7, 2026-08-27] ADR-0010 §6 one override pair per placement — a user who moves a block twice
  teaches only the first move; the second is logged but unrewarded. — P9/P11: decide whether a
  second move should replace the pair (correction semantics) once override frequency is known.
  — P9: unchanged (no override data yet). — **re-dated 2026-08-31:** first-real-data review
  (P11 has no participants).
- [P7, 2026-08-27] ADR-0010 §9 duration multiplier applied to est_minutes for both engines — this
  changes the task's feature 11 (log duration) and its feasibility, i.e. the planner's inputs
  drift with learning even for arm A. Symmetric by design, but the pre-registration should say
  so. — OSF freeze: add one sentence. — **P11:** the nightly report counts scaling-active
  users (`duration_estimates.n >= 3`); the per-arm split runs in the File 06 analysis where
  arm-days are known.
- [P7, 2026-08-27] `attribution_sweep_tick()` posts to the function with the backend key from
  Vault; a leaked Vault read (postgres role) equals a leaked service key. — P12 runbook: rotate
  `HOURWELL_SERVICE_KEY` when the service host is set up; consider a cron-only key. — **P12:**
  rotation is runbook §11, triage §16; a cron-only key NOT added — it doubles the rotation
  surface for zero blast-radius gain (a Vault reader holds the postgres role anyway);
  revisit only on an actual leak.
- [P7, 2026-08-27] Expo SDK 57 patch drift (expo 57.0.16→.17, RN 0.86.2→.3, jest-expo 57.0.4→.5,
  @expo/metro-runtime pinned directly) applied via `expo install --fix` to keep expo-doctor green;
  jest-expo 57.0.5 tightened the `jest.mock` factory scope rule (mock objects must be
  `mock`-prefixed or lazily referenced). — device pass: nothing; P12: re-verify versions.md.
  — **DONE P12** (versions.md P12 section: drift to expo 57.0.18/RN 0.86.3 recorded; eas-cli
  pinned).
- [P7, 2026-08-27] `gatePatches` (adversarial #6) closes the daily/instant race by re-reading the
  stored tuple before patching; a per-user `pg_advisory_xact_lock` RPC around map+write would be
  the stronger answer. — P8: when sync-resolve shares the path, move map+write into one RPC.
  — **DONE P8, differently** (ADR-0012 §7): a per-user lease (`sync_leases`, TTL 30 s)
  serialises sync-resolve; the mapping stays in TypeScript (no plpgsql fork). Open: the daily
  sweep does not take the lease — `gatePatches` remains its guard (see the P8 line below).
- [P7.1, 2026-08-27] File 06 §5 archive + P11 training on GitHub-hosted runners — EDPB 05/2021
  Example 10 makes exports from EU processors to the controller in Ukraine (and to US runners) a
  Chapter V transfer; the specs assume none. — **Decided 2026-08-28: ADR-0011 accepted, option
  A.** Open follow-ups: P8 — region pin on `functions.invoke` + consent clause + "EU/EEA
  resident?" in enrollment; P10 — local notifications only; P11 — `training/` container on the
  VM (check arm64 wheels for `implicit`/`scikit-learn`), `train.yml` on synthetic data, registry
  in Supabase Storage, `erase_user`/`diagnose_user` RPCs (privacy README §7); OSF freeze —
  synthetic dataset + restricted deposit (Frankfurt). `docs/privacy/README.md` G2–G6, §7.
- [P7.1, 2026-08-27] Oracle sub-processor list is My-Oracle-Support-only and Always Free
  tenancies have no support access (privacy README G1). — **Owner 2026-08-27: PAYG deferred**
  (no reclamation exemption; keep-busy stays on); revisit before participant enrollment, when
  support access may matter. Residual gap recorded in the DPIA until then.
- [P8, 2026-08-29] Google Cloud consent screen created in **Testing** status (enough for the
  owner's verification; refresh tokens expire after 7 days). — **Pre-enrollment, with the PAYG
  revisit above:** switch to **In production** before any participant connects a calendar
  (runbook `google-calendar.md` §4; unverified production shows a warning page, capped at 100
  users, enough for the study).
- [P7.1, 2026-08-28] Week-horizon capacity on the deployment box: 50-task/7-day plans end
  UNKNOWN in ≈ 40 % of runs on every rung under the spec-fixed 1.5 s plan-level budget
  (`p5-manual-verification.md` §2.2). — **P9 (weekly plan UI), owner-visible:** a longer budget
  for week horizons (seven day-plans' worth?), fewer candidate starts per task, or an explicit
  partial-plan contract. Threshold itself re-fitted to 3·10³ (ADR-0007 §11 addendum).
- [P8, 2026-08-28] ADR-0012 §7 lease — `sync-resolve` takes it, the daily `attribute-rewards`
  sweep does not (it iterates users from `attribution_due`); the P7 `gatePatches` re-read is the
  only guard between a sweep and a concurrent sync of the same user. — **DONE 2026-08-29**
  (adversarial #1): the sweep skips leased users; every patch is a compare-and-set on the status
  read. Residual: a writer that waits > 3 s for the lease proceeds without it (logged) — the
  `server_seq` commit-order hole (adversarial #14) is then closed only by the CAS, not by
  ordering. P12: measure lease wait times; consider a lagged re-scan in `sync_pull`. — **re-dated P12 →
  first-real-data review:** wait times need real concurrent traffic (no participants exist).
- [P8, 2026-08-28] Write-back events stay in the user's Google Calendar after `disconnect`
  (the token is revoked before they could be deleted). — **DONE 2026-08-29** (adversarial #11:
  `clearWriteBack` before the revoke and on write-back off).
- [P8, 2026-08-28] `mapGoogleEvent` assumes Google returns `transparency: transparent` for
  default all-day events (its UI default "Free"); if not, a birthday would block a whole day. —
  Verify on the first live calendar (runbook §3); fall back to "all-day never busy" if wrong.
- [P8, 2026-08-28] `sync_ops` has no retention (idempotency window = forever). Volume is tens
  of rows per user-day. — P12 runbook: prune ledger rows older than 90 days if the table ever
  matters; `events` keeps its own UNIQUE regardless. — **DONE P12** (runbook §16: documented
  prune statement; deliberately no scheduled job — study volume is a non-issue).
- [P8, 2026-08-28] A cancelled meeting never un-displaces a block (File 05 §2 says the
  replacement comes with the next plan). Fine for the study; a product would revert
  `displaced_pending` → previous status when the overlap disappears before the slot. — P9 UI
  review.
- [P8, 2026-08-28] UC-09 "≤ 5 min" is the server-side bound; the client's 60 s foreground poll
  is the device half. — P10 notifications: a displacement could push a local notification
  ("a meeting took 14:00 — Slides is back in your Inbox") without any background sync.
  — **Closed P10 (ADR-0014 §6): not built** — the device learns of a displacement only at its
  next foreground, when the Today notice is the right surface; a push would need a relay
  (ADR-0011). UC-09's "replacement suggestion notification" is the next block reminder.
- [P8, 2026-08-29] Engine hardening left open by the adversarial pass (#5–#8, #13): retry on
  `busy`, drain a > 200-op backlog within one sync, an error boundary in `run()`, re-fetch an
  entity after a dead-letter, apply `ack.version`/`server_seq` locally on `applied`. — **DONE
  2026-08-29** before the P8 merge (`engine.ts`, 7 tests; `p8-manual-verification.md` §4).
- [P8, 2026-08-29] A single displaced chunk moves the whole task to the Inbox (`pull.ts`), while
  sibling chunks stay open and `persist_plan` supersedes only `shown` rows — the P6 per-task
  mirror coarseness gains a new trigger. — P9 (timeline work): mirror per chunk or re-place only
  the displaced chunk. — **P9: not built** (no timeline rework this phase); P10 with the
  displacement notification, or P12. — **P10: not built** (no displacement notification,
  ADR-0014 §6); P12.
- [P9, 2026-08-29] ADR-0013 §2 label weight = one prior's worth (α₀ + β₀), decaying like
  evidence, and a labelled cell counts as personal for the rung-2 badge. With few outcomes a
  user who labels many cells drops the learning-mode badge on labels alone. — **DONE 2026-08-30**
  (live smoke: one ✓ on a day-0 user switched the badge off): labelled cells are outside the
  badge's count on both sides; per-cell phrasing unchanged. — **DONE P11:** the report's
  `label_and_scaling` block counts labeled cells vs evidence-personal cells.
- [P9, 2026-08-29] A trade-off decision is a fact on the deciding device; `events` are not
  pulled, so a second device of the same account shows the sheet again for the same plan until
  its own decision (or the re-plan replaces the plan — the usual case within seconds). — P10
  notifications / P12: if two-device use matters for the study, pull `tradeoff_*` events or
  mark the plan row. — **P10: unchanged**; the same holds for the evening ritual (each device
  fires its own "Plan tomorrow?" and finds the plan already made) and for the FR-50 cap, which
  is per install (two devices may remind about the same block; the adversarial pass, #8) —
  P12 if two-device use matters. — **P12: owner question stands** (HANDOFF open questions);
  intentionally not engineered around before the owner answers.
- [P9, 2026-08-29] `drop` = "not today" (earliest_start = tomorrow 00:00 local, +1 postpone);
  a task with a deadline today that is dropped will be reported past its deadline tomorrow —
  the sheet's consequence line says "skips a task worth …", not "misses its deadline". — P10
  copy review: add a deadline warning to the drop option when `deadline < tomorrow`.
  — **P10: not done** (the phase had no copy review); P12. — **P12: re-dated to the
  pre-enrollment copy pass** (release prep shipped no UI changes; both copy items go
  together).
- [P9, 2026-08-29] The P9 migration (`belief_labels` + trigger) is on the branch and pgTAP-
  verified against the linked project in a rolled-back transaction, but **not applied** to the
  hosted project: `supabase db push --linked` was refused by the session's permission
  classifier. — **DONE 2026-08-30** (owner pushed it; `p9-live-smoke.mjs` 31/31 with the full
  label round trip).
- [P9, 2026-08-29] Adversarial #6 — the label delivery re-POSTs the oldest ≤ 200 undelivered
  rows every pass; a batch the service refuses permanently (e.g. 409 for a user whose cells were
  never instantiated) blocks later labels — the same contract as `/feedback` tuples. — P12
  runbook: on a 4xx answer, mark the batch with the reason and skip it next pass (keep 5xx
  retrying). — **P12:** diagnosis documented (runbook §16); the mark-and-skip contract change
  re-dated to the next sync/EF migration (release prep ships no EF changes; no participants
  at risk meanwhile).
- [P9, 2026-08-29] Adversarial #9 — a `belief_label` with a bad vocabulary fails the event
  insert → op outcome `error` (retried 5× then dead-lettered), not `rejected`; only a tampered
  client can reach it (the client validates the same regex). — P12: map errcode 22023 →
  `rejected` in `sync_replay` when the next sync migration is written anyway. — **P12:
  unchanged** (no sync migration this phase); travels with the next one.
- [P9, 2026-08-29] Adversarial note — ✗ on the favoured cell lowers it, the belief moves to the
  next daypart and the ✗ leaves the list (still in force on the cell, visible on the heatmap).
  — P10 copy review: show the cell's label state on the heatmap text view; consider listing the
  labelled cell under the belief it displaced. — **P10: not done**; P12. — **P12: re-dated to
  the pre-enrollment copy pass** (with the drop-deadline warning above).
- [P10, 2026-08-30] **NFR-P3 and the edge-function round trips.** From Node → eu-west-1 the
  PostgREST read/write p95 is 82–88 ms (✅ 300 ms) but `sync-resolve` (lease + replay + pull +
  release ≈ 4 hops + boot) is 477 ms p95, `insights` 714 ms (VM hop), `export-data` 736 ms. The
  client never blocks on these (offline-first), but the spec sentence is about the API. — P12:
  one RPC for lease + replay + pull (or pull inside `sync_replay`), keep-alive, and a handset
  measurement over LTE (device checklist); report both numbers in the thesis
  (`p10-manual-verification.md` §2.3). — **P12: deferred with reasons** — the
  lease+replay+pull RPC is a sync-engine change out of release-prep scope and untestable
  without live traffic; the handset half sits on the device checklist; both numbers already
  reported honestly (corrections #47). Re-open at first-real-data if 477 ms p95 matters.
- [P10, 2026-08-30] **E-mail confirmation of erasure** (UC-10 "confirmed by email") is an in-app
  confirmation with the `deletion_audit` reference (ADR-0014 §9: no transactional mail on the
  free tier, a mail provider = a new processor, anonymous accounts have no address). — Owner
  decision before enrollment: keep, or approve an EU mail processor (cost + Art. 28) for the
  study cohort.
- [P10, 2026-08-30] **FR-51 smart lead time** stays behind the (absent) flag; the lead is the
  Appendix A static 10 min. — Roadmap (thesis "future work"): a per-category lead learned from
  `notification_response` latency.
- [P10, 2026-08-30] **Android DATE triggers are inexact by default** on API 31+ (no
  `SCHEDULE_EXACT_ALARM`); a reminder may land minutes late under Doze. — Device pass measures
  the drift; if it matters for the study, request the exact-alarm permission in P12.
- [P10, 2026-08-30] **Tomorrow's reminders are scheduled tonight** (ADR-0014 §1: the ritual's
  plan for tomorrow gets tomorrow's budget) but only if the app is opened after the plan lands
  — a ritual accepted from the notification opens the app, so this holds; a plan made by the
  other device does not schedule reminders here until the next foreground. — P12 if two-device
  use matters.
- [P10, 2026-08-30] **`@testing-library/react-native` 14: a second `render` after `cleanup()`
  in the same test leaves the NEXT test's render empty** (found while adding the Today cases;
  one existing trade-off test had the pattern). Rule from now on: one render per test.
- [P11, 2026-08-31] Supabase legacy anon/service_role JWTs are deprecated end-2026; the nine
  edge functions run on the platform-INJECTED legacy vars (runbook §14). Before the cutoff:
  one shared helper reading `SUPABASE_SECRET_KEYS`/`SUPABASE_PUBLISHABLE_KEYS` (JSON, keyed
  by name) and a `createClient` sweep — do it well before enrollment ends so a mid-study
  platform cutoff cannot bite.
- [P12-ladder, 2026-08-31] **Store accounts — owner decided to buy neither** (Play $25 /
  Apple $99/yr, metadata §7): the pack stays prepared-but-unsubmitted; recruitment is
  Android-only (sideloaded release APK). Revisit the Apple membership ONLY if N=30
  completers cannot be reached on Android alone — reversal costs the fee + the metadata §8
  steps plus a categories/deep-link re-verify on a store-signed iOS binary
  (device-checklist "Release builds" residual); no new build work.
- [#49, 2026-09-01] **The field study is not executed (owner)** — enrollment-conditioned
  lines above (consent screen → production, PAYG "before enrollment", the mail-processor
  decision, `sync_ops` prune "for the study", two-device items tied to study use) lose
  their study deadline and re-arm only if the decision reverses (after the DPIA §11
  re-read). Exception: the Supabase legacy-key migration keeps its own **platform**
  deadline (end-2026) regardless of any study.
- [post-P12, 2026-09-01] **OSF freeze — DECIDED (owner): register the unexecuted
  protocol**, sequenced strictly after the hardware pass (ladder step 5) closes; the
  thesis phrasing then flips "pre-registration-ready" → "pre-registered" (corrections
  #49 update; rollup "How to run the pass" step 2). Material: items 8/10/21/35/36
  verbatim + H1/M9/G5 in the rollup.
- [hardware pass, 2026-09-02] **Learned path runs at the fallback budget's edge on a full
  inbox.** Pixel 7a, 14 tasks, day window 12:00–18:00: CP-SAT hits the 1.5 s `SOLVER_TIME_CAP_S`
  (FEASIBLE) on 8 of 10 re-plans, so service ≈ 1.5 s + function/network ≈ 0.2–0.4 s brushes the
  1.9 s `PLAN_FALLBACK_BUDGET_MS`; 1/10 came back `fallback:timeout`. Both are Appendix A
  parameters (cap SPEC-FIXED). Revisit before any thesis claim about the fallback rate: either
  raise the EF budget toward the 2.5 s NFR-P1 ceiling, lower the cap on `day` horizons, or
  report the measured ≈ 10 % fallback rate on tight days as a property of the deployment. **Evening data point (20:22, build 3):** the ritual's full-day plan for the 3rd (14 tasks, 09:00–18:00) also came back `fallback:timeout` at 1909 ms — 1 of 1 full-day request; the half-day series was 1 of 10. A full working day with a 14-task inbox may not be answerable by the learned engine inside the budget at all.
- [hardware pass, 2026-09-02] **Zero-block fallback plans count toward the 30-per-24 h plan
  limit** (`countPlansLast24h`). Harmless once the client's cold-start re-request loop is fixed
  (day-2 defect 15), so the limiter stays as designed; re-check the day-0/evening-empty case
  after that fix — if a user can still lock themselves out by opening the app, exclude
  zero-recommendation rows from the count.
- [hardware pass, 2026-09-02] **A re-plan while a focus session is running drops that block
  from Today.** The 16:16 relaunch re-planned (cold-start defect, since fixed) and the new plan
  omitted "dataset cleanup" (its 16:15 start was already past); the old recommendation stayed
  `accepted` (ADR-0010 held — not lapsed) and Focus kept the session, but Today no longer showed
  the block. A manual re-plan during a session hits the same path. Revisit in the service/EF:
  carry a recommendation with a running session as a fixed assignment (previous_assignments
  with status `accepted` + an open session) so Today and Focus never disagree.
- [hardware pass, 2026-09-02] jest prints "A worker process has failed to exit gracefully" on
  the fix-batch branch (second adversarial pass, unattributed — likely the SQLite suites, not
  verified against main). Run `pnpm test -- --detectOpenHandles` once and close the handle.
- [hardware pass, 2026-09-02 evening] **Measured shape of the learned-path fallback** (45-request
  sweep, `docs/verification/hw-plan-budget-sweep.mjs`; day-2 notes "Plan-budget sweep"): the
  1.9 s budget = 0.43 s round-trip floor + 0.45–0.9 s function overhead + a 1.0 s effective solver
  slice (1.5 s cap − 0.5 s ladder reserve, no gap limit). Reliable when the solver finishes
  < ≈ 0.6 s (≤ 4.5 h windows at any size; ≤ 12 tasks on 9 h); a coin flip whenever the first rung
  runs to its slice (from 14–16 tasks on 9 h; today's deadline-bearing 14-task instances 12/15,
  an optimality-proof stall on ≈ 300-literal models). Decide: `relative_gap_limit` / early stop,
  parallel context reads, budget → 2.5 s − client overhead, or co-location — and which of these
  is reported as a result rather than fixed. Supersedes the "≈ 10 % on tight days" wording above.
- [hardware pass, 2026-09-02 — DECIDED (owner)] **Learned-path budget levers:** CP-SAT
  `relative_gap_limit` / early stop — **yes** (implement, with an ADR pinning the value and the
  re-measured fallback rate); a bigger `PLAN_FALLBACK_BUDGET_MS` — **no**; moving the VM /
  co-location — **no**; parallel context reads in the edge function — **only if cheap** (one
  bounded attempt; drop it if it needs more than a small refactor). The measured shape above
  (round-trip floor, function overhead, 1.0 s slice, proof stalls) is reported as a thesis
  result either way; the gap-limit run re-measures with the same sweep script.
- [hardware pass, 2026-09-03 — DONE, ADR-0018] **Stopping criteria shipped:** `relative_gap_limit`
  0.01 + a 0.3 s no-improvement early stop (watchdog → `stop_search()`) + search-trajectory
  telemetry on every plan + concurrent count/context reads in `plan-request`. Measured before
  shipping: the gap limit alone is inert on the stall class (relative bound gap 0.38–1.21 on the
  device's reproduced inbox; symmetry level 2 / probing 1 change nothing) — the early stop is
  what ends the stall, at ≤ 0.3 % objective loss for the 0.3 s window. **After-rollout numbers
  (2026-09-03):** device series on the same inbox 0/10 fallbacks (before 1/10), function p50
  1091 / p95 1342 ms (before 1675 / 1907), solve p50 400 / max 665 ms, early stop 10/10; sweep
  0/36 (before 1/36) and 0/9 on the splittable + deadlines variant; function work outside the
  service call p50 388 / p90 517 ms (before 553 / 797). Window margin on the box is thin (longest
  waits 224–268 ms vs 0.3 s) — re-pin rule in ADR-0018. Still
  open: (a) the exact alternative — symmetry-breaking among interchangeable tasks so the proof
  closes instead of being stopped; (b) re-pin the window from the box's own
  `max_improvement_gap_ms` p95 after a week of plans (rule in ADR-0018 §3).
- [hardware pass, 2026-09-03 — DECIDED (owner)] **Pre-plan sync cost (the largest NFR-P1
  component, 1.0–1.5 s on the phone).** NFR-P1 was set at 4.5 s p95 device end-to-end / 1.5 s server-side with the measured figures reported alongside — **revised 2026-09-04 to ≤ 6.0 s p95 on a 2022 low-end Android over a weak link (Pixel 7a reference 3.7 s alongside; day-4 notes derivation): 2.6 of the 3.9 s reference p95 is server-side and independent of the user's phone and network, which is exactly the share L2/L3 address;** **L1 shipped the same day**
  (server-only); **L2 and L3 are optional optimisations, not prerequisites** for meeting the
  requirement — do them only if a later phase wants the lower measured figure. Measured composition (`hw-sync-hops.mjs`, Node → hosted
  function, 0 ops): `poll` (no rewards pass) p50 533 ms vs `pre_plan` p50 844 ms (710–1422),
  8 task ops 946 ms; the 400 path ≈ 300 ms = boot + auth + parse; one RPC hop ≈ 87 ms; the phone
  adds ≈ 0.45 s of transport + 0.1–0.2 s of local apply. Levers, cheapest first: (L1) run the
  instant-rewards pass only when the pushed ops carry facts, i.e. treat `pre_plan` like `poll`
  in `shouldRunRewards` — ≈ −0.35 s, server-only, ~1 h, attribution deferred to the next sync /
  23:55 (invariant 7 unaffected); (L2) one RPC for lease + replay + pull + release — ≈ −0.25 s,
  server-only, ~half a day (SQL wrapper + pgTAP + function); (L3) carry the pending ops inside
  `plan-request` and pull afterwards in the background — ≈ −1.2 s (the whole round trip minus
  the replay inside the plan call), a client change → build 4 + re-verification, ~1.5 days, and
  the 1.9 s fallback clock must start after the replay. Estimated device p95 after each: today
  ≈ 3.4 s → L1 ≈ 3.0 s → L1+L2 ≈ 2.8 s → L3 ≈ 2.0–2.2 s. Corrects the day-3 wording "collapsing
  the hops ≈ −0.8 s" (that was L1 + L3 conflated).
- [post-P12 hw day 4, 2026-09-04] ADR-0014 §1 (the inexact DATE trigger accepted as OS policy) — on
  the Pixel 7a every alarm runs with a 31–60 min window because `SCHEDULE_EXACT_ALARM` was neither
  declared nor granted; a 10-min lead cannot be honoured (the 08:50 reminder for the 9:00 block was
  never shown; the ritual posted 26 min late). Build 4 declares the permission (24808ad). Still owed:
  an in-app "Alarms & reminders" prompt (a Settings row that opens
  `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` via expo-intent-launcher, shown while
  `canScheduleExactAlarms()` is false — needs a tiny native check or a config plugin) and the
  Play-policy justification text if the store pack is ever submitted.
- [post-P12 hw day 4, 2026-09-04] FR-26 semantics — a ritual answered after the morning's `new_day`
  plan re-plans TODAY (`nextPlanDayOf` anchors on the ritual's own plan day): right by the 06:00
  anchor rule, but the user's morning plan is superseded mid-morning. Suggest: an `accept` for a day
  another trigger has already planned logs the `notification_response` fact and opens Today without
  a request. Not changed today.
- [post-P12 hw day 4, 2026-09-04] third-skip diagnostic card (P7) — shown only on the foreground
  whose lapse scan detects the third skip; left unanswered it is gone on the next cold start
  (observed 08:31 → 08:53, task "email replies"). Suggest persisting the due diagnostic (task id)
  until answered or explicitly dismissed.
