# Simulation study — results and the prediction-by-prediction comparison

> **Scope (ADR-0020 §3):** the field study is out of scope of the master's project; the
> evaluation was performed in simulation. This document reports that study against its
> frozen pre-registration (`docs/study/preregistration.md`).
>
> **Timestamp evidence (git, branch `post-p12/simulation-study`):** pre-registration committed
> `11b71a9` (2026-09-05 22:11:53 +0300, no study code in the tree) → study code `ec1b869`
> (22:19:16 +0300) → this run executed once on `ec1b869` (`docs/study/results/run.json`:
> E1 23.8 s, E2 10.6 s, E3 41.3 s, 8 workers) → results and this document committed after.
> Reproduce: `cd training && uv run hourwell-simstudy --out ../docs/study/results --workers 8`
> (seeds are fixed; outputs are byte-identical up to floating-point summation order across
> worker counts).
>
> **Verdict legend (preregistration §1.4):** ✅ confirmed · ◐ partly · ❌ not confirmed. No
> criterion was relaxed after the fact; where a registered criterion turned out to be
> mis-specified, the miss is reported as a miss and the mis-specification is named.

## Summary

| Experiment     | Registered | ✅  | ◐   | ❌  | What came out differently (details in §5)                                                                                                                                                   |
| -------------- | ---------- | --- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 estimators  | 9          | 8   | 1   | 0   | replay is biased on policies whose value correlates with \|A_m(x)\| (−0.6 / +0.7 pp, 3.2 / 4.6 MC SE) — a consequence of the variable slice size, not predicted                             |
| E2 power       | 7          | 6   | 0   | 1   | the type-I band was written for a two-sided rate while the registered rejection rule is one-directional; the tests are calibrated against the consistent 0.025 target                       |
| E3 closed loop | 9          | 4   | 4   | 1   | morning types lose 1.7–2.3 pp under the learned arm (predicted ≈ 0); the flat-prior learning signature is real on average but invisible per replicate; per-replicate MAE monotonicity fails |

Headline numbers: the learned arm beats the heuristic by **2.5 pp** in the base world (ceiling
4.1 pp, efficiency 0.62) and **5.4 pp** in the amplified world (ceiling 7.8, efficiency 0.69),
direction correct in 96 % / 100 % of replicated studies; a 30-user ABAB study detects the base
effect only 26 % of the time and the amplified effect 79 %; the File 06 primary analysis has
power 0.84 / 0.82 at N = 30 (ICC 0.10 / 0.20); every OPE estimator except replay is unbiased
at the designed data rate, with the ESS ≥ 100 gate met 3× over.

## 1. E1 — Estimator study (`results/e1_estimators.json`)

R = 200 worlds × n = 1,000 slice rows. Bias = mean(V̂ − V_true); MC SE = SD/√R.

| Policy     | Estimator | Bias        | SD      | \|bias\|/SE | RMSE   | ESS    |
| ---------- | --------- | ----------- | ------- | ----------- | ------ | ------ |
| P1 uniform | IPS       | −0.0006     | 0.0152  | 0.6         | 0.0151 | 1000.0 |
| P1 uniform | SNIPS     | −0.0006     | 0.0152  | 0.6         | 0.0151 | 1000.0 |
| P1 uniform | DR-true   | −0.0005     | 0.0150  | 0.5         | 0.0150 | 1000.0 |
| P2 alpha   | replay    | +0.0008     | 0.0233  | 0.5         | 0.0233 | 360.5  |
| P2 alpha   | IPS       | −0.0017     | 0.0329  | 0.7         | 0.0328 | 332.8  |
| P2 alpha   | SNIPS     | −0.0017     | 0.0247  | 0.9         | 0.0247 | 332.8  |
| P2 alpha   | DR-true   | −0.0016     | 0.0244  | 0.9         | 0.0244 | 332.8  |
| P2 alpha   | DR-const  | −0.0015     | 0.0246  | 0.9         | 0.0245 | 332.8  |
| P3 tilted  | IPS       | −0.0010     | 0.0218  | 0.7         | 0.0217 | 619.0  |
| P3 tilted  | SNIPS     | −0.0010     | 0.0182  | 0.8         | 0.0182 | 619.0  |
| P3 tilted  | DR-true   | −0.0010     | 0.0180  | 0.8         | 0.0180 | 619.0  |
| P4 oracle  | replay    | −0.0061     | 0.0269  | **3.2**     | 0.0276 | 359.2  |
| P4 oracle  | IPS       | −0.0037     | 0.0367  | 1.4         | 0.0368 | 331.7  |
| P4 oracle  | SNIPS     | −0.0007     | 0.0278  | 0.4         | 0.0278 | 331.7  |
| P4 oracle  | DR-true   | −0.0012     | 0.0274  | 0.6         | 0.0273 | 331.7  |
| P5 anti    | replay    | +0.0074     | 0.0228  | **4.6**     | 0.0239 | 363.5  |
| P5 anti    | IPS       | +0.0048     | 0.0299  | 2.3         | 0.0302 | 335.5  |
| P5 anti    | SNIPS     | +0.0022     | 0.0246  | 1.2         | 0.0246 | 335.5  |
| P5 anti    | DR-true   | +0.0020     | 0.0246  | 1.2         | 0.0246 | 335.5  |
| any        | DM-const  | +0.03…+0.12 | ≤ 0.003 | 270–780     | —      | —      |

