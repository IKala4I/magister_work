# Sensitivity study across simulated worlds — results against the frozen grid

> **Scope:** the field study is out of scope; the evaluation is performed in simulation. Every
> number here is a property of the world model in `docs/study/sensitivity-grid.md` §1 — a
> logistic completion model with a File 04 §3.2 chronotype pattern, individual deviations and
> day shocks — not a fact about people.
>
> **Provenance (git, branch `post-p12/sensitivity-grid`):** grid frozen `2a48a51` (2026-09-06
> 09:30:11 +0300, no sensitivity code in the tree) → code `2ad8a94` (09:34:08) → one run on
> `2ad8a94` (`docs/study/results/sensitivity_run.json`: 301 s, 8 workers, 75 cells × 40
> replicated 120-user studies) → this document. Reproduce: `cd training && uv run
hourwell-simstudy --sensitivity --out ../docs/study/results --workers 8`.
>
> Verdicts: WIN = effect > +1 pp and positive in ≥ 90 % of replicates; LOSS = mirror; TIE
> otherwise (grid §3). MC SE of a cell's effect ≈ 0.14 pp.

## Summary

**58 WIN · 17 TIE · 0 LOSS** over 75 worlds. The learned policy never loses on average by more
than 0.5 pp, but the grid's registered "substantive failure" test fires: **in the world the
cold-start prior was written for (the table's own pattern at its assumed strength, no
individual deviation), the learned policy only ties with the earliest-first heuristic**
(+0.4 / −0.1 / +0.0 pp at day-noise 0 / 0.6 / 0.9). The reason is visible per class: the
52 % intermediate users lose 1.4–1.9 pp and the 28 % morning types 0.9–2.0 pp to the variance
of per-user learning (§5.1: sampling variance explains the morning-type part, estimation noise
on small true differences the intermediate part), cancelling the 20 % evening types' +5 to
+10 pp gains.

**What drives the wins is individual deviation from the class profile, not the population
chronotype pattern.** With no population pattern at all (s = 0) but individual deviations of
σ_shape = 0.6 logits (≈ ±14 pp per daypart), the learned policy wins by 5.7 pp; with a
population pattern twice as strong as File 04 assumes but no individual deviation, it wins by
only 2.8 pp. The cold-start prior is worth at most ±0.4 pp either way.

**Sample size (Q2):** the completers needed for 0.80 power range from **20 to more than 120**
across worlds; **48 of 75 cells exceed the grid's maximum of 120**, including the
literature-like adult population at File 04's assumed strength (N₈₀ > 120; a 30-user study
rejects 5 % of the time). N ≤ 60 occurs only where individuals deviate strongly from their
class (σ_shape = 0.6: N₈₀ 33–84), or where the population effect is twice the table's on an
extreme-heavy sample (uniform / student mix at s = 2: 31 / 43), or with six tasks a day at
s = 2 (20). File 06's N = 30 is supported in none of the adult-mix cells at s ≤ 1.5 unless
σ_shape = 0.6.

## 1. The boundary (Q1) — located, not asserted

The learned policy **beats** the earliest-first heuristic when there is enough _individual_
slot structure to learn: σ_shape ≥ 0.3 logits at any population strength (34 of 36 such
cells WIN; the two ties are at day-noise 0.9 with s ≤ 1), or a population pattern at least
1.5× File 04 §3.2's strength (s ≥ 1.5) even without individual deviation. It **ties** when
completion barely depends on the slot (s = 0, σ_shape = 0: +0.1 / −0.0 / −0.2 pp), when the
world is exactly the table's pattern at its assumed strength or weaker without individual
deviation (s ∈ {0.5, 1}, σ_shape = 0: −0.5 to +0.4 pp — the intermediates' loss cancels the
evening types' gain), when the day is nearly full (8 of 9 slots, s ≤ 1) or nearly empty (2
tasks, s ≤ 1), and at the low adherence baseline with a weak pattern (p₀ = 0.30, s = 0.5).
It **never loses** by more than 0.5 pp on average in any cell. Per class the picture is
constant across the grid: **evening types gain 5–20 pp; morning and intermediate types lose
1–2 pp wherever their own slot differences are smaller than the noise of per-user learning
(the sampler's variance σ² = 0.25 for the morning types, estimation noise on ≈ 10 outcomes per
cell for the intermediates — §5.1)**, and gain only when σ_shape ≥ 0.3 gives them something
individual to learn (INT: −1.9 pp at σ_shape = 0, +0.2 at 0.3, +3.4 at 0.6, s = 1).

Block A effects (pp; W = WIN, T = TIE; adult mix, p₀ 0.45, K 4, File 04 prior):

| s   | σ_shape 0 / σ_day 0 | 0 / 0.6 | 0 / 0.9 | 0.3 / 0 | 0.3 / 0.6 | 0.3 / 0.9 | 0.6 / 0 | 0.6 / 0.6 | 0.6 / 0.9 |
| --- | ------------------- | ------- | ------- | ------- | --------- | --------- | ------- | --------- | --------- |
| 0   | +0.09 T             | −0.04 T | −0.18 T | +1.94 W | +1.72 W   | +1.51 W   | +5.67 W | +5.12 W   | +4.65 W   |
| 0.5 | −0.24 T             | −0.29 T | −0.49 T | +1.53 W | +1.14 W   | +0.87 T   | +4.82 W | +4.15 W   | +3.85 W   |
| 1   | +0.42 T             | −0.07 T | +0.04 T | +1.66 W | +1.44 W   | +1.09 T   | +4.67 W | +4.11 W   | +3.84 W   |
| 1.5 | +1.65 W             | +1.19 W | +1.15 W | +2.57 W | +2.17 W   | +2.09 W   | +4.46 W | +4.08 W   | +3.76 W   |
| 2   | +2.79 W             | +2.45 W | +2.00 W | +3.43 W | +3.19 W   | +2.65 W   | +5.12 W | +4.66 W   | +4.27 W   |

