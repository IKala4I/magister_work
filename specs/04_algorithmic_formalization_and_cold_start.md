# 04 — Algorithmic Formalization & Cold Start

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** Unified solver formulation · Offline policy evaluation (RQ4) · Cold-start prior mapping
> **Status:** v1.0 (SDD Phase 3) · Supersedes `03_technical_architecture.md` §3.2 Stages 1/4/5 where noted.

---

## 1. Unified Bandit-Weighted CP-SAT Formulation

### 1.1 Why the redesign

File 3 described *enumerate feasible pairs → score → re-solve* as three stages. Two problems: (a) at a weekly horizon the pair set $|\mathcal{T}| \times |\text{starts}|$ grows into the $10^4$ range, making per-pair bandit scoring the bottleneck; (b) a score-then-perturb exploration step outside the solver breaks the propensity bookkeeping needed for offline evaluation (§2). The fix is a **single optimization problem** in which the contextual bandit supplies the objective coefficients, and exploration happens *inside* the weight construction via Thompson sampling — one posterior sample, one solve.

**Key decoupling — context bucketing.** Bandit scores do not depend on the raw tick, only on the slot's context features. Define a bucketing map $\phi: \mathcal{K} \to \mathcal{C}$ (daypart × day-type × relative-position class, $|\mathcal{C}| \approx 12$–$18$). The bandit is queried once per $(\tau, c)$ pair — at most $|\mathcal{T}| \cdot |\mathcal{C}| \approx 50 \times 15 = 750$ dot products (microseconds) — regardless of horizon length. The combinatorial explosion never reaches the ML layer; the solver handles the combinatorics, which is what CP-SAT is for.

### 1.2 Sets, parameters, precomputation

| Symbol | Meaning |
|---|---|
| $\mathcal{T}$ | candidate tasks; $\mathcal{K} = \{1,\dots,K\}$ ticks of length $\Delta = 15$ min over horizon $H$ (day: $K \le 96$; week: $K \le 672$) |
| $\mathcal{W} \subseteq \mathcal{K}$ | workable ticks = working hours ∖ (sleep ∪ fixed events ∪ buffers) |
| $d_\tau$ | duration in ticks; $b$ = buffer ticks; $e_\tau$, $\mathrm{dl}_\tau$ = earliest / deadline tick |
| $\mathcal{F}_\tau$ | **precomputed feasible starts**: $\mathcal{F}_\tau = \{k : [k, k + d_\tau + b) \subseteq \mathcal{W},\; e_\tau \le k,\; k + d_\tau \le \mathrm{dl}_\tau\}$ |
| $\hat{q}_{\tau,c}$ | bandit completion estimate for task $\tau$ in context bucket $c$ (§1.4) |
| $v_\tau \in \{1,2,3\}$ | task value; $g(\cdot)$ urgency multiplier, $g(u) = 1 + \gamma_u e^{-u/\eta}$ with $u = \mathrm{dl}_\tau - k$ |

Domain reduction ($\mathcal{F}_\tau$) is where naive explosion dies: deadlines, earliest-starts and fixed events typically cut candidate starts per task to $10^1$–$10^2$.

### 1.3 The optimization problem (ILP form)

**Decision variables:** $x_{\tau,k} \in \{0,1\}$ for $k \in \mathcal{F}_\tau$ (task $\tau$ starts at tick $k$); derived $y_\tau = \sum_{k \in \mathcal{F}_\tau} x_{\tau,k}$; soft-penalty slacks $z^{sw}_k, z^{fr}_\tau \ge 0$.

**Objective weights** (bandit → solver interface):

$$w_{\tau,k} \;=\; v_\tau \cdot \hat{q}_{\tau,\phi(k)} \cdot g(\mathrm{dl}_\tau - k)$$

**Objective:**

$$\max \;\; \sum_{\tau \in \mathcal{T}} \sum_{k \in \mathcal{F}_\tau} w_{\tau,k}\, x_{\tau,k} \;-\; \lambda_d \sum_{\tau \in \mathcal{T}_{\text{crit}}} M_\tau (1 - y_\tau) \;-\; \lambda_s \sum_{k} z^{sw}_k \;-\; \lambda_f \sum_{\tau} z^{fr}_\tau$$

Note on double counting: because $w$ already contains $v_\tau$, an *un*-scheduled task forfeits its weight automatically; the explicit deferral term applies **only** to $\mathcal{T}_{\text{crit}}$ (deadline within horizon or pinned), with big-ish $M_\tau$ — it encodes hard-ish criticality, not general value, so value is never counted twice.

