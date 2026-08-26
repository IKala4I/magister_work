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
