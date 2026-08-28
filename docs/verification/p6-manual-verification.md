# P6 manual verification — Plan E2E

> Per CLAUDE.md "Simulator evidence": every number below states what ran, on what, and what it
> does and does not establish. The learned path (RecSys Space) does not exist yet, so the
> end-to-end measurements are on the **NFR-R2 fallback path** against the hosted edge function.

## 1. Gates (2026-08-26)

| Gate                                                   | Result                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check`   | green                                                                                                          |
| `pnpm test` (apps/mobile + packages/shared)            | **35 suites, 264 tests** passed (P5: 189+) — new: plansDao, planTrigger, rationale, today, schema (plans)      |
| `deno fmt --check` · `deno lint` · `deno check` · test | **50 tests** passed (`supabase/functions`): grid/φ/F_τ/eligibility parity, heuristic, ε-draw, handler, service |
| `uv run ruff check .` · `ruff format --check` · `mypy` | clean (43 source files)                                                                                        |
| `uv run pytest`                                        | **126 passed, 6 skipped** (Postgres integration tests run in the CI db job)                                    |
| pgTAP `p6_plan_request_test.sql` (9 assertions)        | **CI db job only** — no Docker on the dev Mac; the same assertions were exercised live (§3)                    |

## 2. Cross-language parity (H1 symmetry, mechanically)

`services/recsys/scripts/gen_grid_parity.py` writes `supabase/functions/_shared/testdata/grid_parity.json`
from the Python grid/φ/F_τ/eligibility code for three cases (Kyiv spring-forward day, 92 ticks;
Kyiv fall-back week with `now` inside the first day and a busy block on the DST day, 676 ticks;
New York fall-back day, 100 ticks). `tests/test_grid_parity_fixture.py` asserts the committed file
equals a fresh generation; `grid_parity_test.ts` asserts the Deno modules reproduce every field
(n_ticks, origin, per-tick local minute / weekday / day index, workable and occupied sets, bucket
id per tick, F_τ per task, reachable bucket set per task, the eligible set). Feature vectors and
the Beta posterior are pinned to Python reference values in `features_test.ts` / `energy_test.ts`.
Parameters are pinned across the boundary in `params_test.ts` (EF ↔ `packages/shared` ↔ `params.py`).

## 3. Live smoke on the hosted project (`docs/verification/p6-live-smoke.mjs`, 10 runs)

Run from `apps/mobile` with Node 24 on the dev Mac against the linked EU project after
`supabase db push` (migrations `20260827120000`, `20260827130000`) and
`supabase functions deploy plan-request`. **18/18 PASS**: anonymous sign-in → `plan-request`
without a profile → 404 → profile through RLS → `empty_inbox` (no plan row) → four tasks through
RLS → `planned` with `engine = heuristic`, `model_version = heuristic-p6.0`,
`telemetry.ef.reason = fallback:not_configured` (no `RECSYS_URL` secret yet), 4 blocks, every
assignment field persisted (17 features, bucket, rationale key), at most one experiment row with
propensity ∈ {1/2, 1/3, 1/4} **exactly**, `A_m(x)` in telemetry, NULL `q_hat`/`confidence` on
heuristic rows → re-plan supersedes the first plan (`expired`, ids echoed) → owner reads own rows,
another anonymous user reads none → the client cannot set `expired` (guard trigger) but can move
a `shown` row to `accepted`.

**Timings (client → edge function → response, fallback path, Node on a Mac, home Wi-Fi):**
p50 **747 ms**, p95 **867 ms** (724, 817, 703, 788, 716, 771, 867, 747, 708, 795); the function's
own `ef.total_ms` ≈ 450 ms of which the context read + persist are the bulk (the heuristic itself
is < 5 ms). Two earlier 10-run samples had p95 1167 / 1522 ms with a cold function instance in
the sample; the post-adversarial redeploy sample (§6) was p50 956 / p95 1258 ms (`ef.total_ms`
878 on the first request after deploy — a cold instance), all 18 checks passing.

What this establishes: the whole chain works against real RLS, real triggers and the real
function runtime; the fallback path leaves ≈ 1.6 s of NFR-P1's 2.5 s for the service when it is
warm. What it does **not** establish: NFR-P1's warm p95 on the **learned** path (needs the HF
Space — ⛔ owner action; then rerun with `RECSYS_URL` + `HOURWELL_SERVICE_KEY` set), any number
from a handset (device-checklist "NFR-P1 from the device"), or the kill-the-Space fallback timing
(device-checklist "UC-03 A1").

Two defects the live run found and P6 fixed: (1) the base schema already had `plans_user_date_idx`
— the P6 migration now adds only the rate-limit index; (2) `propensity real` (float4) cannot store
1/3 — under the new eligibility rule that is a legitimate value, so the column is now
`double precision` (spec-conflicts L22).

### 3.1 Learned path live (2026-08-28, service on the ADR-0009 VM)

Same script, same Mac and Wi-Fi, after `RECSYS_URL` + `HOURWELL_SERVICE_KEY` were set as function
secrets and the VM served build `b75d7c1` (threshold 3 000). **18/18 PASS** in both samples with
`engine = learned`, `model_version = recsys-p5.0`, `telemetry.ef.reason = learned`, 4 blocks,
0 unplaced.

| Sample                        | Timings (ms, client → EF → VM → pooler → response)         | p50       | p95       | `ef.total_ms` on run 1 |
| ----------------------------- | ---------------------------------------------------------- | --------- | --------- | ---------------------- |
| 1 — first calls after secrets | 1430, 1362, 1507, 1535, 1398, 1532, 1488, 1502, 1426, 1333 | 1 430     | 1 535     | 1 124                  |
| 2 — warm, minutes later       | 1064, 1506, 1205, 1202, 1176, 1186, 1389, 1310, 1293, 1197 | **1 202** | **1 506** | 889                    |

What this establishes: **NFR-P1 (≤ 2.5 s p95 end-to-end, warm backend) is met on the learned
path from the dev Mac — p95 1.5 s**, with ≈ 1 s left under the target; the EF's own share is
≈ 0.9–1.1 s (context read + `/plan` round trip to Marseille + persist), the service's solve for a
4-task day plan is tens of ms. The first sample is only ≈ 0.2 s slower (DB pool warm-up on the
service; the VM itself is always on). What it does **not** establish: the number from a handset
on a mobile network (device-checklist "NFR-P1 from the device"); behaviour under concurrent users
(single-flight per client, one VM).

### 3.2 UC-03 A1 — service down → heuristic fallback → service back → learned (2026-08-28)

See `docs/verification/p7-manual-verification.md` §2c for the run (`docker compose stop recsys`
on the VM, 3 runs, restart, 3 runs).

## 4. Experiment rate measurement (owner decision 1)

`uv run python scripts/experiment_rate.py` (pure combinatorics on the service grid; not timing):

| Day profile (09–18)                | tasks | P(≥1 eligible) strict ≥4 | P(≥1 eligible) P6 ≥2 | per user-week (5 plans) |
| ---------------------------------- | ----- | ------------------------ | -------------------- | ----------------------- |
| plain, no events                   | 3     | 0.57                     | **0.86**             | 2.8 → **4.3**           |
| plain, no events                   | 5     | 0.76                     | **0.96**             | 3.8 → **4.8**           |
| two meetings (10–11:30, 15–16)     | 3     | 0.55                     | **0.86**             | 2.8 → **4.3**           |
| heavy: four meetings (~3.5 h busy) | 3     | 0.00                     | **0.22**             | 0 → **1.1**             |
| heavy: four meetings (~3.5 h busy) | 8     | 0.00                     | **0.48**             | 0 → **2.4**             |

Task mix: durations uniform over {15, 30, 45, 60, 90, 120, 150, 180} min, 30 % with a same-day
deadline (critical ⇒ ineligible), 10 % pinned, 1000 sampled inboxes per cell, seed 2026. Under the
strict rule every task ≥ 60 min was ineligible on a plain day (|A(x)| = 3). Rates are before
INFEASIBLE-after-pin drops and before same-day re-plans (only the last shown plan is acted on).

## 5. UC-03 walk on the simulator — NOT done in P6

The Today screen was verified through component tests (empty state, planning banner, blocks with
rationale/time/experiment tag, fallback notice present for fallback plans and absent for arm A,
deferred line, notices) and the plan bridge through DAO tests; the app was **not** launched on
the iOS simulator in this phase (owner directive: simulator runs are smoke checks; the device
checklist carries UC-03 main + A1 + A2 on hardware). This is the one PLAN acceptance item
("walked on device") that stays open until the hardware pass.

## 6. Adversarial pass (fresh-context subagent, 2026-08-26)

Brief: attack H1 symmetry, feature-snapshot parity, EF security, persist semantics, the client
transaction, triggers, blinding cues, toolchain consistency, docs vs. code, vacuous tests.
Result: **2 MAJOR, 10 MINOR, 5 NOTE** — all MAJOR/MINOR fixed in this PR, NOTEs recorded.

| #   | Severity | Finding                                                                                                                                           | Fix                                                                                                                                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | MAJOR    | Arm-A feature snapshot evaluated at the placed tick; the service logs x at the bucket's representative tick k\* → "same x across arms" not backed | `prepareHeuristic` mirrors `_prepare` (k\* per bucket, features at k\*); fixture regenerated from the service's `_prepare` and pins k\*/features; test in heuristic_test |
| 2   | MAJOR    | `NULL_CONFIDENCE_RENDER = 0.7` justified by an estimate; measured day-0 learned confidence is 0.31–0.42 → arm-A blocks visibly more solid         | Measured (n = 98, median 0.38) → constant 0.38; ADR §7 + explainer corrected; primitives test pins it                                                                    |
| 3   | MINOR    | pgTAP compared `double precision` against a `real` literal                                                                                        | Fixed (found by CI first); 1/3 round-trip row added                                                                                                                      |
| 4   | MINOR    | 00:00–06:00 auto-request planned the previous (fully past) day → empty plan, task-status churn                                                    | No auto-request before 06:00; requests always plan the current calendar day; display keeps yesterday's plan until 06:00                                                  |
| 5   | MINOR    | `trigger = new_day` unreachable; live rows did not follow the plan-day change                                                                     | Trigger decided against the latest plan of ANY date; `useLiveRows` takes builder deps                                                                                    |
| 6   | MINOR    | Overlapping pins silently stacked                                                                                                                 | Later pin → `infeasible` + `unpin` option (test)                                                                                                                         |
| 7   | MINOR    | Body validation: non-calendar dates → 500; unbounded `now`/`plan_date`                                                                            | 400 on invalid date, `now` ±24 h, `plan_date` ∈ [today−1, today+7] in the profile zone (tests)                                                                           |
| 8   | MINOR    | Task-status mirror enqueued a partial `task_upsert` payload                                                                                       | Full server-shaped row via `taskOpPayload`                                                                                                                               |
| 9   | MINOR    | `offline` state unreachable; rate-limit copy promised a scheduled plan                                                                            | `FunctionsFetchError`/push failure → `offline`; copy reworded                                                                                                            |
| 10  | MINOR    | Non-atomic persist could leave an orphan plan row                                                                                                 | Compensating delete; RPC recorded in revisit.md                                                                                                                          |
| 11  | MINOR    | FR-22 NULL rendering had no test                                                                                                                  | `ConfidenceBlock` null test (solidity + no percentage in the a11y label)                                                                                                 |
| 12  | MINOR    | Parity fixture could not catch feature/posterior/pinned drift                                                                                     | Fixture now carries k\*, features per (task, bucket) and a pinned task per DST case                                                                                      |
| 13  | NOTE     | ADR overclaimed "client never sees model state" (features 15–16 are on the row per spec)                                                          | Sentence softened                                                                                                                                                        |
| 14  | NOTE     | 500 responses echoed internal error text                                                                                                          | Generic detail; server-side log                                                                                                                                          |
| 15  | NOTE     | Rate limit / supersede are read-then-act under true concurrency                                                                                   | Documented (ADR §4, HANDOFF gotcha); client single-flight guard                                                                                                          |
| 16  | NOTE     | `n_eligible: -1` sentinel on the learned path                                                                                                     | `null` (typed)                                                                                                                                                           |
| 17  | NOTE     | Drop rules are a subset of the service's (draw distribution identical)                                                                            | ADR §2 note; P11 reports drop rate per arm (revisit.md)                                                                                                                  |

After the fixes: Deno **53** tests, jest **265**, pytest **126** (+6 CI-only), all gates green;
the edge function was redeployed and the live smoke rerun: 18/18 PASS (timing sample in §3).