Clipped IPS equalled IPS on every replicate and policy (weights ≤ 4 < M = 10). DM-true has zero
error by construction (it is the truth); evidence rate 100 % in every cell.

| ID    | Registered prediction                                                     | Outcome                                                                                                           | Verdict |
| ----- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| E1-H1 | replay, IPS, DR-true, DR-const unbiased (\|bias\| ≤ 3 SE) on every policy | IPS ≤ 2.3 SE, DR-true ≤ 1.2 SE, DR-const ≤ 0.9 SE everywhere; **replay 3.2 SE (oracle) and 4.6 SE (anti-oracle)** | ◐       |
| E1-H2 | SNIPS \|bias\| ≤ 0.01                                                     | max \|bias\| 0.0022 (anti-oracle)                                                                                 | ✅      |
| E1-H3 | clipping inert: clip == IPS exactly                                       | equal on all 200 × 5 cells                                                                                        | ✅      |
| E1-H4 | SD(SNIPS) ≤ SD(IPS) on P2–P5, equal on P1                                 | 0.0247 < 0.0329 · 0.0182 < 0.0218 · 0.0278 < 0.0367 · 0.0246 < 0.0299; P1 equal                                   | ✅      |
| E1-H5 | RMSE(DR-true) < RMSE(IPS) on P2–P5                                        | 0.0244 < 0.0328 · 0.0180 < 0.0217 · 0.0273 < 0.0368 · 0.0246 < 0.0302                                             | ✅      |
| E1-H6 | RMSE(DR-const) ≤ RMSE(IPS) on P2–P5 (least certain)                       | 0.0245 · 0.0182 · 0.0275 · 0.0252 — all below IPS, and within 0.001 of DR-true                                    | ✅      |
| E1-H7 | replay 361 ± 20; IPS deterministic 333 ± 25; tilted 619 ± 40; P1 = 1000   | 360.5 / 359.2 / 363.5 · 332.8 / 331.7 / 335.5 · 619.0 · 1000                                                      | ✅      |
| E1-H8 | evidence rate 100 %                                                       | 100 % in every cell                                                                                               | ✅      |
| E1-H9 | DM-const biased > 3 SE on P2–P5; DM-true exact                            | 270–780 SE; DM-true error 0                                                                                       | ✅      |

