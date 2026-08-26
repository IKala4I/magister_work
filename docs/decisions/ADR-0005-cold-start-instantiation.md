# ADR-0005 — Cold-start prior instantiation semantics (M5 rule, rMEQ presentation, skip rule, seed-cluster ids)

- **Date:** 2026-08-26
- **Status:** accepted
- **Phase:** P4
- **Spec anchors:** File 04 §3.1–3.4; specs/07 §3.6/§4.1; spec-conflicts M5, L7, L8
- **Decision rule applied:** thesis defensibility (standard citable method) → internal
  consistency → measurability → pragmatics

## Context

File 04 §3 fixes the cold-start math but leaves four implementation-level gaps that P4 had to
close: (1) spec-conflicts M5's "inside declared working hours" rule needed exact tie semantics;
(2) FR-02's "every answer skippable" is ill-defined for a _partially_ answered rMEQ; (3) the
rMEQ item wording/presentation was listed as unfixed in PLAN §4B; (4) `cluster_assignments.
cluster_id` is an int while the rMEQ seed classes are text. PLAN §4B promised proposed defaults
for (2)–(3) in specs/07 Appendix A, but Appendix A has no rows for them (recorded as
spec-conflicts L13) — so this ADR is where they are fixed.

## Decisions

1. **M5 in-hours rule (exact form).** A cell (category × daypart × day-type) counts as inside
   working hours iff a **strict majority** of that day-type's days (≥3 of 5 weekdays; **2 of 2**
   weekend days) have **≥50%** of the daypart's minutes overlapping that day's declared working
   hours. Boundary semantics: exactly 50% overlap qualifies the day; 1-of-2 weekend days is not
   a majority. Consequence (intended): a Saturday-only worker gets out-of-hours weekend priors
   (n₀ = 2) — their weekend pattern is genuinely mixed, and lower prior strength means TS
   explores it more, which is the spec's stated purpose for low n₀ (File 04 §3.3).
   Malformed/absent day entries contribute zero overlap and never error: a degraded profile
   yields weaker priors, not a failed onboarding. Weekday/weekend day sets are ISO (Sat/Sun
   weekend); locale-specific weekends are out of scope for v1.
2. **Partial survey = skipped survey.** The rMEQ (Adan & Almirall, 1991) and its parent MEQ
   (Horne & Östberg, 1976) publish no prorating rule for missing items; inventing imputation
   for a thesis-reported instrument is indefensible. A survey with ANY unanswered item is
   stored as `survey_skipped = true`, `rmeq_score = null`, `chronotype_class = 'INT'`
   (File 04 §3.1), with prior strength halved — which per spec-conflicts L8 IS the UC-01 A1
   "wider exploration budget" (ε never changes per user).
3. **rMEQ presentation.** The five items are MEQ items 1, 7, 10, 18, 19 with the published
   option structure and scores (5..1 / 1..4 / 5..1 / 5..1 / 6,4,2,0; sum ∈ [4,25]); wording is
   lightly paraphrased for a mobile planner (i18n keys `onboarding.rmeq.*`) without changing
   option boundaries or scoring, so the validated cutoffs (L7) remain applicable. Answers are
   radio cards; tapping a selected option deselects it (per-item skip). One scrollable screen;
   UC-01's "5 taps" holds.
4. **Schema-level consistency guards.** The rMEQ→class cutoff table is ALSO enforced as a
   `profiles` CHECK (`profiles_chronotype_matches_score`), making a class that contradicts its
   own score unrepresentable, plus `profiles_completed_requires_class` (a completed onboarding
   always carries a class). The CHECK branches jointly make "skipped survey with a stored
   score" unrepresentable.
5. **Seed-cluster ids.** `cluster_id` for `method='rmeq_seed'` is the ordinal of the class in
   the spec's table order: DM=0, MM=1, INT=2, ME=3, DE=4 (`chronotype_seed_cluster()` in SQL).
   ALS/k-means ids (P11) live in the same column distinguished by `method`.
6. **Prior version selection.** `instantiate_user_priors` copies from the **highest**
   `prior_cells.version` present, so post-P11 empirical-Bayes refreshes reach new users without
   touching the function; `beta_cells.prior_version` records which version seeded each cell.
   (P11 may tighten this to "highest _promoted_ version" via `model_registry` — noted in
   `docs/decisions/revisit.md` if it ever diverges.)
7. **Execution boundary (invariant 1).** Instantiation is a SECURITY DEFINER function fired by
   profile triggers (INSERT with `onboarding_completed_at`, or the UPDATE that first sets it);
   EXECUTE is revoked from `anon`/`authenticated`. All inserts are `ON CONFLICT DO NOTHING`
   (invariant 5: priors never overwrite evidence; re-instantiation is a no-op).

## Consequences

- Every constant is asserted against spec literals: pgTAP (`supabase/tests/p4_cold_start_test.sql`)
  checks the full 240-row v0 table against values generated independently by
  `scripts/gen-prior-cells-expected.mjs`, plus hand-computed α₀/β₀ for in/out/skip/weekend/
  majority/50%-boundary cases; jest (`rmeq.test.ts`) checks every class boundary.
- The honest answer to "where do the numbers come from" is structural: §3.2's table is a
  day-zero bootstrap, version 0 of an empirical-Bayes-refreshed object (File 04 §3.5), and the
  code records `prior_version` on every cell to keep that lineage reportable.
