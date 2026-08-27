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
  wipe behind a deferred-transition confirm when unacked ops exist.
- [P4, 2026-08-26] ADR-0005 §6 (instantiate from max prior_cells version) — fine while only v0
  exists; once P11's empirical-Bayes refresh lands, "highest version" should probably become
  "highest PROMOTED version" via model_registry. — decide in P11 with the registry gate.
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
  — **DONE P6:** persisted in `plans.telemetry.ef` (one experiment per plan); P11 reports drops.
- [P6, 2026-08-26] Appendix A "/plan EF fallback budget 1.9 s" — calibrated for the DAY horizon
  (P5 day p90 170 ms on a Mac); the week horizon takes 1.5–2 s in the service (M8) and would
  fall back most of the time. — P9/P10: if a week view is built, add an async plan path or a
  horizon-specific budget by ADR; re-measure on the 2 vCPU Space first.
- [P6, 2026-08-26] Task-push bridge (`apps/mobile/src/sync/taskPush.ts`) is last-write-wins by
  design (ADR-0008 §5). — P8: replace with op replay (base_version checks) and delete the bridge.
- [P6, 2026-08-26] Timeline as a row list (ADR-0008 §7) — reads fine but loses the "shape of
  the day" a proportional canvas gives. — P9 (Skia work): evaluate a proportional timeline that
  still passes the 200 % font-scale and screen-reader checks.
- [P6, 2026-08-26] `NULL_CONFIDENCE_RENDER = 0.7` — chosen to match day-0 learned confidence
  under the flat prior; once real confidence distributions exist, arm-A blocks may look
  systematically different (a residual blinding cue). — P9/P11: compare rendered solidity
  distributions across arms; consider rendering learned rows in a compressed band.
- [P6, 2026-08-26] `persist.ts` writes plans + recommendations + supersede as three PostgREST
  calls with a compensating delete (ADR-0008 §4). — P8 (sync-resolve needs transactional writes
  anyway): one `security definer` RPC, service-role only, for plan persistence.
- [P6, 2026-08-26] Drop rates on the randomized slice differ by arm by construction (the EF drops
  only on pinned occupancy; the service on any INFEASIBLE). — P11: report `experiment_dropped`
  per arm and condition the replay on the arm.
- [P7, 2026-08-27] Appendix A λ_f = 0.5 retune (the P5 line above, scheduled "P7") — no live
  feedback exists yet (the service host is the open ADR-0009 decision), so there are no observed
  q̂ scales to retune against; retuning on synthetic data would be invention. — P11 first data
  review: retune λ_f (e.g. ∝ v·q̂) by ADR once real tuples exist; keep 0.5 until then.
- [P7, 2026-08-27] ADR-0010 §6 one override pair per placement — a user who moves a block twice
  teaches only the first move; the second is logged but unrewarded. — P9/P11: decide whether a
  second move should replace the pair (correction semantics) once override frequency is known.
- [P7, 2026-08-27] ADR-0010 §9 duration multiplier applied to est_minutes for both engines — this
  changes the task's feature 11 (log duration) and its feasibility, i.e. the planner's inputs
  drift with learning even for arm A. Symmetric by design, but the pre-registration should say
  so. — OSF freeze: add one sentence; P11: report how often scaling was active per arm.
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
