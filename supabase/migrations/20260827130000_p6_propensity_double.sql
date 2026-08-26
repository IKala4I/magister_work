-- P6 — M-01 `recommendations.propensity` becomes double precision.
--
-- Why: under the P6 eligibility rule (ADR-0008 §1) the exact per-row propensity is ε/|A_m(x)|
-- with |A_m(x)| ∈ {2, 3, 4}; 1/3 is not representable in float4 (stored as 0.33333334, a
-- relative error of 6·10⁻⁸ that then rides into every 1/p weight). "Exact" (File 04 §1.4, M-01)
-- should mean exact to double precision like the rest of the numeric pipeline. The MC-backfilled
-- propensities (File 04 §2.3, P11) are doubles too. The CHECK is recreated unchanged.
alter table public.recommendations
  alter column propensity type double precision;
comment on column public.recommendations.propensity is
  'M-01: logging-policy propensity. Exact (= epsilon/|A_m(x)|, |A_m(x)| in {2,3,4} — ADR-0008 §1) on the randomized slice; MC-approximated for TS traffic; NULL until attributed. double precision so 1/3 round-trips (P6).';