Analytic ceilings at σ_shape = 0, σ_day = 0: 0 / 2.2 / 4.3 / 6.4 / 8.4 pp for s = 0 … 2 — the
learned policy captures 0.10 of the ceiling at s = 1, 0.26 at 1.5, 0.33 at 2 (E3 captured
0.6–0.7 on the P11 world, whose intermediate types had no pattern and therefore nothing to
lose). With individual deviation the ceiling grows (5.8 pp at the centre) and the captured
share is 0.25 at the centre, 0.5–0.6 at σ_shape = 0.6.

Sweeps at the centre (s = 1, σ_shape 0.3, σ_day 0.6, adult, p₀ 0.45, K 4 unless varied):

| Factor    | Cells (effect pp, verdict, N₈₀)                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mix × s   | adult 1.14 W >120 · 1.44 W >120 · 2.17 W >120 · 3.19 W 105 — student 1.89 W · 1.65 W · 2.25 W · 3.35 W 90 · 5.17 W 43 — uniform 1.61 W · 1.64 W · 2.87 W 99 · 4.93 W 43 · 6.64 W 31 (s = 0 … 2; adult s = 0 is 1.72 W) |
| p₀ × s    | p₀ 0.30: 0.58 T · 1.00 W · 2.35 W (s 0.5 / 1 / 2) — 0.45: 1.14 · 1.44 · 3.19 — 0.60: 1.31 W · 1.64 W · 3.26 W (N₈₀ 82)                                                                                                 |
| K × s     | K 2: 0.36 T · 0.46 T · 1.31 W — K 4: 1.14 · 1.44 · 3.19 — K 6: 1.91 W · **2.83 W (70)** · **5.56 W (20)** — K 8: 0.55 T · 0.93 T · 1.57 W                                                                              |
| prior × s | flat: 1.96 W · 0.77 T · 1.48 W · 1.87 W · 2.81 W — informative: 1.72 · 1.14 · 1.44 · 2.17 · 3.19 (s = 0 … 2)                                                                                                           |

## 2. Sample size (Q2) — N follows the simulated effect

Per replicate, the per-user difference dᵢ has SD 0.07–0.13 across worlds (0.10 at the
centre); N₈₀ is the exact paired-t sample size from (d̄, SD) and is reported as the median over
40 studies; rejection rates are the empirical paired-t rejections on the first 30 / 60 / 120
users.

| World                                                                 | Effect (pp) | N₈₀ (paired floor)     | Reject at N = 30 / 60 / 120 |
| --------------------------------------------------------------------- | ----------- | ---------------------- | --------------------------- |
| Centre: File 04 strength, adult mix, σ_shape 0.3, σ_day 0.6           | +1.44       | **> 120**              | 0.05 / 0.15 / 0.33          |
| Same, no individual deviation (σ_shape 0)                             | −0.07       | — (no positive effect) | —                           |
| Same, strong individual deviation (σ_shape 0.6)                       | +4.11       | 58                     | 0.33 / — / —                |
| Uniform (extreme-heavy) mix, s = 1                                    | +2.87       | 99                     | 0.28 / 0.63 / 0.88          |
| Uniform mix, s = 2                                                    | +6.64       | 31                     | 0.88 / — / —                |
| Student mix, s = 2                                                    | +5.17       | 43                     | 0.82 / — / —                |
| No population pattern, σ_shape 0.6, no day noise                      | +5.67       | 33                     | 0.80 / — / —                |
| Six tasks a day, s = 2                                                | +5.56       | **20**                 | 0.90 / — / —                |
| Best case with the table's own strength (s = 1, σ_shape 0.6, σ_day 0) | +4.67       | 47                     | 0.45 / — / —                |

Range across the 75 worlds: **N₈₀ = 20 … > 120; > 120 in 48 cells**. Recruitment at File 06's
assumed 30 % attrition: N = 120 completers means ≈ 170 enrolled — beyond a master's project
and, for an eight-week within-subject protocol, beyond most single-lab studies. The honest
reading: **the designed ABAB study is worth running at N ≈ 30–45 only if a pilot shows that
individuals' completion varies across dayparts by σ ≈ 0.6 logits (≈ ±14 pp) beyond their
chronotype class, or that the population chronotype effect is at least twice what File 04 §3.2
assumes on an extreme-heavy sample.** In the literature-like adult world at the table's
assumed strength, the study would need N ≥ 120 and is not worth running as designed. The
2.5 pp / 5.4 pp effects of the E3 study were properties of the P11 world (no pattern for
intermediates); they are not carried forward as "the" effect.

Two cross-checks: (i) File 06 §2.2's hand calculation (Δ 0.08, SD_d 0.15 → 27.6 → 28) uses
the normal approximation; the exact noncentral-t sample size for the same inputs is 30.
(ii) The GLMM of File 06 §1.6 is not fitted; all N₈₀ figures are paired-means floors and the
GLMM's would be lower — but not by the factor of four the centre world needs.

## 3. Predictions S1–S12 against outcomes

