# 01 — Vision & Market

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** Vision, Scientific Novelty & Market Analysis
> **Status:** v1.0 (SDD Phase 1) · **Audience:** Founders, thesis committee, contributors
> **Amended 2026-09-06** (owner rule: specs are generated assumptions; rewritten where measured or simulated results contradict them — §0 below is normative over §§1–5; spec-conflicts H6, H7, M16).

---

## 0. Amendments (2026-09-06) — what the evidence changed

The sensitivity study across 75 simulated worlds (`docs/study/sensitivity-results.md`; grid frozen before the run) and the Android hardware pass (`docs/verification/device-pass/`) contradict several selling points below. Each is restated here; the original text stays for the record.

- **§1 pitch, §1.2, and File 02 §2 — "learns your energy rhythms / chronotype".** Replaced by: *what the system exploits is that a person deviates from the profile of their chronotype class; those individual deviations are what a per-user learner captures and a rule engine cannot.* In simulation the population chronotype pattern by itself gave the learned policy no advantage over the earliest-first heuristic (tie, +0.4 pp, in the world the File 04 §3.2 prior describes), the cold-start prior was worth at most ±0.4 pp, and the 2–6 pp wins appeared only where individuals deviated from their class by ≥ 0.3 logits. The chronotype survey and the population prior remain as a bootstrap, not as the mechanism.
- **§1.3 (1), §3.3 (1), §3.4 — "learning, not rules; the moat compounds; every week widens the gap; a learning system wins categorically".** Replaced by the located boundary: *the learned policy beats the heuristic when there is enough individual slot structure to learn (individual deviation ≥ 0.3 logits, or a population effect ≥ 1.5× the table's); it ties where behaviour follows the population pattern; it never loses by more than 0.5 pp on average, but morning and intermediate types lose 1–2 pp each where a fixed rule is already near-optimal. The personalization gap plateaus inside two weeks under the informative prior and grows by 0.3–1.8 pp per phase pair only with a flat prior or individual variation.* The honest version of the claim: **the method needs individual variation to be worth its complexity; where behaviour follows the population pattern, rules are enough.**
- **§1.2 — "the plan gets measurably better every week"; the "2.4× more often before 11:00" example.** The first is contradicted (plateau, above); the second is an illustration of a rationale format, not a finding, and must not be quoted as one.
- **§1.1 — "2–3 productive hours/day lost to poor task-time fit".** Unsourced; not measured by this project. Drop or source; it is not load-bearing.
- **§1.3 (3), §1.4, §3.2 "Price", "Free-tier cloud … Hugging Face Spaces".** The free Docker CPU tier no longer exists (spec-conflicts H4); the service runs on an Oracle Cloud Always-Free A1 VM in the EU (ADR-0009). The free-tier claim holds; the provider does not.
- **§1.3 (4), §1.4, §3.2 "on-device / sub-10 MB ONNX rankers".** Not delivered: ranking runs server-side in the EU; SASRec-lite/ONNX is deferred to future work (thesis-corrections #9). The privacy claim rests on EU processing, RLS, minimization and erasure (File 02 NFR-S2/S3), not on on-device inference.
- **§2.3 RQ1.** Answered in simulation as: *better than rule-based baselines only where individual variation exists (Q1 boundary); population averages (the prior) are not a competitive policy input — their measured value is ±0.4 pp.* The "significantly better" framing is dropped.
- **§2.3 RQ3.** The measured exploration cost of the ε-slice is 0.03–17 pp of completion on the randomized blocks (≈ 0–4 pp at arm level) and its learning signature 0.3–1.8 pp per phase pair; "cost to user trust" is not measurable in simulation and stays a hypothesis.
- **§2.4 (2) — "an ablation quantifying each layer's contribution".** Done (Block E and the σ_shape axis of the grid): the cross-user/cold-start prior layer contributes within ±0.4 pp in all 75 worlds; the per-user bandit/Beta-cell layer carries the entire effect. Note the cross-user ALS refresh itself never ran on real data; the ablation concerns the File 04 §3.2 table prior.
- **§2.4 (4) — "N = 20–40 within-subject field study".** Out of scope (owner, 2026-09-01); the evaluation was performed in simulation (ADR-0020); the completers needed for 0.80 power are 21 to > 120 depending on the world (File 06 §2 amendment).
- **§2.4 (5) — "an open dataset of anonymized task-slot interaction logs".** No real logs exist; the public artefact is a synthetic dataset plus the replay harness (ADR-0011 §3, ADR-0020 §4).
- **§3.2 comparison matrix.** "Learns personal energy/chronotype from behavior ✅ core" → *learns the individual's deviations from the population profile (✅ built and measured); the chronotype prior itself is worth ±0.4 pp*. "Cross-user cold-start priors ✅" → *✅ built; measured contribution ≈ 0 in simulation*. "Exploration ✅ (Thompson sampling)" → *✅; measured cost 0–4 pp at arm level, symmetric draw across arms*. "On-device / privacy-preserving option ✅ planned" → *not delivered; EU-only server-side processing*.
- **§5 risk "Cold start: model useless in week 1 → chronotype onboarding + collaborative priors".** The priors do not de-risk week 1 measurably (flat prior ties the informative one within 0.4 pp); what remains of the mitigation is the honest "learning mode" UX and the speed of per-user learning (the plateau inside two weeks).
- **File 06 §3 matrix, D7 "deployed field evaluation ✓" for this work.** ◐: the system is deployed and the field protocol is designed and instrumented; the evaluation was performed in simulation.

---

## 1. The Pitch

**Kairos** (Greek: *the opportune moment*) is a mobile application that treats your calendar as a **recommendation problem**, not a constraint-satisfaction puzzle.

Every existing "AI scheduler" (Motion, Reclaim, SkedPal) answers the question *"where does this task fit?"* using deterministic rules and hand-tuned heuristics: deadlines, priorities, working hours. Kairos answers a fundamentally different question:

> **"Given everything the system has learned about *you* — your energy rhythms, your procrastination patterns, your context — which task, placed in which time slot, maximizes the probability that you actually complete it and feel good doing it?"**

That is a **top-K ranking problem over (task, time-slot) pairs**, solved with the same family of algorithms that power Netflix and Spotify — collaborative filtering, contextual bandits, and sequence-aware models — but transplanted into a domain where the "items" being recommended are **perishable, non-replenishable units of time**.

**One-line pitch:** *Spotify learned what you want to hear. Kairos learns when you're actually capable of doing what.*

### 1.1 The Problem

- Knowledge workers lose an estimated 2–3 productive hours/day to poor task-time fit: deep work scheduled into low-energy windows, admin work eating peak cognitive hours.
- Existing schedulers optimize for **feasibility** (no conflicts, deadlines met), not **behavioral success** (did the human actually do the thing?).
- Plans fail silently: when a user skips a block, rule-based tools just shove it forward. None of them *learn from the skip*.
- The result is "productivity app churn": users abandon tools within weeks because the tool's model of them never improves.

### 1.2 The Solution (in one paragraph)

Kairos ingests tasks (manual entry, natural language, calendar sync), builds a **personal temporal profile** (chronotype, per-hour energy estimates, task-type affinities, procrastination signatures), and generates a daily plan by **ranking candidate (task, slot) assignments** with a hybrid recommender. Every user action — completing, skipping, rescheduling, rating a focus session — is an implicit or explicit **feedback signal** that updates the model via online learning (contextual bandits). The plan gets measurably better every week, and the app can *show* the user why: "You complete writing tasks 2.4× more often before 11:00. I moved your report draft there."

### 1.3 Why It's a Game-Changer

1. **Learning, not rules.** Competitors ship static heuristics; Kairos ships a feedback loop. The moat compounds with usage.
2. **Explainable personalization.** Recommendations come with human-readable rationales derived from the model's features — trust is the #1 churn factor in auto-schedulers.
3. **Radically lower price point.** The architecture (see `03_technical_architecture.md`) runs on free tiers; competitors charge $19–34/month. We can undercut the entire category.
4. **Privacy as a feature.** Personal ranking models are small enough for on-device inference; behavioral data can stay minimal and user-owned.

### 1.4 Why Now

- **On-device ML matured:** ONNX Runtime / TFLite make sub-10 MB personalized rankers viable on mid-range phones.
- **Free-tier cloud is genuinely production-grade:** Supabase, Hugging Face Spaces, and GitHub Actions cover DB, inference, and training at $0 for early-stage scale.
- **The market validated willingness to pay** ($34/mo Motion subscriptions) while leaving the low-cost, learning-first quadrant empty.
- **Post-LLM expectations:** users now expect software to adapt to them; static rule engines feel dated.

---

## 2. Scientific Novelty & Relevance (Thesis Foundation)

### 2.1 Research Gap

Recommender-systems research overwhelmingly targets **content domains** (media, e-commerce, news) where:

| Classical RecSys assumption | Time-management reality |
|---|---|
| Item catalog is large, persistent, replenishable | Time slots are **scarce, perishable, and non-replenishable** — a skipped Tuesday 9:00 slot is gone forever |
| Items are independent; recommending one doesn't consume another | Assigning a task to a slot **consumes shared inventory** and constrains all other recommendations (combinatorial coupling) |
| User can accept many recommendations | The user's day is a **hard-budgeted knapsack**; over-recommendation causes plan failure and trust collapse |
| Feedback = click/purchase, near-instant | Feedback = **delayed behavioral outcome** (completion hours later), confounded by external interruptions |
| Repeated consumption is rare or irrelevant | **Habits are the point**: repeated (task-type, slot) success is the core signal |
| Offline evaluation via held-out interactions | Counterfactuals are severe: we never observe what would have happened in the un-recommended slot |

Scheduling literature, conversely, is dominated by **operations research** (constraint programming, MILP) which treats human execution probability as 1.0. The intersection — *behavior-aware, preference-learning schedulers* — is thin. Adjacent published work exists (session-based recommendation, time-aware CF such as TimeSVD++, bandit-based notification timing at scale, just-in-time adaptive interventions / JITAI in mHealth), but **no established framework treats calendar slot assignment as a constrained, non-stationary contextual-bandit recommendation problem with delayed behavioral rewards.** That is the thesis's territory.

### 2.2 Formal Problem Statement (novel framing)

Let user *u* at planning time *t* have a task set *T_u* and a set of feasible slots *S_u* (after hard constraints). Define the recommendation universe as pairs *(τ, s) ∈ T_u × S_u*. The system must select an assignment *A ⊆ T_u × S_u* (each task ≤1 slot, each slot ≤1 task) maximizing expected utility:

```
A* = argmax_A  Σ_{(τ,s)∈A}  P(complete(τ,s) | x_u, x_τ, x_s) · v(τ)  −  λ · Cost(A)
     subject to  hard constraints (deadlines, fixed events, working hours)
```

where *P(complete)* is a **learned personal completion model**, *v(τ)* is task value, and *Cost(A)* penalizes fragmentation and context-switching. This is a **contextual combinatorial bandit with volatile arms** (the slot set changes daily) and **semi-bandit delayed feedback** — a formulation that, assembled in this configuration for personal scheduling, constitutes the core scientific contribution.

### 2.3 Research Questions

- **RQ1:** Can a hybrid recommender (content-based + cross-user collaborative priors + personal contextual bandit) predict task-completion probability per (task-type, time-slot) significantly better than (a) rule-based baselines mimicking Motion/Reclaim heuristics and (b) non-personalized population averages?
- **RQ2:** Which implicit feedback signals (skip, postpone-count, reschedule distance, focus-session abandonment, completion latency) carry the most predictive weight, and how should delayed/confounded rewards be attributed in the bandit update?
- **RQ3:** Does bandit-driven *exploration* of unconventional slots (deliberately testing hypotheses about the user) improve long-term plan adherence versus pure exploitation, and at what exploration cost to short-term user trust?
- **RQ4 (evaluation methodology):** How can constrained slot recommenders be evaluated offline given extreme counterfactual sparsity — via replay methods (Li et al.'s replay estimator), inverse-propensity scoring, or simulation with calibrated user models?

### 2.4 Expected Scientific Contributions

1. **A formalization** of personal scheduling as constrained contextual-bandit recommendation over perishable slot inventory (Section 2.2).
2. **A hybrid architecture** combining cross-user matrix factorization for cold-start priors with per-user online bandits — with an ablation study quantifying each layer's contribution.
3. **A reward-shaping scheme** for delayed, confounded behavioral feedback (completion vs. skip vs. partial focus) with empirical comparison of attribution strategies.
4. **An offline + online evaluation protocol** for slot recommenders (replay on logged data, simulated users, and an N=20–40 within-subject field study measuring plan adherence, completion rate, and SUS/UMUX-Lite satisfaction).
5. **An open dataset & open-source reference implementation** (anonymized task-slot interaction logs — itself a contribution, since no public dataset of this type exists).

### 2.5 Relevance

Academically: sits at the intersection of RecSys (RecSys/SIGIR/UMAP venues), persuasive tech & JITAI (CHI, IMWUT), and applied online learning. Practically: the thesis artifact *is* the startup MVP — every experiment doubles as product telemetry. This dual-use design is explicitly defensible before a committee as *design-science research* (Hevner framework: build + evaluate an innovative artifact against identified gap).

---

## 3. Competitor Analysis

### 3.1 Deep Dives

**Motion (usemotion.com)** — Category leader in AI auto-scheduling. Ingests tasks/projects, auto-places them on the calendar around meetings, reshuffles on conflicts, now bundles broader "AI employee" workflows. **Strengths:** mature auto-rescheduling, project/team features, strong brand. **Weaknesses:** ~$19–34/user/mo; scheduling is deterministic priority/deadline heuristics — it does not learn *when you personally succeed*; frequent user complaints about opaque, "thrashing" reschedules; heavy, desktop-first; no privacy story.

**Reclaim.ai (acquired by Dropbox)** — Calendar-first "smart" defense of habits and tasks in Google/Outlook calendars. **Strengths:** excellent habit-blocking, buffer time, meeting defrag, generous free tier. **Weaknesses:** rule engine at core (user-declared ideal times, priority tiers); adaptation is reactive rescheduling, not preference learning; no standalone mobile-first experience; post-acquisition roadmap uncertainty.

**SkedPal** — The most algorithmically serious incumbent: combines user-defined "Time Maps" with an optimization solver to fit tasks. **Strengths:** powerful for planner-nerds; genuine constraint optimization. **Weaknesses:** the user must *hand-author* their energy model (Time Maps) — the app never learns it; steep learning curve; dated UX; small team, slow iteration; ~$14.95/mo.

**Todoist (Doist)** — The mass-market task manager (30M+ users) with lightweight "smart" features (natural-language dates, some AI assist). **Strengths:** distribution, cross-platform polish, ecosystem, freemium. **Weaknesses:** it is a *list*, not a scheduler — no slot allocation, no behavioral model; its scale proves demand but its feature ceiling defines our opening.

*Adjacent:* Sunsama (manual daily-planning ritual, $20/mo), TickTick (list + habit tracker), Rise/Vitally-style energy trackers (measure chronotype but don't schedule).

### 3.2 Comparison Matrix

| Capability | **Kairos** | Motion | Reclaim.ai | SkedPal | Todoist |
|---|---|---|---|---|---|
| Auto slot assignment | ✅ learned ranking | ✅ rules | ✅ rules | ✅ solver | ❌ |
| Learns personal energy/chronotype from behavior | ✅ core (Bayesian per-hour model) | ❌ | ❌ | ❌ (manual Time Maps) | ❌ |
| Learns from skips/postponements (feedback loop) | ✅ contextual bandit | ❌ | ⚠️ reshuffles only | ❌ | ❌ |
| Cross-user cold-start priors (collaborative) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Explanations for placements | ✅ feature-based rationales | ❌ | ⚠️ minimal | ⚠️ | ❌ |
| Exploration of new time patterns | ✅ (Thompson sampling) | ❌ | ❌ | ❌ | ❌ |
| Mobile-first | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |
| On-device / privacy-preserving option | ✅ planned | ❌ | ❌ | ❌ | ⚠️ |
| Price (individual) | **Free core**, ~$4–6 premium | $19–34/mo | Freemium → ~$8–10 | ~$15/mo | Free → $4–5 |
| Open-source / research transparency | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.3 Our Unfair Advantage

1. **The feedback-loop moat.** Rules don't compound; models do. Every week of usage widens the personalization gap between Kairos and any rule-based competitor, and retrofitting a bandit architecture onto a rules codebase is a rewrite, not a feature.
2. **Cost-structure asymmetry.** Incumbents carry VC-scale infra and sales costs; our free-tier-native architecture makes the *free plan itself* sustainable, letting us attack from below (classic disruption pattern).
3. **Scientific credibility as marketing.** Published methodology + open reference implementation is a trust and hiring asset no productivity-app competitor can copy without becoming a research org.
4. **Data-schema head start.** We log the *right* events (recommendation shown → outcome, with context) from day one, producing a proprietary dataset of task-slot behavioral outcomes that simply does not exist elsewhere.

### 3.4 Why Our Approach Is Fundamentally Better (not incrementally)

Rule-based schedulers optimize a **proxy** (feasible, deadline-respecting calendars). Kairos optimizes the **true objective** (probability-weighted human follow-through). When the proxy and the truth diverge — which is precisely when users churn from Motion after the third "perfectly feasible" plan they ignored — a learning system wins categorically. This is the same structural argument that moved search from directories to ranking and media from schedules to recommendations; we are applying it to the last unpersonalized surface: the calendar.

---

## 4. Business Model & Success Metrics (brief)

- **Free forever core** (personal scheduling, single calendar) — sustainable at $0 infra for early scale.
- **Premium ($4–6/mo):** multi-calendar, advanced analytics, longer history, priority model retraining.
- **North-star metric:** *Plan Adherence Rate* (% of recommended blocks completed as scheduled, 7-day rolling). Guardrails: D30 retention, weekly completed-task count, recommendation-acceptance rate, model uplift vs. baseline (shadow-tested).

## 5. Key Risks

| Risk | Mitigation |
|---|---|
| Cold start: model useless in week 1 | Chronotype onboarding (validated MEQ-style micro-survey) + collaborative population priors + honest "learning mode" UX |
| Free-tier limits at growth | Architecture designed for graceful paid migration (see File 3 §2); costs scale after revenue, not before |
| Exploration erodes trust ("why did it put deep work at 4 pm?") | Bounded exploration budget + always-explained placements + one-tap override that feeds the model |
| Behavioral data sensitivity | Data minimization, EU hosting, on-device ranking roadmap, GDPR-by-design (File 2 §5, File 3 §7) |
| Incumbent copies the pitch | They can copy words, not the logged-outcome dataset or the bandit-native architecture |

---

*Next: `02_product_design_and_requirements.md` — audience, UX system, FR/NFR, use cases.*
