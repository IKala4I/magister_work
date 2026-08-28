# ADR-0007 — RecSys service: solver encoding, exploration exactness, reward paths, and the Appendix A P5 parameters

- **Date:** 2026-08-26
- **Status:** accepted
- **Phase:** P5
- **Spec anchors:** File 04 §1.2–1.5, §2.3; specs/07 §3.2.1–3.2.6, §3.4.2, §3.5, §5, §7, Appendix A
  (every row marked P5); spec-conflicts M2, M3, M4, L2, L3, H1, H3 (+ M7, M8, L14–L16 added here)
- **Decision rule applied:** thesis defensibility (standard citable method; if inventing, say so)
  → internal consistency with specs/01–07 → measurability under File 06 → pragmatics

## Context

File 04 §1 fixes the bandit-weighted CP-SAT formulation and specs/07 fixes the learning machinery
and API, but a service cannot be built from them without closing implementation-level gaps:
how chunks are weighted, how slot-dependent features are evaluated per bucket, which tasks are
eligible for the ε-experiment so that p = ε/m is _exactly_ true, how the hint realizes the
anti-thrashing promise, and how the 1.5 s anytime cap behaves once measurements show presolve —
not search — is the binding constraint. Each Appendix A row marked P5 also needs its final value.

## Decisions

