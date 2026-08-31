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
- [P5, 2026-08-26] PostgresRepo connects as the pooler's `postgres` role (RLS-bypassing). Fine
  for a trusted backend, but least privilege wants a dedicated `recsys_service` role limited to
  model-state tables. — P12 runbook: create the role + grants, rotate the DSN.
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
  — **P10: no week view either** (notifications and privacy); P12.
- [P6, 2026-08-26] Task-push bridge (`apps/mobile/src/sync/taskPush.ts`) is last-write-wins by
  design (ADR-0008 §5). — P8: replace with op replay (base_version checks) and delete the bridge.
  — **DONE P8** (bridges deleted; `sync_replay()` + `src/sync/engine.ts`).
- [P6, 2026-08-26] Timeline as a row list (ADR-0008 §7) — reads fine but loses the "shape of
  the day" a proportional canvas gives. — P9 (Skia work): evaluate a proportional timeline that
  still passes the 200 % font-scale and screen-reader checks. — **P9: not built.** The heatmap
  (the phase's only canvas candidate) went to native Views for per-cell font scaling and a
  one-element screen-reader summary (ADR-0013 §5), so Skia still has no consumer; re-evaluate
  in P12 with the focus ring, or drop the proportional timeline as a product-only nicety.
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
  `HOURWELL_SERVICE_KEY` when the service host is set up; consider a cron-only key.
- [P7, 2026-08-27] Expo SDK 57 patch drift (expo 57.0.16→.17, RN 0.86.2→.3, jest-expo 57.0.4→.5,
  @expo/metro-runtime pinned directly) applied via `expo install --fix` to keep expo-doctor green;
  jest-expo 57.0.5 tightened the `jest.mock` factory scope rule (mock objects must be
  `mock`-prefixed or lazily referenced). — device pass: nothing; P12: re-verify versions.md.
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
  ordering. P12: measure lease wait times; consider a lagged re-scan in `sync_pull`.
- [P8, 2026-08-28] Write-back events stay in the user's Google Calendar after `disconnect`
  (the token is revoked before they could be deleted). — **DONE 2026-08-29** (adversarial #11:
  `clearWriteBack` before the revoke and on write-back off).
- [P8, 2026-08-28] `mapGoogleEvent` assumes Google returns `transparency: transparent` for
  default all-day events (its UI default "Free"); if not, a birthday would block a whole day. —
  Verify on the first live calendar (runbook §3); fall back to "all-day never busy" if wrong.
- [P8, 2026-08-28] `sync_ops` has no retention (idempotency window = forever). Volume is tens
  of rows per user-day. — P12 runbook: prune ledger rows older than 90 days if the table ever
  matters; `events` keeps its own UNIQUE regardless.
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
  P12 if two-device use matters.
- [P9, 2026-08-29] `drop` = "not today" (earliest_start = tomorrow 00:00 local, +1 postpone);
  a task with a deadline today that is dropped will be reported past its deadline tomorrow —
  the sheet's consequence line says "skips a task worth …", not "misses its deadline". — P10
  copy review: add a deadline warning to the drop option when `deadline < tomorrow`.
  — **P10: not done** (the phase had no copy review); P12.
- [P9, 2026-08-29] The P9 migration (`belief_labels` + trigger) is on the branch and pgTAP-
  verified against the linked project in a rolled-back transaction, but **not applied** to the
  hosted project: `supabase db push --linked` was refused by the session's permission
  classifier. — **DONE 2026-08-30** (owner pushed it; `p9-live-smoke.mjs` 31/31 with the full
  label round trip).
- [P9, 2026-08-29] Adversarial #6 — the label delivery re-POSTs the oldest ≤ 200 undelivered
  rows every pass; a batch the service refuses permanently (e.g. 409 for a user whose cells were
  never instantiated) blocks later labels — the same contract as `/feedback` tuples. — P12
  runbook: on a 4xx answer, mark the batch with the reason and skip it next pass (keep 5xx
  retrying).
- [P9, 2026-08-29] Adversarial #9 — a `belief_label` with a bad vocabulary fails the event
  insert → op outcome `error` (retried 5× then dead-lettered), not `rejected`; only a tampered
  client can reach it (the client validates the same regex). — P12: map errcode 22023 →
  `rejected` in `sync_replay` when the next sync migration is written anyway.
- [P9, 2026-08-29] Adversarial note — ✗ on the favoured cell lowers it, the belief moves to the
  next daypart and the ✗ leaves the list (still in force on the cell, visible on the heatmap).
  — P10 copy review: show the cell's label state on the heatmap text view; consider listing the
  labelled cell under the belief it displaced. — **P10: not done**; P12.
- [P10, 2026-08-30] **NFR-P3 and the edge-function round trips.** From Node → eu-west-1 the
  PostgREST read/write p95 is 82–88 ms (✅ 300 ms) but `sync-resolve` (lease + replay + pull +
  release ≈ 4 hops + boot) is 477 ms p95, `insights` 714 ms (VM hop), `export-data` 736 ms. The
  client never blocks on these (offline-first), but the spec sentence is about the API. — P12:
  one RPC for lease + replay + pull (or pull inside `sync_replay`), keep-alive, and a handset
  measurement over LTE (device checklist); report both numbers in the thesis
  (`p10-manual-verification.md` §2.3).
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