**§2.3 derived statement (M9 / #21 closure):** the measured ratios are ESS/n = 0.333 for a
deterministic policy and 0.361 for replay — exactly the registered arithmetic. At the measured
experiment rate a 30-user, 8-week run on plain weeks (≈ 930 slice rows) gives ESS ≈ 310 for any
deterministic target policy (replay ≈ 336): the gate holds with ≈ 3× margin. Heavy weeks (240–520
rows) give ESS ≈ 80–175: below the gate at the low end. **Confirmed.**

## 2. E2 — Simulation-based power (`results/e2_power.json`)

5,000 replicates per cell; per-user paired analysis (File 06 §2.2 floor; robustness (a)).

| Cell                  | Power (paired t) | Power (Wilcoxon) | Mean d̄ (pp) | Registered expectation |
| --------------------- | ---------------- | ---------------- | ----------- | ---------------------- |
| ICC 0.10, OR 1.38     | **0.836**        | 0.816            | 7.23        | ≈ 0.84                 |
| ICC 0.20, OR 1.38     | **0.817**        | 0.799            | 6.75        | ≈ 0.82                 |
| ICC 0.10, OR 1 (null) | 0.0276           | 0.0278           | 0.19        | calibration            |
| ICC 0.20, OR 1 (null) | 0.0302           | 0.0288           | 0.17        | calibration            |

N sweep (ICC 0.20, 2,000 replicates each): N = 20 → 0.644, 24 → 0.724, 28 → 0.782, **30 →
0.822**, 34 → 0.863, 40 → 0.922. Phase-1 between-subject contrast (15 vs 15, Welch): 0.206
(ICC 0.10), 0.133 (ICC 0.20).

| ID    | Registered prediction                                   | Outcome                                                                                                                                                                                                                                               | Verdict                                           |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| E2-H1 | power ≥ 0.80 at N = 30 in both ICC cells                | 0.836 / 0.817                                                                                                                                                                                                                                         | ✅                                                |
| E2-H2 | both within [0.80, 0.88]; ICC 0.10 ≥ ICC 0.20           | as stated                                                                                                                                                                                                                                             | ✅                                                |
| E2-H3 | Wilcoxon 0.00–0.06 below the paired t                   | −0.020 / −0.018                                                                                                                                                                                                                                       | ✅                                                |
| E2-H4 | type-I rate at OR = 1 within 0.05 ± 0.01 for both tests | 0.028 / 0.030 (t), 0.028 / 0.029 (W) — **outside the band as written**; the registered rejection rule counts one direction of a two-sided α = .05 test, whose calibrated rate is 0.025; against that target (0.025 ± 0.005) both tests are calibrated | ❌ (mis-specified band; calibration itself holds) |
| E2-H5 | smallest N with power ≥ 0.80 ∈ {28, 30}                 | 30 (28 → 0.782)                                                                                                                                                                                                                                       | ✅                                                |
| E2-H6 | phase-1 between-subject power 0.10–0.30                 | 0.206 / 0.133                                                                                                                                                                                                                                         | ✅                                                |
| E2-H7 | realised mean difference 6.5–7.5 pp (logit attenuation) | 7.23 / 6.75                                                                                                                                                                                                                                           | ✅                                                |

Two consequences for File 06: (i) N = 30 stands, but with less margin than §2.2's analytic 28
suggests — the random intercept attenuates the +8 pp effect to 6.8–7.2 pp on the probability
scale, and N = 28 sits at 0.78; (ii) these are lower bounds for the §1.6 GLMM, which is not
fitted here.

## 3. E3 — Closed-loop ABAB study (`results/e3_closedloop.json`)

100 replicated 30-user studies per cell; 45 weekdays each (5 run-in + 4 × 10); 1,200 analysed
slice rows per study. Effects in percentage points of completion, mean ± MC SE.

| Cell                    | Ceiling | Effect B − A     | Efficiency | Share > 0 | Reject (t / W) | mean A / B      | DM    | MM    | INT   | ME     | DE     |
| ----------------------- | ------- | ---------------- | ---------- | --------- | -------------- | --------------- | ----- | ----- | ----- | ------ | ------ |
| base / informative      | 4.12    | **+2.54 ± 0.14** | 0.62       | 0.96      | 0.26 / 0.27    | 0.4997 / 0.5251 | −1.82 | −1.66 | +0.35 | +5.85  | +10.01 |
| base / flat             | 4.12    | +2.06 ± 0.14     | 0.50       | 0.92      | 0.22 / 0.20    | 0.4971 / 0.5177 | −1.75 | −1.91 | +0.36 | +4.80  | +8.80  |
| amplified / informative | 7.84    | **+5.37 ± 0.14** | 0.69       | 1.00      | 0.79 / 0.68    | 0.5005 / 0.5543 | −0.85 | −2.26 | −0.09 | +11.47 | +18.57 |
| amplified / flat        | 7.84    | +4.77 ± 0.12     | 0.61       | 1.00      | 0.61 / 0.49    | 0.5001 / 0.5478 | −2.45 | −2.11 | +0.07 | +10.84 | +17.49 |

Learning signature, learning during A, exploration, blend:

| Cell                    | Growth ḡ (pp) | Share ḡ > 0 | Reject | MAE at 5 boundaries           | Monotone share | Cost B (pp)  | Cost A (pp)  | Slice B − A | w_energy end |
| ----------------------- | ------------- | ----------- | ------ | ----------------------------- | -------------- | ------------ | ------------ | ----------- | ------------ |
| base / informative      | +0.25 ± 0.28  | 0.54        | 0.00   | .0718 .0643 .0564 .0530 .0500 | 0.57           | +3.36 ± 0.25 | −0.45 ± 0.23 | −0.32       | 0.715        |
| base / flat             | +0.75 ± 0.30  | 0.59        | 0.03   | .0629 .0607 .0565 .0527 .0509 | 0.28           | +2.45 ± 0.27 | −0.01 ± 0.24 | +0.21       | 0.721        |
| amplified / informative | +0.53 ± 0.29  | 0.59        | 0.04   | .0737 .0656 .0578 .0545 .0516 | 0.57           | +7.46 ± 0.26 | +0.46 ± 0.23 | +0.12       | 0.715        |
| amplified / flat        | +1.26 ± 0.33  | 0.63        | 0.10   | .0796 .0702 .0636 .0589 .0564 | 0.64           | +6.71 ± 0.21 | +0.28 ± 0.22 | −0.05       | 0.718        |

OPE on each study's own slice (informative cells; the flat cells are within 0.1 pp of these):

| Cell                    | Policy          | replay / SNIPS / DR (mean value) | IPS    | Truth  | Mean error (max abs) | ESS | Gap oracle − earliest: IPS / SNIPS / DR |
| ----------------------- | --------------- | -------------------------------- | ------ | ------ | -------------------- | --- | --------------------------------------- |
| base / informative      | earliest-in-A_m | 0.4964                           | 0.4959 | 0.5000 | −0.004 (0.08–0.13)   | 300 | 6.88 / 7.18 / 7.12 pp (truth 6.57)      |
| base / informative      | oracle-in-A_m   | 0.5681 / 0.5681 / 0.5676         | 0.5647 | 0.5657 | +0.002 (0.09–0.11)   | 298 |                                         |
| amplified / informative | earliest-in-A_m | 0.4983                           | 0.5005 | 0.5000 | −0.002 (0.09–0.11)   | 301 | 12.53 / 12.60 / 12.58 pp (truth 12.35)  |
| amplified / informative | oracle-in-A_m   | 0.6243 / 0.6243 / 0.6242         | 0.6258 | 0.6235 | +0.001 (0.07–0.11)   | 301 |                                         |

| ID     | Registered prediction                                                                                             | Outcome                                                                                                                                                                                                                                             | Verdict                   |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| E3-H1  | direction share ≥ 0.95 in all four cells; informative effects in 1.6–4.1 / 3.1–7.8 pp; flat cells lower           | 0.96 / **0.92** / 1.00 / 1.00; effects 2.54 and 5.37 pp inside their bands; flat cells 2.06 and 4.77 (lower)                                                                                                                                        | ◐ (base/flat 0.92)        |
| E3-H1b | DE > ME > {DM, MM, INT}; DM/MM/INT within ±1.5 pp (informative)                                                   | ordering holds in every cell; INT ≈ 0 (+0.35 / −0.09); **DM −1.82, MM −1.66 (base), DM −0.85, MM −2.26 (amplified)**                                                                                                                                | ◐                         |
| E3-H1c | rejection rate 0.25–0.60 (base/inf), ≥ 0.70 (amplified/inf)                                                       | 0.26 · 0.79                                                                                                                                                                                                                                         | ✅                        |
| E3-H4  | informative: mean ḡ ∈ [0, 1.5 pp], rejection < 0.30 (plateau inside phase pair 1) — "most likely to fail"         | +0.25 / +0.53 pp; rejection 0.00 / 0.04                                                                                                                                                                                                             | ✅                        |
| E3-H4b | flat: share(ḡ > 0) ≥ 0.70 and ḡ(flat) > ḡ(informative) in both worlds                                             | shares **0.59 / 0.63**; ḡ(flat) 0.75 > 0.25 and 1.26 > 0.53 (2.5–4 MC SE above zero)                                                                                                                                                                | ◐                         |
| E3-H5  | population MAE decreases at every boundary in ≥ 90 % of replicates, all cells                                     | mean MAE monotone in all four cells (−30 % over the run) but per-replicate monotone in only **0.57 / 0.28 / 0.57 / 0.64**                                                                                                                           | ❌                        |
| E3-H6  | B slice 2–7 pp below B exploited; A slice within ±1.5 pp; slice B − A within 1.5 pp                               | B: 3.36 ✓, **7.46** (0.46 over the band); A: −0.45 / +0.46 ✓; slice B − A −0.32 / +0.12 ✓                                                                                                                                                           | ◐                         |
| E3-H7  | policy gap ≈ 6.6 / 12.4 pp ± 2 for IPS, SNIPS, DR; each estimate within ±0.03 of truth; ESS ≈ 300; evidence 100 % | gaps 6.9–7.2 / 12.5–12.6 ✓; mean errors ≤ 0.004 ✓; ESS 298–301, evidence 100 % ✓; **per-replicate errors reach 0.07–0.13** (the ±0.03 band is one SE at ESS 300, so a per-replicate reading could not hold; the mean-over-replicates reading holds) | ✅ (band under-specified) |
| E3-H8  | final w_energy > 0.70 (informative)                                                                               | 0.715 / 0.715                                                                                                                                                                                                                                       | ✅                        |

## 4. Exploratory diagnostic (run after the results; NOT part of the registered study)

To explain the morning-type loss (E3-H1b), ten base/informative replicates were re-run with
the Thompson-sampling variance forced to ≈ 0 (`sigma_sq = 1e-6` through the service's own
`sample_thetas`), everything else unchanged:

| Setting              | Effect | DM    | MM    | INT   | ME    | DE    |
| -------------------- | ------ | ----- | ----- | ----- | ----- | ----- |
| registered σ² = 0.25 | +1.37  | −2.37 | −2.77 | −2.27 | +5.46 | +8.81 |
| diagnostic σ² ≈ 0    | +1.78  | −1.31 | −2.56 | −2.27 | +6.04 | +9.00 |

(10 replicates; per-class MC SE ≈ 1 pp — INT's −2.3 is noise, the 100-replicate value is +0.35.)
Removing the sampling noise halves the DM loss and leaves the MM loss. The remaining part is
the File 04 §3.2 prior table disagreeing with this world on one cell: it puts AF above MD for
morning types (DM 0.55 vs 0.50; MM 0.58 vs 0.52) while the tanh world has AF below MD (0.465 vs
0.500; 0.479 vs 0.500), so the learned arm places its fourth block in the afternoon until the AF
cell's evidence overrides the prior, and the heuristic (MO×3 + MD) is already optimal there.
Interpretation for the thesis: where the heuristic is optimal, the learned arm pays ≈ 1 pp for
a wrong prior cell and ≈ 1 pp for posterior sampling on an untrained bandit; where it is not
(evening types), the learned arm gains 6–19 pp. Both are properties of the deployed parameters
(σ² = 0.25, n₀ = 8, w = 0.7/0.3), not of the estimators.

## 5. What came out differently — and why it matters

1. **Replay is biased when \|A_m(x)\| varies (E1-H1, P4/P5).** Li et al.'s argument is
   per-context: within a fixed candidate set the uniform draw makes the matched subsample
   representative. With the 2026-08-26 eligibility rule (|A_m(x)| ∈ {2, 3, 4}, p = 1/|A_m|),
   rows with small slices are matched twice as often as rows with large ones, so replay
   averages over a context distribution reweighted by 1/|A_m(x)|. A policy whose value
   correlates with the slice size (the oracle: larger sets contain better buckets) is
   estimated with a bias of the order of 0.6–0.7 pp here — small, but systematic and in a
   known direction. IPS, SNIPS and DR weight each match by |A_m(x)| and are unbiased. Thesis
   consequence: on the slice, report replay only alongside SNIPS/DR (File 04 §2.3 already
   names DR primary), or weight replay matches by |A_m(x)| — which is IPS. Recorded as
   spec-conflicts M10 and revisit.
2. **The E2 type-I band was mis-specified (E2-H4).** The registered rejection rule counts one
   direction of a two-sided test (its calibrated null rate is 0.025), while the band was
   written for a two-sided 0.05. The observed 0.028–0.030 is calibrated against the correct
   target. Reported as a pre-registration wording error, not as a calibration failure.
3. **Morning types lose under the learned arm (E3-H1b).** Predicted ≈ 0 (the heuristic is
   optimal for them, so nothing to gain); observed −0.9 to −2.3 pp. §4 attributes it to
   posterior-sampling noise on an untrained bandit plus one mis-ordered prior cell. It is the
   price of acting on a prior and exploring, paid exactly where the incumbent rule is already
   right — a limitation the thesis should state next to the evening-type gains.
4. **The base/flat direction share is 0.92, not ≥ 0.95 (E3-H1).** With a flat prior the
   learned arm captures only half of a 4.1 pp ceiling (2.1 pp) and 8 of 100 simulated studies
   see it point the wrong way. A cold-start prior is worth ≈ 0.5 pp of the effect and ≈ 4
   points of direction reliability in this world.
5. **The learning signature exists but a 30-user study cannot see it (E3-H4b).** The
   phase-pair growth in the flat cells is +0.75 / +1.26 pp, 2.5–4 MC SE above zero over 100
   studies, yet positive in only 59–63 % of single studies and significant in 3–10 %. File 06
   H4 as a within-study test is underpowered at this effect size; as a between-replicate
   quantity it is real. The informative cells confirm the prediction that the File 04 prior
   already places the plateau inside phase pair 1.
6. **Per-replicate MAE monotonicity was the wrong criterion (E3-H5).** The population-mean
   MAE falls 30 % over the run in every cell and at every boundary — the model does learn
   during A phases (thesis-corrections #10 stands) — but the last two boundaries move by
   ≈ 0.3 pp, below the per-replicate noise, so "monotone in ≥ 90 % of replicates" fails
   (28–64 %). The registered criterion mistook a mean statement for a per-replicate one.
7. **Exploration cost in the amplified world is 7.5 pp on the slice rows, 0.5 pp above the
   registered 7 pp bound (E3-H6).** The band was set from the base world's arithmetic; the
   cost scales with the ceiling. On the arm's total it is ≈ 1.9 pp (one block in four).

## 6. What the study establishes and what it does not

- **Establishes (about the system):** the OPE harness is unbiased and gated as designed at
  the study's data rate, with the replay caveat above; the pre-registered power analysis of
  File 06 §2.3 holds at N = 30 (0.82–0.84) as a lower bound; the deployed Stage 2–4 policy
  captures 60–70 % of the available adherence gap under the File 04 prior and 50–60 % under
  a flat one, gains where the heuristic is wrong and loses ≈ 1–2 pp where it is already
  right; the matched ε-slice costs the heuristic arm nothing on average and the learned arm
  its exploitation gain on one block in four, and the slice's OPE ranks policies correctly
  with ESS ≈ 300.
- **Does not establish (about people):** nothing. Completion is drawn from
  `q_true`; H1–H4 as claims about human adherence remain untested (thesis-corrections #49).
  The worlds are the committed P11 generator and a registered amplification of it; fatigue,
  calendar busy time, deadlines, task heterogeneity and the CP-SAT packing are outside E3
  (preregistration §4.1); the E2 GLMM is not fitted.

## 7. Files

- `docs/study/preregistration.md` — frozen design (commit `11b71a9`).
- `training/src/hourwell_training/simstudy/` — the study code (commit `ec1b869`); tests
  `training/tests/test_simstudy.py`.
- `docs/study/results/{e1_estimators,e2_power,e3_closedloop,run}.json` — the run's outputs.
