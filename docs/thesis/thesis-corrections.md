# Thesis-Draft Corrections Worklist

> One line per discrepancy between `docs/thesis/draft.docx` and the system as built.
> Format: draft section says A, the system does B, change the text to say B because …
> Appended by every phase whose work contradicts the draft. Started 2026-08-24 (draft read
> end-to-end against specs/01–07 and the P0/P1 state).

1. **§4.6 / табл. 3.3 (stack):** draft says "Jest 30" and "ESLint 9" — the system pins jest
   29.7 (jest-expo 57's internals are ^29.x; ADR-0003) and ESLint 10 (current flat-config
   line). Change the text to name jest 29.7 and ESLint 10, or drop tool version numbers from
   prose and cite the repo's versions.md.
2. **§3.3 / табл. 3.3:** draft implies TypeScript strict on the current major; the system pins
   **TypeScript 5.9.3** because openapi-typescript's peer range is ^5.x (ADR-0004). Say 5.9.
3. **Табл. 3.2 NFR-Sc1 vs §3.3 text:** the draft contradicts itself — 10 000 MAU free-tier in
   the table, ~3 000 MAU in §3.3/§1.5. The audited figure is **$0 to ~3k MAU** (File 03 §2.2
   "as amended"); fix the table row to say ~3k free / ≤$25 to 50k.
4. **§2.1 (formal statement):** "кожна задача — не більше одного інтервалу" contradicts the
   splittable-chunk constraint (2.6): change to "кожен фрагмент задачі — не більше одного
   інтервалу" (spec-conflicts M6).
5. **Додаток Г (SQL fragment):** the real schema differs: `events.op_id` is text (client ULID)
   with UNIQUE(user_id, op_id) — not a bigint PK; `recommendations` additionally carries
   plan_id, chunk_index, context_bucket, features (numeric snapshot), q_hat, rationale_key +
   rationale_params (no free-text rationale column), is_experiment, engine, attributed_at;
   `model_version text references model_registry(version)` is invalid (version is not unique) —
   the system stores model_version as a plain tagged string. Update the fragment or label it
   "спрощений ілюстративний фрагмент".
6. **§3.4:** draft's single `user_model_state` table is normalized in the system into
   `bandit_state` + `beta_cells` + `blend_state` (cell-level SQL access for FR-40 heatmap and
   priors refresh). Update the entity list because the heatmap and empirical-Bayes queries
   read cells relationally.
7. **Додаток Ж (/plan example):** system responses use `engine: "learned" | "heuristic"` (not
   "bandit_cpsat"), `category: "deep"` (closed archetype enum, not "deep_work"), a
   `rationale_key` + `rationale_params` pair rendered client-side (i18n decision) instead of a
   server-rendered Ukrainian string, and a `telemetry` object (not `solver`). Update the
   example to the specs/07 §5 shape.
8. **§5.1 / §5.6 (blinding) — design change APPROVED 2026-08-24 (spec-conflicts H1):** both
   arms carry the ε-randomized slot (identical ε, identical top-m, identical badge rendering).
   Required text edits: (a) табл. 5.1 arm A renamed **"евристика + узгоджена рандомізація"**
   ("heuristic + matched randomization") — drop "сумлінна репліка рушія класу Motion/Reclaim"
   and state that the matched randomization is what makes the blind hold; (b) §5.4 robustness
   (в): the exploration-excluding refit is reported **for both arms** and recovers the
   unperturbed comparison; (c) §5.6 add threat: matched randomization slightly depresses both
   arms' adherence and makes A a perturbed rather than pure incumbent — argue symmetry cancels
   this in the A-vs-B contrast; (d) §2.6/§5.3 OPE text: note baseline traffic now carries
   exact propensities, so the randomized slice spans both arms; (e) mention the rejected
   alternative (sham badges on non-randomized A-blocks) and why: it would falsify
   logged-propensity semantics and deceive participants. Same edits go into the field
   protocol's pre-registration material, which stays in-repo (ADR-0020 — no OSF).
9. **§4.5:** draft states SASRec-lite is trained nightly from the start; the system defers the
   sequence model to the post-v1 feature channel (specs/07 §3.6 rung 3) — no FR requires it and
   the v1 serving path never reads it. Either mark it "запланований компонент конвеєра" or
   move it to перспективи (Висновки already list it as future work — align §4.5 with that).
10. **§5.4 (H4 limitations):** add one sentence acknowledging that the model also _learns_
    during A phases (logging on), so the phase-pair gap growth partially reflects accumulated
    data volume, not purely policy action (spec-conflicts L5).

---

## Appended after P2 (mobile shell) and P3-so-far (tasks), 2026-08-24

Items 1–10 were written against the P0/P1 state. Two of them already cover things that came
up again while building P2/P3 and need **no new entry**: the TypeScript 5.9.3 pin is item 2,
and the H1 matched-randomization rewrite of arm A is item 8 (all five sub-edits (a)–(e)).

11. **Табл. 3.2, NFR-P2 — measurement condition not yet met (most important of this batch).**
    The draft requires "холодний старт застосунку ≤ 2 с (90-й перцентиль) **на середньому
    пристрої 2022 р.**". The measured p90 is **1075 ms**, but on an **iOS simulator running on
    an Apple-silicon Mac** — which is not a mid-range 2022 handset, and is materially faster.
    The number satisfies the threshold but **not the stated condition**, so it must not be
    quoted as if it did. Either (a) report it as "simulator, Release build, p90 = 1075 ms" and
    state that the device-class measurement lands in P10, or (b) hold the claim until the P10
    pass produces a figure on real hardware. Do **not** write "≤ 2 s on a mid-range 2022
    device — confirmed". Protocol and all three runs: `docs/verification/p2-manual-verification.md`.
    (The same caution applies to the 60 fps timeline half of NFR-P2, which is not measured at
    all yet — no timeline exists before P6.)
12. **§3.7 / Додаток В (typography):** draft says **"Inter Variable"** for the interface (also
    repeated in Додаток В). The system ships **static Inter instances**
    (`@expo-google-fonts/inter`, weights 400/500/600/700) because React Native exposes no
    variable-font axis API (spec-conflicts L12). Change "Inter Variable" to "Inter (статичні
    накреслення 400/500/600/700)" in both places; the JetBrains Mono and SF Pro/Roboto
    fallback statements stay correct.
13. **Табл. 3.3 (stack) — "Expo SQLite + Drizzle ORM (useLiveQuery)":** the system reads
    domain data through its own `src/db/useLiveRows.ts` hook, not drizzle's `useLiveQuery`
    (commit 8dd6e88 records the reasoning and the limits of the evidence: the deciding factor
    is the open upstream drizzle-orm#2620, "no update when the query returns no rows", which
    is exactly the empty-inbox → first-task transition this screen lives on). The claim the
    draft actually cares about — "живі запити роблять SQLite єдиним реактивним джерелом
    істини" — is **unchanged and still true**; only the named mechanism differs. Cite the hook
    instead of `useLiveQuery`, or drop the parenthetical.
14. **§3.8 / табл. 3.3 (chrono-node) — split of responsibility:** the draft credits chrono-node
    with "розбір **дат/тривалостей** природною мовою" and §3.8 implies it parses the whole
    string. In the system chrono-node parses **dates only**; **durations are parsed by a local
    grammar** in `src/domain/quickAdd.ts` that runs _first_ and masks its spans out of the text
    chrono sees — necessary because chrono interprets a bare "2h"/"90m" as a _relative time_
    (i.e. a deadline two hours from now) rather than an estimate, which would silently turn
    every duration into a deadline. Reword to "розбір дат — chrono-node; тривалості —
    власна граматика" and keep the on-device claim, which is unaffected. Worth one sentence:
    it is a genuine implementation finding, not a library default.
15. **§3.8 (quick-add preview):** the draft describes the preview chip as (назва, тривалість,
    дедлайн). True as far as it goes, but the system additionally assigns **silent defaults**
    for the FR-10 fields the sentence cannot state — category `admin`, priority 2 (normal),
    30 min when no duration is given — all editable afterwards in the task sheet. Add half a
    sentence, otherwise the text implies a task can be created without a category.
16. **§3.8 (disambiguation chips):** draft says "неоднозначності розв'язуються вбудованими
    чипами уточнення" (plural, unqualified). As built, the parser detects three ambiguity
    kinds (bare weekday naming today; multiple dates; multiple durations) but the UI renders
    chips for **the weekday case only** — the other two are exposed in the parse result and
    resolved by first-match. Either qualify the sentence or finish the chips before the text
    is frozen; this is tracked as P3 follow-up work, not a spec change.

**Nothing to correct** (checked against the draft this round, and matching as built): the
FR-10 field list in §3.6 табл. 3.1 — "назва, категорія, тривалість, дедлайн, цінність 1–3,
подільність, найраніший старт" is exactly the implemented model; the 6-second undo for
destructive actions; "пропустити ніколи не буває червоним"; WCAG 2.2 AA with ≥44 px targets
and 200 % font scaling + reduced-motion (now backed by an executed sweep, 27/27); and the
Today/Inbox/Focus/Insights/Onboarding/task-sheet screen list.

17. **§2 / §3 (solver) — a checked assumption that failed; present it as an empirical result.**
    The draft (with File 04 §1.5) states that a 15-min week instance has "≈ 1.5·10⁴ literals —
    small for CP-SAT" and that the degradation ladder triggers at "|literals| > 4·10⁴". That was
    a stated assumption about where the 1.5 s anytime cap binds, and measurement falsified it:
    on the P5 model (M-series Mac, OR-Tools 9.15, 2 workers), 15-min week instances with
    8–10·10³ start literals returned **UNKNOWN inside the cap without ever starting search** —
    the time was consumed by CP-SAT's **presolve probing over the ≈ 11 k value literals of the
    start encoding**, not by search — while 30-min instances (3–4·10³ literals) returned
    FEASIBLE. Mechanism: probing is superlinear in the number of Boolean literals of the
    `AddElement` start encoding, so the practical threshold sits an order of magnitude below the
    spec's 4·10⁴. Consequences implemented and to be reported: probing/symmetry presolve off,
    a **measured practical threshold of 8·10³ literals** (Mac; **3·10³ on the deployment box** —
    item 37) in addition to the 4·10⁴ outer bound,
    escalation on an UNKNOWN outcome ("still hot"), and the cap as a plan-level budget shared
    across rungs. Write it as "the spec's size argument was tested and did not hold; here is the
    mechanism and the measurement" (spec-conflicts M8, ADR-0007 §11,
    `docs/verification/p5-manual-verification.md` §2). Container numbers (2 vCPU Space) are
    still pending and must be quoted separately (device-checklist "Service environment").
18. **§2 (warm start):** if the draft says the previous plan is injected "as a hint" so that
    blocks only move when worthwhile, add that CP-SAT hints do not preserve ties — the system adds a
    one-unit (1e-4) stability bonus on the hinted start to realize that promise (spec-conflicts M7).
19. **§2 (splittable tasks):** state that a chunk's objective weight is the duration-proportional
    share of the task's weight (spec-conflicts L14) and that chunks number at most four (ADR-0007
    §3); the formal C3 leaves chunk weights implicit.
