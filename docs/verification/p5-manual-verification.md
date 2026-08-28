# P5 manual verification — RecSys service

> Per CLAUDE.md "Simulator evidence" (extended to services): timing measured on the development
> Mac is a smoke check, NOT evidence about the 2 vCPU Hugging Face container File 04 §1.5 names.
> Each section states what ran, on what, and what it does and doesn't establish.

## 1. Gates (2026-08-26, `services/recsys`)

`uv run ruff check .` → All checks passed · `uv run mypy src tests` → Success: no issues found in
41 source files · `uv run pytest --cov=hourwell_recsys` → **110 passed, 5 skipped** (the 5 are the
PostgresRepo integration tests, run in CI's db job against the local Supabase), coverage **92 %**
(domain modules 90–100 %; `repo.py` 60 % locally, covered by the CI Postgres run; `main.py` is
the uvicorn entry). Root TS gates: `pnpm typecheck` / `pnpm lint` / `pnpm format:check` green;
`packages/shared/src/api.ts` regenerates byte-identical (CI `api-contract` job).

## 2. Solve-time bench — Mac numbers, honestly labelled

`uv run python scripts/bench_solve.py --runs 20` on macOS 26.5 / Apple Silicon (12 cores),
Python 3.12.14, OR-Tools 9.15, `num_workers = 2`, probing/symmetry presolve off (ADR-0007 §11).

| Instance                                | Status         | Solve p50 | Solve p90 | Solve max | End-to-end p50 | End-to-end p90 | Literals p50/max | Ladder                                   |
| --------------------------------------- | -------------- | --------- | --------- | --------- | -------------- | -------------- | ---------------- | ---------------------------------------- |
| day: 12 tasks, 2 busy blocks, 1 pinned  | OPTIMAL 20/20  | 70 ms     | 145 ms    | 622 ms    | 75 ms          | 170 ms         | 258 / 375        | none 20                                  |
| week: 50 tasks, 5 busy blocks, 1 pinned | FEASIBLE 20/20 | 1.00 s    | 1.04 s    | 1.37 s    | 1.10 s         | 1.95 s         | 3 127 / 6 713    | coarse 30-min 12 · day-by-day 7 · none 1 |

What this establishes: the model is well-formed and the anytime cap + ladder behave as designed on
this machine (no UNKNOWN escapes; the budget is respected per plan; the week p90 end-to-end
overshoot above 1.5 s is Python model-building on the day-by-day rung, 7 builds). What it does
**not** establish: NFR-P1's service budget on the 2 vCPU container — presolve time (the measured
bottleneck, spec-conflicts M8) scales with single-thread speed, and a shared-CPU quota changes
`num_workers = 2` behaviour. Backlog item: device-checklist "Service environment".

Before the fixes recorded in ADR-0007 §11 the same week instances returned **UNKNOWN 20/20** with
zero placements (presolve consumed the cap) — the ladder never engaged because the literal count
(8–17·10³) sat below File 04's 4·10⁴ trigger. That measurement is why the practical threshold and
the UNKNOWN escalation exist.

### 2.1 The same bench on the deployed container (2026-08-28, ADR-0009 box) — the numbers that count

`docker compose exec -T recsys /opt/venv/bin/python scripts/bench_solve.py --runs 20` on
`recsys-oracle` (Oracle A1.Flex, 2 OCPU Ampere aarch64 / 12 GB, Ubuntu 24.04, kernel
6.17.0-1020-oracle), container pinned to `cpus: 2`, Python 3.12.14, OR-Tools as in the image built
from `103a238`, `num_workers = 2`, probing/symmetry presolve off. Keep-busy timer idle during the
run (checked). Raw JSON: session log; the run is reproducible with the command above.

