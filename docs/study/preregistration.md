# Pre-registration — the simulation study (frozen before the run)

> **Status: FROZEN.** This file is committed **before** any simulation-study code exists in
> the repository and before any run at the configuration below (ADR-0020 §2). The commit
> that adds it is the timestamp; the code (`training/src/hourwell_training/simstudy/`) and
> the results (`docs/study/simulation-results.md`, `docs/study/results/`) land in later
> commits of the same PR. Any change to a hypothesis, a parameter or an analysis after
> the results exist is visible in `git log -- docs/study/preregistration.md` and must be
> reported as a deviation in the results document (File 06 §4, "researcher degrees of
> freedom").
>
> Scope wording (ADR-0020 §3): the **field study is out of scope** of the master's project;
> the **evaluation is performed in simulation**. This document is that evaluation's design:
> hypotheses with directions, method, analysis plan, and what would count as disconfirmation.

## 0. What this study is and is not

- It is a study of the **deployed system's evaluation machinery and learning policy under a
  known synthetic ground truth**: (E1) whether the off-policy estimators the thesis relies on
  (File 04 §2) recover true policy values with the bias/variance ordering the literature
  predicts, at the data rate the logging design produces; (E2) whether the field protocol's
  primary analysis has the pre-registered power at N = 30 (File 06 §2.3 — the simulation
  script File 06 says the registration includes); (E3) whether the learned policy — the
  service's own Stage 2–4 scoring code, not a re-implementation — beats the heuristic arm on
  the ABAB schedule of File 06 §1.2, and whether the learning signature File 06 H4 describes
  appears.
- It is **not** evidence about people. Completion in the simulation is drawn from a
  generative model (§1.1); every hypothesis below is a statement about the system under that
  model. H1–H4 of File 06 as claims about human adherence remain untested
  (thesis-corrections #49, boundary bullet).
- Prior knowledge, stated so it is not counted as a result: the P11 acceptance tests
  (`training/tests/test_synthetic.py`, merged 2026-08-31) already show replay / IPS / SNIPS /
  DR landing within ±0.05 of closed-form truth on one 4,000-row world. E1 quantifies bias,
  variance and ESS over replications, which those pass/fail tests do not. Nothing in E2 or
  E3 has been run in any form before this file was committed.

## 1. Common material

### 1.1 The synthetic world (ground truth)

`hourwell_training.synthetic.q_true(bucket, chronotype)` — the committed P11 generator
(ADR-0015 §16), unchanged:

```
q_true = 0.5 + 0.35 · tanh( s · morningness(class) · tilt(daypart) − 0.4 · [fatigued] )
morningness: DM 1.0 · MM 0.6 · INT 0.0 · ME −0.6 · DE −1.0
tilt:        EM 1.0 · MO 0.6 · MD 0.0 · AF −0.2 · EV −0.6 · NT −1.0
```

- **Base world:** `s = 0.5` (the committed value). **Amplified world:** `s = 1.0` (E3
  sensitivity cell only; the generator gains an optional `scale` argument defaulting to 0.5,
  so nothing that exists changes). The amplified world is registered here, before any run,
  because the base world's analytic ceiling (§4.1) is below File 06's smallest effect of
  interest; it is a stated sensitivity, not a post-hoc search.
- Completion of a placed block is Bernoulli(q_true(bucket, class)); rewards are 0/1.

### 1.2 Fixed parameters (all from specs/07 Appendix A / the service `params.py`; none tuned here)

ε = 1, m = 4, `EXPERIMENT_MIN_BUCKETS` = 2, IPS clip M = 10, ESS floor 100, Beta half-life 28
days, TS σ² = 0.25, blend init (0.7, 0.3) with lr 0.05, feature dimension 17, prior strength
n₀ = 8 inside declared working hours / 4 outside (File 04 §3.3), prior means μ₀ from the
File 04 §3.2 Deep column (category `deep`, γ = 1, δ = 0).

### 1.3 Seeds and replication

Every replicate is `numpy.random.default_rng(seed)` with seed = base + index; bases: E1
= 1000, E2 = 2000, E3 = 3000 (per cell: + 100 · cell index). Reported uncertainty is the
Monte-Carlo standard error over replicates (SD/√R). A run is one invocation of
`uv run hourwell-simstudy --out docs/study/results` in `training/`; the results document cites
the commit it ran on.

### 1.4 Decision rules used throughout

- "Confirmed" = the pre-registered criterion is met; "not confirmed" = it is not; "partly" =
  met in some cells/policies and not others (each listed). No criterion is relaxed after the
  fact; a miss is reported as a miss with its magnitude.
- A directional hypothesis with a numeric band is confirmed only if the direction AND the
  band hold.

## 2. E1 — Estimator study (RQ4; File 04 §2; ADR-0015 §8)

### 2.1 Design

- R = 200 replicates of `make_world(n_rows = 1000, seed)`. n = 1,000 is the order of the
  slice the designed field study would log: N = 30 × 8 weeks × ≈ 4.3 experiments per
  user-week on plain weeks (M9, thesis-corrections #21) × ≈ 0.9 after drops ≈ 930 rows.
- Logging policy: uniform over A_m(x) with |A_m(x)| ∈ {2, 3, 4} equiprobable and exact
  propensity 1/|A_m(x)| (the generator).
- Target policies (all restricted to A_m(x)):
  - **P1 uniform** — the logging policy itself (w ≡ 1);
  - **P2 alpha-first** — deterministic, alphabetically first bucket (an arbitrary policy
    independent of the outcome, as in the P11 tests);
  - **P3 tilted** — 0.7 on the alphabetically first bucket, 0.3 spread uniformly on the rest;
  - **P4 oracle** — deterministic argmax of q_true within A_m(x);
  - **P5 anti-oracle** — deterministic argmin.
- Estimators: replay (deterministic policies only), IPS, clipped IPS (M = 10), SNIPS, DR
  with the true reward model (`q_true`), DR with a deliberately wrong constant model (0.5),
  DM-true and DM-constant (reported as DR ingredients, File 04 §2.3).
- Truth per replicate: the closed-form value of the policy on **that replicate's logged
  contexts** (`true_value_deterministic` / `true_value_stochastic`), so the target has no
  context-sampling noise.
- Metrics per (policy, estimator): bias = mean(V̂ − V_true), SD(V̂ − V_true), RMSE, mean ESS,
  evidence rate = share of replicates with ESS ≥ 100.

### 2.2 Hypotheses (directional, with pass criteria)

| ID    | Prediction                                                                                                                                                                                                                     | Criterion                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| E1-H1 | Replay (P2/P4/P5), IPS, DR-true and DR-const are unbiased on every policy.                                                                                                                                                     | \|bias\| ≤ 3 · SD/√R for each (policy, estimator) cell                                         |
| E1-H2 | SNIPS is consistent, with a small finite-sample bias at n = 1,000 (a ratio estimator).                                                                                                                                         | \|bias\| ≤ 0.01 on every policy; direction not predicted                                       |
| E1-H3 | Clipping at M = 10 is inert under this logging design: the largest weight is 1/(1/4) = 4 < 10.                                                                                                                                 | clipped IPS == IPS on every replicate and policy (exact equality)                              |
| E1-H4 | Self-normalisation reduces variance: SD(SNIPS) ≤ SD(IPS) for P2–P5; equal for P1 (all weights 1).                                                                                                                              | SD(SNIPS) ≤ SD(IPS) on P2–P5; \|SD diff\| ≤ 0.001 on P1                                        |
| E1-H5 | The true reward model makes DR strictly more efficient than IPS: RMSE(DR-true) < RMSE(IPS) on P2–P5.                                                                                                                           | strict inequality on P2–P5                                                                     |
| E1-H6 | A wrong-but-centred model still helps a little: RMSE(DR-const) ≤ RMSE(IPS) on P2–P5 (residuals r − 0.5 have smaller second moment than r). **The least certain E1 prediction.**                                                | RMSE(DR-const) ≤ RMSE(IPS) on P2–P5                                                            |
| E1-H7 | Data rate: replay keeps n · E[1/m] = 1000 · (1/2 + 1/3 + 1/4)/3 = 361 rows; the IPS ESS of a deterministic policy is n · (E w)²/E[w²] = n/E[m] = 333; the tilted policy's ESS is n/1.615 = 619; the uniform policy's ESS is n. | mean ESS within ±20 (replay P2/P4/P5), ±25 (IPS P2/P4/P5), ±40 (IPS P3); P1 ESS = 1000 exactly |
| E1-H8 | The ESS gate is met at this scale for every policy.                                                                                                                                                                            | evidence rate = 100 % in every cell                                                            |
| E1-H9 | DM alone is biased when its model is wrong: \|bias(DM-const)\| > 3 · SD/√R on P2–P5 (it estimates 0.5 regardless of the policy), while DM-true is exact.                                                                       | as stated                                                                                      |

### 2.3 Derived statement for the field protocol (M9 / #21 closure, arithmetic on E1-H7)

At the measured experiment rate the designed field study would log ≈ 930 slice rows on plain
weeks (N = 30, 8 weeks, 4.3/user-week, 10 % drops) → deterministic-policy ESS ≈ 930/3 ≈ 310
(replay ≈ 336): the ESS ≥ 100 gate would hold with ≈ 3× margin. On heavy weeks
(1.1–2.4/user-week) → 240–520 rows → ESS ≈ 80–175: **marginal, and below the gate at the low
end**. E1 reports the measured ESS/n ratios that this arithmetic uses; the statement is
confirmed if the measured ratios are within the E1-H7 bands.

## 3. E2 — Simulation-based power for the primary contrast (File 06 §2.3, pre-registered by the spec)

### 3.1 Data-generating model (File 06 §1.6, with the spec's parameters)

logit P(complete_ij) = β₀ + β₁·cond_ij + u₀ᵢ + u₁ᵢ·cond_ij, with β₀ = logit(0.45), β₁ =
log(1.38) (OR of the +8 pp smallest effect of interest, File 06 §2.1), u₀ᵢ ~ N(0, σ₀²) with
σ₀² = ICC·(π²/3)/(1 − ICC) for ICC ∈ {0.10, 0.20}, u₁ᵢ ~ N(0, 0.48²) (the logit-scale slope
SD that puts the between-user SD of the true probability difference at ≈ 0.12, File 06 §2.2's
pessimistic τ; no pilot exists), β₂ = β₃ = β₄ = 0 (phase/weekday/category effects are
nuisance covariates, set to zero for power). Per user: 2 phases × 10 weekdays × 4 blocks = 80
blocks per condition (File 06 §2.2). N = 30 completers.

### 3.2 Analyses

- **Primary (the analytic floor File 06 §2.2 registers, and robustness (a) of §1.6):** per-user
  condition means → paired difference dᵢ → two-sided paired t-test at α = .05; rejection
  counted only in the hypothesised direction (d̄ > 0). Wilcoxon signed-rank on the same dᵢ.
- **Cells:** ICC ∈ {0.10, 0.20} × β₁ ∈ {log 1.38, 0}; 5,000 replicates each (File 06 §2.3).
- **N sweep** at ICC = 0.20, β₁ = log 1.38: N ∈ {20, 24, 28, 30, 34, 40}, 2,000 replicates each
  → the smallest N with power ≥ 0.80.
- **Supplementary phase-1 between-subject contrast** (File 06 §1.6): 15 vs 15 users, 40 blocks
  each, Welch t two-sided; 5,000 replicates per ICC.
- The §1.6 GLMM (random intercept + random condition slope) is the field protocol's primary
  model and is strictly more efficient than the paired analysis (File 06 §2.2); it is not
  fitted here (no mixed-model dependency in `training/`), so E2's power figures are **lower
  bounds** for the GLMM's. This is stated, not hidden.

### 3.3 Hypotheses

Analytic expectation (computed before any run, `docs/study/preregistration.md` §3 derivation):
the random intercept attenuates the average marginal effect below 8 pp (mean d ≈ 0.073 at ICC
0.10, ≈ 0.068 at ICC 0.20) and the per-user SD of dᵢ is ≈ 0.13–0.12, giving a noncentral-t
power of ≈ 0.84 (ICC 0.10) and ≈ 0.82 (ICC 0.20) at N = 30, ≈ 0.82 / 0.79 at N = 28.

| ID    | Prediction                                                                                                                                     | Criterion                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| E2-H1 | Power ≥ 0.80 at N = 30 in both ICC cells (File 06 §2.3's acceptance criterion holds without raising N).                                        | paired-t power ≥ 0.80 in both cells           |
| E2-H2 | Power is only mildly ICC-sensitive (the intercept cancels within user; only the marginal-effect attenuation remains): 0.80–0.88 in both cells. | both within [0.80, 0.88]; ICC 0.10 ≥ ICC 0.20 |
| E2-H3 | Wilcoxon power is 0.01–0.05 below the paired t.                                                                                                | difference within [0.00, 0.06] in both cells  |
| E2-H4 | Type-I error is calibrated: rejection rate at β₁ = 0 within 0.05 ± 0.01 (two-sided) for both tests.                                            | as stated                                     |
| E2-H5 | The smallest N with power ≥ 0.80 (ICC 0.20) is 28–30.                                                                                          | N\* ∈ {28, 30} on the sweep grid              |
| E2-H6 | The phase-1 between-subject contrast is underpowered: 0.10–0.30 in both cells (File 06 §1.6 calls it convergent evidence only).                | within [0.10, 0.30]                           |
| E2-H7 | The realised mean probability difference is below the nominal 8 pp because of the logit nonlinearity: 6.5–7.5 pp in both cells.                | mean(d̄) within [0.065, 0.075]                 |

## 4. E3 — Closed-loop policy study on the ABAB schedule (File 06 §1.1–§1.2, §1.5 H1/H4 analogues)

### 4.1 Design

- **Users:** N = 30 completers, chronotype classes round-robin (6 per class: DM, MM, INT, ME,
  DE). Working window 09:00–18:00 Mon–Fri (the profile default); no busy events.
- **Placements:** 4 identical tasks per weekday (category `deep`, 60 min, value 2, not
  splittable, no deadline — File 06 §2.2's "≈ 4 recommended blocks/weekday"), placed into
  hourly slots 09–18. Reachable buckets and capacities: MO.wd (3 h), MD.wd (2 h), AF.wd (3 h),
  EV.wd (1 h, 17–18); EM and NT are outside the window. **Fatigue is inert by construction**
  (a-priori occupancy is empty, as in the service — ADR-0007 §4 — so every scored bucket is
  the fresh one, and the truth uses the same fresh bucket); interference is the L4 probe's
  question, not this study's, and is a stated limitation.
- **Assignment:** because the four tasks are identical, the ILP objective Σ v·q̂ is maximised
  by filling the highest-q̂ buckets by capacity; the study places tasks **sequentially greedily
  by the arm's ranking** (re-scored after each placement) instead of calling CP-SAT. E3
  evaluates Stages 2–4 (energy cells, bandit, blend, exploration) under the service's own code
  (`estimates.score_pairs`, `exploration.top_m_buckets` / `draw_experiment`,
  `energy.apply_reward`, `bandit.update`, `blend.sgd_step`); Stage 5 (the solver) is out of
  E3's scope and is verified elsewhere (P5/P7.1, ADR-0018).
- **Arms:** **A** = heuristic ranking "earliest reachable bucket first" (ADR-0008 §2, the
  arm-A edge function's rule). **B** = learned: q̂ = blend(cell posterior mean, TS-sampled
  linear score) with one θ̃ per plan-day (File 04 §1.4), greedy over buckets with free
  capacity. Both arms carry the ε-slice with **ε = 1, one experiment per plan-day**: one of
  the four tasks drawn uniformly, its bucket drawn uniformly from the arm's own top-m (m = 4)
  by that arm's ranking, placed first, propensity 1/|A_m(x)| logged with A_m(x). Here
  |A_m(x)| = 4 on every row (four reachable buckets with capacity at the draw).
- **Learning (both arms, every block — "learns in all phases, acts only in B"):** per outcome
  in service order (`feedback.py`): `apply_reward` on the Beta cell (deep × daypart ×
  weekday, decay as of the attribution time 23:55 local), one blend SGD step with the cell
  mean (feature 15) and xᵀθ̂ **before** the update, then `bandit.update` (Sherman–Morrison).
  TS sampling at 06:00 of each plan day.
- **Schedule:** run-in week 0 (5 weekdays, under the first arm of the user's sequence, not
  analysed), then phases 1–4 × 10 weekdays = 45 weekdays, 180 blocks per user, 160 analysed.
  Sequences ABAB / BABA by blocked randomization (block size 4, seeded), 15 / 15. Calendar
  start Monday 2026-09-07.
- **Priors:** File 04 §3.2 Deep column μ₀ per (class, daypart); n₀ = 8 for MO/MD/AF/EV (inside
  09–18), 4 for EM/NT; bandit state identity; blend (0.7, 0.3).
- **Cells (2 × 2), R = 100 replicates each:** world ∈ {base, amplified} × priors ∈
  {File 04 (informative), flat (μ₀ = 0.5, n₀ = 8 — `repo.fallback_cells`' shape)}. The flat
  cell isolates online learning from the cold-start prior: with the File 04 table the prior
  already orders the dayparts correctly for the evening classes (§4.2), so a learning signature
  can only be expected where the prior is uninformative.

### 4.2 Analytic ceilings (closed form on the world, computed before any run)

Per class, the heuristic arm fills MO×3 + MD×1; the oracle fills the best dayparts by
capacity. Population mean under A is exactly 0.500 in both worlds (the world is symmetric).

| Class      | base: A | base: oracle | base: gap  | amplified: A | amplified: oracle | amplified: gap |
| ---------- | ------- | ------------ | ---------- | ------------ | ----------------- | -------------- |
| DM         | 0.5765  | 0.5765       | 0          | 0.6410       | 0.6410            | 0              |
| MM         | 0.5467  | 0.5467       | 0          | 0.5906       | 0.5906            | 0              |
| INT        | 0.5000  | 0.5000       | 0          | 0.5000       | 0.5000            | 0              |
| ME         | 0.4533  | 0.5313       | 0.0781     | 0.4094       | 0.5616            | 0.1522         |
| DE         | 0.4235  | 0.5517       | 0.1281     | 0.3590       | 0.5988            | 0.2398         |
| population | 0.5000  | 0.5412       | **0.0412** | 0.5000       | 0.5784            | **0.0784**     |

Consequences registered up front: (i) on a 09–18 window the earliest-first heuristic **is the
optimum for morning and intermediate types** — the learned arm can only gain on ME/DE; (ii)
the base world's population ceiling (4.1 pp) is **below File 06's smallest effect of interest
(8 pp)**, the amplified world's (7.8 pp) is at it; (iii) the uniform draw over A_m(x) has the
same population mean (0.500) as arm A's exploitation, so the matched slice costs arm A nothing
on average (−8.5 pp for DM, +8.5 pp for DE, base world) and costs arm B its exploitation gain.

### 4.3 Analysis plan (per replicate, then aggregated over R)

- Per user: mean completion over analysed A blocks and B blocks → dᵢ = B − A; per phase pair
  (phases 1–2 vs 3–4): gᵢ = (B − A)_pair2 − (B − A)_pair1.
- **Primary (H1 analogue):** two-sided paired t on dᵢ at α = .05 (direction B > A counts);
  Wilcoxon on dᵢ. Effect = d̄ in percentage points; efficiency = d̄ / ceiling.
- **H4 analogue:** paired t on gᵢ; share of replicates with ḡ > 0.
- **Per class:** mean dᵢ per chronotype class.
- **Learning during A (thesis-corrections #10):** MAE of the four reachable cells' posterior
  means vs q_true, averaged over users, at the five phase boundaries (start of phase 1 … end
  of phase 4).
- **Exploration cost:** completion on slice rows vs on exploited rows, per arm.
- **OPE on the replicate's own slice (analysed phases, both arms, ≈ 1,200 rows):** policies
  restricted to A_m(x) — "earliest-in-A_m" and "oracle-in-A_m" (argmax q_true); replay, IPS,
  SNIPS, DR with the pipeline's logistic direct method on features 0–13 (ADR-0015 §9); compared
  with each policy's closed-form value on the logged contexts.
- Aggregation: mean ± MC SE over R; rejection rates; medians where distributions are skewed.

### 4.4 Hypotheses

| ID     | Prediction                                                                                                                                                                                                                                                                                                            | Criterion                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E3-H1  | B beats A (File 06 H1 analogue) in every cell: d̄ > 0 in ≥ 95 % of replicates; the mean effect captures 40–100 % of the ceiling: **base/informative 1.6–4.1 pp**, **amplified/informative 3.1–7.8 pp**; the flat-prior cells sit lower (the prior must be learnt).                                                     | direction share ≥ 0.95 in all four cells; the informative-prior effects inside their bands |
| E3-H1b | The effect is carried by the evening classes: mean dᵢ for DE > ME > {DM, MM, INT}, and \|dᵢ\| for DM/MM/INT is within ±1.5 pp of 0 (informative cells).                                                                                                                                                               | ordering holds; DM/MM/INT within ±0.015                                                    |
| E3-H1c | Statistical power of the H1 analogue at N = 30 follows the ceiling: rejection rate **0.25–0.60 in base/informative** (an effect of ≈ 3 pp against a per-user SD ≈ 0.09 is underpowered), **≥ 0.70 in amplified/informative**.                                                                                         | as stated                                                                                  |
| E3-H4  | Learning signature (File 06 H4 analogue), informative-prior cells: ḡ ≥ 0 on average but small, ≤ 1.5 pp, with rejection rate < 0.30 — the File 04 prior already ranks the dayparts for ME/DE, so the plateau is reached inside phase pair 1. **Most likely to fail.**                                                 | mean ḡ ∈ [0, 0.015]; rejection rate < 0.30                                                 |
| E3-H4b | Flat-prior cells show the signature the informative cells hide: ḡ > 0 in ≥ 70 % of replicates and larger than in the matching informative cell.                                                                                                                                                                       | share(ḡ > 0) ≥ 0.70; mean ḡ(flat) > mean ḡ(informative) in both worlds                     |
| E3-H5  | The model learns during A phases too (#10): the population cell-MAE decreases at every one of the four phase boundaries in ≥ 90 % of replicates, in every cell.                                                                                                                                                       | as stated                                                                                  |
| E3-H6  | Exploration cost is asymmetric by construction: in arm B the slice rows complete 2–7 pp **below** B's exploited rows (informative cells); in arm A the slice rows are within ±1.5 pp of A's exploited rows; the slice completion itself differs by < 1.5 pp between arms.                                             | all three bands                                                                            |
| E3-H7  | OPE on the study's own slice ranks the policies correctly and stays honest: V̂(oracle-in-A_m) − V̂(earliest-in-A_m) ≈ 6.6 pp (base) / 12.4 pp (amplified) within ±2 pp for IPS, SNIPS and DR; each estimate within ±0.03 of its closed-form truth; ESS ≈ 300 (n/4) for the deterministic policies, evidence rate 100 %. | bands as stated, informative cells                                                         |
| E3-H8  | The blend drifts toward the energy weight: mean w_energy at the end of the run > 0.7 (its initial value) in the informative cells — the Beta cell mean is the better predictor in this world (the linear score starts at 0).                                                                                          | mean final w_energy > 0.70 in both informative cells                                       |

### 4.5 What would count as disconfirmation worth a thesis paragraph

- E3-H1 direction share < 0.95 in an informative cell → the learned policy does not reliably
  capture a gap that exists (a defect in Stages 2–4 or in exploration cost).
- E3-H4 growth clearly negative, or E3-H4b absent in the flat cells → the online learner does
  not improve on its prior within 8 weeks at 4 outcomes/day (decay 28 d) — a parameter
  finding for Appendix A.
- E1-H1 failing for IPS or DR-true → a logging/propensity defect in the harness, which would
  invalidate RQ4's substrate; this is the one outcome that would stop the thesis claim.

## 5. Reporting

`docs/study/simulation-results.md` presents, per experiment, the registered prediction next
to the outcome and a verdict (confirmed / partly / not confirmed), then a "what came out
differently" section, then the limitations §0 lists. Machine-readable outputs
(`docs/study/results/e1_estimators.json`, `e2_power.json`, `e3_closedloop.json`, `run.json`
with the commit hash and wall time) are committed alongside. Thesis text: corrections #55.