20. **§3 (service API):** the propensity is logged as the within-slice value and the service
    refuses requests whose ε or m differ from the pre-registered constants (L16) — worth one
    sentence where the OPE substrate is described. **Amended 2026-09-09:** this entry was
    written before the P6 eligibility rule and said «p = ε/m = 0.25». The deployed per-row
    value is **p = ε/|A_m(x)|** with |A_m(x)| ∈ {2, 3, 4} — 0.5, 1/3 or 0.25 — logged beside
    `A_m(x)` in a `double precision` column for exactly that reason (ADR-0008 §1/§4;
    spec-conflicts M9, L22; `services/recsys/src/hourwell_recsys/exploration.py`). Writing
    0.25 as _the_ propensity would put a wrong constant in §2.3 and Додаток Ж.

---

## Appended after P6 (plan E2E), 2026-08-26

21. **§5 (MRT slice / power) — flag for the pre-registration text (in-repo since ADR-0020).** The draft and File 06 §2.3 compute the
    MRT-slice power from "1 randomized slot per day". Measured on the planner's own grid and
    eligibility code (`services/recsys/scripts/experiment_rate.py`): under the strict "≥ 4
    reachable buckets" rule a plain 09–18 weekday makes every task ≥ 60 min ineligible, so a
    plan with three tasks has an eligible task with probability 0.57 and a four-meeting day
    never has one. With the P6 rule (owner decision 2026-08-26: |A_m(x)| ∈ {2, 3, 4}, exact
    per-row p = ε/|A_m(x)|) the probability is **0.86 (three tasks/day), 0.96 (five), 0.22–0.48
    on heavy days**, i.e. **≈ 4.3 experiments per user-week on plain weeks and ≈ 1–2.4 on heavy
    weeks**, before INFEASIBLE-after-pin drops (P11 reports the drop rate) and before re-plans
    supersede earlier draws (only the last shown plan of a day is acted on). Recompute the
    slice's achieved power from this rate (Liao et al. 2016) and state the eligibility rule and
    the per-row propensity formula in the pre-registration text. (ADR-0008 §1; spec-conflicts M9.)
22. **§5.1 табл. 5.1 (arm A) — concrete definition, in addition to item 8's rename.** Arm A is
    now built: a deterministic list scheduler on the SAME grid, feasibility set, context buckets
    and feature snapshot as the learned engine — pinned tasks first; the matched ε-draw with the
    heuristic's own ranking (earliest reachable bucket first); then critical tasks by
    Earliest-Deadline-First (Liu & Layland 1973) and the rest by priority tier, deadline,
    duration at their earliest free start (Graham 1966 list scheduling); greedy chunking for
    splittable tasks. It never calls the RecSys service, logs `q_hat`/`confidence` as NULL and
    `model_version = heuristic-p6.0`, and logs the SAME 17-feature snapshot (features 15–16 read
    from the user's Beta cells) so the learned policy can be replayed on arm-A slice rows.
    Cite EDF/list scheduling rather than "Motion/Reclaim-class rule engine". (ADR-0008 §2–3.)
23. **§3 (graceful degradation, NFR-R2):** if the draft says fallback plans are "labeled as
    such", add that the label is tied to the fallback _reason_ (service timeout/unreachable),
    not to the heuristic engine — arm-A plans are unlabeled so the blind holds; outage user-days
    are excluded from the analysis (File 06). Also: the fallback budget is 1.9 s of a 2.5 s
    end-to-end target and is calibrated for day plans; week plans are not requested by the v1
    client. (spec-conflicts L17; ADR-0008 §4, §7.) **2026-09-03:** the "2.5 s end-to-end target"
    is superseded by the measured requirement in #51; the 1.9 s fallback budget stands.
24. **§3.6 / UC-03 (plan triggers):** if the draft describes "06:00 local" as a scheduled server
    or background job, say instead that planning is triggered lazily on first open/foreground of
    a plan day (06:00 is the day boundary) because no correctness may depend on background
    execution on mobile; the 06:00 reminder is a notification (P10). (spec-conflicts L20.)
25. **§3.7 (Today screen):** the timeline is a row list with a time gutter and a "Now" marker,
    not a pixel-proportional canvas — chosen so 200 % font scale and screen readers work
    (NFR-A1/A2); a proportional canvas is a P9+ option. Confidence-as-solidity applies to
    learned rows; heuristic rows render at a constant solidity with no percentage claimed.
26. **§3.3 / табл. 3.2 (cost envelope) and §4.x (deployment):** the draft hosts the RecSys
    service on "Hugging Face Spaces (free CPU tier)" and states "$0 through ~3k MAU". As of
    July 2026 Hugging Face requires a paid plan (PRO, $9/mo) to create any Docker or Gradio
    Space, free or not; only Static Spaces are free (spec-conflicts H4, verified 2026-08-27
    against huggingface.co/docs/hub/spaces-overview and hub-docs PR #2624). Rewrite the
    hosting paragraph: the service runs in a container on an **Oracle Cloud Infrastructure
    "Always Free" Ampere A1 VM (2 OCPU / 12 GB) in the EU region France South, Marseille
    (`eu-marseille-1`)**, behind Caddy with automatic TLS, deployed by a pull-based rollout from
    the GitHub Container Registry (ADR-0009, decided 2026-08-27). The cost envelope stays as
    written ("$0 through ~3k MAU; ≤ $25/mo to ~50k"): Always Free resources never expire and the
    50k-MAU tier maps to a paid A1 shape. Add one sentence in the limitations/threats section: the
    free-tier assumption was true when the architecture was written (early 2026) and was
    falsified by the provider during implementation — an external-dependency risk of free-tier
    research systems, mitigated by an infrastructure-agnostic container and a provider with a
    contractual (not promotional) free tier.
27. **§3.x (privacy / NFR-S2 "EU region hosting"):** if the draft claims every service runs in
    the EU, qualify it: Hugging Face Spaces on free and PRO plans run in the US only (EU
    runtime is a Team/Enterprise feature — docs "storage-regions", 2026-08-27), so the
    RecSys tier as specified would have processed pseudonymous behavioural data outside the
    EU. The P1 DPIA note recorded only "not guaranteed". With ADR-0009 (Oracle, Marseille) the
    EU claim is true for every tier; state additionally that the RecSys tier is **self-hosted on
    infrastructure the researcher administers** (Oracle as processor under its Data Processing
    Agreement; OS patching, access control and key rotation are the researcher's
    responsibility — `docs/runbooks/oracle-vm.md`, `docs/privacy/README.md`).
28. **§3.x / UC-07 (manual override as teaching):** if the draft describes the v1 override as a
    drag with haptic snap, say that v1 offers "Move…" (a start-time picker on the row-list
    timeline) producing the same paired feedback (origin 0.1 / target 0.7, one pair per
    placement, target context computed server-side from the shared grid/φ/feature code); the
    drag gesture is a later UI refinement, not part of the learning signal. (spec-conflicts M10;
    ADR-0010 §6.)
29. **§3.4 (blend weights):** if the draft says "River learns the blend weights online", write
    instead: the service takes one projected-SGD step on the squared error of the convex blend
    per applied reward tuple (lr 0.05, exact projection onto the simplex, Duchi et al. 2008) and
    replays the trajectory on rebuild; River reproduces the unprojected step and serves as the
    test oracle (like MABWiser for the bandit). (spec-conflicts L23; ADR-0010 §10.)
30. **§3.4.1 / §3.4.2 (attribution):** state the concrete rules as built — sessions within
    ±15 min of slot start belong to the block (Σ focused over in-window sessions ÷ planned; ≥ 50 %
    → 1.0, else r = f); a completion without a session counts as in-window inside the slot
    ± 15 min; same-day completions outside the window earn 0.3 only at the 23:55 authority;
    a skip is 0.0 instantly and sets the row to `rejected` (there is no `skipped` status);
    "actually did it" within 7 days rewrites the stored lapse to 1.0 and triggers a full rebuild,
    keeping the original attribution time for decay. The 23:55-local boundary is evaluated in
    SQL in the user's timezone and is DST-tested. (ADR-0010 §3–§7.)
31. **§3.6 / UC-06 A2 (duration estimator):** the EWMA (α = 0.3) of focused/estimated minutes
    over finished sessions is computed in the edge function and applied to the task's estimate
    for both engines once three sessions exist (multiplier clipped to [0.5, 2]); it is not part
    of the bandit's state. (spec-conflicts L27; ADR-0010 §9.)
32. **§4 (feedback delivery / robustness):** add that reward tuples are stored first and
    delivered to the service afterwards with an acknowledgement marker; a service outage delays
    learning but loses nothing (idempotent re-delivery). Relevant to the hosting discussion in
    #26. (ADR-0010 §8.)
33. **§3.x (privacy / processors):** name the processors as built — Oracle Cloud Infrastructure
    (IaaS, `eu-marseille-1`, Data Processing Agreement for Oracle Services incorporated by the
    Cloud Services Agreement), Supabase (BaaS, eu-west-1, DPA), PostHog EU, Sentry EU — and state
    that the RecSys tier is self-hosted on a VM the researcher administers (patching, access
    control and key rotation are the researcher's responsibility; `docs/privacy/README.md` §3).
    If the draft says "no infrastructure is operated by the researcher", change it.
34. **§3.x / File 06 §5 (archive) and §5 (evaluation pipeline) — transfer analysis:** the draft
    treats "controller in Ukraine, data in the EU" as transfer-free. Per EDPB Guidelines 05/2021
    (v2.0, Example 10) that holds for participant → controller and controller → EU-processor
    flows, but **exports from the EU processors to the researcher's machine in Ukraine — including
    pseudonymised event logs and the Parquet archive — are Chapter V transfers** (no adequacy
    decision for Ukraine). Add the safeguard chosen before P11 (in-region analysis on the EU VM /
    Supabase-side SQL, anonymised aggregates only, or Art. 46/49 grounds) and apply the same
    reasoning to GitHub-hosted training runners (US). (`docs/privacy/README.md` G2/G3.)
    **2026-08-27, ADR-0011 (proposed):** the path-by-path analysis, the two population cases
    (EDPB Example 10 vs Example 6), the lawful bases and four options are written; the text
    change depends on the owner's choice — under the recommended option A the sentence becomes
    "all participant data is stored and processed in EU regions; the researcher, located in
    Ukraine, receives anonymous aggregates; incidental administrative access is covered by
    explicit consent under Art. 49(1)(a)". **Decided 2026-08-28 (ADR-0011 accepted, option A):**
    use that sentence; add "training and analysis run on the same EU virtual machine; the
    continuous-integration pipeline sees synthetic data only".
35. **§3.x (legal framing) — state the participant population and its consequence:** File 06
    §1.3 does not say where participants are. If in the EU/EEA, the GDPR applies to the
    researcher under Art. 3(2)(b) and **Art. 27 requires a representative in the Union** (the
    27(2) exemption needs "occasional" processing — an 8-week behavioural study is not); if in
    Ukraine only, the GDPR binds the EU processors, not the researcher, and Law 2297-VI Art. 29
    governs transfers (EU/EEA adequate; the US is not a Convention 108 party). **Decided
    2026-08-28 — the draft should read:** "Participants are recruited in Ukraine (university
    lists and local productivity communities); residents of the EU/EEA are not excluded. The
    system is designed to the stricter EU regime regardless: all participant data is stored and
    processed in EU regions — Supabase (eu-west-1) and an Oracle Cloud virtual machine in
    France (eu-marseille-1) that also runs model training and the study analysis. The
    researcher, established in Ukraine, receives anonymous aggregates only; incidental
    administrative access to individual records is covered by the participant's explicit
    consent (GDPR Art. 49(1)(a); under the Law of Ukraine No. 2297-VI, Art. 29, EU/EEA states are
    adequate destinations). Should a participant resident in the EU/EEA enroll, the GDPR applies
    to the researcher under Art. 3(2)(b) and a representative in the Union is designated under
    Art. 27 before that enrollment." (ADR-0011 §1, §6, Decision 1.)
36. **File 06 §5 / §3.x (artefact statement):** "anonymized event dataset (Parquet, HF
    datasets)" over-claims — a row-level dataset of 42 people with 8 weeks of timestamped
    behaviour is pseudonymised, not anonymous, and HF datasets is US-hosted. Replace with the
    release option decided 2026-08-28 (ADR-0011 §3), as re-read by ADR-0020 (amendment below). **Decided 2026-08-28 — replace the phrase with:**
    "a synthetic event dataset generated from the fitted models, together with the one-command
    replay harness that reproduces every offline-evaluation table from it (public, on OSF); the
    real event log (Parquet) is pseudonymised, not anonymous — 42 participants × 8 weeks of
    timestamped behaviour is re-identifiable by linkage — and is deposited with restricted
    access on EU storage (OSF, Frankfurt region) under a data-use agreement". Also replace "HF
    Hub" for the model registry with "Supabase Storage (EU)" wherever `artifact_uri` is
    described. spec-conflicts H5; ADR-0011 §4, Decision 3. **Amended 2026-09-05 (owner,
    ADR-0020 §4):** no OSF project exists — read "public, on OSF" as "public, in the project
    repository", and the restricted-access deposit as a clause that applies only if a field
    study is ever run (platform chosen then; nothing exists to deposit today).
37. **§3.x / File 04 §1.5 ("meeting NFR-P1 on 2 vCPU") and the reported ladder parameter —
    measured on the deployment box 2026-08-28:** report the container numbers, not the Mac's
    (item 11): day plan (12 tasks) OPTIMAL 20/20, end-to-end p50 135 ms / p90 487 ms on the
    Oracle A1 (2 pinned cores) — NFR-P1 met with margin. The practical degradation threshold is
    **3·10³ literals on that box** (the Mac fit was 8·10³; the 15-min week rung is already
    presolve-bound at 3.6·10³ there). Qualify the claim: for the 50-task, 7-day stress instance
    the 1.5 s plan-level budget yields a FEASIBLE plan in ≈ 60 % of runs even on the best rung
    (≈ 40 % return the partial anytime plan with the ladder flagged) — the product path is the
    day horizon; the weekly plan (FR-20) needs a budget decision before it ships (revisit.md).
    `p5-manual-verification.md` §2.1–2.3, ADR-0007 §11 addendum. **2026-09-03:** "NFR-P1 met
    with margin" here is the _service-side_ statement and stays true; the end-to-end requirement
    is restated from device measurements in #51 — do not let the two numbers stand as one claim.
38. **§3.x (sync / UC-09 "plan consistent with external calendar ≤ 5 min after change"):**
    state the bound as a **server-side** property — the Google push channel (seconds, typical)
    backed by a 5-minute pg_cron sweep (`gcal_sweep_tick`) that re-syncs any connected calendar
    not synced in the last 5 min and renews channels; the **device** learns the new state at its
    next foreground or 60-second poll (invariant 7: no correctness depends on background
    execution). Say explicitly that the offline-first client is eventually consistent and that
    the reward path is what the bound protects (the displacement is recorded server-side before
    the facts arrive). ADR-0012 §10; spec-conflicts L29.
39. **§3.x (File 05 §2 "field-level merge, user-owned fields LWW"):** the text should name the
    rule the system implements: user-owned fields follow the newest edit time across devices
    (ties to the device in hand); fact-derived fields are monotone (a completion never regresses
    to a plan-side status, `postpone_count` is the max); the merged row is replayed against the
    server's version and every queued op of the entity collapses into it, so the conflict loop
    is bounded by construction. Also state that replaying a duplicate `op_id` is a no-op at the
    constraint level (ledger `sync_ops`), verified by pgTAP, a Deno scenario and the live
    smoke. ADR-0012 §2–§4; `p8-manual-verification.md` §2.
40. **§3.x (weekly review / "high-weight labels", FR-33/FR-41):** the draft says corrections are
    "applied as high-weight labels" without a definition. The system defines a label as one
    prior's worth of pseudo-observations on the named Beta cell (weight α₀ + β₀ — File 04 §3.3's
    n₀: 8 h in-hours, 4 h out-of-hours), `correct` → successes, `incorrect` → failures, decaying
    with the same 28-day half-life as evidence; only the latest label per cell is in force and
    every label delivery triggers the full rebuild from stored tuples + labels (invariant 6 now
    covers labels, not only "actually did it"). Say so, and say that labels touch the energy
    model only — the bandit's (A, b) never sees a label (no feature vector). ADR-0013 §2.