| ID                         | Registered prediction                                                                                             | Outcome                                                                                                                                                                               | Verdict                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| S1 null world              | TIE/LOSS at s = 0, σ_shape = 0; d̄ ∈ [−2, +0.5]                                                                    | +0.09 / −0.04 / −0.18 pp, all TIE                                                                                                                                                     | ✅                          |
| S2 individual effects only | WIN at s = 0, σ_shape = 0.6 for σ_day ≤ 0.6; efficiency < 0.5; flat > informative at s = 0                        | WIN at σ_shape 0.6 (5.7 / 5.1 / 4.7 pp) and even at 0.3 (1.9 / 1.7 / 1.5); efficiency **0.60 / 0.53 / 0.48** — above the predicted ceiling share; flat 1.96 > informative 1.72        | ◐ (stronger than predicted) |
| S3 boundary in s           | monotone in s; WIN boundary at s = 0.5; WIN at all s ≥ 1 in Block A                                               | **not monotone at σ_shape = 0** (+0.09, −0.24, +0.42, +1.65, +2.79); the boundary at σ_shape = 0 is **s ≈ 1.5**; three s = 1 cells and one s = 0.5 / σ_shape 0.3 / σ_day 0.9 cell TIE | ❌                          |
| S4 day noise               | d̄(σ_day 0.9) / d̄(0) ∈ [0.65, 0.90] at s ≥ 1                                                                       | 0.66–0.84 in eight of nine cells; the ninth (s = 1, σ_shape 0) has no effect to attenuate                                                                                             | ✅ (one degenerate cell)    |
| S5 individual deviation    | d̄(σ_shape 0.6) > d̄(0) at s ≥ 1, σ_day ≤ 0.6                                                                       | +2.2 to +4.3 pp in all six comparisons                                                                                                                                                | ✅                          |
| S6 mix                     | uniform > student > adult at s ≥ 0.5                                                                              | holds at s ≥ 1 (e.g. 2.87 > 2.25 > 1.44); at s = 0.5 student 1.65 ≈ uniform 1.64 (MC SE 0.14)                                                                                         | ✅ (within SE at 0.5)       |
| S7 baseline                | largest at p₀ 0.45; 0.30 and 0.60 within [0.75, 1.0] of it                                                        | p₀ 0.60 is **larger** (1.31 / 1.64 / 3.26 vs 1.14 / 1.44 / 3.19); p₀ 0.30 is 0.51–0.74 of 0.45                                                                                        | ❌                          |
| S8 inbox                   | peak at K = 4; TIE at K = 8 for s ≤ 1; boundary 6–8                                                               | **peak at K = 6** (2.83 vs 1.44 at s = 1; 5.56 vs 3.19 at s = 2); K = 8 TIE at s ≤ 1 ✓, WIN (+1.57) at s = 2; d̄(4) > d̄(2) ✓                                                           | ◐                           |
| S9 prior                   | informative ≥ flat for s ≥ 1; flat ≥ informative at s = 0; within ±1 pp at 0.5                                    | s = 1: 1.44 vs 1.48 (tie within SE); 1.5 / 2: +0.30 / +0.38 for informative; s = 0: flat +0.24; s = 0.5: informative +0.37                                                            | ✅                          |
| S10 per class              | DM/MM within [−1, +1.5] at s ≥ 1, σ_shape 0                                                                       | DM −0.9 / −0.4 / +0.3 ✓; **MM −2.0 / −1.4 / −0.25**; **INT −1.9 / −1.6 / −1.1 (unpredicted)**; ME +4.9 … +12.2, DE +9.1 … +19.6                                                       | ❌                          |
| S11 sample size            | centre N₈₀ 50–100 and rejection at 30 of 0.25–0.50; s = 0.5 > 120; s = 1.5 25–50; s = 2 ≤ 30; uniform s = 1 25–50 | centre **> 120**, rejection **0.05**; s = 0.5 > 120 ✓; s = 1.5 > 120; s = 2 105; uniform s = 1 99                                                                                     | ❌ (only the s = 0.5 half)  |
| S12 learning signature     | ḡ > 0 in flat and σ_shape 0.6 cells; \|ḡ\| ≤ 0.5 pp in informative σ_shape 0 cells                                | flat +0.28 / +0.93 / +1.58 ✓; σ_shape 0.6 +1.36 / +1.80 / +1.64 ✓; informative σ_shape 0: −0.23 / +0.30 / **+0.86 (s = 2)**                                                           | ◐                           |

**Too-kind test:** passed — the null world ties, and 17 of 75 cells tie. **Substantive-failure
test:** fires — TIE at s = 1, σ_shape = 0, σ_day = 0 (+0.42 pp; ceiling 4.3).

## 4. What came out differently — and what it means

1. **The intermediate majority loses under the learned policy whenever its slot differences are
   small (S3, S10, S11).** Not predicted. In the table's own world an intermediate's four
   dayparts differ by 0.1–0.4 logits (completion 0.38–0.52 at p₀ 0.45); the deployed Thompson
   sampler (σ² = 0.25 on an identity-prior bandit) scatters placements across them, while the
   heuristic's MO-heavy fill is near-optimal because MO is the intermediates' best daypart in
   File 04 §3.2. The loss shrinks as the pattern strengthens (−1.9 → −1.1 pp from s = 1 to 2)
   and turns into a gain once individual deviation gives the learner something to resolve
   (+0.2 at σ_shape 0.3, +3.4 at 0.6). The exploratory diagnostic (§5.1) attributes the
   morning-type part to the sampler's variance and the intermediate part to estimation noise
   on small true differences. Thesis consequence: the learned policy's population-level
   advantage depends on the share of users whose own slot effects exceed the noise floor of
   per-user learning; where a fixed rule is already near-optimal, adaptivity costs 1–2 pp.
   Appendix A's σ² = 0.25 is one lever (it removes the DM loss); evidence-scaled sampling and
   a slower-decaying evidence window are the others, for a first-real-data review.
2. **The effect scale was over-predicted by 2–3× (S11).** The bands assumed E3's 0.6–0.7
   efficiency; in this world the captured share at σ_shape = 0 is 0.10–0.33 because the losing
   classes were absent from the P11 world. Every N₈₀ prediction except "s = 0.5 > 120" failed
   in the same direction. The recomputed range (§2) replaces them.
3. **Individual deviation dominates (S2, S5).** Predicted as a contributor; observed as the main
   driver: +4 pp from σ_shape 0 → 0.6 at every s, more than the entire population effect at
   s = 2. The learner's value is per-person profile learning, which the cold-start prior cannot
   provide (S9: ±0.4 pp).
