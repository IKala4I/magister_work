# 06 — Evaluation Protocol

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** Pre-registered field-study design (ABAB) · Power analysis · Related-work matrix · Validity threats
> **Status:** v1.0 (SDD Phase 5) · To be frozen as an OSF pre-registration before first participant enrollment.

---

## 1. Pre-Registered Field Study — Within-Subject Reversal Design (ABAB)

### 1.1 Conditions

| Arm | Policy driving placements | Notes |
|---|---|---|
| **A — Heuristic baseline** | Deterministic scheduler replicating incumbent logic: deadline-first, priority tiers, user-declared preferred hours (a faithful Motion/Reclaim-class rule engine, NFR-R2 fallback promoted to primary) | Feedback **logging stays on** in A; the model *learns* in all phases but *acts* only in B |
| **B — Learned policy** | Full hybrid pipeline: Beta-cell energy model + collaborative priors + combinatorial TS + CP-SAT (Files 3–4) | Includes the budgeted top-$m$ randomized slot ($\varepsilon = 1$ placement/day, File 4 §1.4) |

**Blinding.** Single-blind: the UI is pixel-identical across arms — the heuristic arm generates template rationales and confidence styling from its rule weights, so participants cannot infer condition from surface cues. The analyst works on coded condition labels; unblinding occurs only after the analysis script (frozen at pre-registration) has been run.

### 1.2 Design & schedule

- **Structure:** within-subject reversal, 4 phases × **2 weeks** each (each phase spans two full weekly cycles — adherence is strongly weekday-periodic), total **8 weeks** per participant.
- **Counterbalancing:** participants randomized 1:1 to sequence **ABAB** or **BABA** (blocked randomization, block size 4), which converts order/maturation effects into an estimable between-sequence factor rather than a confound.
- **Embedded micro-randomization:** independently of phase, B-phases contain the per-placement top-$m$ uniform randomization of File 4 §1.4 — formally a **micro-randomized trial (MRT)** nested inside the reversal design (Klasnja et al., 2015; Liao et al., 2016). Phase contrasts answer the *policy-level* question (H1); the MRT slice answers the *slot-level* causal question ("does slot choice causally move completion?") with exact propensities. This hybrid is a deliberate defense against the standard critique that reversal designs cannot support causal claims at the decision-point level.
- **Onboarding run-in:** week 0 (not analyzed): install, onboarding survey, habituation; ensures phase 1 does not conflate novelty with condition.

### 1.3 Participants

- **Target:** N = 30 completers (recruit 42; §2 justifies both numbers).
- **Inclusion:** ≥18 y; own smartphone (iOS 16+/Android 12+); self-reported ≥5 schedulable tasks/week; consent to research data use (the "research cohort" flag, File 3 §7).
- **Exclusion:** current use of an auto-scheduling tool (Motion/Reclaim/SkedPal) — avoids contamination; shift workers with employer-dictated hours (no scheduling latitude).
- **Recruitment:** university lists + productivity communities; incentive: premium-for-life + €20 voucher on completion (paid regardless of outcomes, stated in consent).
- **Ethics:** university ethics-board approval before enrollment; GDPR-compliant handling per DPIA (File 3 §7); withdrawal at any time with data erasure (FR-42).

### 1.4 Outcomes (all computed by pre-registered code)

| Tier | Measure | Definition |
|---|---|---|
| **Primary** | **Plan Adherence Rate (PAR)** | Per block: completed-as-scheduled (focus started within ±15 min of slot start and finished ≥50%) ∈ {0,1}; aggregated as model-based condition effect (§1.6). Blocks displaced by external calendar conflicts are **excluded from the denominator** (confound rule, File 3 §3.4) |
| Secondary S1 | Recommendation acceptance | shown → {accepted/pinned} vs {moved/rejected} |
| Secondary S2 | Weekly completed-task count | tasks reaching `done`, per user-week |
| Secondary S3 | UMUX-Lite (Lewis et al., 2013) | end of each phase (4 measurements) |
| Secondary S4 | Plan-trust single item | "Today's plan felt realistic" (1–7), sampled 2×/week |
| Exploratory | MRT slot effect | causal effect of slot bucket on completion within the randomized slice (IPS/DR, File 4 §2) |
| Exploratory | Calibration | ECE of predicted $\hat q$ vs realized completion, per phase |

### 1.5 Hypotheses (directional, frozen)

- **H1 (primary):** PAR is higher under B than A (OR > 1).
- **H2:** acceptance rate higher under B.
- **H3:** UMUX-Lite and plan-trust higher under B.
- **H4 (mechanism):** the B-over-A PAR gap *grows* from phase-pair 1 to phase-pair 2 (learning signature: sequence × phase interaction > 0).

### 1.6 Analysis plan (frozen before unblinding)

**Primary model** — block-level mixed-effects logistic regression:

$$\text{logit}\, P(\text{complete}_{ijk}) = \beta_0 + \beta_1 \text{cond}_{ij} + \beta_2 \text{phase}_j + \beta_3 \text{weekday}_k + \beta_4 \text{category}_k + u_{0i} + u_{1i}\text{cond}_{ij}$$

with random intercept and random condition slope per user $i$; report $e^{\beta_1}$ with 95% CI; α = .05 **two-sided** despite the directional hypothesis (conservative). **Robustness:** (a) per-user phase-mean paired analysis, Wilcoxon signed-rank; (b) refit excluding phase 1 (novelty); (c) refit excluding exploration-labeled blocks (they are visible "experiments" and could depress B's PAR — excluding them isolates the exploitative policy). **Secondaries:** Holm–Bonferroni across S1–S4. **Missing data:** intention-to-treat; mixed models under MAR; sensitivity: completers-only. **Pre-registered exclusions:** users with <10 shown blocks in any phase; user-days flagged by outage telemetry; the external-conflict rule above. **Carryover** (the known weakness of reversal designs with learning interventions — habits formed in B persist into A): addressed by (i) counterbalancing, (ii) H4 explicitly modeling it as signal rather than pretending it away, (iii) a supplementary **between-subject contrast on phase 1 only** (clean, no carryover, lower power — reported as convergent evidence, not primary).

## 2. Power Analysis

### 2.1 Assumptions

Baseline adherence under heuristics $p_A \approx 0.45$ (consistent with productivity-app telemetry ranges; verified in pilot). Smallest effect of interest: **+8 percentage points** ($p_B = 0.53$, OR ≈ 1.38) — chosen because a smaller gap would not justify the ML architecture over rules in product terms (effect-size floor argued from practical significance, a stance committees respect).

### 2.2 Conservative analytic floor (paired means)

Each participant contributes ~4 recommended blocks/weekday × 10 weekdays/phase × 2 phases ≈ **80 blocks per condition**. Per-user condition-mean sampling SE ≈ $\sqrt{0.25/80} = 0.056$; within-user difference sampling SD ≈ 0.079; adding between-user heterogeneity of the true effect ($\tau \approx 0.12$, deliberately pessimistic) gives $SD_d \approx \sqrt{0.079^2 + 0.12^2} \approx 0.15$. Paired-t sample size at power 0.80, α = .05 two-sided:

$$n \;=\; \frac{(z_{0.975} + z_{0.80})^2}{(\Delta / SD_d)^2} \;=\; \frac{(1.96 + 0.84)^2}{(0.08/0.15)^2} \;\approx\; \frac{7.84}{0.284} \;\approx\; 27.6 \;\Rightarrow\; \mathbf{28}$$

| Detectable Δ | $SD_d = 0.12$ | $SD_d = 0.15$ | $SD_d = 0.18$ |
|---|---|---|---|
| +6 pp | 32 | 49 | 71 |
| **+8 pp** | 18 | **28** | 40 |
| +10 pp | 12 | 18 | 26 |

**Decision: N = 30 completers** (covers Δ = 8 pp at the pessimistic $SD_d$ = 0.15 with margin); **recruit 42** assuming ≤30% attrition over 8 weeks (typical for 2-month app studies). Note the paired-means calculation is the *conservative floor*: the pre-registered primary GLMM exploits within-phase block-level variation and is strictly more efficient.

### 2.3 Pre-registered simulation-based power (primary method)

Because GLMM power has no clean closed form, the registration includes a simulation script (5,000 replicates): generate block-level data from the §1.6 model with $\beta_1 = \log(1.38)$, ICC ∈ {0.10, 0.20}, random-slope SD from pilot; fit; record rejection rate. Acceptance criterion: ≥0.80 power at N = 30 under the pessimistic cell, else N is raised *before* enrollment. The analytic table above is the sanity check on the simulation, not vice versa. MRT-slice power for the exploratory slot-level effect follows Liao et al. (2016) sample-size formulae and is reported as achieved (not target) power, since ε is fixed by product constraints.

## 3. Related-Work Matrix

Dimensions: **D1** recommends *time placement* (not items) · **D2** hard resource constraints (slots consumed) · **D3** online learning from behavior · **D4** delayed/confounded behavioral reward · **D5** personal scheduling domain · **D6** OPE under counterfactual sparsity · **D7** deployed field evaluation.

| Stream / representative work | D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---|---|---|---|---|---|---|---|
| Time-aware CF — TimeSVD++ (Koren, KDD 2009) | ✗ (time as *context* for items) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Sequence-aware RecSys — GRU4Rec (Hidasi et al., ICLR 2016); SASRec (Kang & McAuley, ICDM 2018) | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Implicit-feedback CF — Hu, Koren & Volinsky (ICDM 2008) | ✗ | ✗ | ✗ | ◐ (confidence weights) | ✗ | ✗ | ✗ |
| Contextual bandits for recommendation — LinUCB (Li et al., WWW 2010) | ✗ | ✗ | ✓ | ✗ (instant CTR) | ✗ | ◐ | ✓ |
| Bandit OPE — replay (Li et al., WSDM 2011); SNIPS (Swaminathan & Joachims, 2015); DR (Dudík et al., ICML 2011); slate PI (Swaminathan et al., NeurIPS 2017) | ✗ | ✗ | — | ✗ | ✗ | ✓ | ◐ |
| Combinatorial semi-bandits — Kveton et al. (AISTATS 2015); Wen et al. (ICML 2015) | ◐ (abstract arms) | ✓ (matroid/combinatorial) | ✓ | ✗ | ✗ | ✗ | ✗ |
| JITAI framework — Nahum-Shani et al. (Ann. Behav. Med. 2018) | ◐ (*when to intervene*) | ✗ | ◐ | ✓ | ◐ (health behavior) | ✗ | ✓ |
| MRT + bandit mHealth — HeartSteps (Klasnja et al., 2015; Liao et al., IMWUT 2020) | ◐ (timing of nudges) | ✗ | ✓ | ✓ | ◐ | ◐ | ✓ |
| Notification-timing bandits — Yancey & Settles (KDD 2020) | ◐ | ✗ | ✓ | ◐ | ✗ | ◐ | ✓ |
| OR / CP scheduling & calendar assistants — CP-SAT scheduling practice; Calendar.help (Cranshaw et al., CHI 2017) | ✓ | ✓ | ✗ | ✗ (assumes execution) | ✓ (meetings) | ✗ | ✓ |
| Procrastination theory — temporal motivation theory (Steel, Psych. Bull. 2006) | — | — | — | ✓ (theory of delay) | ✓ | — | — |
| **Kairos (this work)** | **✓** | **✓** | **✓** | **✓** | **✓** | **✓** | **✓** |

✓ central · ◐ partial/adjacent · ✗ absent · — not applicable.

**Gap statement (one sentence for the defense):** each column exists somewhere in the literature, but **no prior work occupies the full row** — constrained slot recommendation (D1+D2, from OR and combinatorial bandits) driven by online learning from delayed behavioral rewards (D3+D4, from bandits and JITAI) in the personal-scheduling domain (D5) with a sparsity-aware evaluation protocol (D6) and a deployed field study (D7); Kairos's contribution is the *integration* plus the formalization that makes the integration principled (File 1 §2.2, File 4).

**Stream → component mapping (what we adopt vs. what is new):**

| Stream | Adopted into Kairos | What Kairos adds beyond it |
|---|---|---|
| Implicit CF (Hu et al.) | ALS priors, Stage 3 | Priors feed *Beta cells* for a bandit, not a recommender's output |
| LinUCB / TS | Stage 4 scoring | Lifted to plan-level combinatorial TS with solver-integrated exploration (File 4 §1.4) |
| Combinatorial semi-bandits | Regret framing | Real behavioral rewards, volatile arm sets, deployed system |
| OPE literature | Replay/IPS/SNIPS/DR toolbox | Applied under slot-inventory sparsity with a designed-in randomized slice |
| JITAI / MRT | Micro-randomization, delayed-reward attribution mindset | Intervention = *the schedule itself*, under hard calendar constraints |
| OR scheduling | CP-SAT assignment layer | Objective coefficients are *learned completion probabilities*, not fixed priorities |

## 4. Threats to Validity (pre-empted)

- **Internal — carryover & model maturation:** §1.6's counterbalancing, H4, and the phase-1 between-subject contrast; model *acts* only in B, removing the "B trains during A" asymmetry in the action pathway.
- **Internal — novelty/Hawthorne:** run-in week; phase-1-excluded robustness fit; identical UI across arms.
- **External — sample:** students/knowledge workers (WEIRD skew) — stated as scope, matching the product's target segment (File 2 §1), not hidden.
- **Construct — PAR as proxy:** adherence ≠ wellbeing; S3/S4 subjective measures triangulate; over-scheduling gaming is impossible since both arms schedule from the same task inbox.
- **Statistical conclusion:** single primary outcome; Holm on secondaries; ESS gates on all OPE estimates (File 4 §2.3); simulation-based power pre-registered.
- **Researcher degrees of freedom:** OSF registration freezes hypotheses, exclusions, model formulae, and the analysis script; deviations reported as such.

## 5. Reproducibility & Artifact Statement

OSF pre-registration (design + analysis code) · public repo (client, backend, training pipeline) · anonymized event dataset (Parquet, HF datasets — the archive pipeline of the Phase 4 audit) · `model_registry` versions pinning every model that served study traffic · one-command replay harness reproducing all offline-evaluation tables from the raw logs.

---

*Traceability: §1.1-B ↔ Files 3–4 pipeline · MRT slice ↔ File 4 §1.4/§2.2 · confound exclusions ↔ File 3 §3.4 · dataset archive ↔ Phase 4 audit §1 · This file completes RQ1–RQ4 coverage: RQ1/RQ3 → §1, RQ2 → attribution ablations on study logs, RQ4 → File 4 §2 executed per §5.*