| Instance                                | Status (final)                | Solve p50 | Solve p90 | Solve max | End-to-end p50 | End-to-end p90 | Literals p50/max | Ladder                          |
| --------------------------------------- | ----------------------------- | --------- | --------- | --------- | -------------- | -------------- | ---------------- | ------------------------------- |
| day: 12 tasks, 2 busy blocks, 1 pinned  | OPTIMAL 20/20                 | 118 ms    | 336 ms    | 574 ms    | 135 ms         | 487 ms         | 238 / 375        | none 20                         |
| week: 50 tasks, 5 busy blocks, 1 pinned | **UNKNOWN 19/20**, FEASIBLE 1 | 366 ms    | 450 ms    | 1 464 ms  | **1 966 ms**   | **2 389 ms**   | 3 629 / 4 582    | day-by-day 18 · coarse 30-min 2 |

What this establishes on the box File 04 §1.5 names:

- **NFR-P1 for the product's plan (day horizon): met with margin.** 487 ms p90 end-to-end
  inside the service, against the 1.5 s plan budget and the edge function's 1.9 s fallback budget
  (NFR-P1 itself is ≤ 2.5 s p95 end-to-end, warm backend). The A1 core is ≈ 1.7× slower than the
  M-series core on this instance (118 vs 70 ms solve p50), as expected.
- **The 50-task week stress instance does not solve on this box under the Mac-fitted ladder.**
  Its 15-min encoding has ≈ 3.6·10³ literals — _below_ the practical threshold of 8·10³ fitted on
  the Mac (ADR-0007 §11) — so the plan starts at the 15-min rung, spends the whole 1.0 s slice
  (1.5 s cap − 0.5 s reserve) and returns UNKNOWN (presolve-bound, the M8 regime); the coarse
  rung then gets only the reserve, and day-by-day the leftovers (50 ms minimum slices) — "every
  day still hot" → final status UNKNOWN in 19/20 runs, end-to-end ≈ 2.0 s p50 / 2.4 s p90 (three
  Python model builds + the solves). On the Mac the same instance was FEASIBLE 20/20 at 1.0 s.
  **This is the empirical result ADR-0007 §11 said to expect — the threshold is box-specific
  and must be re-fitted on the deployment box**, not a defect of the ladder (it engaged exactly as
  designed; the budget was spent on the wrong rung). The re-fit sweep and the value adopted are
  in §2.2; the thesis reports the container numbers, never the Mac's (thesis-corrections #11).

### 2.2 Threshold re-fit on the box (2026-08-28) and the value adopted

Same container, keep-busy idle, `PRACTICAL_LITERAL_THRESHOLD` monkey-patched in-process
(`hourwell_recsys.planner`), week instance, 20 runs per point (the 8 000 point repeats §2.1
within noise):

| Threshold | Rung the plan starts on | Final status (of 20)        | Solve p50 | End-to-end p50 | End-to-end p90 | Ladder                   |
| --------- | ----------------------- | --------------------------- | --------- | -------------- | -------------- | ------------------------ |
| 8 000     | 15-min                  | FEASIBLE 1 · UNKNOWN 19     | 369 ms    | 2 076 ms       | 2 532 ms       | day-by-day 18 · coarse 2 |
| 4 000     | 15-min                  | FEASIBLE 5 · UNKNOWN 15     | 394 ms    | 1 795 ms       | 1 942 ms       | day-by-day 18 · coarse 2 |
| **3 000** | coarse 30-min           | **FEASIBLE 12 · UNKNOWN 8** | 1 091 ms  | **1 387 ms**   | **1 895 ms**   | day-by-day 19 · coarse 1 |
| 2 000     | day-by-day              | FEASIBLE 12 · UNKNOWN 8     | 1 084 ms  | 1 365 ms       | 1 892 ms       | day-by-day 20            |
| 1 000     | day-by-day              | FEASIBLE 11 · UNKNOWN 9     | 1 087 ms  | 1 365 ms       | 1 890 ms       | day-by-day 20            |

