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
- **L11.** Client-writable recommendation statuses narrowed to the plan-review set
  {accepted, pinned, moved, rejected}: `completed` belongs to sync-resolve (File 05 §2) and
  `lapsed` to attribute-rewards (File 05 §1 keeps the client's lapse mark local). Prevents an
  honest client from knocking a rec out of the attribution job's {shown, accepted} scan set
  and a hostile one from dodging lapse attribution.
