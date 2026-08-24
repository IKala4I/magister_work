-- M-01 — recommendations.propensity (File 03 §4; File 04 §1.4/§2)
-- Exact ε/m written at plan time for the randomized slice; NULL for TS traffic until the
-- nightly Monte-Carlo job (K = 32 scored samples, File 04 §2.3) back-fills the approximation.
alter table public.recommendations add column propensity real
  check (propensity is null or (propensity > 0 and propensity <= 1));

comment on column public.recommendations.propensity is
  'M-01: logging-policy propensity. Exact (= epsilon/top_m) on the randomized slice; MC-approximated for TS traffic; NULL until attributed. Substrate for unbiased OPE (File 04 §2).';