**Adopted: `PRACTICAL_LITERAL_THRESHOLD = 3 000`** (was 8 000, the Mac fit) — the largest tested
value that skips the presolve-bound 15-min rung for this instance on this box; 2 000 and 1 000
add nothing here and would only remove the coarse rung for mid-size instances that fit it. The
change ships through CI → GHCR → the VM's pull-based rollout and is re-measured on the box with
the shipped image (§2.3). ADR-0007 §11 addendum; thesis-corrections #37.

**What the sweep says beyond the parameter — a claim-level result for the thesis.** On the
2-core A1 the 50-task, 7-day stress instance ends UNKNOWN in ≈ 40 % of runs on _every_ rung: the
coarse 30-min rung is presolve-bound too, and day-by-day's seven ≈ 200 ms slices are "hot" for
some days. So File 04 §1.5's "meeting NFR-P1 on 2 vCPU" is **true for the product's plan (day
horizon, ≤ 15 tasks: 487 ms p90 end-to-end, wide margin) and not true for week-horizon planning
of 50 tasks under the 1.5 s plan-level budget** on the free box — there the anytime contract
returns partial plans with the ladder flagged in telemetry. The client and the edge function
request the day horizon only (`horizon ?? 'day'`); the weekly plan is FR-20's second half and a
P9 UI question. Options when it is built (revisit.md): a longer plan-level budget for week
horizons (the 1.5 s cap is spec-fixed for _a_ plan; a week plan is seven), fewer candidate
starts per task, or accepting the partial anytime plan explicitly. Not decided here.

### 2.3 Re-measurement with the shipped image

Image `b75d7c117240` (PR #13, `PRACTICAL_LITERAL_THRESHOLD = 3 000` confirmed inside the
container), same command, keep-busy idle, 2026-08-28 19:12 UTC:

| Instance                                | Status (final)             | Solve p50 | Solve p90 | Solve max | End-to-end p50 | End-to-end p90 | Literals p50/max | Ladder                          |
| --------------------------------------- | -------------------------- | --------- | --------- | --------- | -------------- | -------------- | ---------------- | ------------------------------- |
| day: 12 tasks, 2 busy blocks, 1 pinned  | OPTIMAL 20/20              | 122 ms    | 460 ms    | 592 ms    | 139 ms         | 555 ms         | 238 / 375        | none 20                         |
| week: 50 tasks, 5 busy blocks, 1 pinned | FEASIBLE 13/20 · UNKNOWN 7 | 1 086 ms  | 1 097 ms  | 1 103 ms  | 1 349 ms       | 1 920 ms       | 3 690 / 4 590    | day-by-day 19 · coarse 30-min 1 |