**Constraints:**

$$\text{(C1) at most one start:}\quad \sum_{k \in \mathcal{F}_\tau} x_{\tau,k} = y_\tau \le 1, \qquad y_\tau = 1 \;\; \forall \tau \text{ pinned}$$

$$\text{(C2) no overlap (unit resource):}\quad \sum_{\tau} \;\; \sum_{\substack{k' \in \mathcal{F}_\tau \\ k' \le k < k' + d_\tau + b}} x_{\tau,k'} \;\le\; 1 \qquad \forall k \in \mathcal{W}$$

(buffers via the effective duration $d_\tau + b$; fixed events are excluded from $\mathcal{W}$ upstream, so they need no constraint)

$$\text{(C3) splittable tasks:}\quad \tau \to \{\tau^{(1)}, \dots, \tau^{(m)}\},\;\; d_{\tau^{(j)}} \ge d_{\min},\;\; \textstyle\sum_j y_{\tau^{(j)}} \cdot d_{\tau^{(j)}} \ge d_\tau \cdot y_\tau \text{ (all-or-none via chunk chain)}$$

$$\text{(C4) same-category run-length (soft):}\quad \sum_{\tau \in \mathcal{T}_g} \sum_{\substack{k' \in \mathcal{F}_\tau}} \big|[k', k'+d_\tau) \cap [k, k+L)\big|\; x_{\tau,k'} \;\le\; H_g + z^{sw}_k \quad \forall k, \; \forall \text{category } g$$

$$\text{(C5) fragmentation (soft):}\quad z^{fr}_\tau \ge \#\text{chunks}(\tau) - 1 \;\; \text{for splittable } \tau$$

### 1.4 Exploration inside the weights — combinatorial Thompson sampling

Per category $g$, the bandit maintains linear-Gaussian state $(\hat\theta_g, A_g)$ (File 3 §3.4). At plan time, **sample once**:

$$\tilde\theta_g \sim \mathcal{N}\!\big(\hat\theta_g,\; \sigma^2 A_g^{-1}\big), \qquad \hat{q}_{\tau,c} = \mathrm{clip}_{[0,1]}\!\big(x_{\tau,c}^\top \tilde\theta_{g(\tau)}\big)$$

then solve the ILP with the resulting $w$. The returned assignment is thereby a draw from the posterior probability-matching distribution over *plans* — Thompson sampling lifted to the combinatorial semi-bandit setting (cf. Wen, Kveton et al., combinatorial TS with semi-bandit feedback). The LinUCB variant (A/B arm, RQ3) replaces the sample with $\hat{q}_{\tau,c} = \mathrm{clip}\big(x^\top \hat\theta_g + \alpha_{\text{ucb}} \sqrt{x^\top A_g^{-1} x}\big)$ and is deterministic given state.

**Budgeted explicit exploration (for §2's evaluability).** Independently, with probability $\varepsilon$ per plan (default 1 slot/day): one non-critical task's placement is drawn **uniformly from its top-$m$ candidate buckets** ($m = 4$) and pinned into the solve. Its propensity is *known exactly*, $p = \varepsilon / m$, is logged on the recommendation row, and the block renders as an "experiment" (FR-22). This randomized slice is the substrate for unbiased offline evaluation.

### 1.5 Solver implementation & complexity (CP-SAT)

Implementation uses CP-SAT's native modeling rather than raw ILP: `NewOptionalIntervalVar(start_τ, d_τ+b, end_τ, y_τ)` + `AddNoOverlap` replaces (C2) with a far tighter propagated global constraint; weights enter via a channeled objective on start-domain literals.

- **Size:** worst case $\sum_\tau |\mathcal{F}_\tau| \le 50 \times 300 \approx 1.5\times10^4$ literals — small for CP-SAT.
- **Anytime:** `max_time_in_seconds = 1.5`; best feasible solution returned (CP-SAT is anytime), meeting NFR-P1 on 2 vCPU.
- **Stability:** previous plan injected via `AddHint(...)` — warm start *and* an anti-"thrashing" prior (placements only move when the objective says it's worth it).
- **Degradation ladder:** $|\text{literals}| > 4\times10^4$ → 30-min granularity; still hot → rolling day-by-day decomposition. Both flagged in telemetry.

## 2. Offline Policy Evaluation — Formalization (RQ4)

### 2.1 Target quantity

A (per-placement) policy $\pi(a \mid x)$ maps context $x$ to a placement $a = (\tau, s)$ within candidate set $\mathcal{A}(x)$. We estimate the policy value

$$V(\pi) \;=\; \mathbb{E}_{x \sim \mathcal{D}} \; \mathbb{E}_{a \sim \pi(\cdot \mid x)} \; \mathbb{E}\big[\, r \mid x, a \,\big]$$

from logs $\{(x_i, a_i, r_i, p_i)\}_{i=1}^n$ produced by the deployed logging policy $\mu$, where $p_i = \mu(a_i \mid x_i)$ is the **logged propensity** (schema change: `recommendations.propensity real` — see audit).

### 2.2 Replay estimator (Li et al., 2011)

$$\hat{V}_{\text{replay}}(\pi) \;=\; \frac{\displaystyle\sum_{i=1}^{n} \mathbb{1}\!\big[\pi(x_i) = a_i\big]\; r_i}{\displaystyle\sum_{i=1}^{n} \mathbb{1}\!\big[\pi(x_i) = a_i\big]}$$

Unbiased **iff** the logging policy chooses uniformly at random over $\mathcal{A}(x)$ and rewards are independent of the logger — which our greedy/TS traffic violates. Therefore replay is computed **only on the randomized exploration slice** of §1.4, where within the top-$m$ set the draw *is* uniform: candidate policies are evaluated restricted to $\mathcal{A}_m(x)$, matches are exact, and Li et al.'s unbiasedness argument applies. Effective data rate is $\approx \varepsilon/m$ of exploration events — the price of validity, budgeted deliberately.

### 2.3 Inverse Propensity Scoring family (all logged traffic)

$$\hat{V}_{\text{IPS}}(\pi) \;=\; \frac{1}{n}\sum_{i=1}^{n} \frac{\pi(a_i \mid x_i)}{p_i}\; r_i, \qquad \omega_i := \frac{\pi(a_i \mid x_i)}{p_i}$$

Variance-controlled variants used in the thesis:

$$\hat{V}_{\text{clip}}(\pi) = \frac{1}{n}\sum_i \min(\omega_i, M)\, r_i \qquad\quad \hat{V}_{\text{SNIPS}}(\pi) = \frac{\sum_i \omega_i r_i}{\sum_i \omega_i}$$

$$\hat{V}_{\text{DR}}(\pi) \;=\; \frac{1}{n}\sum_{i=1}^{n} \Big[\, \hat{r}\big(x_i, \pi(x_i)\big) \;+\; \omega_i \big(r_i - \hat{r}(x_i, a_i)\big) \Big]$$

with $\hat{r}$ the direct-method reward model (a calibrated gradient-boosted / logistic model on $(x,a)$). DR is the primary estimator: unbiased if *either* propensities *or* $\hat{r}$ are correct. Reliability is always reported via the effective sample size

$$\mathrm{ESS} \;=\; \frac{\big(\sum_i \omega_i\big)^2}{\sum_i \omega_i^2}$$

and estimates with $\mathrm{ESS} < 100$ are treated as non-evidence.

**Propensities under TS.** Exact $\mu(a\mid x)$ for a greedy-over-sample combinatorial policy is intractable; we (a) use *exact* propensities on the randomized slice, and (b) for TS traffic approximate $p_i$ by Monte-Carlo over $K=32$ posterior samples *scored* (not solved) per context — logged asynchronously by the nightly job, an acknowledged approximation subjected to sensitivity analysis.

### 2.4 Slate correction

A plan is a slate $A$; we assume additive slate reward $r(A) = \sum_{(\tau,s) \in A} r_{\tau,s}$, justified because rewards are attributed per placement (File 3 §3.4) and cross-placement interference is partially absorbed by context features (*tasks-already-done-today*). Per-pair decomposition then licenses the unit-level estimators above (cf. slate OPE / pseudo-inverse estimator, Swaminathan et al. 2017, kept as a robustness alternative). Violation of additivity is an explicit, tested limitation (interference probe: does morning-slot reward shift conditional on afternoon load?).

## 3. Cold-Start Mapping: rMEQ → Priors & Cluster

### 3.1 Instrument

Onboarding uses the **reduced Morningness–Eveningness Questionnaire (rMEQ; Adan & Almirall, 1991)** — 5 items (paraphrased: preferred wake time · morning grogginess · evening bedtime drive · self-judged best hours · self-labeled morning/evening type), summed score $R \in [4, 25]$, standard classes:

| $R$ | Class $c_0$ |
|---|---|
| 22–25 | **DM** — definitely morning |
| 18–21 | **MM** — moderately morning |
| 12–17 | **INT** — intermediate |
| 8–11 | **ME** — moderately evening |
| 4–7 | **DE** — definitely evening |

Skipped survey (FR-02 allows it) ⇒ $c_0 = $ INT with prior strength halved (§3.3).

### 3.2 Prior mean matrix — Deep-work anchor $\mu_0^{\text{Deep}}(c_0, p)$

Dayparts $p$: EM 06–09 · MO 09–12 · MD 12–14 · AF 14–17 · EV 17–20 · NT 20–24.

| Daypart | DM | MM | INT | ME | DE |
|---|---|---|---|---|---|
| EM 06–09 | .78 | .70 | .55 | .42 | .35 |
| MO 09–12 | .74 | .72 | .66 | .55 | .48 |
| MD 12–14 | .50 | .52 | .52 | .52 | .50 |
| AF 14–17 | .55 | .58 | .62 | .64 | .62 |
| EV 17–20 | .40 | .48 | .58 | .68 | .72 |
| NT 20–24 | .30 | .36 | .48 | .62 | .74 |

Direction and ordering follow chronotype–performance literature (synchrony effect); the **absolute values are a day-zero bootstrap only** and are re-fit quarterly by empirical Bayes from mature users (§3.5) — this is the honest answer to "where do these numbers come from."

### 3.3 Category transform and Beta parameters

Other categories are logit-affine transforms of the Deep anchor:

$$\mu_0^{(g)}(c_0, p) \;=\; \sigma\Big( \gamma_g \,\mathrm{logit}\big(\mu_0^{\text{Deep}}(c_0, p)\big) + \delta_g + \delta_{g,p} \Big)$$

| Category $g$ | $\gamma_g$ (energy sensitivity) | $\delta_g$ | Extra $\delta_{g,p}$ |
|---|---|---|---|
| Deep / creative | 1.00 | 0 | — |
| Admin / shallow | 0.45 | +0.25 | — (flat, easier) |
| Physical / errands | 0.55 | +0.10 | +0.35 in AF (circadian body-temp peak) |
| Learning | 0.85 | −0.05 | — |

Beta priors per cell (cell = category × daypart × day-type):

$$\alpha_0 = n_0\, \mu_0^{(g)}, \qquad \beta_0 = n_0\,\big(1 - \mu_0^{(g)}\big)$$

**Prior strength** $n_0$ (pseudo-observations): **8** inside declared working hours, **4** outside them (less confidence away from stated patterns ⇒ higher posterior variance ⇒ TS explores there proportionately), **halved** overall if the survey was skipped. With ~4–6 attributed outcomes per active cell per week, personal evidence overtakes the prior in ≈ 1.5–2 weeks — matching the three-rung cold-start UX (File 3 §3.6). **Weekend cells:** $\mu_0^{\text{wknd}} = \tfrac{1}{2}\mu_0^{\text{wkday}} + \tfrac{1}{2}\cdot 0.55$, with $n_0$ halved.

### 3.4 ALS cluster assignment

- **Day 0:** cluster id $:= c_0$ (the five rMEQ classes double as seed behavioral clusters; population priors above are per-class aggregates).
- **After ≥ 30 attributed outcomes:** user is folded into the trained factor space by the standard ALS fold-in (fixed item factors $Y$):

$$x_u \;=\; \big(Y^\top C_u Y + \lambda I\big)^{-1} Y^\top C_u\, p_u$$

then reassigned to the nearest behavioral centroid (k-means over user factors; $k$ chosen by silhouette, re-fit nightly). Cluster switch ⇒ that cluster's cell aggregates become the *new* $(\alpha_0, \beta_0)$ **only for still-unvisited cells** (visited cells keep their personal posteriors — priors never overwrite evidence).

### 3.5 Empirical-Bayes refresh (removing the hand-tuning objection)

Quarterly, for each (class, cell): fit $(\hat\alpha_0, \hat\beta_0)$ by method of moments on the distribution of mature-user cell rates $\{\hat\theta_u\}$ — sample mean $m$ and variance $s^2$ give

$$\hat\alpha_0 = m\Big(\frac{m(1-m)}{s^2} - 1\Big), \qquad \hat\beta_0 = (1-m)\Big(\frac{m(1-m)}{s^2} - 1\Big)$$

so §3.2's table is version 0 of a learned object, with its own row in `model_registry` (`kind='priors'`).

---

*Traceability: §1 supersedes File 3 §3.2 Stages 1+4+5 · §1.4/§2 require `recommendations.propensity` (schema migration M-01) · §3 implements File 3 §3.6 rung 1 and FR-02.*
