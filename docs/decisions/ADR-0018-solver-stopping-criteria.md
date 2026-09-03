# ADR-0018 — Solver stopping criteria under the plan budget: CP-SAT relative gap limit + a no-improvement early stop, with search-trajectory telemetry

- **Date:** 2026-09-03
- **Status:** **accepted** — owner decision 2026-09-02 on the levers (gap limit / early stop
  **yes**; bigger fallback budget **no**; VM co-location **no**; parallel context reads **only
  if cheap**); parameter values, mechanism and telemetry are technical and decided here.
- **Phase:** hardware pass (post-P12), Android day 3
- **Spec anchors:** File 04 §1.5 (anytime cap, degradation ladder, "meeting NFR-P1 on 2 vCPU");
  Appendix A (`solver time cap` SPEC-FIXED 1.5 s; `/plan EF fallback budget` 1.9 s);
  ADR-0007 §11 (plan-level budget, 0.5 s ladder reserve, probing/symmetry 0); ADR-0009 (the
  box); `docs/decisions/revisit.md` (2026-09-02 entries: measured shape, owner decision);
  day-2 notes "Plan-budget sweep"; day-3 notes (`android-20260903-1020/notes.md`).

## Context

**What was measured before this decision (day 2, 45-request sweep + the device series).** The
1.9 s fallback budget of `plan-request` is structurally consumed: ≈ 0.43 s round trip
function→VM, 0.45–0.9 s of function work outside the call, and a solver slice of **1.0 s**
(1.5 s cap − 0.5 s ladder reserve). Whenever the first rung ran to its slice the request became
a coin flip against the budget: 1/10 timeouts in the day-2 device series, 1/1 on the evening
full-day plan, 1/10 again in the day-3 "before" series (9 of the other 9 FEASIBLE at 1001–1007 ms).

**Why the slice was burnt — reproduced locally from the device's own data (day 3).** The
owner's inbox is 15 `admin` tasks of value 2, ten of 30 min and five of 45 min, two with
deadlines — an instance where most tasks are interchangeable. Rebuilt with the real prior cells
and 8 previous assignments (`probe2.py`/`probe4.py` in the day-3 evidence folder):

| what                                | result (24 solves, 12 seeds × fresh/re-plan, Mac)                          |
| ----------------------------------- | -------------------------------------------------------------------------- |
| status at the 1.0 s slice           | FEASIBLE **24/24** (never OPTIMAL)                                         |
| first solution                      | 10–11 ms                                                                   |
| last improving solution             | p50 0.054 s · p90 0.206 s · max 0.298 s                                    |
| relative bound gap at the cap       | **0.38–1.21** (CP-SAT definition `                                         | O−B | / max(1, | O   | )` on the scaled objective) |
| inter-improvement interval          | p50 1 ms · p90 25 ms · p95 55 ms · max 153 ms (235 improvements)           |
| `symmetry_level=2`, `+probing 1`    | no change — 12/12 at the cap                                               |
| `relative_gap_limit=0.05`           | no change — 12/12 at the cap (the bound is 40–120 % above the incumbent)   |
| no-improvement window 0.2 s / 0.3 s | 228–509 ms / 323–610 ms; **objective identical to the 1.0 s run on 12/12** |

So this is an **optimality-proof stall**: the incumbent is found in tens of milliseconds and
the LP bound of the element-channelled objective never closes. A gap limit alone — the lever
named in the owner decision — would have changed nothing on this instance class; the early stop
is the half of that decision that works, and the gap limit stays because it is the standard,
citable criterion for the instances whose bound does close.

**Objective loss vs. window (from the 24 recorded trajectories; "stop" = last improvement +
window, the objective then vs. the 1.0 s objective):**

| window (Mac) | ≈ window on the box (×3.5) | mean stop | max stop | mean loss | max loss | lossy solves |
| ------------ | -------------------------- | --------- | -------- | --------- | -------- | ------------ |
| 0.050 s      | 0.18 s                     | 0.087 s   | 0.161 s  | 0.30 %    | 4.41 %   | 11 / 24      |
| 0.075 s      | 0.26 s                     | 0.128 s   | 0.237 s  | 0.20 %    | 4.41 %   | 6 / 24       |
| 0.100 s      | 0.35 s                     | 0.166 s   | 0.306 s  | 0.01 %    | 0.30 %   | 4 / 24       |
| 0.150 s      | 0.53 s                     | 0.227 s   | 0.448 s  | 0.01 %    | 0.30 %   | 1 / 24       |
| 0.200 s      | 0.70 s                     | 0.279 s   | 0.498 s  | 0         | 0        | 0 / 24       |

**Box vs. Mac.** The deployment box (Oracle A1, 2 pinned cores) solved the sweep's clean
12-task / 14-task full-day instances in 61–62 / 277–285 ms; this Mac solves the same shapes in
15–32 / 22–98 ms (median 24 / 73) — a **2.5–4× slowdown**, so box-scaled intervals are the Mac
ones × 3.5 (used above), × 4 at worst.

