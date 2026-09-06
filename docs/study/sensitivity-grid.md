# Sensitivity study across simulated worlds — the grid, frozen before the run

> **Status: FROZEN** (ADR-0020 §2 discipline). Committed before any sensitivity code exists and
> before any cell runs. Later commits add `simstudy/sensitivity.py`, then the run's outputs
> (`docs/study/results/sensitivity.json`) and `docs/study/sensitivity-results.md`. Changes to a
> factor, a level, a criterion or a prediction after this commit are deviations and are reported
> as such. Owner directive 2026-09-06: the world is an object of study — fix the grid first, argue
> every bound, report every cell including losses and ties, locate the boundary rather than
> assert it, and let sample size follow the simulated effect.
>
> Scope wording: the field study is out of scope; the evaluation is performed in simulation. Every
> number below is a property of the world model in §1, not a fact about people.

## 0. Questions

- **Q1 (boundary).** Under which world properties does the deployed learned policy (Stages 2–4,
  the service's own code) beat the earliest-first heuristic, tie with it, or lose to it?
- **Q2 (sample size, owner item 1).** Given the _simulated_ effect rather than File 06's assumed
  +8 pp, how many completers would the designed ABAB study need for 0.80 power — as a range
  across worlds — and is that practical?
- **Q3 (prior).** Does the File 04 §3.2 cold-start prior help, do nothing, or hurt, as the world
  departs from it?

## 1. The world model (what is assumed about people, where it comes from, what it cannot represent)

A simulated person u on weekday d places K identical 60-minute tasks into the hourly slots of a
09:00–18:00 working day (reachable dayparts MO 9–12, MD 12–14, AF 14–17, EV 17–18 — File 04
§3.2's daypart grid restricted to the profile-default window). Completion of a block placed in
daypart c is Bernoulli with

```
logit q(u, c, d) = logit(p₀) + s · T(k_u, c) + δ_{u,c} + ε_{u,d}
```

| Term                     | Meaning                                                                                                                                                                                                                                                | Where it comes from                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| p₀                       | adherence baseline: the class-average completion under uniform slot use                                                                                                                                                                                | File 06 §2.1's assumed heuristic baseline 0.45 ("consistent with productivity-app telemetry ranges") — itself an assumption; swept                                                                                                                                                                                                                                                                                                                                       |
| T(k, c)                  | the population slot pattern for chronotype class k: File 04 §3.2's Deep-work μ₀ table on the logit scale, centred per class over the four reachable dayparts (DM: MO +0.84, MD −0.21, AF −0.01, EV −0.62 … DE: MO −0.42, MD −0.34, AF +0.15, EV +0.61) | File 04 §3.2 ("direction and ordering follow chronotype–performance literature (synchrony effect); the absolute values are a day-zero bootstrap"). Using the table's own pattern means the learner's prior is _exactly right in shape_ at s = 1 — the grid measures what happens when it is not (s ≠ 1, δ ≠ 0)                                                                                                                                                           |
| s                        | how strongly completion depends on the slot at the population level; 1 = the table's assumed strength, 0 = no slot effect                                                                                                                              | the 2025 systematic review of synchrony effects (Chronobiology International, 65 studies) finds a synchrony effect in 45 % of adult studies and no chronotype main effect in > 80 % — small-to-absent effects are the norm, so s = 0 is a live world, not a straw man; the table's DM spread (logit 0.74 − logit 0.40 = 1.46) is on the large side, so s = 1 is "the spec's assumption" and s = 2 (a 0.20 → 0.80 swing across the day) an implausible upper stress bound |
| δ_{u,c} ~ N(0, σ_shape²) | an individual's fixed deviation from their class profile, per daypart                                                                                                                                                                                  | the same review: effects are inconsistent across people and tasks; σ_shape = 0.6 makes an individual's profile differ from the class profile as much as classes differ from each other (the table's MM–DM spread ≈ 0.6 logits) — the learner must then learn per person, which is what Beta cells are for                                                                                                                                                                |
| ε_{u,d} ~ N(0, σ_day²)   | a day-level shock shared by that day's blocks ("a bad day"), unforecastable at plan time                                                                                                                                                               | File 06 §2.3's user-level ICC ∈ {0.10, 0.20} converts to logit SDs 0.60 / 0.91; the same magnitudes are used for the day level (no day-level measurement exists — stated)                                                                                                                                                                                                                                                                                                |
| class mix                | the shares of DM / MM / INT / ME / DE                                                                                                                                                                                                                  | MEQ in a middle-aged worker sample: 28 % morning, 52 % intermediate, 20 % evening (Horne–Östberg validation, cited in the MEQ literature) → "adult" 12/16/52/12/8; "uniform" 20 × 5 (the E3 study's mix — over-represents extremes); "student" 8/12/48/20/12 (chronotype is latest around age 20 — Roenneberg et al. 2007 — and File 06 §1.3 recruits from university lists)                                                                                             |
| K                        | tasks per weekday (inbox pressure)                                                                                                                                                                                                                     | File 06 §2.2 assumes ≈ 4 blocks/weekday; the Pixel 7a pass planned 7–13 blocks from a 14-task inbox (build-6 notes) — so 2, 4, 6, 8 span "light" to "the day is nearly full" (9 slots)                                                                                                                                                                                                                                                                                   |
| N                        | completers                                                                                                                                                                                                                                             | File 06's 30; 60 and 120 to locate N₈₀                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**What the world cannot represent (limitations to carry into the thesis):** people do not change
(no habit formation, no carry-over between phases, no Hawthorne/novelty effect — File 06 H4's
mechanism as a _human_ claim is outside the model); tasks are identical (no deadlines, values,
durations, splitting); no calendar busy time, no fatigue/interference (ADR-0007 §4's a-priori
occupancy is empty); no skipping-as-information beyond the 0/1 outcome; rewards are attributed
perfectly at 23:55; the heuristic and learned arms share the window and the tasks exactly; the
plan is executed as placed (no moves). The learner's code is the deployed one; the solver is
replaced by greedy placement (optimal for identical tasks). The P11 generator used by E1/E3
(`synthetic.q_true`) is a _different_ world (tanh, AF below MD for morning types); the grid
uses the File 04 pattern so that the prior/world relation is explicit (§4.2 of the results
explains the E3 morning-type loss in this light).

## 2. Factors, levels, design

| Factor                                 | Levels                                                 | Centre      |
| -------------------------------------- | ------------------------------------------------------ | ----------- |
| s (population slot effect)             | 0, 0.5, 1, 1.5, 2                                      | 1           |
| σ_shape (individual deviation, logits) | 0, 0.3, 0.6                                            | 0.3         |
| σ_day (day shock, logits)              | 0, 0.6, 0.9                                            | 0.6         |
| mix                                    | adult, uniform, student                                | adult       |
| p₀                                     | 0.30, 0.45, 0.60                                       | 0.45        |
| K (tasks/day)                          | 2, 4, 6, 8                                             | 4           |
| prior                                  | informative (File 04 §3.2), flat (μ₀ 0.5, n₀ 8)        | informative |
| N                                      | 30, 60, 120 (prefixes of the same 120 simulated users) | —           |

- **Block A (world core, full factorial):** s × σ_shape × σ_day at the centre of the other
  factors = 45 cells.
- **Block B (population):** mix × s at the centre = 15 cells (5 shared with A).
- **Block C (baseline):** p₀ × s ∈ {0.5, 1, 2} = 9 cells (3 shared).
- **Block D (inbox):** K × s ∈ {0.5, 1, 2} = 12 cells (3 shared).
- **Block E (prior):** flat × s at the centre = 5 cells.
- **75 distinct cells**, R = 40 replicated studies each, 120 users per study (classes assigned by
  deterministic proportional apportionment so every prefix of the user list carries the mix),
  45 weekdays (5 run-in + 4 × 10, ABAB/BABA blocked 1:1 as in E3), ε = 1 slice in both arms,
  learning in both arms, action in B only. Seeds: 5000 + 100 · cell index + replicate.
- Everything else as the registered E3 (`docs/study/preregistration.md` §4.1): priors n₀ = 8
  in-hours / 4 out, TS σ² = 0.25, blend 0.7/0.3, decay 28 d, plan at 06:00, attribution 23:55.

## 3. Outputs per cell (all reported; nothing suppressed)

- Effect d̄ = mean over the 120 users of (B − A completion, analysed phases), ± MC SE over R; the
  world's analytic ceiling (oracle over the drawn δ, without ε) and efficiency = d̄ / ceiling.
- **Verdict** (pre-registered thresholds): **WIN** if d̄ > +1 pp and d̄ > 0 in ≥ 90 % of
  replicates; **LOSS** if d̄ < −1 pp and d̄ < 0 in ≥ 90 %; **TIE** otherwise. 1 pp is one-eighth
  of File 06's smallest effect of interest and ≈ 10 MC SE at this design — a tie band, not a
  significance test.
- Per-class effects; the learning signature ḡ (phase-pair growth); exploration cost per arm.
- **Sample size:** per replicate, the per-user SD of dᵢ and the analytic paired-t N₈₀ (two-sided
  α = .05, power .80, noncentral t) from (d̄, SD); the median N₈₀ over replicates; and the
  empirical rejection rates at N = 30 / 60 / 120 (paired t on user prefixes). N₈₀ is reported
  as **"> 120"** when the median exceeds the grid maximum, and as a **range across worlds**,
  never a single number.

## 4. Predictions (directional, with bands; the analytic ceilings are in `sensitivity.json`)

Analytic ceilings at σ = 0, adult mix, K = 4, p₀ = 0.45: 0 / 2.2 / 4.3 / 6.4 / 8.4 pp for s = 0 /
0.5 / 1 / 1.5 / 2 (uniform mix 0 / 3.3 / 6.5 / 9.6 / 12.5; student 0 / 2.8 / 5.6 / 8.3 / 10.9).
E3 captured 0.6–0.7 of its ceiling; the bands below assume 0.4–0.8.

| ID                           | Prediction                                                                                                                                                                                                        | Criterion                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| S1 (null world)              | s = 0, σ_shape = 0: TIE or LOSS at every σ_day — the learned arm pays for TS noise and for a prior that asserts a pattern the world lacks. **No scheduler can help when completion does not depend on the slot.** | d̄ ∈ [−2, +0.5] pp in all 3 cells; none WIN                                                         |
| S2 (individual effects only) | s = 0, σ_shape ≥ 0.3: WIN through per-user learning alone, capturing < 50 % of the (δ-only) ceiling at σ_shape = 0.6; the flat prior beats the informative one at s = 0 (Block E vs A)                            | WIN at σ_shape = 0.6 for σ_day ≤ 0.6; efficiency < 0.5; flat − informative > 0 at s = 0            |
| S3 (boundary in s)           | d̄ increases in s at every (σ_shape, σ_day); the WIN boundary lies at **s = 0.5** (d̄ 0.9–1.8 pp, the tie band's edge) at the adult mix — WIN from s ≥ 1 everywhere                                                 | monotone in s within MC SE; WIN for all s ≥ 1 cells of Block A; s = 0.5 cells within [0.5, 2.0] pp |
| S4 (day noise)               | σ_day compresses the marginal slot effect and slows learning: d̄ at σ_day = 0.9 is 10–35 % below σ_day = 0 at the same (s ≥ 1, σ_shape)                                                                            | ratio within [0.65, 0.90]                                                                          |
| S5 (individual deviation)    | σ_shape adds a learnable individual signal: at s ≥ 1, d̄ at σ_shape = 0.6 exceeds σ_shape = 0 (the ceiling grows and the Beta cells learn it)                                                                      | d̄(0.6) > d̄(0) at s ≥ 1, σ_day ≤ 0.6                                                                |
| S6 (mix)                     | d̄ scales with the evening-type share: uniform (40 %) > student (32 %) > adult (20 %) at every s ≥ 0.5                                                                                                             | ordering holds at s ∈ {0.5, 1, 1.5, 2}                                                             |
| S7 (baseline)                | d̄ is largest at p₀ = 0.45 and 5–20 % smaller at 0.30 and 0.60 (logistic compression; ceilings 3.6 / 4.3 / 4.2 pp at s = 1)                                                                                        | both ratios within [0.75, 1.0] at s ∈ {1, 2}                                                       |
| S8 (inbox)                   | d̄ peaks at K = 4, is lower at K = 2 (less to gain) and K = 6, and collapses at K = 8 (both arms fill 8 of 9 slots; ceiling 0.9 pp at s = 1) — boundary between K = 6 and K = 8                                    | K = 8 is TIE at s ≤ 1; d̄(4) > d̄(2) and d̄(4) > d̄(8) at every s                                      |
| S9 (prior, Q3)               | informative ≥ flat for s ≥ 1 (the prior's shape is right); flat ≥ informative at s = 0; at s = 0.5 within ±1 pp of each other                                                                                     | as stated                                                                                          |
| S10 (per class)              | morning types no longer lose: DM/MM within [−1, +1.5] pp at s ≥ 1, σ_shape = 0 (the table's own pattern gives them a small AF-over-MD gain the heuristic misses); ME/DE carry the effect                          | as stated                                                                                          |
| S11 (sample size, Q2)        | centre world (s = 1, σ_shape 0.3, σ_day 0.6, adult, K 4): median N₈₀ **50–100**; rejection at N = 30 **0.25–0.50**; s = 0.5: N₈₀ > 120; s = 1.5: 25–50; s = 2: ≤ 30; uniform mix at s = 1: 25–50                  | as stated                                                                                          |
| S12 (learning signature)     | ḡ > 0 on average only in flat-prior cells and at σ_shape = 0.6 (something to learn); ≈ 0 (\|ḡ\| ≤ 0.5 pp) in the informative σ_shape = 0 cells                                                                    | as stated                                                                                          |

**What would count as the grid being "too kind":** WIN in the s = 0 / σ_shape = 0 cells, or no
LOSS/TIE anywhere in Block A. **What would count as a substantive failure of the learned
policy:** TIE or LOSS at s ≥ 1 with σ_shape = 0 and σ_day = 0 (the world the prior was written
for).

## 5. Reporting

`docs/study/sensitivity-results.md`: the full 75-cell table (every cell, verdict, effect,
ceiling, efficiency, N₈₀, rejection at 30/60/120), a boundary statement of the form "the learned
policy beats the heuristic when …, ties when …, loses when …" with the located boundary, the Q2
sample-size range across worlds and its practicality, the Q3 prior answer, predictions S1–S12
against outcomes, deviations, and the §1 limitations. Thesis: corrections #56 (the study as the
main quantitative contribution) and #57 (N recomputed).
