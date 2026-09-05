# ADR-0008 — Plan E2E: experiment eligibility, arm A "heuristic + matched randomization", the plan-request edge function and the client plan flow

- **Date:** 2026-08-26
- **Status:** accepted
- **Phase:** P6
- **Spec anchors:** File 04 §1.2, §1.4, §2.2; File 06 §1.1, §2.2–2.3, §1.6; specs/07 §4.1, §5,
  Appendix A rows "/plan EF fallback budget", "plan triggers", "experiment eligibility";
  File 02 FR-20/21/22, UC-03, NFR-R2, NFR-P1, NFR-O1; spec-conflicts H1, M2, M8, L16
  (+ M9, L17–L21 added here); ADR-0007 §5, §11, §12, §15 (l)–(m)
- **Decision rule applied:** thesis defensibility (standard citable method; if inventing, say
  so) → internal consistency with specs/01–07 → measurability under File 06 → pragmatics

## Context

P5 delivered the learned engine; P6 must put a plan on the Today screen end-to-end and, at the
same time, build the study's baseline arm. spec-conflicts H1 (owner-approved 2026-08-24) makes
arm A "heuristic + matched randomization": the edge function's heuristic must run the SAME
ε-draw as the service — same eligibility, same ε and m, same badge, same logged propensity —
because the badge is what would otherwise unblind participants. Two owner decisions from the P5
report shape the phase: (1) relax experiment eligibility to |A_m(x)| ∈ {2, 3, 4} with the exact
per-row propensity p = ε/|A_m(x)|; (2) keep λ_f = 0.5 until P7. Nothing in P8 (sync) exists
yet, so the server holds no task rows; and the RecSys Space is not yet created, so the learned
path cannot be exercised live in this phase.

## Decisions

1. **Experiment eligibility (owner decision 1).** A task is eligible when it is non-critical,
   unpinned, ≤ 2 h and reaches at least **`EXPERIMENT_MIN_BUCKETS = 2`** distinct context
   buckets with an unsplit placement (F_τ over W, pinned occupancy ignored — as in ADR-0007
   §15 (a)). The drawn task's ranked set A_m(x) is its top-min(m, |A(x)|) buckets under the
   arm's ranking; the bucket is uniform over A_m(x) and the logged propensity is
   **p = ε/|A_m(x)|** — still a pure function of settings and the set size, never of the draw
   (M2). File 04 §2.2's replay argument holds per row because every row's draw is uniform over
   its own logged A_m(x) (persisted as `plans.telemetry.ef.experiment.top_m`, ADR-0007 §15 (l)).
   The rule is implemented once per side (`exploration.py`, `exploration.ts`) and pinned across
   the boundary by `params_test.ts` and the grid-parity fixture. **Measured effect**
   (`services/recsys/scripts/experiment_rate.py`, uniform durations 15–180 min, 30 % same-day
   deadlines, 10 % pinned): on a plain 09–18 weekday any task ≥ 60 min was ineligible under the
   strict rule (|A(x)| = 3); P(plan has ≥ 1 eligible task) with 3 tasks rises 0.57 → 0.86,
   with 5 tasks 0.76 → 0.96; on a heavy day (4 meetings, ~3.5 h busy) it rises 0.00 → 0.22–0.48
   (3–8 tasks). With ε = 1 and five weekday plans that is ≈ 4.3 (plain) / 1.1–2.4 (heavy)
   experiments per user-week before drops — the realistic rate File 06's MRT-slice power must
   use instead of "1 slot/day" (thesis-corrections #21; OSF freeze item).

2. **Arm A = "heuristic + matched randomization" (`supabase/functions/_shared/heuristic.ts`).**
   A deterministic list scheduler on the identical grid, F_τ, φ and feature snapshot (TypeScript
   mirrors of `grid.py`, `contexts.py`, `features.py`, `energy.py`, `exploration.py`; parity with
   the service pinned by a fixture the Python side generates and both test suites assert):
   (i) pinned tasks keep their instant — a pin overlapping an earlier pin is INFEASIBLE with an
   `unpin` option, as in the service; (ii) the matched ε-draw runs on the a-priori grid with
   the heuristic's own ranking — **earliest reachable bucket first**, ties by bucket id — and the
   drawn task is placed first inside its bucket; if pinned occupancy leaves no start there the
   draw is dropped and no row is labelled (the service's INFEASIBLE-after-pin drop,
   `experiment_dropped`); (iii) remaining tasks in "deadline-first, priority tiers" order —
   critical tasks (deadline inside the horizon) by Earliest-Deadline-First (Liu & Layland 1973;
   Dertouzos 1974), then the rest by value tier, deadline, duration, id — each at its earliest
   free start (Graham 1966 list scheduling), with greedy chunking (≥ d_min, ≤ MAX_CHUNKS, every
   chunk before the deadline) for splittable tasks that do not fit whole; (iv) no estimate
   exists: `q_hat`/`confidence` are NULL; rationale keys are the closed-vocabulary subset the
   heuristic can truthfully claim (`pinned`, `experiment`, `deadline_pressure`,
   `earliest_feasible`); `model_version = heuristic-p6.0`; `solver_status = HEURISTIC`;
   no FR-24 options beyond `unpin` (P9). [INFERRED: the PLAN names the ingredients, not the
   algorithm.] The DRAW is distribution-identical across arms (same eligible set on the a-priori
   F_τ, Bernoulli(ε), uniform task, uniform over top-min(m, |A|) of the arm's own ranking); the
   DROP rules are a strict subset of the service's (no start free of pinned occupancy in the
   drawn bucket vs. any INFEASIBLE), so drop _rates_ can differ by arm — P11 reports them per arm.

3. **The heuristic logs the SAME feature snapshot the learned engine would log.** File 04 §2.2
   replay evaluates candidate policies on the logged x, so arm-A rows must carry the vector the
   service computes: x is evaluated at the bucket's **representative tick k\*** (the earliest
   tick of full ∪ chunk starts in that bucket — `planner.py` rep_ticks / `estimates.py`), not at
   the placed tick, so every placement in a bucket shares one x (urgency and preceding load
   included); features 15–16 come from the user's `beta_cells` (user-scoped client, RLS "read
   own"; decayed posterior mirrored in `energy.ts` and pinned to `energy.py`), with the same
   flat prior as the service for users without cells (`cells_source` logged). The parity fixture
   is generated by the service's own `_prepare` and pins k\* and the full vector per (task,
   bucket), a pinned task included (adversarial finding, P6). Invariant 1 stays intact in
   substance: the client mirrors the numeric snapshot specs/07 §4.1 puts on the row (owner-
   readable), never the model state itself; the EF writes no state.