**Scale of the "loss".** The objective is one Thompson posterior sample (File 04 §1.4): across
seeds the same instance scores 5.6–19.2 weight units. A truncation loss of ≤ 0.3 % (≤ 4.4 % in
the worst seed of 24 at the shorter windows) is an order of magnitude inside that sampling
spread — the plan is a sample either way.

## Decision

1. **`relative_gap_limit = 0.01`** (`CPSAT_RELATIVE_GAP_LIMIT`, Appendix A row "relative gap
   limit"). CP-SAT's own criterion (`sat_parameters.proto`: relative gap `|O−B| / max(1,|O|)`,
   default 0.0 = off; when it fires the status reads OPTIMAL and `best_objective_bound` shows the
   true gap — recorded in telemetry). 1 % is far below the sampling spread above; it ends the
   last proof steps on instances whose bound closes and is inert on the stall class (measured).
2. **No-improvement early stop, window 0.3 s** (`SOLVER_STALL_WINDOW_S`, Appendix A row
   "no-improvement window"): once a solution exists, the search ends when no better one has
   arrived for 0.3 s. Mechanism (`solver._EarlyStop`): a solution callback records improvement
   times; a watchdog thread calls `CpSolver.stop_search()` (asynchronous, lock-guarded in
   ortools 9.15.6755 — docs/versions.md) because CP-SAT invokes the callback only on improving
   solutions. Rule for the value: **≥ the 95th percentile of the box-scaled inter-improvement
   interval** (0.19 s at ×3.5, 0.22 s at ×4) with margin, i.e. the window ends only waits that
   are longer than 19 of 20 observed waits between improvements — and, by the loss table, it
   sits on the ≤ 0.3 % row (0.1 s Mac-equivalent). Expected box behaviour on stall instances:
   solve ≈ last improvement (p50 0.19 s, p90 0.72 s box-scaled) + 0.3 s → **p50 ≈ 0.5 s**, p90 at
   the 1.0 s slice; service call ≈ 0.43 s + that. The same criterion is the standard "unimproved
   time limit" termination of anytime/metaheuristic solvers (e.g. OptaPlanner/Timefold
   `unimprovedSecondsSpentLimit`); CP-SAT has no built-in parameter for it, hence the watchdog.
3. **Search-trajectory telemetry on every plan** (`Telemetry.early_stop`, `n_solutions`,
   `last_improvement_ms`, `max_improvement_gap_ms`, `objective_bound`, `gap`; persisted in
   `plans.telemetry.service`) — the evidence for re-pinning the window from the box's own
   distribution (rule: if the box's `max_improvement_gap_ms` p95 over a week of plans exceeds
   the window, raise the window to it) and for the thesis figure on proof stalls. Day-by-day
   solves aggregate: bound and gap add up only when every day reported one; timing fields take
   the worst day.
4. **Edge function:** the rate-limit count and the context reads run concurrently
   (`Promise.all`) — one database round trip fewer before the service call; the 429 check still
   precedes any planning. This is the "only if cheap" lever: five lines, tests unchanged.
5. **Rejected per the owner decision:** raising `PLAN_FALLBACK_BUDGET_MS`; co-locating the VM
   with the function region. Rejected on measurement: `symmetry_level`/probing changes (no
   effect on the stall), a larger gap limit (meaningless against a loose bound).
6. **Status and reproducibility semantics.** An early-stopped solve reports FEASIBLE (the
   ladder treats it as done; only UNKNOWN escalates). The seed reproduces the model exactly; the
   stop time is wall-clock, the same class of non-determinism the 1.5 s anytime cap already had
   (FEASIBLE at the cap). ADR-0007 §7's stability bonus (1 scaled unit) can be overridden by a
   stop before the tie is resolved — accepted; the bonus was never a hard guarantee.

## Consequences

- **Fallback rate** — re-measured today with the same instruments (device "after" series and
  `hw-plan-budget-sweep.mjs 2`); numbers in the day-3 notes and the revisit entry. Filled in
  below once the rollout served the new build.
- **What the thesis reports:** the measured shape (round-trip floor, function overhead, 1.0 s
  slice, proof stalls on interchangeable-task inboxes) as a result; the two stopping criteria as
  the deployment's anytime policy with the loss table above; NFR-P1 as a measured requirement
  (thesis-corrections, day 3).
- **Re-pin rule** in Decision 3; the window is box-specific like `PRACTICAL_LITERAL_THRESHOLD`.
- **Exact alternative kept for later** (revisit.md): symmetry-breaking constraints among
  interchangeable tasks (lexicographic start order per (category, duration, value, deadline)
  class) could let the proof close instead of stopping it — a model change, not a parameter.
- Appendix A gains two rows; `api.ts` regenerated (six telemetry fields; the edge function only
  checks that `telemetry` is an object, the client stores it as JSON).

## Measured after the rollout (2026-09-03)

_To be filled from the after-series and the sweep re-run._