4. **More tasks help until the day is full (S8).** Six tasks a day beat four (2.8 vs 1.4 pp at
   s = 1): the heuristic is pushed into the worst dayparts and the learner receives six outcomes
   a day instead of four. Eight fills 8 of 9 slots and the choice disappears (TIE at s ≤ 1).
   The best sample size on the grid (N₈₀ = 20) is the six-task, s = 2 world.
5. **Low baselines compress the effect; high ones do not (S7).** At p₀ = 0.30 the Bernoulli
   signal per block is weaker relative to the logit differences; at 0.60 the effect is unchanged
   or slightly larger. The prediction's symmetric compression was wrong.
6. **Day noise costs 15–35 % (S4 confirmed)** and is the least of the world's problems for the
   learner; the exploration cost of the ε-slice, by contrast, reaches 17 pp on slice rows in
   strong-effect worlds (grid maximum; 0.03 pp in the null world) — one block in four is placed
   at random, so the arm-level cost is up to 4 pp. That cost is symmetric by design and is why
   the slice is matched across arms.
7. **The learning signature (File 06 H4) appears where there is something to learn (S12):**
   +0.9 to +1.8 pp phase-pair growth with a flat prior or with σ_shape 0.6, and +0.9 even with
   the informative prior at s = 2 (the table under-states that world). It is a real but small
   quantity that a 30-user study cannot detect (E3 finding, unchanged).

## 5. Exploratory (after the results; not registered)