1. **Appendix A P5 rows — accepted as proposed** (`services/recsys/src/hourwell_recsys/params.py`,
   each constant tagged): ε = 1.0 encoded as **Bernoulli(ε) per plan** (one experiment placement
   per plan when an eligible task exists ⇒ logged p = ε/m = 0.25); m = 4 (spec-fixed);
   λ_s = 0.3, λ_f = 0.5; M_τ = 10·v_τ with **λ_d = 1** (Appendix A has no λ_d row — M_τ carries the
   scale, λ_d is the unit multiplier); γ_u = 0.5, η = 16 ticks; b = 1 tick (applied both as the
   effective-duration buffer and on both sides of fixed events, File 04 §1.2 "buffers");
   d_min = 2 ticks; L = 12, H_g = 8 for `deep` only (Appendix A "off for admin" — read as "deep
   only" since no other cap is stated); σ² = 0.25; α_ucb = 1.0; d = 17; /plan rate limit
   30/user/day (service-side defense in depth; the edge function's counter is the P6 authority).
2. **CP-SAT encoding.** Float weights scaled by 10⁴ to integers. Per unsplit task: a start
   variable over Domain(F_τ), presence literal, optional fixed-size interval of d_τ + b, weight via
   `AddElement(start, W_τ)`; capped-category (deep) tasks additionally carry start-domain literals
   because (C4) needs the overlap coefficient per start — exactly File 04's (C4) form, no
   reification. `AddNoOverlap` over all intervals. Chunks use `AddElement` for weight and for the
   workable run length (containment `s_j + b ≤ R[start_j]`), and a single `AddMultiplicationEquality`
   per chunk for weight × size.
3. **Chunks (C3).** Weight of a chunk = w_{τ,k}·s_j/d_τ (duration-proportional share; a literal
   reading of C3 would pay the full task weight per chunk — spec-conflicts L14). Σ_j s_j = d_τ·y_τ
   (equality; a subset of the spec's ≥ that also forbids over-scheduling). At most **MAX_CHUNKS = 4**
   chunks (any d_τ stays coverable; bounds the model). Observed consequence with λ_f = 0.5: a
   v = 1, q̂ = 0.5 task gains nothing from splitting (L15, revisit.md).
4. **φ and slot-dependent features.** A-priori occupancy for the fatigue rule and feature 17 =
   fixed events ∪ pinned tasks (the solver's own placements are unknown before the solve; the
   logged `context_bucket` is the plan-time bucket, so learning is consistent with logging).
   Slot-dependent features (urgency, preceding load) are evaluated at the bucket's representative
   tick k* = earliest feasible start in that bucket, so the bandit is queried once per (τ, c) as
   File 04 §1.1 requires; the stored `features` snapshot is exactly the vector the bandit scored.
5. **ε-experiment exactness.** Eligible = non-critical, unpinned, ≤ 2 h, **and ≥ m distinct
   feasible buckets** (otherwise "uniform over top-m" is not p = ε/m). The task is drawn uniformly
   (M2), the bucket uniformly from top-m by q̂ with ties broken by bucket id (deterministic set).
   The experiment task is solved **unsplit** so exactly one M-01 row carries the propensity.
   `propensity = ε/m` is a pure function of settings; the service **rejects** (422) requests whose
   ε or m differ from the constants (L16; H1 needs identical values across arms). If pinning the
   experiment makes the model infeasible, the plan is re-solved without it and no row is labelled.
6. **Beta cells.** Rewards enter as fractional Bernoulli evidence S += r, F += 1 − r (schema
   columns are `real`); decay is applied first as of the tuple's `attributed_at`; negative Δt
   (out-of-order delivery) clamps to 0. The cell a tuple belongs to is decoded from its feature
   snapshot's one-hot block (positions 2–7 daypart, 8 weekend).
7. **Anti-thrashing.** CP-SAT `AddHint` seeds the search but does not preserve ties (measured;
   spec-conflicts M7). The hinted start receives **one scaled objective unit** (1e-4 weight),
   below any meaningful estimate difference, so placements move only for a real gain.
8. **Confidence (FR-22 solidity)** = clip(1 − sd_q/0.5) with
   sd_q = √(w_E²·sd_cell² + w_B²·σ²·xᵀA⁻¹x) — the posterior sd of q̂ under the blend, normalised by
   the maximal sd of a [0, 1] variable. [INFERRED]
9. **/insights**: `ci` = Beta quantiles at (0.1, 0.9); affinities use the closed key
   `daypart_affinity` with a factor threshold of 1.15 over the category's mean; `adherence` stays
   empty until P9 (H2: PAR from facts only).
10. **Rationale vocabulary (FR-21)**: `pinned`, `experiment`, `deadline_pressure` (e^{−u/η} ≥ 0.5),
    `energy_peak` (cell mean ≥ 1.15 × category mean), `fresh_slot`, `earliest_feasible`,
    `best_available` — precedence in that order; the client renders sentences (P6).
11. **Solver time behaviour (measured 2026-08-26, M-series Mac, 12 cores — NOT the target
    container).** With the spec's encoding, 15-min week instances (50 tasks, 8–10·10³ start
    literals) were **presolve-bound**: CP-SAT stopped after presolve with UNKNOWN inside the
    1.5 s cap (probing over ~11k value literals). Decisions: `cp_model_probing_level = 0`,
    `symmetry_level = 0`; `num_workers = 2` (target box); the ladder degrades at a **practical
    threshold of 8·10³ literals** (spec 4·10⁴ kept as outer bound) _and_ escalates on an UNKNOWN
    outcome ("still hot"); the 1.5 s cap is a **plan-level budget** shared across rungs and days
    (0.5 s reserved for the next rung while one exists; 50 ms minimum slice). Measured after:
    day 12 tasks — OPTIMAL 20/20, solve median 70 ms, p90 145 ms; week 50 tasks — FEASIBLE 20/20,
    solve median 1.0 s, max 1.37 s, end-to-end p90 1.95 s. These numbers say nothing about the
    2 vCPU Space — that measurement is on the verification backlog (device-checklist "Service
    environment").
    **Addendum 2026-08-28 (measured on the deployment box, Oracle A1 2 pinned cores, ADR-0009):**
    day instance OPTIMAL 20/20, end-to-end p50 135 ms / p90 487 ms (NFR-P1 met with margin);
    week 50-task instance presolve-bound already at 3.6·10³ literals on the 15-min rung
    (UNKNOWN 19/20 under the Mac-fitted 8·10³). Sweep 8000/4000/3000/2000/1000 → FEASIBLE
    1/5/12/12/11 of 20 → **practical threshold re-fitted to 3·10³** (the box-specific value this
    item said to expect). Beyond the parameter: ≈ 40 % of 50-task week runs stay UNKNOWN on
    every rung on that box — the anytime contract returns partial plans; the product requests
    day horizons only. `p5-manual-verification.md` §2.1–2.3; thesis-corrections #37; revisit.md
    (week-horizon budget before P9).
12. **Auth, persistence, ownership.** Both credentials are accepted on every endpoint: a user JWT
    (ES256 via JWKS, aud `authenticated`, `sub` must equal `user_id` → 403 otherwise) or the
    `X-Service-Key` secret. Per-user state lives only in Postgres via the pooler; bandit state is
    initialised lazily (A = I, b = 0) and users without instantiated cells get a non-persisted flat
    prior (μ₀ = 0.5 at half strength — the unscored-survey semantics); the id-set for idempotent
    /feedback lives in the service-owned `recsys_applied_tuples` (no FK to recommendations by
    design). The service never instantiates cells (trigger owns that, ADR-0005) and never writes
    reward rows.
13. **/parse-preview** returns `category_guess = null` always (categories are form-edited, never
    NL-guessed — P3 decision); text is parsed and returned, never stored or scored (NFR-S3).
14. **state_version** increments once per /feedback batch that changed state and on every
    rebuild; the same version is written to all four category rows.

15. **Adversarial-pass amendments (2026-08-26).** (a) The experiment's top-m ranking is built
    over the buckets an _unsplit_ placement can occupy (full-duration starts) — chunk-only
    buckets had entered the set and caused silent drops (20 % on the probe), which would have
    made the logged 0.25 a conditional, biased propensity; `_apply_experiment` now fails hard on
    an empty restriction. (b) `correction: true` on ANY tuple — excluded ones included — triggers
    the rebuild (specs/07 §5 verbatim); the rebuild reads non-excluded rows only. (c) Pinned
    tasks keep their exact instant (tick span is the conservative cover); pins in a no-daypart
    hour are reported `no_feasible_start`, not a 500. (d) The day-by-day rung reports UNKNOWN when
    no day solved. (e) d_min is expressed in ticks of the rung actually solved (1 tick = 30 min on
    the coarse rung). (f) Feature 11 clips at 1 (§3.2.4 "components in [0, 1]"). (g) An
    out-of-order OLDER tuple is added pre-decayed by the time since it, so delivery order cannot
    change the posterior. (h) `X-Service-Key` is compared as bytes (non-ASCII → 401).
    (i) The rate limiter evicts by wall clock, never by request data. (j) `/feedback` for a user
    without instantiated cells is refused (409) instead of silently marking evidence applied.
    (k) State, cells and the id-set are written in one transaction. (l) `Assignment.experiment_top_m`
    carries A_m(x) for File 04 §2.2 replay — P6 must persist it with the recommendation row.
    (m) TS draws follow category order (same seed ⇒ same plan on every backend); internal
    `ValueError`s are no longer mapped to 422. Notes accepted without change: coarse-rung φ
    semantics differ slightly (rows carry `tick_minutes` in plan telemetry; P6 persists it);
    every INFEASIBLE-after-pin drop is a selection on the slice (P6 persists
    `experiment_dropped`, P11 reports the rate); the "≥ m feasible buckets" rule leaves few
    eligible tasks on a plain 09–18 day — a measurability concern for RQ4 raised in
    revisit.md for the owner.

## Consequences

- The propensity path is exact and testable end to end; the arm-A edge function (P6) must mirror
  the same primitive (uniform task, uniform top-m bucket, same ε and m) for H1 symmetry.
- Presolve, not search, bounds the 1.5 s cap on this model; the container measurement (backlog)
  decides the final practical threshold, and P6's fallback budget (1.9 s) must be calibrated
  against the measured end-to-end week p90.
- λ_f and the chunk-weight share are the two places where a literal spec reading was refined;
  both are recorded in spec-conflicts and thesis-corrections.
