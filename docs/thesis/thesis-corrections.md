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
   logged-propensity semantics and deceive participants. Same edits go into the OSF
   pre-registration text before freeze.
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
    a **measured practical threshold of 8·10³ literals** in addition to the 4·10⁴ outer bound,
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
20. **§3 (service API):** the propensity is logged as the within-slice value p = ε/m = 0.25 and
    the service refuses requests whose ε or m differ from the pre-registered constants (L16) —
    worth one sentence where the OPE substrate is described.

---

## Appended after P6 (plan E2E), 2026-08-26

21. **§5 (MRT slice / power) — flag for the OSF freeze.** The draft and File 06 §2.3 compute the
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
    client. (spec-conflicts L17; ADR-0008 §4, §7.)
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
    release option chosen at the OSF freeze. **Decided 2026-08-28 — replace the phrase with:**
    "a synthetic event dataset generated from the fitted models, together with the one-command
    replay harness that reproduces every offline-evaluation table from it (public, on OSF); the
    real event log (Parquet) is pseudonymised, not anonymous — 42 participants × 8 weeks of
    timestamped behaviour is re-identifiable by linkage — and is deposited with restricted
    access on EU storage (OSF, Frankfurt region) under a data-use agreement". Also replace "HF
    Hub" for the model registry with "Supabase Storage (EU)" wherever `artifact_uri` is
    described. spec-conflicts H5; ADR-0011 §4, Decision 3.