5.1 **TS-noise attribution of the intermediate loss.** The s = 1, σ_shape = 0, σ_day = 0.6
cell re-run with the sampler's variance forced to ≈ 0 (`scripts/simstudy_exploratory.py
--only int-loss`, 10 replicates, seeds 6000–6009; `results/exploratory_sensitivity.json`):

| Setting              | Effect   | DM    | MM    | INT   | ME    | DE    |
| -------------------- | -------- | ----- | ----- | ----- | ----- | ----- |
| registered σ² = 0.25 | +0.55 pp | −0.60 | −1.43 | −1.18 | +5.81 | +9.51 |
| diagnostic σ² ≈ 0    | +0.82 pp | +0.05 | −1.12 | −0.91 | +5.92 | +9.35 |

Sampling noise explains the morning-type (DM) loss entirely and only a quarter of the
intermediate and MM loss. Day shocks are not the remainder either: at σ_day = 0 the same cell
still shows INT −1.41, MM −1.46 (registered run). What remains is the variance of the per-user
estimates themselves — ≈ 10 Bernoulli outcomes per cell decayed over 28 days, against true
differences of 0.1–0.4 logits — the ordinary cost of an adaptive policy where a fixed rule is
already near-optimal. The registered run is unaffected by this diagnostic.

## 6. Limitations (from grid §1, restated with the results in view)

Nothing about people: completion is a logistic model with a chronotype pattern taken from a
spec table, individual deviations and day shocks whose magnitudes are argued from File 06's
ICC range, not measured. People do not change, tasks are identical, no calendar busy time,
no fatigue, perfect attribution, plans executed as placed. The heuristic is the earliest-first
rule of ADR-0008 §2, not a commercial scheduler. The solver is replaced by greedy placement.
N₈₀ figures are paired-means floors (no GLMM). The grid's σ_shape range (0–0.6) is the axis the
conclusions hinge on and the one with the least empirical basis — it is exactly what a pilot
would have to measure.

## 7. Files

- `docs/study/sensitivity-grid.md` — the frozen design (`2a48a51`).
- `training/src/hourwell_training/simstudy/sensitivity.py` — the code (`2ad8a94`); tests
  `test_sensitivity_*` in `training/tests/test_simstudy.py`.
- `docs/study/results/sensitivity.json`, `sensitivity_run.json` — the run.
- Full 75-cell table: appendix below (generated from the JSON).

## Appendix — all 75 cells (from `results/sensitivity.json`)

Effect ± MC SE and ceiling in pp; eff. = effect / ceiling; rej30/60/120 = paired-t rejection rates on user prefixes; per-class columns in pp.

| #   | block | s   | σ_shape | σ_day | mix     | p₀   | K   | prior       | effect pp ± se | ceiling pp | eff.  | share>0 | verdict | N₈₀  | rej30 | rej60 | rej120 | DM    | MM    | INT   | ME     | DE     |
| --- | ----- | --- | ------- | ----- | ------- | ---- | --- | ----------- | -------------- | ---------- | ----- | ------- | ------- | ---- | ----- | ----- | ------ | ----- | ----- | ----- | ------ | ------ |
| 0   | A     | 0.0 | 0.0     | 0.0   | adult   | 0.45 | 4   | informative | +0.09 ± 0.11   | 0.00       | —     | 0.62    | TIE     | >120 | 0.00  | 0.00  | 0.00   | +0.25 | -0.16 | +0.05 | +0.42  | +0.17  |
| 1   | A     | 0.0 | 0.0     | 0.6   | adult   | 0.45 | 4   | informative | -0.04 ± 0.11   | 0.00       | —     | 0.42    | TIE     | >120 | 0.00  | 0.00  | 0.03   | -0.18 | +0.04 | -0.09 | +0.38  | -0.21  |
| 2   | A     | 0.0 | 0.0     | 0.9   | adult   | 0.45 | 4   | informative | -0.18 ± 0.14   | 0.00       | —     | 0.38    | TIE     | >120 | 0.03  | 0.00  | 0.03   | +0.73 | -0.07 | -0.64 | +0.51  | +0.27  |
| 3   | A     | 0.0 | 0.3     | 0.0   | adult   | 0.45 | 4   | informative | +1.94 ± 0.15   | 5.00       | 0.39  | 0.97    | WIN     | >120 | 0.15  | 0.40  | 0.65   | +1.96 | +1.94 | +1.82 | +2.40  | +2.00  |
| 4   | A     | 0.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | informative | +1.72 ± 0.12   | 5.06       | 0.34  | 1.00    | WIN     | >120 | 0.10  | 0.30  | 0.45   | +1.86 | +1.81 | +1.58 | +1.90  | +1.92  |
| 5   | A     | 0.0 | 0.3     | 0.9   | adult   | 0.45 | 4   | informative | +1.51 ± 0.13   | 4.90       | 0.31  | 0.95    | WIN     | >120 | 0.20  | 0.15  | 0.42   | +1.18 | +1.68 | +1.57 | +1.44  | +1.38  |
| 6   | A     | 0.0 | 0.6     | 0.0   | adult   | 0.45 | 4   | informative | +5.67 ± 0.18   | 9.40       | 0.60  | 1.00    | WIN     | 33   | 0.80  | 0.95  | 1.00   | +5.33 | +5.79 | +5.77 | +5.46  | +5.59  |
| 7   | A     | 0.0 | 0.6     | 0.6   | adult   | 0.45 | 4   | informative | +5.12 ± 0.18   | 9.59       | 0.53  | 1.00    | WIN     | 42   | 0.75  | 0.95  | 1.00   | +5.02 | +4.83 | +5.50 | +3.96  | +5.05  |
| 8   | A     | 0.0 | 0.6     | 0.9   | adult   | 0.45 | 4   | informative | +4.65 ± 0.15   | 9.62       | 0.48  | 1.00    | WIN     | 50   | 0.47  | 0.82  | 1.00   | +4.44 | +5.10 | +4.48 | +4.26  | +5.64  |
| 9   | A     | 0.5 | 0.0     | 0.0   | adult   | 0.45 | 4   | informative | -0.24 ± 0.11   | 2.18       | -0.11 | 0.35    | TIE     | >120 | 0.07  | 0.00  | 0.00   | -1.35 | -1.88 | -0.95 | +2.75  | +4.76  |
| 10  | A     | 0.5 | 0.0     | 0.6   | adult   | 0.45 | 4   | informative | -0.29 ± 0.12   | 2.18       | -0.14 | 0.35    | TIE     | >120 | 0.00  | 0.00  | 0.00   | -1.86 | -1.55 | -1.05 | +3.07  | +4.33  |
| 11  | A     | 0.5 | 0.0     | 0.9   | adult   | 0.45 | 4   | informative | -0.49 ± 0.15   | 2.18       | -0.23 | 0.28    | TIE     | >120 | 0.03  | 0.00  | 0.03   | -1.72 | -1.26 | -1.15 | +2.15  | +3.17  |
| 12  | A     | 0.5 | 0.3     | 0.0   | adult   | 0.45 | 4   | informative | +1.53 ± 0.13   | 4.72       | 0.32  | 0.95    | WIN     | >120 | 0.05  | 0.15  | 0.45   | +0.25 | -0.70 | +1.08 | +4.59  | +6.04  |
| 13  | A     | 0.5 | 0.3     | 0.6   | adult   | 0.45 | 4   | informative | +1.14 ± 0.13   | 4.72       | 0.24  | 0.95    | WIN     | >120 | 0.10  | 0.17  | 0.23   | -0.42 | -0.28 | +0.78 | +3.13  | +5.48  |
| 14  | A     | 0.5 | 0.3     | 0.9   | adult   | 0.45 | 4   | informative | +0.87 ± 0.13   | 4.71       | 0.18  | 0.85    | TIE     | >120 | 0.07  | 0.05  | 0.05   | -0.28 | -0.25 | +0.23 | +3.50  | +4.96  |
| 15  | A     | 0.5 | 0.6     | 0.0   | adult   | 0.45 | 4   | informative | +4.82 ± 0.14   | 9.09       | 0.53  | 1.00    | WIN     | 44   | 0.65  | 0.95  | 1.00   | +2.20 | +2.71 | +4.69 | +7.92  | +8.98  |
| 16  | A     | 0.5 | 0.6     | 0.6   | adult   | 0.45 | 4   | informative | +4.15 ± 0.18   | 8.81       | 0.47  | 1.00    | WIN     | 68   | 0.45  | 0.85  | 1.00   | +1.96 | +3.13 | +4.13 | +6.04  | +6.60  |
| 17  | A     | 0.5 | 0.6     | 0.9   | adult   | 0.45 | 4   | informative | +3.85 ± 0.16   | 8.88       | 0.43  | 1.00    | WIN     | 77   | 0.38  | 0.72  | 0.97   | +2.02 | +1.99 | +3.72 | +5.88  | +7.90  |
| 18  | A     | 1.0 | 0.0     | 0.0   | adult   | 0.45 | 4   | informative | +0.42 ± 0.09   | 4.32       | 0.10  | 0.72    | TIE     | >120 | 0.03  | 0.00  | 0.05   | -1.35 | -1.46 | -1.41 | +5.96  | +10.22 |
| 19  | A     | 1.0 | 0.0     | 0.6   | adult   | 0.45 | 4   | informative | -0.07 ± 0.11   | 4.32       | -0.02 | 0.47    | TIE     | >120 | 0.03  | 0.00  | 0.03   | -0.90 | -1.98 | -1.88 | +4.89  | +9.13  |
| 20  | A     | 1.0 | 0.0     | 0.9   | adult   | 0.45 | 4   | informative | +0.04 ± 0.15   | 4.32       | 0.01  | 0.50    | TIE     | >120 | 0.03  | 0.05  | 0.05   | -0.80 | -2.11 | -1.50 | +4.80  | +8.29  |
| 21  | A     | 1.0 | 0.3     | 0.0   | adult   | 0.45 | 4   | informative | +1.66 ± 0.12   | 5.68       | 0.29  | 1.00    | WIN     | >120 | 0.07  | 0.40  | 0.40   | -0.12 | -0.63 | +0.18 | +6.83  | +10.61 |
| 22  | A     | 1.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | informative | +1.44 ± 0.13   | 5.84       | 0.25  | 0.97    | WIN     | >120 | 0.05  | 0.15  | 0.33   | -0.92 | -1.22 | +0.15 | +6.29  | +11.13 |
| 23  | A     | 1.0 | 0.3     | 0.9   | adult   | 0.45 | 4   | informative | +1.09 ± 0.15   | 5.57       | 0.20  | 0.85    | TIE     | >120 | 0.05  | 0.15  | 0.17   | -1.33 | -1.40 | -0.03 | +5.08  | +10.70 |
| 24  | A     | 1.0 | 0.6     | 0.0   | adult   | 0.45 | 4   | informative | +4.67 ± 0.17   | 9.13       | 0.51  | 1.00    | WIN     | 47   | 0.45  | 0.88  | 1.00   | +0.82 | +1.06 | +3.98 | +10.15 | +13.52 |
| 25  | A     | 1.0 | 0.6     | 0.6   | adult   | 0.45 | 4   | informative | +4.11 ± 0.13   | 9.07       | 0.45  | 1.00    | WIN     | 58   | 0.33  | 0.82  | 0.97   | +0.52 | +0.84 | +3.38 | +9.28  | +12.71 |
| 26  | A     | 1.0 | 0.6     | 0.9   | adult   | 0.45 | 4   | informative | +3.84 ± 0.16   | 9.09       | 0.42  | 1.00    | WIN     | 84   | 0.35  | 0.65  | 0.95   | +0.49 | +0.68 | +3.38 | +7.93  | +11.75 |
| 27  | A     | 1.5 | 0.0     | 0.0   | adult   | 0.45 | 4   | informative | +1.65 ± 0.13   | 6.40       | 0.26  | 0.97    | WIN     | >120 | 0.07  | 0.25  | 0.53   | -0.60 | -0.70 | -1.29 | +10.03 | +16.05 |
| 28  | A     | 1.5 | 0.0     | 0.6   | adult   | 0.45 | 4   | informative | +1.19 ± 0.11   | 6.40       | 0.19  | 0.95    | WIN     | >120 | 0.05  | 0.07  | 0.12   | -0.40 | -1.40 | -1.56 | +8.52  | +15.35 |
| 29  | A     | 1.5 | 0.0     | 0.9   | adult   | 0.45 | 4   | informative | +1.15 ± 0.13   | 6.40       | 0.18  | 0.93    | WIN     | >120 | 0.03  | 0.15  | 0.17   | -0.56 | -1.17 | -1.24 | +8.05  | +13.28 |
| 30  | A     | 1.5 | 0.3     | 0.0   | adult   | 0.45 | 4   | informative | +2.57 ± 0.11   | 7.30       | 0.35  | 1.00    | WIN     | >120 | 0.10  | 0.50  | 0.85   | -0.14 | -0.69 | -0.04 | +11.23 | +16.79 |
| 31  | A     | 1.5 | 0.3     | 0.6   | adult   | 0.45 | 4   | informative | +2.17 ± 0.11   | 7.27       | 0.30  | 1.00    | WIN     | >120 | 0.03  | 0.28  | 0.65   | -0.45 | -0.78 | -0.15 | +9.35  | +16.04 |
| 32  | A     | 1.5 | 0.3     | 0.9   | adult   | 0.45 | 4   | informative | +2.09 ± 0.16   | 7.17       | 0.29  | 0.97    | WIN     | >120 | 0.15  | 0.33  | 0.60   | -0.34 | -0.24 | +0.07 | +8.55  | +13.58 |
| 33  | A     | 1.5 | 0.6     | 0.0   | adult   | 0.45 | 4   | informative | +4.46 ± 0.13   | 9.53       | 0.47  | 1.00    | WIN     | 52   | 0.35  | 0.82  | 1.00   | +0.28 | +0.74 | +2.75 | +12.16 | +17.38 |
| 34  | A     | 1.5 | 0.6     | 0.6   | adult   | 0.45 | 4   | informative | +4.08 ± 0.14   | 9.72       | 0.42  | 1.00    | WIN     | 66   | 0.45  | 0.88  | 1.00   | -0.13 | +0.33 | +2.47 | +11.84 | +16.40 |
| 35  | A     | 1.5 | 0.6     | 0.9   | adult   | 0.45 | 4   | informative | +3.76 ± 0.18   | 9.51       | 0.40  | 1.00    | WIN     | 76   | 0.42  | 0.72  | 0.90   | +0.35 | +0.42 | +2.38 | +10.52 | +14.16 |
| 36  | A     | 2.0 | 0.0     | 0.0   | adult   | 0.45 | 4   | informative | +2.79 ± 0.12   | 8.39       | 0.33  | 1.00    | WIN     | 109  | 0.15  | 0.47  | 0.88   | +0.41 | -0.48 | -1.25 | +14.06 | +21.99 |
| 37  | A     | 2.0 | 0.0     | 0.6   | adult   | 0.45 | 4   | informative | +2.45 ± 0.11   | 8.39       | 0.29  | 1.00    | WIN     | >120 | 0.10  | 0.35  | 0.68   | +0.27 | -0.25 | -1.13 | +12.18 | +19.55 |
| 38  | A     | 2.0 | 0.0     | 0.9   | adult   | 0.45 | 4   | informative | +2.00 ± 0.11   | 8.39       | 0.24  | 1.00    | WIN     | >120 | 0.05  | 0.25  | 0.42   | -0.41 | -0.55 | -1.38 | +11.09 | +18.73 |
| 39  | A     | 2.0 | 0.3     | 0.0   | adult   | 0.45 | 4   | informative | +3.43 ± 0.13   | 8.84       | 0.39  | 1.00    | WIN     | 80   | 0.07  | 0.62  | 0.97   | +0.37 | -0.40 | -0.16 | +14.63 | +21.91 |
| 40  | A     | 2.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | informative | +3.19 ± 0.16   | 8.70       | 0.37  | 1.00    | WIN     | 105  | 0.23  | 0.55  | 0.88   | -0.15 | +0.12 | +0.01 | +12.96 | +20.12 |
| 41  | A     | 2.0 | 0.3     | 0.9   | adult   | 0.45 | 4   | informative | +2.65 ± 0.12   | 8.71       | 0.30  | 1.00    | WIN     | >120 | 0.07  | 0.40  | 0.75   | +0.12 | -0.81 | -0.18 | +11.07 | +18.74 |
| 42  | A     | 2.0 | 0.6     | 0.0   | adult   | 0.45 | 4   | informative | +5.12 ± 0.12   | 10.45      | 0.49  | 1.00    | WIN     | 44   | 0.60  | 1.00  | 1.00   | +0.48 | +0.35 | +3.03 | +14.72 | +20.32 |
| 43  | A     | 2.0 | 0.6     | 0.6   | adult   | 0.45 | 4   | informative | +4.66 ± 0.17   | 10.56      | 0.44  | 1.00    | WIN     | 58   | 0.45  | 0.88  | 1.00   | +0.38 | +0.38 | +2.38 | +13.44 | +20.91 |
| 44  | A     | 2.0 | 0.6     | 0.9   | adult   | 0.45 | 4   | informative | +4.27 ± 0.18   | 10.64      | 0.40  | 1.00    | WIN     | 67   | 0.53  | 0.82  | 0.97   | -0.11 | +0.15 | +2.10 | +13.01 | +19.61 |
| 45  | B     | 0.0 | 0.3     | 0.6   | uniform | 0.45 | 4   | informative | +1.61 ± 0.14   | 4.88       | 0.33  | 0.95    | WIN     | >120 | 0.10  | 0.25  | 0.42   | +1.84 | +1.55 | +1.65 | +1.76  | +1.24  |
| 46  | B     | 0.5 | 0.3     | 0.6   | uniform | 0.45 | 4   | informative | +1.64 ± 0.15   | 5.35       | 0.31  | 0.95    | WIN     | >120 | 0.05  | 0.17  | 0.42   | -0.61 | -0.63 | +0.78 | +3.72  | +4.94  |
| 47  | B     | 1.0 | 0.3     | 0.6   | uniform | 0.45 | 4   | informative | +2.87 ± 0.13   | 7.40       | 0.39  | 1.00    | WIN     | 99   | 0.28  | 0.62  | 0.88   | -1.29 | -0.74 | +0.12 | +6.24  | +10.02 |
| 48  | B     | 1.5 | 0.3     | 0.6   | uniform | 0.45 | 4   | informative | +4.93 ± 0.10   | 10.01      | 0.49  | 1.00    | WIN     | 43   | 0.65  | 0.95  | 1.00   | -0.10 | -0.80 | +0.38 | +9.73  | +15.46 |
| 49  | B     | 2.0 | 0.3     | 0.6   | uniform | 0.45 | 4   | informative | +6.64 ± 0.14   | 12.57      | 0.53  | 1.00    | WIN     | 31   | 0.88  | 1.00  | 1.00   | +0.30 | -0.20 | -0.26 | +12.89 | +20.45 |
| 50  | B     | 0.0 | 0.3     | 0.6   | student | 0.45 | 4   | informative | +1.89 ± 0.15   | 5.00       | 0.38  | 0.97    | WIN     | >120 | 0.17  | 0.30  | 0.53   | +1.97 | +1.73 | +1.75 | +2.04  | +2.30  |
| 51  | B     | 0.5 | 0.3     | 0.6   | student | 0.45 | 4   | informative | +1.65 ± 0.14   | 5.41       | 0.30  | 0.95    | WIN     | >120 | 0.12  | 0.28  | 0.50   | -0.54 | -0.13 | +0.55 | +3.73  | +5.96  |
| 52  | B     | 1.0 | 0.3     | 0.6   | student | 0.45 | 4   | informative | +2.25 ± 0.12   | 6.84       | 0.33  | 1.00    | WIN     | >120 | 0.23  | 0.40  | 0.70   | -0.60 | -1.09 | -0.02 | +6.33  | +10.02 |
| 53  | B     | 1.5 | 0.3     | 0.6   | student | 0.45 | 4   | informative | +3.35 ± 0.14   | 8.88       | 0.38  | 1.00    | WIN     | 90   | 0.33  | 0.62  | 0.95   | -0.45 | -0.91 | -0.48 | +9.46  | +15.67 |
| 54  | B     | 2.0 | 0.3     | 0.6   | student | 0.45 | 4   | informative | +5.17 ± 0.12   | 11.28      | 0.46  | 1.00    | WIN     | 43   | 0.82  | 1.00  | 1.00   | +0.38 | -0.05 | +0.09 | +13.72 | +20.24 |
| 55  | C     | 0.5 | 0.3     | 0.6   | adult   | 0.3  | 4   | informative | +0.58 ± 0.13   | 4.10       | 0.14  | 0.80    | TIE     | >120 | 0.00  | 0.07  | 0.10   | -1.29 | -1.10 | +0.37 | +3.12  | +4.10  |
| 56  | C     | 1.0 | 0.3     | 0.6   | adult   | 0.3  | 4   | informative | +1.00 ± 0.13   | 4.91       | 0.20  | 0.97    | WIN     | >120 | 0.03  | 0.07  | 0.20   | -1.10 | -1.54 | -0.01 | +5.77  | +8.48  |
| 57  | C     | 2.0 | 0.3     | 0.6   | adult   | 0.3  | 4   | informative | +2.35 ± 0.15   | 7.40       | 0.32  | 1.00    | WIN     | >120 | 0.15  | 0.38  | 0.70   | +0.04 | -0.31 | -0.74 | +11.56 | +17.25 |
| 58  | C     | 0.5 | 0.3     | 0.6   | adult   | 0.6  | 4   | informative | +1.31 ± 0.14   | 4.63       | 0.28  | 0.93    | WIN     | >120 | 0.10  | 0.20  | 0.33   | -0.14 | -0.06 | +0.95 | +3.50  | +5.17  |
| 59  | C     | 1.0 | 0.3     | 0.6   | adult   | 0.6  | 4   | informative | +1.64 ± 0.10   | 5.57       | 0.29  | 1.00    | WIN     | >120 | 0.05  | 0.23  | 0.47   | -0.68 | -0.50 | +0.43 | +6.08  | +10.37 |
| 60  | C     | 2.0 | 0.3     | 0.6   | adult   | 0.6  | 4   | informative | +3.26 ± 0.13   | 8.77       | 0.37  | 1.00    | WIN     | 82   | 0.17  | 0.62  | 0.95   | -0.15 | +0.44 | +0.23 | +12.10 | +20.03 |
| 61  | D     | 0.5 | 0.3     | 0.6   | adult   | 0.45 | 2   | informative | +0.36 ± 0.15   | 4.86       | 0.07  | 0.65    | TIE     | >120 | 0.07  | 0.03  | 0.03   | -0.63 | -1.50 | -0.19 | +2.88  | +5.23  |
| 62  | D     | 1.0 | 0.3     | 0.6   | adult   | 0.45 | 2   | informative | +0.46 ± 0.20   | 4.79       | 0.10  | 0.68    | TIE     | >120 | 0.07  | 0.03  | 0.10   | -0.29 | -2.11 | -0.87 | +5.29  | +8.03  |
| 63  | D     | 2.0 | 0.3     | 0.6   | adult   | 0.45 | 2   | informative | +1.31 ± 0.16   | 6.34       | 0.21  | 0.93    | WIN     | >120 | 0.00  | 0.07  | 0.20   | -0.03 | -1.28 | -2.04 | +9.54  | +17.62 |
| 64  | D     | 0.5 | 0.3     | 0.6   | adult   | 0.45 | 6   | informative | +1.91 ± 0.11   | 3.46       | 0.55  | 1.00    | WIN     | >120 | 0.23  | 0.38  | 0.65   | +0.89 | +0.88 | +1.74 | +3.74  | +3.81  |
| 65  | D     | 1.0 | 0.3     | 0.6   | adult   | 0.45 | 6   | informative | +2.83 ± 0.11   | 4.54       | 0.62  | 1.00    | WIN     | 70   | 0.35  | 0.72  | 1.00   | +0.77 | +1.17 | +2.34 | +6.02  | +7.46  |
| 66  | D     | 2.0 | 0.3     | 0.6   | adult   | 0.45 | 6   | informative | +5.56 ± 0.13   | 7.45       | 0.75  | 1.00    | WIN     | 20   | 0.90  | 1.00  | 1.00   | +1.96 | +2.57 | +4.79 | +10.28 | +14.52 |
| 67  | D     | 0.5 | 0.3     | 0.6   | adult   | 0.45 | 8   | informative | +0.55 ± 0.10   | 0.98       | 0.56  | 0.80    | TIE     | >120 | 0.03  | 0.15  | 0.10   | +0.32 | +0.53 | +0.46 | +1.04  | +0.77  |
| 68  | D     | 1.0 | 0.3     | 0.6   | adult   | 0.45 | 8   | informative | +0.93 ± 0.10   | 1.17       | 0.79  | 0.93    | TIE     | >120 | 0.15  | 0.20  | 0.28   | -0.08 | +0.44 | +0.80 | +1.93  | +2.64  |
| 69  | D     | 2.0 | 0.3     | 0.6   | adult   | 0.45 | 8   | informative | +1.57 ± 0.10   | 1.77       | 0.89  | 1.00    | WIN     | >120 | 0.23  | 0.42  | 0.62   | +0.11 | -0.18 | +1.38 | +3.48  | +5.42  |
| 70  | E     | 0.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | flat        | +1.96 ± 0.11   | 4.94       | 0.40  | 1.00    | WIN     | >120 | 0.15  | 0.38  | 0.57   | +1.57 | +2.16 | +1.91 | +2.05  | +2.33  |
| 71  | E     | 0.5 | 0.3     | 0.6   | adult   | 0.45 | 4   | flat        | +0.77 ± 0.12   | 4.63       | 0.17  | 0.85    | TIE     | >120 | 0.03  | 0.03  | 0.12   | -1.38 | -0.70 | +0.55 | +3.23  | +4.57  |
| 72  | E     | 1.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | flat        | +1.48 ± 0.16   | 5.72       | 0.26  | 0.95    | WIN     | >120 | 0.07  | 0.25  | 0.35   | -0.82 | -0.98 | +0.55 | +5.50  | +9.66  |
| 73  | E     | 1.5 | 0.3     | 0.6   | adult   | 0.45 | 4   | flat        | +1.87 ± 0.14   | 7.10       | 0.26  | 1.00    | WIN     | >120 | 0.07  | 0.33  | 0.55   | -0.69 | -1.19 | +0.09 | +8.51  | +13.20 |
| 74  | E     | 2.0 | 0.3     | 0.6   | adult   | 0.45 | 4   | flat        | +2.81 ± 0.10   | 8.87       | 0.32  | 1.00    | WIN     | 118  | 0.15  | 0.50  | 0.93   | -0.35 | -0.39 | -0.12 | +11.84 | +19.12 |