Consistent with the sweep (§2.2): the day plan is unchanged (its 238 literals never reach any
threshold), the week stress instance now spends its budget on rungs that can finish — FEASIBLE
13/20 vs 1/20, end-to-end p50 1.35 s vs 2.08 s — and the ≈ 35–40 % UNKNOWN residue on this box
stands as the capacity limit described above. These are the numbers the thesis reports for File
04 §1.5 (thesis-corrections #37); the Mac table in §2 stays as the development-time reference.

## 3. End-to-end smoke (in-process, in-memory state)

`fastapi.testclient` against `create_app(repo=InMemoryRepo(), auth=AuthSettings("k", None))`,
a Kyiv weekday with a 10:00–11:30 busy block, five tasks (deep 90 min due 17:00, admin 30, learning
120 splittable, physical 45 pinned 14:00, deep 60), seed 7:

- `learn1` 11:45–13:45 `MO.wd.fatigued` (90-min busy run ended 15 min before — rule fires);
- `phys1` 14:00–14:45 `AF.wd.fresh` rationale `pinned`; `deep1` 15:00–16:30 before its deadline;
- `admin2` 16:45–17:15 **`is_experiment = true`, `propensity = 0.25`**, rationale `experiment`;
- `deep2` deferred (capacity: 24 ticks needed incl. buffers vs 21 workable after the pinned block);
- telemetry `solve_ms 22`, `literals 145`, `degradation null`, `rng_seed 7`.

Establishes the wiring only; the same assertions run as tests (`test_planner.py`, `test_api.py`).

## 4. Database

- `supabase db push` applied `20260827090000_p5_recsys_applied.sql` to the linked EU project;
  `packages/shared/src/database.ts` regenerated (+24 lines) and normalised.
- pgTAP `supabase/tests/p5_recsys_test.sql` (CI-only, no local Docker): table, composite PK,
  RLS on with zero policies, 42501 for `authenticated` and `anon`, closed `kind` vocabulary,
  erasure cascade from `auth.users`.
- `tests/test_repo_postgres.py` (CI db job, local Supabase): cells load/save, fallback prior for
  unknown users, bandit upsert round-trip, blend default, applied id-set idempotency, stored tuples
  exclude `excluded = true` rows.

## 5. Not verified in P5 (by design or pending)

- The deployed Space (⛔ owner creates it; `deploy-recsys.yml` needs `HF_TOKEN` + `HF_SPACE`);
  container timing; cold-start latency (NFR-R2) — all on the checklist.
- Integration with `plan-request` / `sync-resolve` / `attribute-rewards` (P6/P7) — the contract is
  pinned by `api.ts`; the reward-mapping side of H3 (writing `excluded = true`, emitting no row on
  displacement) is the edge functions' job and is tested there in P7/P8.
- River SGD step on blend weights (P7); MC propensities for TS traffic (P11).

## 6. Adversarial pass (fresh-context subagent, 2026-08-26)

**2 MAJOR / 11 MINOR / 7 NOTE — all MAJOR/MINOR fixed, each with a regression test.**

- **MAJOR 1 — top-m over chunk-only buckets** (`planner._draw`): a splittable ≤ 2 h task's ranking
  included buckets only a chunk could start in; drawn there, the unsplit experiment was INFEASIBLE
  and dropped (probe: 12/60 seeds), so the logged 0.25 was conditional on the draw — biased IPS/DR.
  Fixed (rankings = full-duration buckets; hard error on an empty restriction);
  `test_experiment_ranking_uses_only_full_duration_buckets` (40 seeds, 0 drops, top-m = the four
  reachable buckets).
- **MAJOR 2 — excluded correction never rebuilt** (`feedback.apply_feedback`): the one case that
  must purge evidence (a reward later marked ambiguous) was skipped. Fixed per specs/07 §5 ("any
  tuple"); `test_excluded_correction_triggers_the_rebuild`.
- MINOR (fixed): pin at a no-daypart hour → 500; off-grid pin floored; day-by-day reported
  FEASIBLE on all-UNKNOWN; d_min hard-coded in ticks on the 30-min rung; feature 11 > 1; older
  out-of-order tuple added undecayed; non-ASCII service key → 500; rate-limiter eviction keyed by
  request date; fallback-cell users marked applied without persistence (now 409); three separate
  write connections (now one transaction); A_m(x) not on the row (now `experiment_top_m`).
- NOTE (recorded, no change): coarse-rung φ semantics; slice selection by INFEASIBLE drops (P6
  persists `experiment_dropped`); the "≥ m buckets" eligibility rule yields few experiments on a
  plain 09–18 day (revisit.md — owner call); TS draw order (fixed anyway); 422 handler (removed);
  Blend float32 tolerance (relaxed).
- Reviewer's independent recomputation matched the code: F_τ on a hand-built W (incl. L2),
  g(0)/g(16)/g(32), the (C4) overlap coefficients, Sherman–Morrison vs `inv` (1.3e-15).
- Requirement verdicts after fixes: 1 traceability PASS · 2 propensity PASS (was FAIL on MAJOR 1)
  · 3 reward paths PASS (was PARTIAL on MAJOR 2) · 4 timing honesty PASS.