41. **§2.x / §4 (stack table "Skia heatmap", FR-40):** the heatmap is NOT a Skia canvas: 126
    native Views coloured by OKLCH interpolation between the two spec tokens, composited at an
    alpha that grows with effective evidence (confidence = solidity), one screen-reader summary
    plus a text view. Change the text because a canvas is a single opaque element to a screen
    reader and cannot scale per-cell labels with the font (NFR-A1/A2); Skia remains for the
    focus ring/timeline if ever needed. Also state the resolution honestly: the grid repeats a
    daypart across its hours and a day type across its weekdays. ADR-0013 §5.
42. **§3.x (adherence in the app, FR-33):** the "adherence stats" the weekly review shows are the
    File 06 §1.4 PAR per ISO week (session started within ±15 min AND finished or ≥ 50 %
    focused; displaced and superseded blocks out of the denominator), computed from
    recommendations + facts only — never from the reward table (spec-conflicts H2, guarded by a
    source-level test). The draft should not describe it as "completion rate". ADR-0013 §3.

43. **§UC-10 / privacy chapter ("confirmed by email"):** erasure is confirmed **in the app** with
    the `deletion_audit` reference and completion time; no e-mail is sent (free tier, no
    transactional mail; a mail provider would be a new processor; anonymous accounts have no
    address). Say "confirmed in-app with a reference number"; keep "within 30 days" as the legal
    bound, note the actual completion is synchronous (seconds). ADR-0014 §8–§9. **Decision
    final (owner, 2026-08-31, ADR-0016):** the text should present in-app as the DESIGNED
    mechanism, not a fallback — e-mail can never be universal here (anonymous accounts have
    no address) and Art. 12(3) asks for "without undue delay", which the synchronous in-app
    confirmation satisfies best.
44. **§retention ("anonymous accounts purged after 30 days unconverted"):** the rule implemented
    is **30 days of inactivity** (no sign-in, no event) — an active trial is never destroyed. Also
    say that the 24-month raw-event window starts at study end and is executed by the archive job
    (P11), not by a deletion sweep. ADR-0014 §10.
45. **§notifications (FR-50 "smart lead time"; UC-09 "replacement suggestion notification"):** v1
    ships a **static 10-minute lead** (Appendix A); there is **no displacement push** — the device
    learns of a displacement at its next foreground and the Today notice is the surface. The
    thesis should describe the cap mechanism precisely: a pure planner over a conservative
    delivered-ledger (anything past-due counts as delivered), so "≤ 5/day" is a ceiling under
    any sequence of re-plans, without background execution. ADR-0014 §1–§2, §6.
46. **§accessibility ("all pairings meet AA"):** state the measured exceptions and the rule that
    fixes them: accents are fills only; secondary text on the primary container is large-text
    only (dark 4.36:1); on-primary text is white in light and the dark surface colour in dark
    (white on the dark primary was 2.98:1). Cite `p10-a11y-audit.md`. ADR-0014 §11.
47. **§performance (NFR-P3 "core read/write API ≤ 300 ms p95"):** report two numbers, not one:
    PostgREST read/write from Node → eu-west-1 82–88 ms p95 (meets), the composite `sync-resolve`
    round trip 477 ms p95 (does not). Do not present the sync round trip as the "core API", and
    do not present any of these as device numbers (the handset adds radio wake-up and mobile
    TLS). `p10-manual-verification.md` §2.3. **Amended 2026-09-09:** this entry promised that
    «the device pass measures» the handset figure. It did not — the device-checklist row for a
    handset-side latency series (LTE and Wi-Fi, `sync_completed` durations, one timed export)
    is still open, and no NFR-P3 device number exists. The thesis states the two Node-side
    numbers with their condition and says plainly that a device figure does not exist.
48. **§release / §conclusions (store submission, TestFlight, "app published"):** owner
    decision 2026-08-31 — **neither** developer account is purchased (Play $25, Apple
    $99/yr). Wherever the draft implies store submission, TestFlight distribution, or a
    public listing, write instead: every release artifact is **prepared and verified but
    deliberately unsubmitted** (DPIA, listing copy within verified limits, data-safety
    answers, privacy-policy draft, clean name search, EAS profiles) — the system is
    **"ready to release; only release and marketing remain."** Study distribution is
    account-free: sideloaded release APK on Android; **no iOS participant channel exists**
    (TestFlight needs the membership; free provisioning = 3 devices / 7 days), so
    recruitment is Android-only unless the decision is reversed — state this as a §5
    recruitment limitation next to the M9 power note. `docs/store/metadata.md` §7 decision
    block; enrollment checklist §1.
