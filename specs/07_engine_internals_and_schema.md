# 07 — Engine Internals & Data Schema (Reconstruction)

> **Project:** Kairos (public name: Hourwell) — Personal Time Optimization via Recommendation Systems
> **Document:** Reconstruction of the content Files 03/05 v1.1-RN incorporate from the superseded
> v1.0 architecture document: engine stages (§3.2), reward shaping & attribution (§3.4), feedback
> pipeline (§3.5), cold-start UX rungs (§3.6), base data schema (§4), API schemas (§5), security &
> privacy specifics (§7). Section numbers deliberately mirror v1.0's so every existing cross-
> reference in Files 03–06 resolves against this document.
> **Status:** DRAFT for owner approval (P0 gate). On approval joins `specs/` as read-only truth.
> **Derivation rule:** everything here is derived from what Files 01–06 state or entail. Choices
> the files do not fix are marked **[INFERRED]** with the reasoning and the spec anchor they
> follow from. Open numeric parameters are collected in **Appendix A** with a proposed default
> and the phase where each is finally fixed (by ADR).

---

## §3.2 Engine Stages

The engine is a hybrid of five stages. Stages 1 and 5 were **superseded** by the unified
bandit-weighted CP-SAT formulation (File 04 §1, its explicit "supersedes File 3 §3.2 Stages
1/4/5 where noted"): candidate generation is now the feasible-start precompute $\mathcal{F}_\tau$
and assembly is the single CP-SAT solve. What remains normative here is the *learning* machinery
that supplies $\hat q_{\tau,c}$.

### 3.2.1 Stage 2 — Personal energy model (Beta cells)

Per user, per **cell = (category g, daypart p, day-type d)** (File 04 §3.3 fixes the cell
definition): a Beta posterior over completion probability.

- Categories: the four archetypes of File 04 §3.3 — `deep`, `admin`, `physical`, `learning`.
  **[INFERRED]** The taxonomy is closed: File 04 §3.3's transform table is exhaustive and the
  cross-user layer needs a shared categorical vocabulary (NFR-S3). User-created labels map onto
  one of the four archetypes at creation time (FR-02's "top task categories" selects presets).
- Dayparts: EM/MO/MD/AF/EV/NT per File 04 §3.2. Day-type: `weekday` | `weekend` (File 04 §3.3
  weekend rule). 4 × 6 × 2 = 48 cells per user.
- Storage per cell: prior $(\alpha_0, \beta_0)$ (versioned, from `prior_cells`) plus **evidence
  counters** $(S, F)$ with `last_event_at`.
- **Decayed counts, half-life 28 d** (File 05 §1 diagram line "decayed counts, half-life 28d"):
  at every read/update the evidence is decayed as
  $S \leftarrow S \cdot 2^{-\Delta t / 28\text{d}}$, likewise $F$; the prior is **not** decayed.
  Effective posterior: $\alpha = \alpha_0 + S$, $\beta = \beta_0 + F$. **[INFERRED]** decay
  applies to evidence only: decaying the prior would contradict "priors never overwrite
  evidence" symmetrically — with no fresh evidence the belief must relax *toward the prior*,
  not toward ignorance.
- Posterior mean $\mu_{g,p,d} = \alpha/(\alpha+\beta)$ and variance feed the feature vector
  (§3.2.4) and the insights heatmap (FR-40).

### 3.2.2 Stage 3 — Collaborative priors (ALS)

Exactly File 04 §3.4–3.5: rMEQ class doubles as the day-0 cluster; after ≥30 attributed
outcomes, ALS fold-in over the user×cell implicit matrix (Hu-Koren-Volinsky confidence
weighting; File 06 §3 row "Implicit CF") → nearest behavioral centroid → that cluster's cell
aggregates become $(\alpha_0, \beta_0)$ **for still-unvisited cells only**. A cell is
"visited" when its evidence $S+F \ge 1$ before decay at switch time. **[INFERRED]** threshold 1:
File 04 says "visited cells keep their personal posteriors"; any attributed outcome makes a
cell personal.

### 3.2.3 Stage 4 — Per-category contextual bandit (LinUCB / TS)

Per user and category $g$: linear-Gaussian state $(A_g, b_g)$, $\hat\theta_g = A_g^{-1} b_g$,
initialized $A_g = I_d$, $b_g = 0$ **[INFERRED]** (standard LinUCB/TS ridge init; File 04 §1.4
presumes an existing $(\hat\theta_g, A_g)$). Updates: Sherman–Morrison rank-1 (File 05 §1);
corrections rebuild from stored tuples (§3.5). TS at plan time samples once per category
(File 04 §1.4); LinUCB is the deterministic A/B arm.

### 3.2.4 Feature vector $x_{\tau,c}$ — **[INFERRED]** composition

Files fix only fragments: context bucketing φ (File 04 §1.2), "tasks-already-done-today" as an
interference-absorbing feature (File 04 §2.4), implicit signals as candidate predictors (RQ2,
FR-32). The composed vector, dimension **d = 17**, all components in [0, 1] or z-scaled:

| # | Feature | Source / anchor |
|---|---|---|
| 1 | intercept = 1 | — |
| 2–7 | daypart one-hot (6) | File 04 §3.2 |
| 8 | is_weekend | File 04 §3.3 weekend rule |
| 9 | rel_fatigued (§3.2.5) | File 04 §1.2 "relative-position class" |
| 10 | task value (v−1)/2 | FR-10 value 1–3 |
| 11 | log-duration, scaled: log(d_min)/log(480) | FR-10 duration |
| 12 | splittable flag | FR-10 |
| 13 | urgency e^{−u/η} (u = ticks to deadline; 0 if none) | File 04 §1.2 g(·) |
| 14 | postpone_count (capped 5)/5 | FR-32, RQ2 |
| 15 | Beta-cell posterior mean μ_{g,p,d} | couples Stage 2 into Stage 4 |
| 16 | Beta-cell posterior sd | exploration signal |
| 17 | preceding_load: scheduled minutes in the 3 h before the slot / 180 | File 04 §2.4 "tasks-already-done-today" |

Reasoning: (15)–(16) make the energy model a *feature* of the bandit rather than a competing
scorer, which is what lets one Sherman–Morrison update family serve both — and matches File 05
§1 where a single `/feedback` batch updates LinUCB state *and* Beta cells from the same tuple.
The snapshot stored per recommendation (NFR-O1, §4) is exactly this vector.

### 3.2.5 Context bucketing φ — **[INFERRED]** completing File 04 §1.2

File 04 fixes φ = daypart × day-type × relative-position class with $|\mathcal{C}| \approx$
12–18 but leaves "relative-position class" undefined. Definition: a slot is **fatigued** if ≥90
consecutive scheduled/busy minutes end ≤15 min before it; else **fresh**. The split applies
only where it can occur meaningfully — the long workday stretches MO and AF on weekdays —
giving $|\mathcal{C}| = 6·2 + 2 = $ **14**, inside the spec's 12–18 band. Rationale: fatigue
from a preceding run is the one within-daypart effect the JITAI/interference literature cited
in File 06 §3 supports, and a full 3-way product (24 buckets) would exceed the spec's own bound.

### 3.2.6 Estimate blend and River

File 03 §2.2 names "River online blend weights"; File 05 §1 shows "River SGD step on blend
weights w". **[INFERRED]** what is blended: the bandit's linear estimate and the Beta cell's
mean are combined as

$$\hat q_{\tau,c} = \mathrm{clip}_{[0,1]}\big( w_E\, \mu_{g,p,d} \;+\; w_B\, x_{\tau,c}^\top \tilde\theta_g \big),\qquad w_E + w_B = 1,\ w \ge 0$$

with $w$ per user, updated by a River online logistic/SGD step toward realized rewards at each
feedback batch, initialized $(w_E, w_B) = (0.7, 0.3)$ so day-0 plans lean on priors while the
bandit is untrained (three-rung UX, §3.6). TS exploration propagates through the $\tilde\theta$
sample; the Beta term is deterministic at plan time. This preserves File 04 §1.4's "one
posterior sample, one solve" contract. Feature (15) already couples the models; the explicit
blend additionally protects against early bandit overconfidence — the ablation in RQ1 can set
$w_B = 1$ to test the pure-linear variant.

## §3.4 Reward Shaping & Attribution

**Reward semantics.** $r \in [0,1]$ attaches to a **placement** (a `recommendations` row), never
to a task. The client never computes $r$ (File 03 §1.2): clients log **facts** (events); Edge
Functions map facts → reward tuples; the RecSys service applies the math.

### 3.4.1 Outcome table (normative)

Slot window: a focus session "belongs" to its block when started within **±15 min** of
`slot_start` (anchor: File 06 §1.4 PAR definition). $f$ = focused duration / planned duration.

| # | Facts observed (by end of local day) | reward r | `reason` | Timing |
|---|---|---|---|---|
| 1 | Focus finished, or task marked done, session in-window | **1.0** | `completed` | instant |
| 2 | Session in-window, abandoned with $f \ge 0.5$ | **1.0** | `completed` | instant |
| 3 | Session in-window, abandoned with $f < 0.5$ | **$f$** | `partial` | instant |
| 4 | Task completed same local day but out-of-window | **0.3** | `off_slot` | attribution job |
| 5 | Block end passed, no session, no completion | **0.0** | `lapsed` | attribution job (lazy scan shows it earlier, File 05 §1) |
| 6 | User explicitly skips the block | **0.0** | `skipped` | instant |
| 7 | User rejects the placement at plan review | **0.0** | `rejected` | instant |
| 8 | Drag override (UC-07): paired tuples — origin context | **0.1** | `override_out` | instant |
| 9 | Drag override — target context (weak positive, UC-07 "positive-weak") | **0.7** | `override_in` | instant |
| 10 | Externally displaced (UC-09) | **no reward row** | — | never (File 05 §1 note: "external-conflict displacements emit NO reward") |

**[INFERRED]** rows 2–4, 8–9 values: File 06's PAR treats $f \ge 0.5$ in-window as adherent
(row 2 = 1.0 keeps the training signal aligned with the primary outcome measure); UC-06 A1
fixes *that* partial credit exists below 50% — linear $f$ is the least-assumption monotone
choice; row 4's 0.3 encodes "the plan's day-level suggestion helped, the slot didn't" — it must
sit strictly between lapse (0) and partial credit's midpoint to keep slot-level learning
dominant; rows 8–9 encode UC-07's negative/positive-weak pair, kept away from the extremes so a
later *executed* outcome (row 1–5, attached to the moved placement's new context) dominates.
All five values are Appendix-A parameters, fixed in P7.

**Ratings are not rewards.** FR-31 energy/difficulty ratings and FR-32's reschedule-distance
enter as features/labels (duration estimator, insights, RQ2 ablations), never as $r$.
**[INFERRED]** from RQ2's framing of implicit signals as *predictors* whose weight is an open
research question — baking them into $r$ would pre-answer RQ2.

### 3.4.2 Attribution windows and authority

- **Instant signals** (rows 1–3, 6–9) produce reward tuples as soon as the fact syncs.
- **The 23:55 local attribution job** (`attribute-rewards`, File 05 §1) is the authority: it
  finalizes rows 4–5 for every recommendation of that local day still in {shown, accepted},
  writes `feedback_rewards`, POSTs the batch to `/feedback`, marks recommendations attributed.
  Idempotency key = `(recommendation_id, kind)`; safe re-runs (File 05 §1 "idempotency key =
  rec_id").
- **Correction window: 7 days.** **[INFERRED]** File 05 §1 shows a correction the *next* day,
  so the window exceeds one day; unbounded corrections would make the OPE archive (File 06 §5)
  unstable. Within the window, UC-04 A1 "actually did it" replaces the outcome tuple's $r$ and
  triggers a **full rebuild** (§3.5.3). After it, the correction is logged as an event but
  reward tuples are frozen.
- **Ambiguity exclusion** (File 05 §2): when the context of a reward became ambiguous —
  completion concurrent with external displacement, device-clock anomalies, timezone change
  moving the day boundary across the slot **[INFERRED** examples; the displacement case is
  spec-explicit**]** — the tuple is written with `excluded = true` + reason and **never** enters
  bandit updates, rebuilds, or OPE. Excluded ≠ deleted: the row remains for audit.
- **PAR denominator rule** (File 06 §1.4): displaced blocks are excluded from adherence
  computations; the schema encodes this as status `displaced`/`displaced_pending` (M-02), no
  reward row.

## §3.5 Feedback Pipeline (two-phase, rebuild-on-correction)

1. **Fact capture.** Client appends ops to the Drizzle outbox; push-then-pull sync delivers
   them as `events` rows (append-only, `op_id`-idempotent).
2. **Instant phase.** `sync-resolve` recognizes reward-bearing facts among pushed ops, computes
   the tuple per §3.4.1 (it is server-side — the client stays reward-ignorant), inserts
   `feedback_rewards`, and forwards the batch to `POST /feedback`.
3. **Daily phase.** `attribute-rewards` per §3.4.2.
4. **Service update** (`/feedback`): per tuple — Sherman–Morrison update of $(A_g, b_g)$ with
   $(x, r)$; Beta cell success/failure increment with decay applied first; River blend step.
   State rows carry `state_version`; the update is applied only if the tuple's
   recommendation isn't already reflected (id-set check) — safe re-delivery.
5. **Rebuild on correction** (File 05 §1: "REBUILD (A, b) and beta cell from stored reward
   tuples (no downdate)"): load all non-excluded tuples for the user (bounded by the event
   archive horizon), recompute $A_g = I + \sum x x^\top$, $b_g = \sum r x$ per category, recount
   Beta evidence applying decay *as of each tuple's original timestamp*, bump `state_version`.
   Never a rank-one downdate.

## §3.6 Cold-Start UX Rungs (three-rung ladder)

File 04 §3.3 calibrates prior strength "matching the three-rung cold-start UX (File 3 §3.6)";
File 03 §1.2 names the ladder "heuristic → cached personal model → full pipeline". The rungs:

- **Rung 1 — population priors (day 0 – ~2 weeks).** Plans driven by chronotype-class priors
  (File 04 §3); UI shows "learning mode" (UC-01: "learning-mode plan with population-prior
  confidence labels"); confidence rendering stays glassy (File 02 §3.1 confidence = solidity);
  wider exploration when the survey was skipped (UC-01 A1).
- **Rung 2 — personal model dominance (~2 weeks).** When a cell's evidence exceeds its prior
  strength ($S+F > n_0$), rationales switch from population phrasing ("most evening types…") to
  personal phrasing ("you complete…"); the learning-mode badge drops when ≥50% of *active*
  cells are personal. **[INFERRED]** thresholds; File 04 §3.3 fixes the 1.5–2-week takeover
  timing that these reproduce.
- **Rung 3 — collaborative refinement (≥30 attributed outcomes).** ALS fold-in + cluster
  reassignment refresh unvisited-cell priors (§3.2.2); exploration budget now spends on
  cluster-informed candidates. Roadmap beyond v1: SASRec-lite sequence layer (File 03 §2.2)
  as an additional feature channel.

## §4 Data Schema (Postgres 16, Supabase)

Conventions: `timestamptz` everywhere; every user-owned table has `user_id uuid not null
references auth.users(id) on delete cascade` (FR-42 erasure by cascade); soft optimistic
concurrency via `version int` on client-mutable rows (File 05 §2 `base_version` checks);
`server_seq bigint` from a global sequence, trigger-set on insert/update of pull-synced tables —
the pull cursor is "max `server_seq` seen" (File 05 §2 push-then-pull against a server cursor).
**[INFERRED]** statuses are `text` + named CHECK constraints, not enums: M-02 must extend the
value set, and re-creating a CHECK is transactional and index-neutral.

### 4.1 Base tables (migration `0001_base`)

**profiles** — 1:1 with auth.users. `user_id PK/FK`, `timezone text` (IANA), `locale text`,
`working_hours jsonb` (per-weekday [start,end] minutes), `sleep_window jsonb`, `rmeq_score
smallint null` (4–25), `chronotype_class text CHECK in (DM,MM,INT,ME,DE) null`, `survey_skipped
bool default false`, `top_categories text[]`, `onboarding_completed_at`, `research_cohort bool
default false` (File 03 §7), `settings jsonb` (notification prefs incl. per-category mute,
FR-50), `version`, `updated_at`, `server_seq`.

**tasks** — FR-10 fields verbatim: `id uuid PK`, `user_id`, `title text`, `category text CHECK
in (deep,admin,physical,learning)`, `est_minutes int > 0`, `deadline timestamptz null`, `value
smallint CHECK 1..3`, `splittable bool default false`, `earliest_start timestamptz null`,
`recurrence jsonb null` (FR-12 schema-ready), `status text CHECK in
(inbox,scheduled,done,archived) default inbox`, `done_at null`, `postpone_count int default 0`,
`deleted_at timestamptz null` (**[INFERRED]** soft delete: offline peers must converge on
deletions), `version`, `created_at`, `updated_at`, `server_seq`.
Indexes: `(user_id, status)`, `(user_id, deadline)`.

**calendar_events** — FR-03/UC-09: `id uuid PK`, `user_id`, `source text` (`google`), 
`external_id text`, `start_at`, `end_at`, `title text null` (display only; never exported —
§7), `busy bool default true`, `updated_at`, `server_seq`, **UNIQUE(user_id, source,
external_id)** (File 05 §2 "unique source+external_id").

**plans** — one row per generation run. `id uuid PK`, `user_id`, `plan_date date`, `horizon
text CHECK in (day,week)`, `engine text CHECK in (learned,heuristic)` (NFR-R2 tagging, UC-03
A1), `model_version text`, `arm text null` (File 06 condition; filled from study_assignments),
`solver_status text`, `telemetry jsonb` (solve_ms, literals, degradation-ladder flags — File 04
§1.5 "flagged in telemetry"), `generated_at`, `server_seq`. **[INFERRED]** table exists so
solver telemetry and NFR-O1 versioning have a home that isn't duplicated per block.

**recommendations** — the core row (base, *before* M-01/M-02): `id uuid PK`, `user_id`,
`plan_id FK`, `task_id FK`, `chunk_index smallint default 0` (File 04 §1.3 C3 splittable
chunks), `slot_start`, `slot_end`, `context_bucket text` (φ value, §3.2.5), `features jsonb`
(the numeric $x_{\tau,c}$ snapshot — NFR-O1 "feature snapshot"; numeric-only, §7),
`q_hat real`, `confidence real` (FR-22 rendering), `rationale_key text` + `rationale_params
jsonb` (FR-21; key+params so the client renders localized copy — i18n decision 6),
`is_experiment bool default false` (FR-22), `engine text`, `model_version text`, `status text
CHECK in (shown,accepted,pinned,moved,rejected,completed,lapsed,expired) default shown`,
`attributed_at timestamptz null`, `version`, `created_at`, `updated_at`, `server_seq`.
Indexes: `(user_id, slot_start)`, `(user_id, status)`, partial on `attributed_at is null`.

**events** — append-only behavioral log (File 05; NFR-O1): `id bigint identity PK`, `user_id`,
`op_id text not null`, `type text` (task_created, focus_start, focus_end, block_skipped,
completion, correction, drag_override, notification_response, review_completed, plan_accepted,
…), `task_id null`, `recommendation_id null`, `payload jsonb`, `context jsonb` (client context
snapshot, File 05 §1 "ctx=snapshot"), `client_ts`, `server_ts default now()`, `local_day date`.
**UNIQUE(user_id, op_id)** — duplicate op replay is a no-op (NFR-R1).

**feedback_rewards** — stored reward tuples (§3.4; the rebuild substrate): `id uuid PK`,
`user_id`, `recommendation_id FK`, `kind text CHECK in (outcome,override_out,override_in)`,
`reward real CHECK 0..1`, `reason text`, `category text`, `features jsonb` (x at attribution),
`excluded bool default false`, `excluded_reason text null`, `attributed_at`, `corrected_at
null`. **UNIQUE(recommendation_id, kind)** — corrections UPDATE the outcome row in place
(§3.4.2); history lives in `events`.

**bandit_state** — `PK(user_id, category)`, `d smallint`, `a_matrix double precision[]` (d×d,
row-major), `b_vector double precision[]`, `state_version int`, `updated_at`. **[INFERRED]**
File 05's `user_model_state` participant is normalized into `bandit_state` + `beta_cells` +
`blend_state`: /insights (FR-40) and prior refresh (File 04 §3.5) need cell-level SQL access,
and partial updates shouldn't rewrite a monolithic blob.

**beta_cells** — `PK(user_id, category, daypart, day_type)`, `succ real`, `fail real`,
`last_event_at`, `alpha0 real`, `beta0 real`, `prior_version int`, `updated_at`.

**blend_state** — `user_id PK`, `w_energy real`, `w_bandit real`, `state_version`, `updated_at`.

**prior_cells** — global, versioned (File 04 §3.2–3.3, §3.5): `PK(version, chronotype_class,
category, daypart, day_type)`, `mu0 real`, `n0 real`. Version 0 seeded from File 04's tables.

**cluster_assignments** — `user_id PK`, `cluster_id int`, `method text CHECK in
(rmeq_seed,als_foldin)`, `assigned_at` (File 04 §3.4).

**model_registry** — `id PK`, `kind text CHECK in (priors,als,blend,ranker)`, `version text`,
`artifact_uri text` (HF Hub), `metrics jsonb`, `promoted bool`, `created_at` (File 03 §1.1,
File 04 §3.5 "its own row in model_registry (kind='priors')").

**study_assignments** — File 06 §1.2: `PK(user_id, phase_no)`, `sequence text CHECK in
(ABAB,BABA)`, `arm text CHECK in (A,B)`, `starts_on date`, `ends_on date`.

**gcal_sync_state** — P8 (File 05 §2 incremental sync): `user_id PK`, `channel_id`,
`resource_id`, `sync_token`, `channel_expires_at`, `updated_at`.

**deletion_audit** — **[INFERRED]** GDPR proof-of-erasure (UC-10 "confirmed by email", ≤30 d):
`id PK`, `user_hash text` (no user FK — survives the cascade), `requested_at`, `completed_at`.

### 4.2 Migration M-01 (`0002_m01_propensity`)

`ALTER TABLE recommendations ADD COLUMN propensity real;` — exact $\varepsilon/m$ on the
randomized slice at write time (File 04 §1.4); for TS traffic, back-filled by the nightly
Monte-Carlo job ($K = 32$ scored samples, File 04 §2.3) — NULL until then.

### 4.3 Migration M-02 (`0003_m02_displacement`)

Re-create the recommendations status CHECK adding `displaced_pending` and `displaced`
(File 05 §2), and `ADD COLUMN conflict_flag bool not null default false` (the
`concurrent_external_conflict` marker that drives ambiguity exclusion).

### 4.4 Row-Level Security catalog (NFR-S1: RLS on every table)

| Table | authenticated user policies | service-role-only writes |
|---|---|---|
| profiles | SELECT/INSERT/UPDATE own (`user_id = auth.uid()`) | — |
| tasks | SELECT/INSERT/UPDATE/DELETE own | — |
| calendar_events | SELECT own | webhook EF writes |
| plans | SELECT own | plan-request EF writes |
| recommendations | SELECT own; UPDATE own **restricted to** status/version by trigger guard **[INFERRED** column-level discipline: placements are service-authored, clients only transition status**]** | plan-request / attribute-rewards / sync-resolve |
| events | SELECT own; INSERT own (`with check user_id = auth.uid()`); **no UPDATE/DELETE policies → append-only for clients** | — |
| feedback_rewards | SELECT own | sync-resolve / attribute-rewards / service |
| bandit_state, beta_cells, blend_state | SELECT own | RecSys service |
| prior_cells, model_registry | SELECT for `authenticated` (global read) | training pipeline |
| cluster_assignments, study_assignments | SELECT own | training pipeline / admin |
| gcal_sync_state | none (client never reads) | webhook EF |
| deletion_audit | none | deletion EF |

Anonymous-trial users (FR-01) are Supabase anonymous users: same `auth.uid()`, same policies;
conversion keeps the uid — no data migration. Unconverted anonymous accounts are purged after
30 days (**[INFERRED]** retention hygiene; Appendix A).

## §5 API Surface — Request/Response Schemas

All endpoints JSON over HTTPS. Auth: `Authorization: Bearer <Supabase user JWT>` verified
against the project JWKS (File 03 §5); the two batch endpoints additionally accept the
service-to-service secret (`X-Service-Key`) with explicit `user_id` — required because
`attribute-rewards` runs from pg_cron with no user session **[INFERRED]**.

### POST /plan  (called by `plan-request` EF only)

```jsonc
// request
{
  "user_id": "uuid", "plan_date": "2026-08-24", "horizon": "day",
  "timezone": "Europe/Kyiv",
  "working_hours": {"mon": [540, 1080], "...": "..."},   // minutes from local midnight
  "sleep_window": [1380, 420],
  "busy": [{"start": "...", "end": "..."}],               // MAY BE EMPTY (decision 5)
  "tasks": [{"id": "uuid", "category": "deep", "est_minutes": 90, "deadline": null,
              "value": 2, "splittable": false, "earliest_start": null,
              "pinned_start": null, "postpone_count": 1}],
  "previous_assignments": [{"task_id": "uuid", "slot_start": "..."}],  // AddHint warm start
  "settings": {"epsilon": 1.0, "top_m": 4, "policy": "ts"},            // policy: ts|linucb|heuristic-shadow
  "arm": "B"
}
// response 200
{
  "engine": "learned", "model_version": "...", "solver_status": "FEASIBLE",
  "assignments": [{
     "task_id": "uuid", "chunk_index": 0, "slot_start": "...", "slot_end": "...",
     "context_bucket": "AF.wd.fresh", "q_hat": 0.61, "confidence": 0.74,
     "rationale_key": "afternoon_affinity", "rationale_params": {"category": "admin"},
     "is_experiment": false, "propensity": null, "features": [1, 0, "..."]
  }],
  "unplaced": [{"task_id": "uuid", "reason": "no_feasible_start"}],
  "infeasible": null,           // or {"options": [{"kind": "shrink", "task_id": "...",
                                //   "delta_minutes": 30, "consequence": {"metric": "est_completion_drop", "value": 0.18}}]}
  "telemetry": {"solve_ms": 840, "literals": 9200, "degradation": null}
}
```

Infeasibility → FR-24 trade-off options ranked by estimated utility loss; the EF relays them to
the client sheet; the user's pick returns as a new /plan call with the option applied.

### POST /feedback  (called by `sync-resolve` and `attribute-rewards`)

```jsonc
// request
{ "user_id": "uuid", "tuples": [{
    "recommendation_id": "uuid", "kind": "outcome", "reward": 1.0, "reason": "completed",
    "category": "deep", "features": [1, 0, "..."], "excluded": false,
    "attributed_at": "...", "correction": false }] }
// response 200
{ "updated": 1, "skipped_excluded": 0, "rebuilt": false, "state_version": 42 }
```

`correction: true` on any tuple triggers the §3.5.3 rebuild after applying replacements.

### GET /insights  (user JWT)

```jsonc
{ "heatmap": [{"category": "deep", "daypart": "MO", "day_type": "weekday",
               "mean": 0.71, "ci": [0.58, 0.81], "n_effective": 11.2}],
  "affinities": [{"key": "morning_deep_work", "params": {"factor": 2.4},
                  "confidence": 0.8, "state_ref": "beta:deep.MO.weekday"}],
  "adherence": [{"week": "2026-W34", "par": 0.56}] }
```

FR-40's hour×weekday grid renders client-side from (daypart, day_type) posteriors; `state_ref`
is what FR-41 correction toggles post back against. `ci` from Beta quantiles; `n_effective` =
decayed $S+F$ (drives the solidity rendering, FR-22).

### POST /parse-preview  (user JWT; fallback only, FR-11 primary is on-device)

`{"text": "report draft 2h by fri", "timezone": "...", "now": "..."}` →
`{"title": "report draft", "category_guess": "deep", "est_minutes": 120,
"deadline": "...", "ambiguities": ["deadline_time_of_day"]}`

### GET /healthz

`{"status": "ok", "model_versions": {"priors": "0", "als": null, "blend": "..."},
"uptime_s": 1234}` — the EF's cold-detection probe (NFR-R2: fallback fires on timeout/non-200;
budget in Appendix A).

## §7 Security & Privacy Specifics

- **JWT:** asymmetric (NFR-S1), verified against Supabase JWKS with `kid`-keyed cache;
  `aud = authenticated`; the service rejects tokens whose `sub` ≠ requested `user_id`.
  Service-to-service: single high-entropy secret held in Supabase EF env + HF Space secrets —
  never in the client, never in the repo.
- **No raw text across the ML boundary (NFR-S3):** `features` snapshots are numeric arrays;
  `rationale_key`/`context_bucket` are closed vocabularies; task titles and calendar titles
  never reach `/plan` scoring state, the training export, or the archive. The training-export
  query selects an explicit column whitelist; a CI test asserts the whitelist contains no
  text-typed columns (File 03 §7 "CI-tested export query").
- **Erasure (FR-42/UC-10):** `on delete cascade` from `auth.users` through every user-owned
  table; per-user model state lives only in Postgres (HF Hub holds only global artifacts), so
  account deletion is a single auth-admin call + `deletion_audit` row; completion email within
  30 days. Global models are trained on pseudonymized categorical features and are not
  re-trained on erasure (documented DPIA position, File 03 §7).
- **Export (FR-42):** an `export-data` EF (P10) bundles tasks, events, recommendations, reward
  tuples, and learned parameters (Beta cells, blend, affinities) as JSON.
- **Retention:** raw `events` 24 months → pseudonymized Parquet archive (File 06 §5);
  anonymous-trial accounts purged after 30 days unconverted. **[INFERRED]** both windows —
  Appendix A.
- **Analytics:** PostHog **EU instance** + Sentry EU org (NFR-S2; decision 7 requires the
  PostHog region documented at P1); model-version tag on every recommendation event (NFR-O1).
- **Rate limiting:** `/plan` capped per user per day (Appendix A) at the EF layer —
  free-tier protection **[INFERRED]**.

## Appendix A — Open Parameters (proposed defaults; fixed by ADR in the named phase)

| Parameter | Meaning (anchor) | Proposed default | Fixed in |
|---|---|---|---|
| ε | P(one experiment placement per plan) (File 04 §1.4 "default 1 slot/day") | 1.0 → propensity 0.25 | P5 |
| m | top-m buckets (File 04 §1.4) | **4 (spec-fixed)** | — |
| experiment eligibility | non-critical, unpinned, ≤2 h, drawn uniformly | as stated | P5 |
| λ_s / λ_f | run-length / fragmentation penalties (File 04 §1.3) | 0.3 / 0.5 per extra chunk | P5 |
| M_τ | criticality deferral weight | 10 · v_τ | P5 |
| γ_u, η | urgency multiplier g(u) (File 04 §1.2) | 0.5, 16 ticks (4 h) | P5 |
| b | buffer ticks (File 04 §1.2) | 1 tick (15 min) | P5 |
| d_min | min splittable chunk (C3) | 2 ticks (30 min) | P5 |
| L, H_g | same-category run-length window/cap (C4) | 12 ticks / 8 ticks (deep); off for admin | P5 |
| σ² | TS sampling variance (File 04 §1.4) | 0.25 | P5 |
| α_ucb | LinUCB width (File 04 §1.4) | 1.0 | P5 |
| d | feature dimension (§3.2.4) | 17 | P5 |
| solver time cap | File 04 §1.5 | **1.5 s (spec-fixed)** | — |
| /plan EF fallback budget | NFR-R2 within NFR-P1's 2.5 s | 1.9 s total, then heuristic | P6 |
| plan triggers | UC-03 | 06:00 local + first open | P6 |
| Beta half-life | File 05 §1 | **28 d (spec-fixed)** | — |
| slot start grace | File 06 §1.4 PAR | **±15 min (spec-anchored)** | P7 |
| partial/off-slot/override rewards | §3.4.1 rows 3, 4, 8, 9 | f · 1.0 / 0.3 / 0.1 / 0.7 | P7 |
| correction window | §3.4.2 | 7 days | P7 |
| (A,b) forgetting | non-stationarity beyond Beta decay | none in v1 | P7 |
| duration estimator | UC-06 A2 | EWMA α = 0.3 per (user, category) | P7 |
| blend init / lr | §3.2.6 | (0.7, 0.3) / River SGD 0.05 | P7 |
| attribution cron | 23:55 local on UTC pg_cron | every-15-min sweep over timezones | P7 |
| rung-2 thresholds | §3.6 | S+F > n₀ per cell; badge off at 50% active cells | P7 |
| notification lead | FR-50 "smart lead time" | 10 min before block (v1 static) | P10 |
| daily notification cap | FR-50 | **5 (spec-fixed)** | — |
| retention windows | §7 | events 24 mo; anonymous 30 d | P10 |
| IPS clip M | File 04 §2.3 | 10 | P11 |
| MC propensity K | File 04 §2.3 | **32 (spec-fixed)** | — |
| ESS floor | File 04 §2.3 | **100 (spec-fixed)** | — |
| ALS hyperparams | File 04 §3.4 | factors 32, λ 0.1, α_conf 40 | P11 |
| k-means k | File 04 §3.4 | silhouette over k ∈ [3, 8] | P11 |
| /plan rate limit | §7 | 30/user/day | P5 |

---

*Traceability: §3.2 ↔ File 03 §2.2/§3, File 04 §1.4/§3, File 05 §1 · §3.4 ↔ File 02 §4.4/UC-04/
UC-06/UC-07, File 05, File 06 §1.4 · §3.5 ↔ File 05 §1 · §3.6 ↔ File 04 §3.3, UC-01 · §4 ↔ File
03 §4 (M-01/M-02), File 05 §2 · §5 ↔ File 03 §5 · §7 ↔ File 03 §7, NFR-S1/S2/S3, FR-42.*