4. **Edge function `plan-request` (`supabase/functions/plan-request/`).** `verify_jwt = false`
   at the gateway and in-function verification with `auth.getClaims` (asymmetric project keys via
   JWKS; the legacy HS256 gateway check is not relied on). Reads go through the USER-scoped client
   (RLS proves nothing beyond the user's own rows is needed); writes (`plans`,
   `recommendations`) through the service role. Flow: 405/401/400 → rate limit
   (`PLAN_RATE_LIMIT_PER_DAY` = 30 per rolling 24 h → 429) → context (404 without a completed
   profile) → `no_working_window` (ADR-0019, 2026-09-05: the plan day has no working window —
   no plan row, no rate-limit consumption) → `empty_inbox` (no plan row, no rate-limit
   consumption — UC-03 A2) → engine
   selection: **arm A (from `study_assignments` covering `plan_date`) never calls the service**;
   otherwise `/plan` with `X-Service-Key` under the remaining share of
   `PLAN_FALLBACK_BUDGET_MS` = 1.9 s (Appendix A), and on timeout / network / HTTP / invalid
   response / missing secrets the SAME heuristic answers with `engine = heuristic` and an
   explicit `telemetry.ef.reason = fallback:<kind>` — so outage days are distinguishable from
   arm-A days (File 06 excludes outage user-days) — plus a fire-and-forget `/healthz` wake probe
   (`EdgeRuntime.waitUntil`) so the next request finds the Space warm. The budget is calibrated
   for the **day** horizon (P5 day p90 170 ms on a Mac); a week plan (M8: ~1.5–2 s in the
   service) would need a larger budget or an asynchronous path — no v1 client screen requests
   `week` (revisit.md). Every assignment field lands on the recommendation row (`propensity`
   M-01 included); per-plan experiment data (`top_m`, `dropped`), degradation, tick size and
   seed live in `plans.telemetry` (`ef`, `service`, `request`, `unplaced`, `infeasible`; keys
   documented in the P6 migration comment). A new plan supersedes the still-`shown` rows of
   earlier plans for the same date/horizon (`expired`, never deleted). The previous plan for
   the date feeds `previous_assignments` (AddHint); client-`pinned` blocks feed `pinned_start`.
   M-01's `propensity` column becomes `double precision` (spec: `real`) because 1/3 does not
   round-trip in float4 — the live smoke caught it (spec-conflicts L22). Input bounds
   [INFERRED]: `plan_date` must be a calendar date within [today − 1, today + 7] in the
   profile's zone and `now` within ±24 h of the server clock (a lying clock would make past
   ticks workable). The two PostgREST writes are not one transaction: a failed recommendations
   insert deletes the plan row again (compensation); a single-statement RPC is a P8 candidate
   (revisit.md). The rate-limit count and the supersede snapshot are read-then-act — two truly
   concurrent requests could both pass at 29 or both leave `shown` rows; the client's
   single-flight guard makes that unreachable from the app (HANDOFF gotcha).

