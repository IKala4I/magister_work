# Spec-Integrity Audit — specs/01–07

> One-time consistency audit (2026-08-24) of the generated specification set, per owner
> directive before P1 code. Severity: **HIGH** = threatens a thesis claim or the study's
> validity; **MED** = internal contradiction needing a normative resolution; **LOW** = cosmetic
> or engineering-detail gap. "Resolution" states the normative reading from here on; `specs/`
> stays byte-frozen, so this file is the errata layer — later files override earlier ones only
> where a resolution below says so.

## HIGH

### H1. Experiment badges break the blinding claim (File 06 §1.1 vs FR-22)

File 06 claims single-blind via a "pixel-identical" UI across arms, but FR-22 requires visible
"experiment" labeling of ε-slice blocks, which exist **only in arm B** (File 06 §1.1: the
randomized slot is part of B). A participant who sees (or never sees) experiment badges over
two weeks has a surface cue to their condition — the blinding claim as written is not
deliverable.
**Resolution — APPROVED by owner 2026-08-24, with conditions.** The ε-randomized slot runs in
**both arms** with identical ε, identical top-m, and identically rendered "experiment" badges
(arm A's heuristic ranking defines its top-m set; exact propensity logged identically).
Blinding integrity outranks baseline purity: a broken blind undermines the primary result,
while a slightly perturbed baseline is a describable limitation. Conditions bound to this
approval: (1) arm A is renamed and re-described everywhere as **"heuristic + matched
randomization"** — no longer "a faithful Motion/Reclaim-class rule engine" — stating plainly
that the matched randomization is what buys the blind (File 06 §1.1, OSF text,
thesis-corrections #8); (2) File 06 §1.6's robustness refit excluding exploration-labeled
blocks is kept and reported **for both arms** — that analysis recovers the unperturbed
comparison; (3) File 06 §4 gains a threat entry: matched randomization slightly depresses both
arms' adherence and makes A a perturbed incumbent; symmetry (same ε, same m, same rendering)
means the perturbation cancels in the A-vs-B contrast; (4) wherever OPE is described, state
the upside: baseline traffic now carries exact logged propensities, so the randomized slice
spans both arms; (5) the rejected alternative — sham "experiment" badges on non-randomized
arm-A blocks — is recorded with its rejection reasons (it falsifies logged-propensity
semantics: a badge would claim uniform randomization that never happened, poisoning the OPE
slice; and it deceives participants about when the system actually experiments) in
pojasnennia.uk.md and here. **Status: approved; text changes land before the OSF freeze (still
a stop condition); ε-symmetric engineering lands P5/P6.**

### H2. PAR and the reward table are related but distinct — never derive one from the other

File 06 §1.4 defines PAR per block as binary: focus started within ±15 min of slot start AND
≥50% finished, displaced blocks excluded from the denominator. specs/07 §3.4.1 defines the
_learning_ reward r ∈ [0,1] with partial credit (r = f for f < 0.5), off-slot same-day credit
(r = 0.3), and override tuples — quantities that do not exist in PAR. Conflating them corrupts
the study: e.g. an off-slot completion is r = 0.3 for the bandit but PAR = 0 for the study; an
abandoned session at f = 0.4 is r = 0.4 but PAR = 0.
**Resolution (normative):** PAR is computed by pre-registered code **exclusively from
`events` + `recommendations`** (facts), never from `feedback_rewards`. The reward table exists
only for learning. The two share exactly two constants — the ±15 min grace and the 50%
threshold (single source: `PAR_GRACE`/`PAR_MIN_FRACTION` in the params modules) — so they can
never drift apart silently. A CI test (P7) asserts the PAR computation touches no reward
columns. **Status: applied** (params modules tag these constants; analysis-code rule recorded).

### H3. "Ambiguous" and "displaced" must never be encoded as r = 0.0

File 05 §2: ambiguous rewards are **excluded** from updates; external displacement emits **no
reward**. Both are structurally different from a lapse (r = 0.0): a 0.0 teaches "this context
fails", exclusion teaches nothing. Audit of specs/07: ambiguous tuples are rows with
`excluded = true` (still carrying an r value for audit, never entering updates); displacement
produces **no row at all**. No spec file encodes either as a 0.0 reward — **confirmed clean**.
**Guard:** the `/feedback` handler drops `excluded = true` tuples before any update (tested,
P7); rebuild and OPE readers filter identically; displaced recommendations are excluded from
the PAR denominator (H2). **Status: verified in spec; enforcement tests land in P7.**

## MED

### M1. Free-tier ceiling: 10k MAU (File 02 NFR-Sc1) vs ~3k MAU (File 03 §2.2 "as amended")

Contradiction between files; File 03 marks its number as the Phase-4-audit amendment.
**Resolution:** the amended figure governs — $0 to ~3k MAU, ≤$25/mo to ~50k. The thesis draft
carries the same internal contradiction (табл. 3.2 says 10k; §3.3 says 3k) → thesis-corrections.
**Status: applied.**

### M2. ε propensity is exact only conditionally (File 04 §1.4 "p = ε/m")

Unconditionally, the placement propensity is ε · P(task chosen) · 1/m, not ε/m; File 04's own
§2.2 restricts replay to within-slice uniformity, where the conditional p = 1/m (ε = 1 default
⇒ logged 0.25) is exact. **Resolution:** eligible task drawn uniformly at random (independence
from bucket outcomes); logged propensity is the within-slice value per the spec formula; all
OPE on the slice conditions on slice membership — Li et al.'s argument applies as File 04 §2.2
already states. IPS over mixed traffic uses the MC-approximated propensities for non-slice
rows, never mixes the two meanings. **Status: applied (specs/07 §5, params `EPSILON`, `TOP_M`).**

### M3. |C| ≈ 12–18 vs undefined "relative-position class" (File 04 §1.2)

The full 3-way product would be 24 > 18. **Resolution:** specs/07 §3.2.5's fresh/fatigued split
applied only to weekday MO/AF ⇒ |C| = 14, inside the band. **Status: applied (specs/07).**

### M4. File 04 §1.4 q̂ = clip(xᵀθ̃) vs the River blend (File 03 §2.2, File 05 §1)

File 04 defines q̂ purely from the linear sample; Files 03/05 require River-learned blend
weights over the Beta-energy model and the bandit. **Resolution:** specs/07 §3.2.6's convex
blend, with the TS sample flowing through the linear term (preserves "one sample, one solve");
setting w_B = 1 recovers File 04's formula exactly and is the pre-registered ablation arm.
**Status: applied (specs/07).**

### M5. n₀ = 8 "inside declared working hours" is ill-defined at cell granularity (File 04 §3.3)

Cells are (category × daypart × day-type); working hours vary by weekday and can cover a
daypart partially. **Resolution:** a cell counts as inside working hours iff ≥50% of its
daypart minutes overlap declared working hours, majority across that day-type's days.
[INFERRED, P4 ADR]. **Status: resolved on paper; implemented in P4.**

### M6. File 01 §2.2 "each task ≤1 slot" vs splittable chunks (File 04 §1.3 C3)

The formal statement forbids what C3 requires. **Resolution:** File 04's chunk formulation
supersedes (its own "supersedes" note); the formal statement reads "each chunk ≤1 slot".
Thesis draft (2.1) inherits the same slip → thesis-corrections. **Status: applied.**

## LOW

- **L1.** File 05 §1's q(deep_work, AF) drop 0.61 → 0.44 after a single failure is
  illustrative, not reproducible from the Beta math (one failure moves a n₀=8 posterior by
  ~0.05); treat as narrative. No action.
- **L2.** File 04 §1.2 F_τ lets the _buffer_ extend past the deadline (only k + d_τ ≤ dl_τ is
  checked). Kept as specified — buffers are recovery time, not work. Solver tests assert this
  exact boundary (P5).
- **L3.** LinUCB arm is deterministic ⇒ its propensities are degenerate; OPE for the LinUCB
  arm rests on the ε slice alone. Already implied by File 04 §2.3; recorded so nobody expects
  MC propensities there (nightly job skips LinUCB traffic).
- **L4.** Additive-slate assumption (File 04 §2.4) is a stated, tested limitation — the
  interference probe ships with the OPE harness (P11); the pseudo-inverse estimator is the
  robustness alternative. No conflict; logged so the probe isn't forgotten.
- **L5.** ABAB carryover: File 06's three mechanisms (counterbalancing, H4-as-signal, phase-1
  between-subject contrast) are sound; note additionally that the model _trains_ during A
  phases (logging on), so H4's "learning signature" partially reflects data volume, not only
  policy action. File 06 §4 already frames the action-pathway symmetry; the volume caveat goes
  into the thesis limitations text → thesis-corrections.
- **L6.** Power analysis (File 06 §2) re-derived: per-user SE, SD_d composition, n = 28, and
  the full 3×3 sensitivity table all reproduce exactly. **Verified, no issue.**
- **L7.** rMEQ classes and score range match Adan & Almirall's standard cutoffs. **Verified.**
- **L8.** File 02 UC-01 A1 "wider exploration budget" on survey skip has no mechanism in File
  04 §1.4 (ε is fixed). Resolution: the skip already halves n₀ ⇒ higher posterior variance ⇒
  TS explores more; that _is_ the mechanism, no ε change needed. Recorded to prevent someone
  "fixing" ε per user.

## Verdict

No contradiction survives unresolved. H1 is the single item requiring an owner decision at
pre-registration time (it amends the study design text); everything else is resolved under the
decision rule (defensibility → consistency → measurability → pragmatics) and traceable above.

## Post-review additions (P1 adversarial pass, 2026-08-24)

- **L9.** specs/07 §4 says "Postgres 16" (following File 03); Supabase provisions **17.6** and
  `config.toml` pins `major_version = 17`. No migration uses 16-incompatible features; 17 ⊇ 16.
  Recorded as the normative platform version.
- **L10.** specs/07 §4.4 grants clients DELETE on `tasks`; the hardening migration keeps the
  grant but makes audit-substrate FKs (`recommendations.task_id`, `events.*`,
  `feedback_rewards.recommendation_id`) NO ACTION — a task any recommendation or event
  references cannot be hard-deleted by a client (soft delete via `deleted_at` is the product
  path). Rationale: a cascade from a client DELETE reached `feedback_rewards`, violating
  §3.4.2 "excluded ≠ deleted". FR-42 erasure still cascades from `auth.users` (end-of-statement
  FK semantics; pgTAP-tested).
- **L12.** (P2) File 02 §3.3 specifies **Inter Variable** with "optical sizing on"; React
  Native's text engine exposes no variable-font axis API (`fontVariationSettings` does not
  exist in RN styles), so a variable TTF would render only its default instance. Normative:
  the type system ships **static Inter instances** (400/500/600/700 via
  `@expo-google-fonts/inter`) — visually identical at fixed weights; optical sizing is
  unavailable on mobile. JetBrains Mono unaffected (monospaced ⇒ tabular by construction).
  Spec's own fallback-stack note (SF Pro/Roboto behind Inter) is honored via runtime loading.