49. **§5 evaluation / §conclusions / abstract (the field study, N = 30, H1–H4 "results"):**
    owner decision 2026-09-01 (recorded at the DPIA signature): **the field study is out of
    scope.** State the reason as a boundary, not a shortfall: running it requires
    resources outside a master's project — platform developer accounts, a recruitment
    budget, and eight weeks of volunteer retention that engineering effort cannot
    substitute for. The protocol is **designed, instrumented, and verified end to end**
    (exact per-row propensities M-01, first-class arm switching, blocked ABAB/BABA
    randomization, PAR from facts, the aggregate report, the pre-registration material
    assembled and kept in-repo — "pre-registration-ready"; **owner decision 2026-09-05
    (ADR-0020): no OSF registration — "pre-registration-ready" stays; the pre-registration
    discipline is applied in git to the simulation study (#54, #55)**) and the deployed
    system is ready to run it. **Wording rule (ADR-0020 §3, #54): the field study is _out
    of scope_; the evaluation _was performed in simulation_ and is a study with hypotheses,
    method and results — never "no study was conducted" or "the study is not executed".**
    Rewrite every passage that asserts or implies empirical results from real users:
    - **What stands as evidence:** (a) the simulation study (#55; `docs/study/`) — OPE on
      synthetic ground-truth data, where the estimator family (replay, IPS/clipped, SNIPS,
      DR with the ESS < 100 non-evidence rule) RECOVERS closed-form truth, which validates
      the estimators and the logging substrate, plus the pre-registered power and
      closed-loop policy experiments; (b) the researcher's own live use of the deployed system — the full loop
      (plan → facts → rewards → nightly training → scheduled runs) demonstrated in
      production, including the first timer-fired training run (2026-09-01).
    - **What simulation and own-use CANNOT establish — the thesis must say this
      explicitly:** no behavioural claim about humans is tested, let alone falsified.
      H1–H4 remain untested hypotheses; adherence effects, learning-during-A, and
      chronotype-prior benefits are NOT findings, and no sentence may report them as
      outcomes.
    - **Why the out-of-scope field protocol is itself a contribution — argue it precisely:** the
      protocol is an executable, auditable artifact: a within-subject design with matched
      randomization and a nested micro-randomized ε-slice, exact propensities logged by a
      live system (not a simulator), an OPE harness proven against ground truth, a power
      analysis (M9), and an operational enrollment/consent/privacy apparatus (DPIA
      signed) — such that a lab with recruitment resources can run the study without
      further engineering. This claim holds ONLY while the thesis claims system
      correctness, protocol readiness, and estimator validity — never user outcomes; the
      two bullets above are the boundary of the claim.
      Tense change throughout §5: from reporting/future-promising ("the study will show")
      to design ("the protocol specifies"). Cross-refs: DPIA §10 status note;
      spec-conflicts "Post-P12 status overlay"; enrollment checklist header; #48 for the
      release framing.
50. **§verification / §deployment (learned path "verified live end to end"):** add the
    hardware-pass finding of 2026-09-02: on a real Ukrainian Android device the learned engine
    was unreachable until that day — the device reports the legacy IANA id `Europe/Kiev`, the
    service rejected it (422) and every plan fell back to the heuristic, while the Mac-side
    verification (`Europe/Kyiv`) passed. State it as evidence for the simulator-vs-device rule
    (item 11): the live verification chain was correct and still blind to a device-only input.
    Fixed the same day (tzdata wheel + build-time assertion; CHANGELOG "Post-P12 — hardware
    pass fixes"); the field-study framing (#49) is unaffected. **Amended 2026-09-09:** the fix
    was **server-side only** — every account created on the Pixel after it still records
    `timezone: Europe/Kiev`. Write «the service learned to accept the name the device sends»,
    never «the device began sending the canonical name».
51. **§requirements / §verification (NFR-P1 "plan end-to-end ≤ 2.5 s p95 warm") — restate as a
    measured requirement (owner decision 2026-09-03: the 2.5 s was our own pre-deployment
    estimate, seen by nobody outside the project; the thesis states the figure arrived at by
    measurement, with the reasoning).** What the device measured (Pixel 7a, hardware pass day
    2–3; `android-20260903-1020/notes.md` items 1, 3, 8; ADR-0018): the client's own timer
    (`plan_requested.duration_ms`, tap → plan received, before the SQLite mirror) on ten warm
    re-plans of a 14-task day was **p50 3.27 / p95 3.84 s** on 2026-09-02 — while the server-side
    function alone measured 1.66 / 1.91 s and looked inside the old target. The difference is
    client work the estimate never counted: a pre-plan sync push of 1.0–1.5 s whenever facts or
    task edits are pending (every re-plan sends the unplaced tasks back to the Inbox through the
    outbox, so in real use it is the common case), plus ≈ 0.5 s of transport, response handling
    and the local mirror. The server side then had its own structural problem — CP-SAT burnt its
    1.0 s slice proving optimality on interchangeable tasks (ADR-0018) — fixed the same day: the
    function now measures **p50 1.09 / p95 1.34 s** on the same inbox with 0/10 fallbacks
    (before 1/10 and 1.68 / 1.91 s).
    **Owner decision 2026-09-03 — NFR-P1 = "a plan request completes end-to-end on the device
    (tap → plan mirrored) in ≤ 4.5 s at p95, warm; the server-side `plan-request` in ≤ 1.5 s at
    p95; the heuristic fallback bounds the server wait at 1.9 s."** Under-delivering against it is
    fine and expected; the thesis reports the measured figures alongside the requirement. The
    conditions matter: a Pixel 7a on good home Wi-Fi is a favourable case, not an average one — a
    slower phone on worse mobile data will sit above anything recorded here, and a threshold that
    barely passes under good conditions is bad engineering. Reasoning behind the number:
    (a) _composition on the measured stack_, worst realistic case (ops pending): pre-plan push
    1.0–1.5 s + function 1.09–1.34 s + transport/mirror 0.4–0.6 s → an estimated **p50 ≈ 2.9 s,
    p95 ≈ 3.4 s** after ADR-0018 (the client-side "after" numbers come from the next PostHog
    export; the 2026-09-02 export is the measured "before"); with nothing pending ≈ 1.7–1.9 s.
    (b) _headroom_ ≈ 1.1 s at p95 against the favourable-case measurement — room for a slower
    handset's compute share (mirror + render, 0.2–0.4 s on the Pixel 7a) and for mobile-data
    transport well above the ≈ 0.45 s per round trip seen on home Wi-Fi; the figure is dominated
    by network and server time, not device CPU. (c) _acceptability as user-facing latency_: a plan request is a
    deliberate, infrequent action (first open, the evening ritual, an occasional re-plan — one to
    three per day) with an explicit in-progress state; by Nielsen's response-time limits (0.1 s /
    1 s / 10 s) a 3–4 s wait with feedback keeps the user's attention and is far from the 10 s
    abandonment bound, and the fallback guarantees the wait is bounded even when the learned
    service is slow or down. (d) _not tuned to pass_: the levers left untouched are recorded —
    the pre-plan sync itself (measured 2026-09-03 with `hw-sync-hops.mjs`: the function's fixed
    cost ≈ 0.3 s + four lease/replay/pull/release hops ≈ 0.25 s + the instant-rewards pass
    ≈ 0.3–0.4 s, plus ≈ 0.45 s of phone transport). Of its levers, skipping the rewards pass on
    `pre_plan` (≈ −0.35 s, server-only) shipped the same day; collapsing the hops (≈ −0.25 s) and
    carrying the ops inside the plan request (≈ −1.2 s, a client change) are **optimisations the
    project may or may not do — not prerequisites for meeting the requirement** (revisit.md);
    co-locating the VM with the function region (≈ −0.3 s) was rejected by the owner. The figure
    therefore describes the deployed stack as measured, not its best case. (e) _what changes in the text_: wherever the draft says "≤ 2.5 s
    p95" or "NFR-P1 met" from Node/Mac or server-side numbers (items 23, 37), say instead that
    the requirement was **derived from deployment measurements on hardware** and report the
    decomposition table (day-3 notes item 1) as the evidence; the server-side margin (item 37)
    remains a separate, true statement about the service. Cross-refs: spec-conflicts L40;
    ADR-0018; `device-checklist.md` NFR-P1; `p10-manual-verification.md` §2.3 device row.
    **3 Sep client-side series, read 2026-09-04 from the owner's PostHog export (21/21 rows paired
    with the server rows; `android-20260904-0827/notes.md` item 15):** before ADR-0018 the same
    kind of series measured **p50 3.53 / p95 4.58 s** (function 1.68 / 1.84 s; 1 of 10 fell to the
    fallback) — the decided 4.5 s would NOT have been met; after ADR-0018 (gap limit + early stop,
    concurrent context reads) **p50 3.04 / p95 3.68 s** (function 1.10 / 1.30 s; 0 of 10) — met, with
    the server-side 1.5 s met as well. Client − function stayed at ≈ 1.9–2.0 s p50, of which the
    pre-plan sync push measured 1.16 / 1.54 s (17 of 21 requests carried one); the sync change of
    2026-09-03 evening (PR #40) is measured separately on 4 Sep rows. Report both series in the
    thesis: the decided figure is met by the deployed system, not by the first one measured.
    **Weak-phone derivation (owner request 2026-09-04; `android-20260904-0827/notes.md` § "NFR-P1 —
    deriving a figure"):** the measured 3.7 s p95 splits into a server part that scales with nothing
    on the phone (function 1.3 + invoke overhead 0.3 + sync-resolve 1.0 = 2.6 s p95), a network part
    (two HTTPS requests: 0.9 s p95 on home Wi-Fi at 50 ms RTT) and a device part (0.4 s p95 on a
    Tensor G2). Scaled with public single-core ratios (Snapdragon 695 ×1.3, Snapdragon 680 ×2.9
    slower) and Opensignal latency ranges (4G 30–58 ms, weak cell 100–150 ms, 3G ≈ 90 ms): a
    2022 mid-range phone on a weak LTE cell ≈ 4.5 s, a 2022 low-end phone on a 3G-grade link ≈ 5.7 s.
    **DECIDED (owner, 2026-09-04) — final wording: NFR-P1 = "a plan request completes on the device (tap → plan received) in ≤ 6.0 s at p95, warm, on a 2022 low-end Android over a weak-signal link; the reference measurement is 3.7 s p95 on a Pixel 7a over home Wi-Fi (4.6 s before ADR-0018); the server-side `plan-request` ≤ 1.5 s p95; the heuristic fallback bounds the server wait at 1.9 s." Two caveats travel with it: the client timer stops before the SQLite mirror (0.1–0.9 s on the reference device, scaling with the phone) — reported separately, not folded in; and a pre-plan sync carrying a day's backlog costs more than the measured syncs.** This supersedes the 4.5 s wording above (which was set on the reference device alone). **Amended 2026-09-05 (4 Sep export, `android-20260905-0942/notes.md` item 4): the reference is two series of ten, 3.7 s p95 on 3 Sep and 4.1 s on 4 Sep (one 4.7 s request carried a 3.0 s backlog sync — the second caveat, observed); pooled p95 4.0 s (n = 20). State the reference as 3.7–4.1 s, never as one number; the 6.0 s bound and the 1.5 s server bound (function p95 1.28 s on 4 Sep) are unaffected.** **The more useful finding, stated plainly: of the 3.9 s p95 reference sum, 2.6 s — two-thirds — is server-side work (the plan function, its invoke overhead, the sync-resolve call) that scales with nothing on the user's side, not the phone and not the network. That is the share L2 (one RPC for the sync hops) and L3 (ops carried inside the plan request) address; the device and network multipliers act only on the remaining third.** **Network figures — a stated limitation:** the typical-case latency is current (Ookla, Q4 2024: country-wide median mobile latency 32 ms in Europe, 35 ms in the Americas; a 2023 London campaign measured ≈ 25 ms average on 4G LTE); the weak-cell (100–150 ms) and 3G (≈ 90 ms) values are conservative estimates taken from older public measurements (Opensignal country reports, 2018), because current reports publish experience scores rather than milliseconds or could not be retrieved — the derivation errs on the slow side deliberately. **Erratum 2026-09-06:** the before/after fallback pair (1/10 → 0/10) was measured on the 15-task inbox of 3 Sep; the 14-task series of 2 Sep had 1/10 with no "after" — where this item says "14-task" for the pair, read 15-task. **Amended 2026-09-09 — two internal inconsistencies in this item.** (a) An earlier paragraph still says «the reference measurement on the Pixel 7a over home Wi-Fi is 3.7 s p95» while the 2026-09-05 amendment rules that the reference is stated as **3.7–4.1 s, never as one number**; the amended form governs, and the same applies to «before» (3.84 s p95 on the 2 Sep 14-task series, 4.58 s p95 on the 3 Sep 15-task series — name the series with the number). (b) «of the 3.9 s p95 sum, 2.6 s is server-side» reads as a measurement: 3.9 s is the **sum of the decomposition's component percentiles** (server 2.60 + network 0.90 + device 0.40) against a measured series p95 of 3.68 s, and the day-4 notes state that percentiles do not add and the sum is deliberately conservative. Write it as the decomposition's sum, not as a measured total. `device-checklist.md`'s NFR-P1 row also still runs the 2 Sep and 3 Sep series together («the same inbox») and should be corrected in place.

52. **§verification / §discussion — add the non-working-day finding as the example of what only a
    multi-day run on a real calendar can surface (hardware pass day 4, 2026-09-04; ADR-0019).**
    On the Friday evening the ritual notification promised "6 tasks are waiting — one tap plans
    your day"; the accept produced a plan for Saturday with zero blocks (the profile declares
    working hours for Monday–Friday; every task returned `no_feasible_start`), consumed one of the
    thirty daily plan requests, and left the user with "No plan yet" over "No room today for 15
    tasks" — two untrue messages. Neither the simulator sessions, the 500-plus unit tests nor the
    single-day manual verifications could show it: every fixture plans a weekday and no script
    crosses a week boundary. The thesis should present it as (a) a product defect found by the
    device pass, (b) the decided rule (no plan request, no persisted plan, no daily ritual for a
    day without a working window; truthful copy), and (c) a methodological point — the value of
    the multi-day, real-calendar leg of the verification protocol over simulator smoke checks.

53. **§verification / §discussion / §limitations — the blank-card defect as the example of a client
    defect that corrupts the training signal silently (hardware pass day 5, 2026-09-05; owner
    classification: data integrity, not rendering).** On the Pixel 7a the last Today card rendered as
    an empty panel while its content stayed mounted — the accessibility tree listed title, time and
    status with correct bounds and the buttons still took touches (React Native's `overflow: hidden`
    clip on the Android panel evaluated empty; reproduced 5/5, survives re-layout; fix in the
    post-pass batch). Two taps on blank cards became `task_completed` and `focus_start` facts within
    13 s (`android-20260905-0942/notes.md` item 9). The point for the thesis: the architecture makes
    the client a fact logger whose facts outrank plans (invariant 2) and feed rewards, Beta cells
    and the PAR metric without any server-side plausibility check — so a paint defect is a
    data-quality defect, and no estimator downstream can repair it after the fact. Present it (a)
    as a found-and-fixed defect with the device evidence, (b) as a limitation of fact-logging
    architectures (the rendering path is part of the measurement instrument), and (c) alongside #52
    as the second finding only hardware surfaced — the simulator runs the iOS panel, which has a
    different implementation. Device evidence for (a): build 6 on the Pixel 7a, 0 BLANK in 72 card
    scans over 7- and 13-block lists at default density and 1.3× font scale
    (`android-20260905-1725-build6/notes.md` items 5 and 9).

54. **§5 / §conclusions / abstract / §artefacts — no OSF registration; pre-registration in
    git; the evaluation is a simulation study (owner decision 2026-09-05, ADR-0020).** (a)
    Remove every promise of an OSF registration: the field protocol stays
    "pre-registration-ready" and the assembled registration material is cited as an in-repo
    artifact (`docs/thesis/corrections-rollup.md` + items 8/10/21/35/36), never as a
    submission. (b) §5 gains the simulation study as a study in its own right: its
    hypotheses, expected directions and analysis plan were committed as
    `docs/study/preregistration.md` before the evaluation ran (cite the commit), the run
    happened once at the registered configuration, and the results chapter presents the
    prediction-by-prediction comparison (#55), deviations included. Present this as the
    same protection against fitting hypotheses to results that a registry provides, applied
    inside version control. (c) **Wording rule everywhere** — abstract, §5, conclusions,
    limitations: _"the field study is out of scope; the evaluation was performed in
    simulation"_. Replace every "the study is not executed", "no study was conducted",
    "дослідження не проводилось" with that phrase; keep #49's boundary bullet (what
    simulation cannot establish about people) verbatim. (d) Artefact statement (#36
    amendment): the synthetic dataset + replay harness are public in the repository; the
    restricted-access deposit is a conditional clause for a field study that may never run.

55. **§5 (new subsection "Evaluation in simulation") / §results / §discussion / §limitations —
    the simulation study, reported against its pre-registration (run 2026-09-05 on commit
    `ec1b869`; `docs/study/simulation-results.md`).** Structure the section as the study it is:
    (a) design — three experiments on the committed synthetic world (E1 estimator study, E2
    the File 06 §2.3 simulation-based power, E3 the closed-loop ABAB study on the service's
    own Stage 2–4 code), hypotheses and analysis plan frozen in git before any run (commit
    `11b71a9`, 22:11:53; code `ec1b869`, 22:19:16); (b) results, each pre-registered
    prediction next to its outcome with the verdict — E1 8/9 confirmed, E2 6/7, E3 3 confirmed,
    5 partly, 1 not; (c) the deviations, stated as such. Numbers to carry: the learned arm beats
    the heuristic by **2.5 pp** (ceiling 4.1, efficiency 0.62) in the base world and **5.4 pp**
    (ceiling 7.8, efficiency 0.69) in the amplified one, direction right in 96 % / 100 % of
    replicated studies, detected by a 30-user ABAB study 26 % / 79 % of the time; the
    paired-means floor of File 06's analysis has power **0.84 / 0.82** at N = 30 (ICC 0.10 /
    0.20; N = 28 → 0.78, the analytic 28 is optimistic because the random intercept attenuates
    +8 pp to 6.8–7.2 pp) **under the registered heterogeneity, which is τ ≈ 0.10 — at File 06's
    own pessimistic τ = 0.12 the floor is 0.77 / 0.74 and 0.80 needs N ≈ 34–40 or the §1.6
    GLMM's efficiency (not fitted); quote both**;
    every estimator except replay is unbiased at the designed data rate and the ESS ≥ 100
    gate holds 3× over on plain weeks (ESS ≈ 310 of ≈ 930 slice rows; 80–175 on heavy weeks,
    M9 closed). **The four findings that came out differently — present them, do not
    smooth them:** (1) replay is biased (−0.6 / +0.7 pp, 3–5 MC SE) on policies whose value
    correlates with |A_m(x)| — a consequence of the 2026-08-26 variable slice size (rows with
    small slices are matched more often); IPS/SNIPS/DR are unbiased, so on the slice replay is
    reported beside them, never alone (spec-conflicts M13); (2) morning chronotypes lose
    1–2 pp under the learned arm where the heuristic is already optimal — posterior-sampling
    noise on an untrained bandit (σ² = 0.25) plus one mis-ordered prior cell (File 04 §3.2 puts
    AF above MD for DM/MM; the world has the reverse) — the price of a prior and of exploration,
    paid exactly where the incumbent rule is right; (3) the learning signature (File 06 H4) is
    real under a flat prior (+0.75 / +1.26 pp growth between phase pairs, 2.5–4 MC SE) but a
    single 30-user study sees it positive only 59–63 % of the time and significant 3–10 % — H4
    is underpowered as a within-study test; under the File 04 prior the plateau is reached
    inside phase pair 1 (growth ≈ 0, as predicted); (4) three registered statements were
    mis-specified (a two-sided type-I band against a one-directional rule; per-replicate MAE
    monotonicity and a ±0.03 per-estimate band for mean statements; the E2 slope-SD rationale
    above) and E2's seeding differs from the registered rule — say so and report the
    consistent reading beside them. Limitations to carry verbatim from the results §6: nothing about people; the
    worlds are the P11 generator and its registered amplification; fatigue, busy time,
    deadlines, heterogeneous tasks and the CP-SAT packing are outside E3; the E2 GLMM is not
    fitted (E2 is a lower bound). Cite the run's `run.json` (commit, timings) and the
    one-command reproduction.

    **Amended 2026-09-09:** this entry still opens with «the learned arm beats the heuristic by
    2.5 pp». `simulation-results.md` §6a supersedes those figures and #56 replaces them: they
    are properties of the P11 tanh world, whose intermediate types had no slot pattern and
    therefore nothing to lose. In the thesis the **first** mention of 2.5 / 5.4 pp carries that
    qualifier; the E1 and E2 results stand unqualified.

56. **§5 (new main subsection) / §results / §discussion / §limitations — the sensitivity study
    across simulated worlds as the thesis's main quantitative contribution (owner directive
    2026-09-06; grid frozen `2a48a51`, run on `2ad8a94`; `docs/study/sensitivity-grid.md`,
    `docs/study/sensitivity-results.md`).** Present the world as an object of study: (a) the
    world model verbatim from grid §1 — the logistic completion model, the File 04 §3.2 pattern
    as the population term, individual deviation σ_shape, day shock σ_day, the class mix, the
    baseline, the inbox — with each range's source (the 2025 synchrony-effect systematic
    review, the MEQ worker split 28/52/20, File 06's ICC range, the Pixel 7a inbox sizes) and
    the explicit list of what it cannot represent (people who change, task heterogeneity,
    calendars, fatigue, imperfect attribution); (b) the 75-cell table in full (appendix), 58
    WIN / 17 TIE / 0 LOSS, and the boundary statement of results §1: **the learned policy beats
    the earliest-first heuristic when there is enough individual slot structure to learn
    (σ_shape ≥ 0.3 logits) or a population pattern ≥ 1.5× File 04's; it ties when completion
    barely depends on the slot, when the world is exactly the table's pattern at its assumed
    strength without individual deviation (the 52 % intermediates and the morning types lose
    1–2 pp each to the variance of per-user learning and cancel the evening types' +5 to
    +10 pp), when the day is nearly full or nearly empty, and at a low baseline with a weak
    pattern; it never loses by more than 0.5 pp on average**; (c) the registered
    substantive-failure test firing (TIE in the world the prior was written for) reported as
    the study's central negative result, with the §5.1 decomposition (sampler variance, the
    prior's level bias at p₀ = 0.45, and estimation noise — each with its measured share); (d)
    the prior's value
    (±0.4 pp) and the fact that individual deviation, not the chronotype pattern, drives the
    wins — i.e. the system's value is per-person profile learning; (e) predictions S1–S12
    against outcomes under the frozen criteria as written — 2 confirmed, 5 partly, 5 not — and
    the seven substantive differences (results §4). Replace every
    sentence that quotes E3's 2.5 / 5.4 pp as "the" effect: those were properties of the P11
    world, whose intermediate types had no pattern and nothing to lose.

57. **§5 sample size / §2 assumptions / abstract / conclusions — N recomputed from the
    simulated effect (owner item 1; File 06 §2 amended, spec-conflicts M15).** State that N = 30
    came from an assumed +8 pp effect and no longer stands as a derived number. Report the
    completers needed for 0.80 power **as a range across worlds — 21 to more than 120, above
    120 in 48 of 75 worlds** — never a single figure; name the worlds where N ≤ 60 holds
    (individual deviation ≈ 0.6 logits: 33–52 without day noise, 43–68 at moderate, 50–84 at
    high; a population effect ≥ 1.5–2× the table's on an extreme-heavy sample: 31–43; six tasks a
    day at 2×: 21) and the literature-like adult world where it does not (> 120; a 30-user study
    rejects 5 % of the time). Be explicit that every effect is a property of the world model,
    not a measured fact about people. Then draw the conclusion plainly, with N following its
    inputs: **the designed ABAB study needs N ≈ 35–70 if a pilot shows individual slot-effect
    spread of ≈ 0.6 logits (≈ ±14 pp per daypart), N ≈ 30–45 only if it shows a population
    effect 1.5–2× File 04's on an extreme-heavy sample; otherwise N ≥ 120 (recruit ≥ 170) and it
    is not worth running as designed.** Keep #55's E2 numbers (0.84 / 0.82) only as "what File 06's
    own model gives under its own assumption", and note the 28 → 30 normal-approximation
    correction. Cross-refs: File 06 §2 amendment block; grid §4 S11 (the prediction that
    failed and why).

58. **§1 (актуальність) / §2 (постановка задачі) / анотація / висновки — механізм: не хронотип,
    а індивідуальне відхилення від профілю класу (owner directive 2026-09-06; spec-conflicts
    H6; File 01 §0, File 02 §2 amendment).** Every sentence that sells the system on "energy
    rhythms", "chronotype" or "learns your best hours as a morning/evening type" is replaced.
    Exact wording for the draft (Ukrainian; English gloss follows):
    - **Анотація / §1:** «Система експлуатує не хронотипний ритм як такий, а те, що конкретна
      людина _відхиляється_ від профілю свого хронотипного класу. Навчальник на рівні окремого
      користувача виявляє ці відхилення з поведінки, без того, щоб людина їх описувала; рушій
      правил несе їх лише тоді, коли користувач сам їх задасть (як «карти часу» у SkedPal), — і
      таке порівняння в цій роботі не проводилося: правило, яке навчена політика перемагає або
      з яким грає внічию, — «найраніший вільний слот».»
    - **§2 (постановка задачі), після формулювання RQ1:** «У симуляційному дослідженні на 75
      світах за припущеної у Файлі 04 сили популяційного візерунка або слабшої навчена
      політика вигравала в евристики «найраніший вільний слот» лише там, де люди відхилялися
      від профілю свого класу щонайменше на 0,3 логіта (≈ 1–2 п.п. виконання; при 0,6 логіта —
      4–6 п.п.); популяційний ефект, щонайменше в 1,5 раза сильніший за табличний, також давав
      виграш (1,2–2,8 п.п.) без індивідуальних відхилень. Сам по собі хронотипний візерунок за
      припущеної сили переваги не давав (нічия у світі, який описує приор: +0,4 / −0,1 / 0,0
      п.п. за різного денного шуму), а приор холодного старту був вартий щонайбільше ±0,4 п.п.
      у п'яти світах абляції.»
    - **§4/§5 (де описано онбординг і приори):** «Хронотипне опитування й популяційні приори
      лишаються стартовим наближенням, а не механізмом: у симуляції плоский приор давав той
      самий результат у межах 0,4 п.п. (п'ять світів абляції; крос-користувацьке ALS-оновлення
      в симуляції не брало участі).»
      Gloss: the system exploits that a person deviates from their class profile; the per-user
      learner captures that from behaviour without the user declaring it; a rule engine carries
      it only if hand-authored, a comparison not run — the rule beaten or tied is earliest-first;
      at the table's strength or weaker, wins need individual deviation ≥ 0.3 logits (1–2 pp;
      4–6 pp at 0.6), a ≥ 1.5× population effect also wins (1.2–2.8 pp); the pattern alone gives
      a tie; the prior is worth ±0.4 pp in five ablation worlds. Do not delete the chronotype
      material — reposition it as the bootstrap. RQ1 is reworded per File 01 §0: (a) answered
      against earliest-first within the boundary; (b) not run.

59. **§5 (результати) / §6 (обговорення) / висновки / анотація — головний висновок і
    узгодження з конкурентними твердженнями Файлу 01 (spec-conflicts H7; File 01 §0).** State
    as the headline result, not as a caveat, and drop every "wins categorically" / "the moat
    compounds every week" sentence. Exact wording:
    - **Головний висновок (§5, перший абзац результатів; повторити у висновках):** «Метод
      потребує індивідуальної варіації, щоб бути вартим своєї складності; там, де поведінка
      йде за популяційним візерунком за припущеної у Файлі 04 сили, достатньо правила
      «найраніший вільний слот». У світі, який описує приор холодного старту (візерунок Файлу
      04 §3.2 при припущеній силі, без індивідуальних відхилень; збіг за формою, рівень
      приору на 0,12–0,14 вищий за світ), навчена політика лише грає внічию з евристикою:
      52 % проміжних і 28 % ранкових хронотипів втрачають по 0,8–2,1 п.п. через шум навчання
      на людину, і це гасить виграш вечірніх типів у 5–10 п.п.»
    - **Межа методу (§5, після таблиці сітки):** «Навчена політика виграє в евристики, коли є
      що вчити на рівні людини — індивідуальне відхилення від профілю класу ≥ 0,3 логіта (52 з
      60 таких світів; нічиї — за сильного денного шуму зі слабким візерунком, за 2 або 8
      задач на день і за базового рівня 0,30) — або коли популяційний ефект щонайменше в 1,5
      раза сильніший за припущений у Файлі 04; вона грає внічию, коли поведінка йде за
      популяційним візерунком за припущеної сили або слабше без індивідуальних відхилень;
      вона ніколи не програє більш як на 0,5 п.п. у середньому — але ранкові та проміжні типи
      програють по 0,8–2,1 п.п. там, де фіксоване правило вже майже оптимальне.»
    - **Узгодження з Файлом 01 (§1 або §6):** «Первинне позиціонування («навчання, а не
      правила; перевага зростає з кожним тижнем; навчальна система виграє категорично») у
      симуляції не підтверджується: розрив у персоналізації не накопичується — він зростає
      на 0,3–1,4 п.п. за чотиритижневу половину дослідження за інформативного приору (0,3–1,8
      за плоского приору або сильних індивідуальних відхилень), що замало для виявлення
      дослідженням на 30 осіб; у світі P11 (дослідження E3) він вийшов на плато вже в першій
      парі фаз. Матриця порівняння з конкурентами читається так: система вчить не
      «енергію/хронотип», а відхилення людини від популяційного профілю — з поведінки;
      крос-користувацькі приори збудовано, але виміряний внесок табличного приору ±0,4 п.п., а
      ALS-оновлення в симуляції не перевірялося; рандомізований зріз коштує 0–4 п.п. на рівні
      плеча, а порівняння «розвідка проти чистої експлуатації» не проводилося.»
      Gloss: headline = the method needs individual variation to be worth its complexity; where
      behaviour follows the population pattern at File 04's assumed strength, earliest-first is
      enough; the boundary as located (52 of 60; ties listed); the gap grows 0.3–1.4 pp per
      four-week half, does not compound; the File 01 competitive claims reconciled.

60. **Sweep of specs/01–06 for selling points contradicted by measurement or by what was built
    (owner request 2026-09-06; spec-conflicts M16; amendments in place in Files 01–04, 06).**
    Each item: where the draft is likely to repeat the spec, the evidence, and the wording.
    (a) «план стає вимірно кращим щотижня» (File 01 §1.2) → «розрив зростає на 0,3–1,4 п.п. за
    чотиритижневу половину за інформативного приору — замало для виявлення дослідженням на 30
    осіб» (sensitivity S12 as measured; results §4 item 7). (b) «2–3 продуктивні години на
    день» (File 01 §1.1) → без джерела; вилучити або дати джерело. (c) Hugging Face Spaces
    (File 01 §1.4, File 03) → Oracle A1 Always-Free у ЄС (ADR-0009; H4). (d) on-device / ONNX /
    SASRec-lite (File 01 §1.3–§1.4, File 03) → не реалізовано; перспективи (#9 для SASRec-lite;
    on-device ранжувальник не будувався); приватність тримається на обробці в ЄС, RLS,
    мінімізації та стиранні. (e) «відкритий набір даних із анонімізованих журналів» (File 01
    §2.4) → лише синтетичний набір + скрипт відтворення (#36, ADR-0020). (f) «польове
    дослідження N = 20–40» (File 01 §2.4) → поза межами; оцінювання в симуляції; N₈₀ 21 … понад
    120 (#57). (g) «абляція внеску кожного шару» (File 01 §2.4) → частково: табличний приор
    проти плоского — ±0,4 п.п. у п'яти світах; ALS-шар у симуляції не брав участі й на
    реальних даних не запускався. (h) RQ3 «ціна розвідки для довіри» (File 01 §2.3) → виміряно
    лише вартість рандомізованого зрізу (0,03–17 п.п. на рандомізованих блоках, ≈ 0–4 п.п. на
    плечі) й розкладено внесок дисперсії відбору Томпсона; порівняння «розвідка проти
    експлуатації» не проводилося; довіра в симуляції не вимірюється. (i) NFR-P1 «≤ 2,5 с» (File 02) → ≤ 6,0 с на пристрої; еталон 3,7–4,1 с на Pixel 7a (#51). (j) NFR-Sc1 «10 тис. MAU» →
    ≈ 3 тис. — оцінка аудиту, не виміряно під навантаженням (#3). (k) NFR-P3 → лише базовий
    API; складені функції 477 / 714 / 736 мс p95 (#47). (l) «1 слот/день» (File 04 §1.4) →
    ε = 1 за план з |A_m| ∈ {2, 3, 4}; ≈ 4,3 експерименти на користувача за тиждень —
    пораховано на коді придатності, не спостережено (M9). (m) Драбина деградації 4·10⁴ (File
    04 §1.5) → практичний поріг 3·10³ на машині розгортання (#17/#37); резерв 1/10 → 0/10 на
    15-задачній скриньці. (n) Матриця Файлу 06 §3, D7 «розгорнуте польове оцінювання ✓» → ◐.
    (o) Ризик холодного старту «приори» (File 01 §5) → приори не знижують ризик першого тижня
    вимірно; лишається чесний «режим навчання» і навчання на людину. (p) «усі пари кольорів
    відповідають WCAG 2.2 AA» (File 02 §3) → L39: акцентні кольори як текст і білий на
    основному 2,1–2,98:1; для основного тексту — так. (q) RQ2 (вага сигналів зворотного
    зв'язку; File 01 §2.3) → без реальних даних не відповісти; абляції не проводилися. (r)
    «емпіричне порівняння стратегій атрибуції» (File 01 §2.4 (3)) → не проводилося; правила
    атрибуції реалізовано й протестовано. Not contradicted but bounded: File 04 §3.3 "evidence
    overtakes the prior in 1.5–2 weeks" concerns a cell's evidence outweighing n₀ = 8 at ≈ 4
    outcomes a day — consistent with the simulation; the policy-level gap keeps growing slowly.

61. **§3 (проєктування) — принципи взаємодії та рядок стеку «Анімації та жести» (File 02
    §3.4; spec-conflicts L42, ADR-0021).** The draft states as built: "фізика замість оздоблення
    (пружинні переходи ≤ 250 мс, повага до reduced-motion)" and, in the stack table, "Анімації та
    жести — react-native-reanimated 4 + gesture-handler: ворклети в потоці інтерфейсу: фізика
    перетягу…". The system has exactly one spring transition — the in-app dialog added
    2026-09-06 (200 ms in / 120 ms out, reduced motion → 0 ms on the same path) — and no drag
    physics (M10: drag-to-teach is not built). Change the text: «Принцип "фізика замість
    оздоблення" реалізовано на одній поверхні — діалозі підтвердження (пружина ≤ 250 мс, під
    reduced motion — миттєво тим самим шляхом); решта переходів у застосунку миттєві, що
    зафіксовано як розбіжність зі специфікацією (L42), а не як рішення.» In the stack row keep
    Reanimated 4 (it is wired: babel через `babel-preset-expo`, jest через мок worklets) but
    replace "фізика перетягу" with «пружинні переходи діалогу; перетягування не реалізовано».
    **Amended 2026-09-09 (ADR-0022, spec-conflicts L42 closed):** the principle is now realised
    on the dialog **and on two plan-surface interactions** — the rows settling after
    Done / Skip / I did it and a moved block travelling (or the list scrolling to it with an
    arrival settle), chosen by one test: the motion must say what changed and where it went;
    everything else stays instant by decision. Use instead: «Принцип "фізика замість
    оздоблення" реалізовано на трьох поверхнях — діалозі підтвердження (ADR-0021) та двох
    взаємодіях на стрічці «Сьогодні» (ADR-0022): після «Виконано» / «Пропустити» / «Я зробив»
    рядки нижче з'їжджаються в проміжок (пружина 200 мс), а перенесений блок їде на своє місце
    або список прокручується до нього з «приземленням» картки (250 мс); під reduced motion
    перехід не реєструється тим самим шляхом. Заміри: Pixel 7a 11 / 10 / 14 / 12 кадрів при 60 fps (та прокрутка 17 + приземлення 7 для перенесення за межі екрана), 0 порожніх карток, 60 fps без регресії на 13 блоках; iPhone 12 без пропущених
    кадрів на 16 блоках. Решта переходів (поява плану, повернення в Inbox, шторки) навмисно
    миттєві — рух, що каже лише "щось сталося", є оздобленням; перетягування не реалізовано
    (M10).» In the stack row: «пружинні переходи діалогу та стрічки плану; перетягування не
    реалізовано».

62. **§verification (the hardware pass) / §5 discussion / §6 conclusions — one section for the
    device pass, written as an argument, not a list of incidents (Pixel 7a, 1–5 September 2026,
    builds 1–6; iPhone 12, 7–8 September 2026, builds 1–2; notes under
    `docs/verification/device-pass/`).** Items #50–#53 stay as the per-finding evidence pointers;
    this item supplies the section that carries them. The wording below is draft-ready English; the
    numbers are the notes' numbers, and every paragraph cites the day and item they come from.
    **Where the evidence differs from the owner's spine (2026-09-08), before the text:** (i) the
    "rewards lost after a same-day re-plan" defect was not observed on the phone — it was found by
    the fresh-context review of the fix for the pull-revert defect (iOS day-2 item 64); the phone had
    recorded its mechanism four days earlier (Android day-5 item 14: every row of the superseded
    plan went `expired`, lapsed ones included) and nobody read the reward consequence then — state
    it as a pass product, not a device observation; (ii) "the learned engine never ran on Android at
    all" holds for the first evening and night (all 30 requests) and ends at 11:37 on the second
    day, when the first learned plan on hardware followed the rollout — say "until the second
    morning"; (iii) the spine omits the cold-start re-plan defect (Android day-2 items 15/21: every
    cold start with a persisted plan issued a new request that replaced the day's blocks; the 30
    zero-block rows of day 1 had the same cause and locked the account out of planning for a day)
    — it is the largest data-budget defect of the pass and thesis-critical by UC-03, but it belongs
    to the "never exercised" category below, not to the structural classes; and (iv) two iOS
    MAJORs the spine does not name — the ritual firing twice on one day and the block action row
    unreachable by a screen reader — are the concrete examples for the OS-scheduling and
    screen-reader classes and enter the text through the class table.

    **Text for the draft (§verification, new subsection "What device verification established"):**

    Before the pass, the system carried 583 client tests and 191 edge-function tests, with the
    Python and pgTAP suites beside them, a Release build exercised on the iOS simulator, and a set
    of live smokes that drove the hosted backend from the development machine. All of that
    evidence shares one property: it supplies its own inputs. A fixture chooses the timezone, the
    clock, the calendar day, the network, the lifetime of the process and the way a control is
    touched. A phone supplies those things itself, and it supplies them the way a participant's
    phone would. The hardware pass was therefore not a larger test run. It was the first time the
    system met inputs it had not chosen, and the findings are the inputs it had not anticipated.

    The pass ran on a Pixel 7a (Android 17) for five days, 1–5 September 2026, over six builds, and
    on an iPhone 12 (iOS 26.6) for two days, 7–8 September, over two builds. Six findings carry the
    argument; each is stated with its consequence for the data, because that is where the harm
    lay.

    _The learned engine had never served the phone._ On the first evening all thirty plan
    requests from the device fell back to the heuristic, while the same evening's smoke from the
    development machine reported the learned path healthy, fifteen of fifteen. The phone reports
    its zone as `Europe/Kiev`, the legacy IANA name Android supplies for Ukraine; the development
    machine sends `Europe/Kyiv`; the service's image resolved only the current name, rejected the
    request, and the edge function fell back exactly as designed. In a study, every participant
    on a Ukrainian Android phone would have been served the baseline arm while the logs recorded
    a healthy service; the only visible sign was a fallback banner, which the first reading
    dismissed as one transient failure. Fixed the next morning; the first learned plan on
    hardware followed at 11:37 (Android day 2, item 4; #50).

    _Blank cards with live controls._ On the fifth day the last card of the Today list painted as
    an empty panel while its content stayed mounted: the accessibility tree listed the title, the
    time and the status with correct bounds, and the buttons still took touches. Two taps on blank
    cards became a `task_completed` and a `focus_start` fact within thirteen seconds. Because the
    client is a fact logger whose facts outrank plans, and because the nightly attribution turns
    those facts into rewards with no plausibility check, this is a data-integrity defect in a
    rendering defect's clothes: nothing downstream can tell that the control was never seen. The
    clip came from the Android panel's `overflow: hidden` in the native compositor; the iOS panel
    is a different implementation, which is why the simulator never showed it. Fixed in build 6,
    with 0 blank cards in 72 scans over 7- and 13-block lists (Android day 5, item 9; build-6
    notes items 5 and 9; #53).

    _Three reward defects on iOS, none visible in the logs._ First, the morning after an
    untouched night, the first foreground correctly lapsed the four blocks the user had missed,
    and the same sync's pull reverted them to `shown`: the nightly training had bumped every row's
    version while backfilling propensities, and the server still held the pre-lapse status,
    which it keeps until its own daily job. The next foreground lapsed the same blocks again —
    duplicate facts, skip streaks of three on tasks missed twice, and the third-skip diagnostic
    shown for a phantom (iOS day 2, item 55). Second, a focus session left running across a lock
    was closed by the client's two-hour stale rule with 285 wall-clock minutes of "focus" on a
    thirty-minute block, and the instant attribution paid it as a completion, reward one, while
    the device's own scan had lapsed the block: a guessed reward on an ambiguous session, the
    case invariant 3 exists to exclude (iOS day 2, item 65). Third, a lapse followed by a
    same-day re-plan never became a reward tuple at all, because superseding a plan expired its
    still-open rows and the mapping skips expired rows forever — an upward bias on every re-plan
    day; this one was found by the review of the fix for the first, and its mechanism had been
    recorded on the Android phone four days earlier without anyone reading the consequence (iOS
    day 2, item 64; Android day 5, item 14). All three change the learning signal silently; none
    raises an error; none is reachable by a fixture that supplies its own night.

    _The Friday ritual._ On Friday evening the notification promised "6 tasks are waiting — one
    tap plans your day"; the accept produced a plan for Saturday with zero blocks, because the
    profile declares working hours for weekdays only, consumed one of the thirty daily plan
    requests, and left Today reading "No plan yet" over "No room today for 15 tasks", both untrue.
    Every fixture in the suites plans a weekday and no script crosses a week boundary; the defect
    needed a real Friday. The rule that followed (no request, no row, no ritual for a day without a
    working window) was then verified on a real Saturday: no request reached the server, the
    alarm list held the Sunday review only (Android day 4, item 23; build-6 notes items 1–3; #52).

    _Latency, seen from the phone._ Server-side timing had placed the plan request inside its
    budget; the phone's own timer did not. On the reference device the request measured
    3.7–4.1 s at p95 against a function that measured 1.3 s, because a third of what the user
    waits for happens before the function is called — a pre-plan sync push whenever facts are
    pending, which in real use is the common case. Decomposed, of the 3.9 s p95 sum, 2.6 s is
    server-side work that scales with nothing on the user's side; the phone and the network act
    only on the remaining third. The requirement was therefore re-derived from the decomposition
    for a 2022 low-end phone on a weak link (≤ 6.0 s p95) instead of kept at the pre-deployment
    guess of 2.5 s. The device also supplied the instance class the clean sweep never generated:
    on its own inbox — interchangeable tasks under two deadlines — the solver stalled proving
    optimality at its cap in 12 of 15 requests, and the stopping rule was changed on that
    evidence (Android days 3–4; ADR-0018; #51).

    _Three platform behaviours with no trace off hardware._ The ritual notification on Android
    carried no action buttons: the Android module rejects an empty notification category, the
    app registered the block category first with no actions, the exception was swallowed and the
    ritual's category was never stored — while iOS accepts an empty category, so the simulator
    always showed the buttons. Reminders arrived 26 to 60 minutes late and one was never shown,
    because the exact-alarm permission was neither declared nor granted and Android 13+ denies
    it to a fresh install. And the first open of a day with the radios off read as signed out —
    "Sign in to plan your day" — because the access token had expired while the app was dead
    overnight and the auth client cached the refresh failure; the first online foreground did not
    plan either. None of the three is an error in the app's own logs (Android day 4, items 3–4,
    6, 8).

    _Which classes of defect are structurally invisible without a device, and why._ The findings
    sort into six classes. In each, the input that exposed the defect is one that no fixture,
    simulator or development-machine smoke supplies, because the thing that supplies it is the
    phone's operating system, its hardware, its calendar or its user.

    | Class                                  | Why no suite or simulator supplies it                                                                                                                                                                                                  | What it exposed here                                                                                                                                                                      |
    | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | OS scheduling                          | Alarm exactness, inexact windows, standby buckets, the OS's delivered-notification list and the per-day cap are decided by the OS's power management, not by the app; a simulator has no battery to protect and no lock screen to keep | inexact alarms (+26 min ritual, one nudge never shown); the ritual fired twice on one day because an answered notification leaves the OS's delivered list; the ≤ 5/day cap on a real day  |
    | Real background restriction            | Freezing, jetsam and process revival happen only under a real memory and power budget; a token expires only after real hours with the process dead                                                                                     | offline first open read as signed out; a session closed by the 2 h stale rule and paid as a completion; the lazy lapse scan after a 44-min suspension and after a frozen night            |
    | Screen readers                         | The automated trees (XCUITest, uiautomator) list controls by identifier and say nothing about whether a reader can reach them; only a reader, and a person listening, can                                                              | the block action row unreachable by VoiceOver and TalkBack — a screen-reader user could plan but not start, finish, skip or move a block; the settings gear announced as a link           |
    | Rendering under the real compositor    | The simulator draws with the Mac's GPU and, for the Android surface, does not draw at all; clip paths, live text-size changes and presentation during a dismissal are decided by the platform's own view system                        | blank cards with live controls; a live text-size change re-rendering text without re-laying out; the second erasure dialog dropped by UIKit under Reduce Motion                           |
    | Device-supplied identifiers and inputs | The timezone name, the keyboard, the system language, what "airplane mode" disconnects — the OS supplies them, and the development machine supplies different ones                                                                     | `Europe/Kiev` versus `Europe/Kyiv`; the keyboard covering the onboarding button; autocorrect capitalising a task; airplane mode leaving Wi-Fi on                                          |
    | Multi-day and week-boundary behaviour  | A fixture chooses its day and its clock; only a run that spans real nights meets the day boundary, the nightly server job, the ledger reset and the weekend                                                                            | the Friday ritual planning an unplannable Saturday; the nightly backfill interleaving with the morning's pull; the reminder ledger resetting at midnight; the daily authority at 00:00:03 |

    Not every finding belongs to those classes, and the thesis should say so. The cold-start
    re-plan, the unscrollable Settings screen, the reminders that were never dismissed, the
    200 % gutter wrap and the "default before the first read" flash were all reachable on a
    simulator in principle; nobody had cold-started the app with a persisted plan, scrolled the
    Settings screen on a small display, or watched the shade across an afternoon. The pass found
    them because it ran the whole product for days, on real stakes, with a person looking — not
    because of the silicon. The claim the thesis makes is about the six classes; the count of
    findings is evidence for the practice, not for the claim.

    _What the pass established positively._ The device-conditioned requirements moved from
    "verified on a simulator" to measured: cold start p90 1.07 s on the Pixel 7a right after a
    reboot (0.55 s warm) and 0.50 s on the iPhone 12 (0.95 s after a reboot); a real thumb scroll
    with zero hitches on the iPhone and zero janky frames on the Pixel; exact reminders within
    half a second of their alarm on a plugged and on an unplugged phone; the daily cap holding on
    real days on both platforms, the fifth slot going to the ritual; a ritual delivered to a
    killed app on Android and to a frozen app on a locked iPhone, with the category actions on the
    lock screen; a ritual under Do Not Disturb deferred, not lost; a focus session surviving a
    lock, a kill and a reboot; erasure through the in-app dialogs in 78–180 ms server-side with
    every user table at zero and the pending alarms cancelled; and, after the nightly training
    had touched 79 rows, the 12 exploration-slice rows left with their exact propensities —
    invariant 9 observed on live data.

    _Cost, attendance and yield._ The pass took seven calendar days of session time (five on
    Android, two on iOS), eight Android builds (six in the pass, two for the dialog's hardware check on 6 September) and two iOS builds, and nineteen pull requests (#37–#52, #56–#58), ten of which changed code. The owner's hands were needed for an estimated one and a
    half to two hours on Android and one to one and a half hours on iOS, reconstructed from the
    notes' timestamps: the on-screen keyboard slice on the first evening, two screenshots of the
    notification shade and one tap on the ritual on the second, a screenshot and three decisions
    on the fourth evening, the blank-card report and the afternoon block (move picker, TalkBack,
    erasure) on the fifth; on iOS the developer-profile trust, the calendar consent, a thumb
    scroll, three minutes of VoiceOver, the ritual long-press, the unlocks, Do Not Disturb from
    the lock screen, the rotor listen and the erasure script. The rest was the session's: builds,
    drivers, measurement series, fix batches and reading records after the fact. Per day of
    effort the pass yields fewer serious defects than a code-reading adversarial review — the
    phase reviews found between one and seven MAJOR defects each at under a day of effort; the
    pass found fourteen MAJOR-class defects in seven days, about two a day. But the two sets are
    disjoint: the reviewers had read the notification setup, the pull path and the reward
    mapping and passed them, and none of the fourteen would have been found by another reading,
    because each needed an input the reader had no reason to assume. The honest description of
    where the findings came from is a handful of moments, each the first time a real condition
    occurred: the first plan request answered by the server (day 2, 10:47), the first cold-start
    loop with a persisted plan (day 2, 08:49–08:54 UTC), the first afternoon with reminders in
    the shade (day 2), the first morning after an untouched night (day 4, 08:27–08:53, three
    defects in half an hour), the first tap on a Friday ritual (day 4, 22:13–22:18, three
    defects in five minutes), the first long list scrolled by a person (day 5, 10:09), the first
    accessibility switch flipped while the app ran (iOS day 1, 12:49–13:03), the first
    screen-reader traversal (iOS day 1, 14:44), the first foreground after a night with a server
    job (iOS day 2, 12:22), and the first build installed over a running session (iOS day 2,
    17:39). Ten moments, under three hours of clock time between them, produced the fourteen; the
    remaining days were measurement, fixes, builds and waiting for the calendar. That is the
    shape a device pass should be planned around: not more days, but the first occurrence of
    each real condition, with a person present for the ones a driver cannot make.

    _Sentence for the conclusions:_ "The automated evidence — 583 client tests, 191 edge-function
    tests, the Python and pgTAP suites, simulator sweeps and live smokes — was necessary and was
    blind to six classes of defect, because each depends on an input only a phone's operating
    system, hardware, calendar or user supplies; the seven-day device pass found fourteen
    serious defects in those classes, including four that corrupted the learning signal without
    raising an error, and none of them was reachable by another reading of the code."

    _What remains unverified on hardware, and should be listed as such:_ the magic-link and
    Google-consent rows and the two-device sync (they need the mailbox and the OAuth client in
    production, ⛔ 6); the spent-ritual rule on a day with reminder budget left; a late dialog
    replacement under Reduce Motion; TalkBack's reading of the card's custom actions on Android;
    the double-tap arming test on iOS, which XCUITest cannot deliver inside the 400 ms window
    (Android's measurement and the unit test stand); and the whole of the 2022 low-end Android
    class, for which the NFR-P1 figure is a derivation from the Pixel 7a, not a measurement.
    Cross-refs: #11 (the simulator caveat this section closes), #50–#53, #60 (i), ADR-0018,
    ADR-0019, `docs/verification/device-checklist.md` "Pass status" paragraphs, the explainer's
    defence passage of 2026-09-08.

    **Amended 2026-09-09 — four positive claims in the text above overstate their evidence; each is
    fixed by adding the condition, not by dropping the claim.** (i) «exact reminders within half a
    second» — the measured set is +109, +147, +335, +345, +377, +471 and **+531 ms**; write
    «within 0.11–0.53 s of their alarm, on a plugged and on an unplugged phone». (ii) «erasure
    through the in-app dialogs in 78–180 ms» — the **180 ms** erasure went through the OS alerts
    (build 5); the in-app dialogs measured **78, 113 and 151 ms**. (iii) «a real thumb scroll with
    zero hitches on the iPhone and zero janky frames on the Pixel» — true of a **7-block** iPhone
    list under the owner's thumb and an **8-block** Pixel list; the 13-block Pixel runs show 1
    janky frame each and the 16-block scripted iPhone runs 8 hitches each, so the list length and
    the input (thumb vs scripted drag) travel with the claim. (iv) «cold start p90 1.07 s on the
    Pixel 7a … and 0.50 s on the iPhone 12» compares **different intervals** — Android's
    `am start -W` is process start → first frame, the iPhone's 488/503 ms is initial frame →
    foreground-active and excludes the 413 ms of process creation the same trace reports; the
    defensible cross-platform statement is the post-reboot pair, 0.95 s (iPhone 12) vs 1.07 s
    (Pixel 7a). Also: on 7 September the fifth notification of the day **was the duplicated
    ritual**, so the clean cap demonstration is the Android day of 5 September and the iOS day of
    8 September; the stale-session reward fix is on the branch and **was not re-checked on
    hardware** (and the Android session of 2026-09-02, 164.5 wall-clock minutes, had the same shape
    and its tuple was never checked); and the build and PR counts in «Cost, attendance and yield»
    include the dialog pass (6 Sep), the motion pass (8–9 Sep) and the simulator i18n sweep
    (9 Sep), which lie outside the scope sentence — say which passes they count.

63. **§implementation (the interface language) / §verification (FR-11) / §method (cold start):**
    the draft assumes a Ukrainian-facing product throughout — correction #7 already notes that
    rationales are a `rationale_key` + `rationale_params` pair rendered client-side "instead of a
    server-rendered Ukrainian string". As of 2026-09-09 the app **is** bilingual, with a language
    switch in Settings and Ukrainian as the default on a Ukrainian phone, and the text should say
    so plainly. Three specific edits:

    **Text for the draft (implementation):** "Усі рядки інтерфейсу живуть у двох типізованих
    каталогах — англійському й українському; мова береться з телефона, а явний вибір у
    налаштуваннях її перекриває. Межа локалізації задана свідомо: словник, яким обмінюються клієнт
    і сервер (ключі пояснень, метрики компромісів, назви подій, значення перелічень), лишається
    машинними ідентифікаторами — саме ці ідентифікатори версіонуються, тестуються, відтворюються в
    таблицях роботи й використовуються в offline-оцінюванні."

    **FR-11 — a limitation to retire, not to restate.** Any sentence resting on the hardware-pass
    note "chrono-node is English-only" (device-pass 2026-09-01 item 9, 2026-09-02 item 6) is false
    about the library: `chrono.uk` ships in the pinned 2.10.1 in upstream's full-support tier, and
    quick-add now parses both languages. The residual gap to state honestly instead: «цими
    вихідними» is unknown to the parser and falls back to the plain title, exactly as an
    unrecognised English phrase does. Do not write that «за 30 хвилин» is a gap — an earlier draft
    of this item said so, and it was wrong twice over: chrono does parse it, and our own duration
    grammar was masking it into a 30-minute estimate. That was a defect, found by the adversarial
    pass and fixed. See spec-conflicts L22.

    **Cold start — the one place the thesis must claim less, not more.** The rMEQ's five items stay
    in English in the Ukrainian interface, and the text should say why rather than pass over it:
    the cut-offs 22/18/12/8 were validated for that wording, no validated Ukrainian rMEQ exists,
    and the validated Ukrainian chronotype instruments are the CSM and MCTQ (Senyk, Jankowski &
    Cholii, _Biological Rhythm Research_ 53(6):878–896) — a different item set with its own
    cut-offs (≤ 23 / ≥ 42), which would require its own score→class→prior derivation. The honest
    cost belongs in the same paragraph: a Ukrainian-only speaker will more often skip the survey,
    and skipping is a designed path (INT with prior strength halved, ADR-0005 §2), not a failure.
    Do **not** write that the survey "is localised". ADR-0023 §1.1, spec-conflicts L21.
