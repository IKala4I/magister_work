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

17. **§2 / §3 (solver):** wherever the draft repeats File 04 §1.5's "≈ 1.5·10⁴ literals — small
    for CP-SAT" / "|literals| > 4·10⁴ → 30-min granularity", say instead that the 1.5 s anytime cap is
    _presolve-bound_ on this model: measured 2026-08-26 on an M-series Mac, 15-min week instances at
    8–10·10³ start literals returned UNKNOWN, 30-min instances (3–4·10³) FEASIBLE; the service
    degrades at a measured threshold (8·10³) and on UNKNOWN, with the cap shared across rungs
    (spec-conflicts M8, ADR-0007 §11). Container numbers are pending (device-checklist).
18. **§2 (warm start):** if the draft says the previous plan is injected "as a hint" so that
    blocks only move when worthwhile, add that CP-SAT hints do not preserve ties — the system adds a
    one-unit (1e-4) stability bonus on the hinted start to realize that promise (spec-conflicts M7).
19. **§2 (splittable tasks):** state that a chunk's objective weight is the duration-proportional
    share of the task's weight (spec-conflicts L14) and that chunks number at most four (ADR-0007
    §3); the formal C3 leaves chunk weights implicit.
20. **§3 (service API):** the propensity is logged as the within-slice value p = ε/m = 0.25 and
    the service refuses requests whose ε or m differ from the pre-registered constants (L16) —
    worth one sentence where the OPE substrate is described.