- **L13.** (P4) PLAN §4B says every unfixed parameter "gets a proposed default in `specs/07`'s
  parameter appendix", but Appendix A has no rows for the rMEQ item wording/presentation or the
  working-hours template default. Both are fixed by ADR (rMEQ presentation + partial-skip rule:
  ADR-0005; working-hours/sleep defaults: ADR-0006) rather than by an appendix row; the
  appendix stays frozen with the rest of specs/07.
- **L11.** Client-writable recommendation statuses narrowed to the plan-review set
  {accepted, pinned, moved, rejected}: `completed` belongs to sync-resolve (File 05 §2) and
  `lapsed` to attribute-rewards (File 05 §1 keeps the client's lapse mark local). Prevents an
  honest client from knocking a rec out of the attribution job's {shown, accepted} scan set
  and a hostile one from dodging lapse attribution.

## Post-review additions (P5, 2026-08-26)

- **M7.** File 04 §1.5 says "previous plan injected via `AddHint(...)` — warm start _and_ an
  anti-'thrashing' prior (placements only move when the objective says it's worth it)".
  Measured: CP-SAT's hint only seeds the search; on objective ties the returned solution is
  arbitrary (tested with 1, 2 and 8 workers). The promised behaviour needs an explicit stability
  term. Normative: the hinted start gets **one scaled objective unit** (1e-4 in weight units,
  below any meaningful estimate difference); the hint stays for warm start. ADR-0007 §7;
  `test_solver.py::test_add_hint_keeps_the_previous_placement_on_ties`.
- **M8.** File 04 §1.5's degradation trigger "|literals| > 4·10⁴" and its size argument
  ("≈ 1.5·10⁴ literals — small for CP-SAT") hold for _search_, not for the 1.5 s cap: on the
  P5 model, 15-min week instances with 8–10·10³ start literals were presolve-bound (probing over
  the value encoding) and returned UNKNOWN inside the cap on an M-series Mac; 30-min instances
  (3–4·10³) returned FEASIBLE. Normative: probing/symmetry presolve off (measured fix), the
  ladder additionally degrades at a **measured practical threshold** (8·10³, ADR-0007 §11) and on
  an UNKNOWN outcome ("still hot"); the 4·10⁴ constant stays as the outer bound; the 1.5 s cap is
  a **plan-level** budget shared by rungs/days (anytime contract, NFR-P1). Thesis text should
  cite the measured behaviour, not the 4·10⁴ figure alone → thesis-corrections.
- **L14.** File 04 §1.3 (C3) treats chunks τ^{(j)} as tasks with weight w_{τ^{(j)},k}; read
  literally, a split task would earn its full weight once per chunk. Normative: chunk weight is
  the duration-proportional share w_{τ,k}·d_{τ^{(j)}}/d_τ (ADR-0007 §3) — a fully scheduled split
  task earns exactly what an unsplit placement in the same contexts would.
- **L15.** With Appendix A's λ_f = 0.5 per extra chunk and unit weights v·q̂ ∈ [0, 4.5], a
  v = 1, q̂ ≈ 0.5 task gains nothing from splitting (weight 0.5 − penalty 0.5): low-value
  splittable tasks are deferred rather than split. Kept as the proposed default; recorded in
  `docs/decisions/revisit.md` for P7 retuning once real q̂ scales exist.
- **L16.** specs/07 §5 lists `settings.epsilon/top_m` in the /plan request. The service **rejects**
  values that differ from its constants (422) instead of honouring them: honouring would put an
  unlogged propensity meaning on M-01 rows, and H1 requires identical ε, m across arms.

## Post-review additions (P6, 2026-08-26)

- **M9.** File 04 §1.4 "default 1 slot/day" and File 06 §2.3's MRT-slice power both assume an
  experiment on (nearly) every plan. Measured on the service's own grid/eligibility code
  (`scripts/experiment_rate.py`): under ADR-0007 §5's strict "≥ m reachable buckets" rule a
  plain 09–18 weekday makes every task ≥ 60 min ineligible (|A(x)| = 3), so P(plan has an
  eligible task) is 0.57 with three tasks and 0.00 on a four-meeting day. **Owner decision
  2026-08-26:** eligibility is |A_m(x)| ∈ {2, 3, 4} with the exact per-row p = ε/|A_m(x)|
  (uniform within the logged set — File 04 §2.2 replay stays valid per row); P(eligible) becomes
  0.86 (three tasks) / 0.22–0.48 (heavy day) ⇒ ≈ 4.3 vs. 1.1–2.4 experiments per user-week
  before drops. File 06's power must be recomputed against that rate before the OSF freeze
  (thesis-corrections #21). ADR-0008 §1.
- **L17.** NFR-R2 "fall back to a deterministic heuristic scheduler, **labeled as such**" vs.
  H1's blind: arm A is also `engine = heuristic`. Normative: the label is tied to the
  provenance (`plans.telemetry.ef.reason` starting with `fallback:`), never to the engine tag,
  so arm-A plans are unlabeled and fallback plans are labeled; outage user-days are excluded by
  File 06 §1.6 anyway. ADR-0008 §7.
- **L18.** FR-22 "visual confidence encoding per block" presumes an estimate; the heuristic has
  none. Normative: `confidence` is NULL on heuristic rows (no fabricated number in the logs), the
  client renders NULL at a constant solidity (0.7, ≈ day-0 learned confidence) and omits the
  percentage from the accessibility label. ADR-0008 §7.
- **L19.** specs/07 §5 has the plan-request EF assemble context from the server's tables and
  File 05 §2 assumes push-then-pull sync — but sync is P8, so before P6 the server holds no
  task rows. Normative for P6–P7: a task-push bridge (same pattern as the P4 profile bridge,
  last-write-wins, own rows through RLS) runs before every plan request; P8 replaces it with
  op replay. ADR-0008 §5.
- **L20.** UC-03 "System (06:00 local or first open)" reads as a scheduled trigger; invariant 7
  forbids correctness that depends on background execution. Normative: lazy triggers — first
  open/foreground on a plan day without a plan; 06:00 is the plan-day boundary; the 06:00
  nudge is P10's notification. ADR-0008 §6.
- **L21.** specs/07 §5's /plan response lists `engine: learned | heuristic`; since P5 the
  service only ever answers `learned` (a `policy = heuristic-shadow` still scores with the
  learned machinery). Heuristic plans are produced by the edge function, whose OWN response to
  the client carries `engine`; the server rows are written by the EF either way. No spec text
  change needed beyond noting where the tag originates.
- **L22.** specs/07 §4.2 M-01 declares `recommendations.propensity real` (float4). With the P6
  eligibility rule the exact per-row propensity can be 1/3, which float4 stores as 0.33333334 —
  a 6·10⁻⁸ relative error that would ride into every 1/p weight and contradict "exact".
  Normative: the column is `double precision` (migration `20260827130000_p6_propensity_double`);
  `A_m(x)` is logged beside it, so p is also recoverable as ε/|A_m(x)| symbolically. ADR-0008 §4.

## External changes (P7, 2026-08-27)

### H4. The free Docker CPU tier File 03 §2.2 assumes no longer exists (provider change, 2026-07)

File 03 §2.2 ("unchanged from v1.0") hosts the RecSys service on "Hugging Face Spaces free
CPU" (Docker SDK, CPU Basic 2 vCPU / 16 GB, $0/h) and derives the NFR-Sc1 cost envelope "**$0
through ~3k MAU**" from it; File 04 §1.5 calibrates the 1.5 s anytime cap "on 2 vCPU" (that
box); UC-03 A1 / NFR-R2 describe the "free-tier sleep" cold start; `deploy-recsys.yml` pushes
the `services/recsys` subtree to a Space. **Verified 2026-08-27 against the provider's own
docs:** since ~2026-07-08 (UI) / 2026-07-21 (docs, hub-docs PR #2624, HF staff) _creating any
Space that runs on compute — Gradio or Docker, CPU Basic included — requires a paid plan_:
PRO ($9/mo) for personal accounts, Team ($20/user/mo) or Enterprise for organisations. Only
Static Spaces (no compute) stay free, plus a Gradio-only ZeroGPU carve-out that cannot run a
FastAPI container. No announcement/changelog entry exists; grandfathering of pre-existing free
Spaces is unverified (conflicting user reports, no staff statement). Two further facts surfaced
by the same verification: (a) **free and PRO Spaces run in the US only** — an EU runtime region
exists solely on Team/Enterprise (docs "storage-regions"), so the P1 DPIA hedge in
`docs/privacy/README.md` ("EU availability not guaranteed by free tier") was in fact a
guaranteed _absence_: the architecture as written never satisfied NFR-S2 for the service tier;
(b) CPU Basic keeps a fixed 48 h sleep with no configurable keep-alive and a community-reported
2–5 min cold start.
**What it invalidates:** the $0 cost envelope of NFR-Sc1 (as amended by M1) for the service
tier; the deploy path (`deploy-recsys.yml`, the Space secrets in HANDOFF ⛔ 1); File 04 §1.5's
"2 vCPU" as the named measurement box (device-checklist "Service environment"); the P5/P6
verification items blocked on the Space (live learned-path smoke, warm NFR-P1 p95, container
timing) — they stay on the backlog, never substituted by Mac numbers.
**Status: RESOLVED 2026-08-27 — owner decision: option A (Oracle Cloud Always Free, EU
region eu-marseille-1), ADR-0009 accepted.** This changed a stated constraint of the thesis
(free tier, EU hosting) rather than how something is built, so it was not an autonomous call. The options
(another free-tier EU container host; HF PRO as a paid exception; Supabase-only restructuring
without a Python container; a paid EU endpoint) are evaluated in **ADR-0009** (status
_proposed_) against what the service needs — CP-SAT with 2 workers under the 1.5 s cap, warm
availability during the study, EU residency (NFR-S2), $0 — with a recommendation. Until the
owner decides, `deploy-recsys.yml` stays gated off (`vars.HF_SPACE` unset), no Space and no
GitHub secrets are created, and P7 proceeds (its work is service-internal and local-testable).

## Post-review additions (P7, 2026-08-27)

- **M10.** File 03 §2.1 ("drag-to-teach interaction (UC-07) — drag physics never touch the JS
  thread") and UC-07 ("drags suggested block to a new slot → haptic snap") presume a proportional
  canvas; ADR-0008 §7 chose a row-list timeline for NFR-A1/A2. Normative for P7: the override is
  a "Move…" start-time picker snapped to the 15-min grid that logs the same `block_moved` fact and
  yields the same paired tuples; the drag gesture and haptic snap return with the proportional
  timeline (P9, revisit.md). The study's signal (FR-25 "overrides are first-class training
  signals") is identical either way. ADR-0010 §6.
- **L23.** File 03 §2.2 / File 05 §1 name River as the runtime for the blend weights ("River SGD
  step on blend weights w"). The service owns a two-parameter projected-SGD step in plain Python
  and uses River as the **CI oracle** for the unprojected step (River's Squared loss carries the
  factor 2 — pinned at lr/2), the same pattern File 03 fixes for MABWiser. The simplex projection
  is outside River anyway. ADR-0010 §10.
- **L24.** specs/07 §4.1 `recommendations.status` has no `skipped` value while §3.4.1 rows 6
  (skipped) and 7 (rejected) both exist. Normative: a skip sets `rejected` on the row and the
  event type (`block_skipped` vs the P9 `block_rejected`) distinguishes the rows for the mapping
  and for the PAR code (H2). ADR-0010 §5.
- **L25.** specs/07 §3.4.1 row 1 "task marked done, session in-window" leaves the window of a
  completion WITHOUT a session undefined. Normative [INFERRED]: `done_at` within
  [slot_start − 15 min, slot_end + 15 min]; a finished session started > 15 min late is a same-day
  completion (row 4, 0.3), consistent with PAR = 0. ADR-0010 §4.
- **L26.** File 05 §1's diagram logs the lazy lapse as "event type=skip". Normative: the client
  logs `lapse_observed` (its own reading, not a reward-bearing fact) and an explicit skip logs
  `block_skipped`; the two must stay distinct so rows 5/6 and the pre-registered PAR code never
  conflate them. ADR-0010 §2.
- **L27.** Appendix A "duration estimator (UC-06 A2)" is listed among service parameters, but
  the estimator is an input calibration of `est_minutes`, not model state. Normative: computed in
  `attribute-rewards` from finished sessions, stored in `duration_estimates`, applied by
  `plan-request` to BOTH engines (H1 symmetry) once n ≥ 3, clipped to [0.5, 2]; `params.py`
  keeps `DURATION_EWMA_ALPHA` pinned. ADR-0010 §9.