5. **Client plan flow (bridge until P8).** Because no push engine exists before P8 and the EF
   plans from the SERVER's tasks (specs/07 §5), `src/sync/taskPush.ts` drains pending
   `task_upsert`/`task_delete` ops before every request by upserting the current local rows
   through RLS (same pattern as the P4 profile bridge; last-write-wins; P8 replaces it).
   The response is mirrored into SQLite in ONE transaction (`src/db/plans.ts`): the new local
   `plans` mirror (column-for-column) + recommendation rows + superseded rows → `expired` +
   task status mirror through the outbox (placed ⇒ `scheduled`; previously scheduled but now
   unplaced ⇒ `inbox` — File 02 §3.5 "Inbox = unscheduled tasks") + one `recommendation_shown`
   event per block with `model_version`, `engine`, `is_experiment`, `propensity`, bucket and
   confidence (NFR-O1; never task text). A `plan_requested` analytics event carries the
   client-measured end-to-end time (NFR-P1) and an outcome that separates `fallback` from
   `arm_a`.

6. **Plan triggers (Appendix A "06:00 local + first open") are lazy** (invariant 7): the app
   requests a plan for the current calendar day when it is opened or foregrounded after 06:00
   and that day has no plan yet (`trigger = first_open` when the user has never had a plan,
   `new_day` otherwise — decided against the most recent plan of ANY date). Before 06:00 nothing
   is auto-requested: the previous plan day's plan stays on screen (its own day is over, planning
   it would place nothing — adversarial finding). Manual "Plan my day / Re-plan" always plans the
   current calendar day and bypasses the dedup; one request runs at a time; the rate limit and
   offline state surface as calm notices. The 06:00 nudge itself is P10's notification.

7. **Rendering.** FR-22 confidence = solidity needs a number; heuristic rows have none, so the
   stored column stays NULL and the client renders them at a constant
   `NULL_CONFIDENCE_RENDER = 0.38` — the **measured** day-0 confidence of the learned engine
   under the flat prior and a fresh bandit (TS, 20 seeds × 6 tasks, n = 98: median 0.38, p25
   0.31, p75 0.42; the first draft said 0.7 from a back-of-envelope estimate that ignored the
   bandit term — adversarial finding) — with no percentage in the accessibility label. The NFR-R2 "labeled as such" notice is shown ONLY for fallback plans
   (`ef.reason` starts with `fallback:`), never for arm-A plans — the label would otherwise
   unblind the study (L17). The timeline is a row list with a time gutter and a "Now" marker
   rather than a pixel-proportional canvas [INFERRED]: rows grow with content, so 200 % font
   scale and long rationales never overlap (NFR-A2) and each block is one accessible element
   (NFR-A1); gaps render as capped proportional spacers.

8. **λ_f = 0.5 stays** (owner decision 2); retuning lands in P7 with observed q̂ scales
   (revisit.md entry kept open).

## Consequences

- The randomized slice now spans both arms with one eligibility rule, one propensity formula
  and one logged A_m(x) per row — the OPE substrate File 06 §1.1 promises, at a measured rate
  the pre-registration can quote. Cost: the ranking that defines A_m(x) differs by arm (q̂ vs.
  earliest-reachable), so slice rows carry the arm and P11 must condition on it.
- Arm A is a describable, citable baseline (EDF + list scheduling) rather than a black-box
  rule engine; the thesis text must say so (thesis-corrections #8, #22).
- The heuristic mirrors ~600 lines of service logic in TypeScript. Drift is caught by the
  parity fixture (both suites) and the params pin; any change to grid/φ/features on either side
  must regenerate the fixture (`uv run python scripts/gen_grid_parity.py`).
- The task-push bridge is temporary and last-write-wins; P8 must replace it with op replay and
  remove `taskPush.ts` (HANDOFF gotcha).
- Verification limits this phase: pgTAP ran in CI only (no local Docker); the learned path and
  the NFR-P1 warm p95 wait for the HF Space (⛔ owner action); the fallback path is measured
  against the hosted edge function instead (`docs/verification/p6-manual-verification.md`).
