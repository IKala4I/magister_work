# Corrections rollup — the paste-ready edit set for `draft.docx`

> **What this file is now.** Not an index of instructions any more: for each of the 63 worklist
> items it carries **the Ukrainian sentences the draft should read**, anchored to the place in the
> draft they replace, tagged by how much of the text moves, with the evidence for every number
> attached. `thesis-corrections.md` stays the chronological worklist and the reasoning; this file
> is what you edit from.
>
> **Rule while editing:** where the draft and the system disagree, the system is right and the
> worklist entry says why (CLAUDE.md working mode). Where a correction weakens a claim the draft
> makes, the weaker claim is the finding — §3 lists the sentences that must survive at full
> strength.
>
> Built 2026-09-09 against `draft.docx` as committed (1 159 paragraphs, 10 Heading-1 sections),
> `docs/study/`, `docs/verification/`, `docs/decisions/`, `docs/thesis/spec-conflicts.md`.

## Legend

| Tag   | Meaning                                                                               |
| ----- | ------------------------------------------------------------------------------------- |
| **Ф** | формулювання — replace a phrase, a table cell or a number. Surrounding text stands.   |
| **П** | пасаж — rewrite a paragraph or a use-case body. The claim changes, the section stays. |
| **С** | структура — the section no longer holds: it is rebuilt, moved, split or deleted.      |

**Terminology, fixed here so the chapters do not drift.** Percentage points are written
**«в. п.»** — the ДСТУ-conformant abbreviation for «відсоткові пункти», and the form the draft
already uses in its four occurrences (§5.5 and табл. 5.3). The repository's own Ukrainian
documents use «п.п.» (`pojasnennia.uk.md` 34 occurrences, `thesis-corrections.md` 17), including
the exact wording of items 58 and 59; read those as «в. п.» when pasting, because «п.п.» is the
standard abbreviation for «пункти» and would be read as such by a reviewer. Other fixed forms:
«навчена політика» (not «навчена модель»), «евристика «найраніший вільний слот»», «індивідуальне
відхилення від профілю класу», «рандомізований зріз», «пропенсіті», «попередня реєстрація» (not
«пре-реєстрація»). The draft's research questions are **ДП1–ДП4**; the repository calls them
RQ1–RQ4 — keep ДП in the text and note the mapping once.

Draft anchors are given as the draft's own numbering (§3.3, табл. 3.2, Додаток Ж). Where a
correction lands in a place the draft does not yet have, the anchor says **[NEW]**.

---

## 1. Chapter map — where the work actually is

| Draft section                         | Verdict       | Items                                      | What changes                                                                                                             |
| ------------------------------------- | ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| АНОТАЦІЯ / ANNOTATION                 | **С** rewrite | 49, 54, 55, 56, 57, 58, 59                 | must state that the evaluation was performed in simulation and what it found; the mechanism claim changes                |
| ВСТУП                                 | **С** rewrite | 3, 36, 48, 49, 54, 57, 58, 59, 60, +U1, U2 | актуальність, наукова новизна (п. 3, п. 4), практичне значення, завдання 6, структура роботи                             |
| Розділ 1 §1.1–§1.3                    | **П**         | 58, 60 (a)(b), +U3                         | the mechanism paragraph and the unsourced «2–3 години»                                                                   |
| Розділ 1 §1.2 + табл. 1.1             | **П**         | 58, 59, 60 (d), +U4, U5                    | the competitive table's learning rows and the "rules do not compound" closing paragraph                                  |
| Розділ 1 §1.4 + табл. 1.2             | **С** rewrite | 49, 60 (n), +U6                            | **the research-gap argument rests on Kairos filling D7; it no longer does** — the gap is re-argued over six dimensions   |
| Розділ 1 §1.5 + табл. 1.3             | **С** rewrite | 26, 27, 42, 60 (c)(d)(o), +U7, U8          | the free-tier and on-device market preconditions are falsified; two risk rows materialised                               |
| Розділ 1 §1.6 (ДП1–ДП4)               | **П**         | 58, 59, 60 (g)(h)(q)(r)                    | each research question gains its answered/partly/not-run status                                                          |
| Розділ 2 §2.1                         | **Ф**         | 4                                          | «кожен фрагмент задачі — не більше одного інтервалу»                                                                     |
| Розділ 2 §2.2                         | **Ф**         | +U9                                        | \|C\| = 14 as built, not «12–18»                                                                                         |
| Розділ 2 §2.3                         | **П**         | 18, 19, 20 (amended), 60 (l)               | the stability bonus; chunk weights; **the propensity is p = ε/\|A_m(x)\|, not a constant 0,25**                          |
| Розділ 2 §2.4                         | **С** rewrite | 17, 26, 37, 51, +U10                       | the size argument was tested and failed — the subsection becomes an empirical result with a mechanism                    |
| Розділ 2 §2.5                         | **П**         | 40, 58, 60 (o), +U11                       | the priors are a bootstrap, not the mechanism; the AF/MD ordering is an unmeasured assumption                            |
| Розділ 2 §2.6.2–§2.6.3                | **П**         | 55 (E1), +U12                              | **unweighted replay is biased when \|A_m(x)\| varies** — the methodology statement changes here, not only in the results |
| Розділ 2 §2.7                         | **Ф**         | 30, 31, 32, 40                             | the concrete attribution rules; the EWMA; store-then-deliver; labels                                                     |
| Розділ 3 §3.1 табл. 3.1/3.2 + NFR-R2  | **Ф**         | 3, 11, 23, 45, 47, 51, 60 (i)(j)(k)        | NFR-P1, NFR-P2, NFR-P3, NFR-Sc1, FR-50 rows                                                                              |
| Розділ 3 §3.2 + рис. 3.1              | **П**         | 26, 27, 33, 60 (c)(d)                      | the figure caption names Hugging Face, HF Hub and a GitHub-Actions cron — all three moved                                |
| Розділ 3 §3.3 табл. 3.3               | **Ф**         | 1, 2, 12, 13, 14, 26, 29, 41, 61           | versions and named mechanisms                                                                                            |
| Розділ 3 §3.4                         | **Ф**         | 5, 6, +U13                                 | the entity list; the `excluded` flag that carries invariant 3                                                            |
| Розділ 3 §3.6                         | **Ф**         | 38, 39                                     | ≤ 5 min is a server-side property; the merge rules                                                                       |
| Розділ 3 §3.7                         | **С** rewrite | 27, 33, 34, 35, 36, 43, 44                 | the transfer analysis is new material; the EU claim becomes true but needs its self-hosting sentence                     |
| Розділ 3 §3.8                         | **П**         | 12, 25, 28, 41, 46, 61                     | typography, timeline, drag, heatmap, contrast, motion                                                                    |
| Розділ 3 §3.9 (UC-03, 05, 07, 09, 10) | **П**         | 24, 28, 38, 43, 45, 52, +U14               | four use cases describe behaviour the system does not have                                                               |
| Розділ 4 §4.1                         | **П**         | 13, 14, 15, 16, 28, 61, 63                 | the drag interaction does not exist; the parser split; the interface is bilingual                                        |
| Розділ 4 §4.2 + лістинг 4.1           | **Ф**         | +U15                                       | **the listing logs the wrong event type and writes a status the client may not own**                                     |
| Розділ 4 §4.4 + лістинг 4.2           | **П**         | 17, 26, 37, +U16                           | hosting; the listing must show the solver parameters that were changed on measurement                                    |
| Розділ 4 §4.5                         | **С** rewrite | 9, 36, 40, +U17                            | **the nightly pipeline is a systemd timer on the EU VM; GitHub Actions runs it on synthetic data only**                  |
| Розділ 4 §4.6                         | **П**         | 1, 48, +U18                                | **the five nightly Maestro paths do not exist as described**                                                             |
| Розділ 4 [NEW] §4.7 / Розділ 6 §6.6   | **С** new     | 11, 50, 51, 52, 53, 62                     | the device pass has no home in the draft at all                                                                          |
| Розділ 5 (whole) ✅ written           | **С** rebuild | 8, 10, 21, 22, 23, 48, 49, 54, 55, 56, 57  | the chapter is a protocol for a study that is out of scope; the executed evaluation is not in it                         |
| Розділ 6 [NEW] ✅ written             | **С** new     | 52, 53, 55, 56, 57, 59, 62, +U19           | results, device verification, discussion, the spec-as-hypothesis section                                                 |
| ВИСНОВКИ                              | **С** rewrite | 48, 49, 54, 56, 57, 58, 59, 62             | п. 1, п. 5, п. 6 and the перспективи list                                                                                |
| СПИСОК ДЖЕРЕЛ                         | **С** rework  | +U20                                       | ≈ 5 sources orphaned, ≈ 11 new ones needed                                                                               |
| Додаток В                             | **Ф**         | 12, 41, 46, +U21                           | Inter static; OKLCH honesty; **the derived `danger-text` token is missing**                                              |
| Додаток Г ✅ written                  | **С**         | 5                                          | rewritten against the deployed schema (D5), not relabelled — `text/dodatok-g.md`                                         |
| Додаток Д                             | **П**         | 63                                         | the placeholder resolves: the instrument stays English, and why                                                          |
| Додаток Е                             | **Ф**         | 51, +U22                                   | the NFR-P1 row; regenerate from `docs/traceability.md`                                                                   |
| Додаток Ж                             | **Ф**         | 7, 20 (amended)                            | the response shape and the propensity value                                                                              |
| Додатки [NEW] З, И                    | **С** new     | 56, 55                                     | the 75-cell table; the frozen pre-registration and grid                                                                  |

**U-items** are findings this pass added that no worklist row covers — §7 below.

### The three chapters that are rebuilt, not edited

1. **Розділ 5** — today it specifies a field study in the future tense and reports a power
   analysis for it. The field study is out of scope and the evaluation that _was_ performed
   (two simulation studies, 75 worlds, a pre-registration frozen in git) has no place in the
   chapter. §6 below gives the new chapter in order.
2. **Розділ 1 §1.4–§1.5** — the научный-gap argument and the market-precondition argument both
   rest on statements that measurement removed: Kairos no longer occupies D7 (no deployed field
   evaluation), the free Docker tier the cost model assumed no longer exists, and the on-device
   ranker was never built.
3. **A new Розділ 6** — results, the device pass, the discussion, and the "specification as
   hypothesis" section. Everything the corrections address to «§6 (обговорення)» (item 59) or to
   «§verification» (items 50–53, 62) currently has no referent in the draft.

**Structure — DECIDED by the owner, 2026-09-09: six chapters.** The evaluation splits into
**Розділ 5 «Методика оцінювання ефективності системи»** and **Розділ 6 «Результати оцінювання та
їх обговорення»**; the device pass is **§6.6** inside Розділ 6, with a two-sentence forward
reference from §4.6, and the specification-as-hypothesis material is **§6.8**. The owner's reason,
recorded because it governs later editing calls: the device-verification material and the
"specification asserted, measurement refuted" story are strong enough to carry their own chapter,
and folding them into the existing five would bury the best part of the work. The rejected
alternative — five chapters with Розділ 5 grown to eleven subsections — would have left the main
quantitative contribution and the device pass as subsections of a chapter titled «методика»,
reading as if neither was executed.

**What the decision drags with it** (mechanical, all of it last-pass work): the ВСТУП's «Структура
та обсяг роботи» sentence («шести розділів»); Додаток Е's chapter column; every cross-reference in
Розділи 1–4 that points at «розділ 5» for results; and §1.6's closing paragraph, which now points
ДП1–ДП4 at Розділ 6 rather than Розділ 5.

---

## 2. Rule 1 — every number traced, with its condition attached

A number without its condition is the failure mode this whole rollup exists to prevent: the draft's
NFR-P2 claim was true of a number and false of the condition attached to it. **The condition travels
with the number into the sentence**, not into a footnote.

### 2.0 How these numbers are checked

Every study-derived number below is **recomputed from `docs/study/results/*.json`** by
`docs/thesis/verify-numbers.py` (132 checks, run from the repository root, exit 1 on any
mismatch). The rule it enforces is the owner's, 2026-09-09: **a number that cannot be reproduced
from the results JSON does not go into the thesis until it can** — and the study documents' prose
summaries are not the source. Three errors have now been found in those summaries, twice inside a
sentence that was itself a correction, and the checker was written after the third.

The constants of Розділ 2–4 are not in the JSON; they are verified against the code that defines
them, and each fragment below names the file. Verified this way on 2026-09-09: ε = 1, m = 4 and
the two-bucket eligibility floor (`params.py:50–55`); the chunk cap of four and the hint's
one-scaled-unit stability bonus, 1e-4 (`params.py:94,108`); the duration EWMA α = 0,3 clipped to
[0,5; 2] and the 28-day Beta half-life (`_shared/params.ts:37,54,58`); the prior strengths
n₀ = 8 in-hours / 4 out (`params.py:58–59`); the UC-07 pair 0,1 / 0,7 (`rewards.ts:356`); the
off-slot same-day reward 0,3 and the seven-day correction window (`_shared/params.ts:48,51`); the
PAR grace of 15 min and the 50 % threshold (`_shared/params.ts:46–47`), whose single-source
property is pinned by `test_par.py::test_source_never_touches_reward_columns`; the 17-feature
snapshot (`_shared/params.ts:34`); |C| = 14 (`contexts.py:5–8`); and the 422 refusal of a drifted
ε or m (`app.py:141`).

### 2.1 The measured numbers the thesis may quote

| Number                                                        | Condition it is only true under                                                                                                                                                                                                                                                                                    | Source                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **план: p50 139 мс / p90 555 мс**                             | server-side `/plan` only, day plan of 12 tasks, OPTIMAL 20/20, **the shipped image `b75d7c11`**, Oracle A1 (2 pinned cores), 2026-08-28. The pre-rollout image measured 135 / 487 мс — the source names the shipped numbers as the ones the thesis reports                                                         | #37; `p5-manual-verification.md` §2.3 (pre-rollout: §2.1)                                           |
| **практичний поріг 3·10³ літералів**                          | on the deployment box; **8·10³** on an M-series Mac; the spec's 4·10⁴ stays only as an outer bound                                                                                                                                                                                                                 | #17, #37; spec-conflicts M8; ADR-0007 §11                                                           |
| **тижневий план: FEASIBLE у ≈ 60 % запусків**                 | 50 tasks × 7 days, best rung, 1,5 s plan-level budget, deployment box; ≈ 40 % return the partial anytime plan                                                                                                                                                                                                      | #37                                                                                                 |
| **інкумбент за 10–11 мс; остання поліпшувальна за p50 54 мс** | the device's own inbox class (interchangeable tasks, two deadlines); the rest of the second is an optimality proof that never closes                                                                                                                                                                               | ADR-0018                                                                                            |
| **втрата від обриву ≤ 0,3 % (макс. 4,41 %)**                  | objective units, shortest no-improvement window; the Thompson spread on the same instance is 5,6–19,2 weight units across seeds                                                                                                                                                                                    | ADR-0018                                                                                            |
| **резерв 1/10 → 0/10**                                        | **15-task inbox, 3 Sep** (the 14-task series of 2 Sep had 1/10 and no "after") — erratum inside #51                                                                                                                                                                                                                | #51 erratum 2026-09-06                                                                              |
| **еталон NFR-P1 3,7–4,1 с p95**                               | Pixel 7a, home Wi-Fi, warm, tap → plan received (timer stops **before** the SQLite mirror), two series of ten (3 and 4 Sep), pooled 4,0 s (n = 20)                                                                                                                                                                 | #51; `android-20260905-0942/notes.md` item 4                                                        |
| **≤ 6,0 с p95 (the requirement)**                             | derived, not measured: 2022 low-end Android over a weak-signal link, from the decomposition                                                                                                                                                                                                                        | #51 owner decision 2026-09-04                                                                       |
| **2,6 с з 3,9 с — серверна частка**                           | function 1,3 + invoke 0,3 + sync-resolve 1,0 at p95; scales with nothing on the user's phone or network                                                                                                                                                                                                            | #51                                                                                                 |
| **функція p50 1,09–1,10 с / p95 1,30–1,34 с**                 | after ADR-0018, the 15-task inbox, 0/10 fallbacks. Before: p50 1,68 / p95 1,84–1,91 с. **These are p50 → p95 pairs, not a p95 range** — no source reports a function p95 of 1,10 с                                                                                                                                 | #51; `android-20260903-1020/notes.md` item 8; `android-20260904-0827/notes.md` item 15              |
| **передплановий push 1,16 / 1,54 с**                          | 17 of 21 requests carried one; 3 Sep series                                                                                                                                                                                                                                                                        | #51                                                                                                 |
| **холодний старт p90 1,07 с (p50 0,89)**                      | **Pixel 7a, build 3, одразу після перезавантаження**, n = 20, `am start -W` TotalTime (старт процесу → перший кадр); warm p90 0,55 с. Build 1 після перезавантаження давав p90 **1,58 с** — зміна між збірками не має приписаної причини                                                                           | #62; `android-20260903-1020/notes.md` item 12; `android-20260901-2030/notes.md`                     |
| **холодний старт 0,49–0,50 с**                                | **iPhone 12**, n = 19 з 20, xctrace — **інший відрізок**: перший кадр → активний на передньому плані, на прогрітих запусках із теплим кешем сторінок. Окремий холодний замір після перезавантаження дає 413 мс створення процесу і перший кадр на 0,95 с — це та величина, яку можна зіставляти з Android          | #62; `ios-20260907-1130/notes.md` item 38 — **U26**                                                 |
| **p90 1075 мс**                                               | **iOS simulator on an Apple-silicon Mac, Release** — satisfies the NFR-P2 threshold and NOT its device condition                                                                                                                                                                                                   | #11 — see §2.3                                                                                      |
| **1825 / 1824 кадри, 1 janky, p99 10 мс**                     | Pixel 7a, the same 13-block plan under a build of main and the motion build                                                                                                                                                                                                                                        | #61; `android-20260908-motion/notes.md`                                                             |
| **11 / 10 / 14 / 12 кадрів** (build `f5fdbe2`)                | Pixel 7a at 60 fps: Done / Skip / «Я зробив» / on-screen move                                                                                                                                                                                                                                                      | #61 (ADR-0022); `android-20260908-motion/notes.md` items 7–10                                       |
| **17 + 7 кадрів; Done 9**                                     | Pixel 7a, **the re-verified build `ac99dea`**: off-screen move = a 17-frame scroll then a 7-frame arrival settle; Done measured 9 frames on that build, not 11 — do not mix the two series                                                                                                                         | #61; `android-20260908-motion/notes.md` item 18                                                     |
| **8 = 8 hitches (847 / 807 кадрів)**                          | iPhone 12, 16-block plan, before/after                                                                                                                                                                                                                                                                             | #61                                                                                                 |
| **0 порожніх карток у 72 сканах**                             | build 6 on the Pixel 7a, 7- and 13-block lists, default density and 1,3× font scale                                                                                                                                                                                                                                | #53                                                                                                 |
| **82–88 мс p95 / 477 мс p95**                                 | PostgREST читання/запис **з Node → eu-west-1** / складений виклик `sync-resolve`; #60 (k) додає 714 і 736 мс для інших складених. **Числа з телефона не існує** — рядок чек-листа відкритий (§11.5)                                                                                                                | #47; `p10-manual-verification.md` §2.3                                                              |
| **стирання 78 / 113 / 151 мс**                                | server-side cascade **через діалоги застосунку** (три виміри: build 8 ×2 на Pixel 7a, build 2 на iPhone 12); кожна таблиця користувача на нулі, заплановані будильники скасовано. Ранній вимір **180 мс** — через системні діалоги (build 5), інша поверхня                                                        | #62 як виправлено в §11.3; `android-20260906-dialog/notes.md`; `ios-20260908-1215/notes.md` item 70 |
| **2,06–3,60:1**                                               | accent colours **used as text** on the light surface (energyHigh 2,06 · success 2,43 · energyLow 2,45 · warning 2,68 · danger 3,60); secondary on the primary container 4,36:1 (large text only, dark). **White on the dark primary was 2,98:1 and was fixed in P10** (6,3:1) — do not quote it as a current value | #46; `p10-a11y-audit.md` §1; spec-conflicts L39                                                     |
| **3,76:1 / 3,60:1 → 6,47:1**                                  | `danger` #EF4444 as a body-size label on the elevated white / light surface → the derived `dangerText` #B91C1C                                                                                                                                                                                                     | spec-conflicts L41; `colors.ts:52` — **U21, no worklist row**                                       |
| **+56 % / +150 %**                                            | **a static measurement of string length** over a 16-label risk set / «Пропустити» against `Skip` (ADR-0023 §1.3) — not a rendering measurement. The simulator sweep confirmed it qualitatively: the block action row wraps at accessibility-XXXL                                                                   | #63; `ADR-0023-localisation-boundary.md`; `i18n-uk-20260909/notes.md`                               |
| **≈ 4,3 / 1,1–2,4 експерименти на користувача за тиждень**    | **computed on the eligibility code, never observed** — plain vs heavy weeks, before INFEASIBLE-after-pin drops                                                                                                                                                                                                     | #21; spec-conflicts M9; ADR-0008 §1                                                                 |
| **ESS ≈ 310 з ≈ 930 рядків зрізу**                            | 30 users × 8 weeks at the computed plain-week rate; heavy weeks 240–520 rows → ESS 80–175 (below the gate at the low end)                                                                                                                                                                                          | #55 E1 §2.3                                                                                         |
| **ESS/n = 0,333 / 0,361**                                     | deterministic target policy / replay, measured over 200 × 1 000 rows                                                                                                                                                                                                                                               | `simulation-results.md` §1                                                                          |
| **replay зміщений на −0,6 / +0,7 в. п.**                      | oracle / anti-oracle policies, 3,2 / 4,6 MC SE; closed form −0,55 / +0,54 (and +0,27 for alpha-first)                                                                                                                                                                                                              | #55; spec-conflicts M13/M14                                                                         |
| **+2,54 ± 0,14 в. п. / +5,37 ± 0,14 в. п.**                   | **E3 only** — the P11 tanh world (base / amplified), whose intermediate types had no slot pattern and nothing to lose                                                                                                                                                                                              | #55 — see §3, this is the number that must stop being "the" effect                                  |
| **потужність 0,836 / 0,817 при N = 30**                       | E2, ICC 0,10 / 0,20, **under the registered τ ≈ 0,107**, paired-means floor, GLMM not fitted                                                                                                                                                                                                                       | #55                                                                                                 |
| **0,768 / 0,735 при N = 30**                                  | the same floor at File 06's own pessimistic τ = 0,12 (slope 0,545 / 0,578) — 0,80 needs N ≈ 34–40                                                                                                                                                                                                                  | #55 §4.2, #57                                                                                       |
| **58 WIN / 17 TIE / 0 LOSS**                                  | 75 worlds × 40 replicated 120-user studies, MC SE ≈ 0,14 в. п.; WIN = > +1 в. п. and positive in ≥ 90 % of replicates                                                                                                                                                                                              | #56                                                                                                 |
| **+0,4 в. п. (σ_day = 0)**                                    | **the world the prior was written for** (File 04 §3.2 pattern at s = 1, σ_shape = 0). This one cell is what the registered substantive-failure test names; the neighbouring day-noise cells (−0,1 at 0,6 and +0,0 at 0,9) corroborate it but are not the test                                                      | #56, #59; `sensitivity-grid.md` §4; `sensitivity-results.md` §3                                     |
| **втрата 0,8–2,1 в. п. (ранкові) / 1,4–1,9 в. п. (проміжні)** | in that same world; decomposed on 40 paired seeds: sampler variance ≈ half of DM's, prior level bias ≈ a quarter of each, the rest is the variance of the per-user estimates                                                                                                                                       | #56; `sensitivity-results.md` §5.1                                                                  |
| **приор вартий ±0,4 в. п.**                                   | five ablation worlds (Block E, flat vs informative); the ALS layer was never in the simulation at all                                                                                                                                                                                                              | #56, #60 (g)                                                                                        |
| **+5,67 в. п. без жодного популяційного візерунка**           | s = 0, σ_shape = 0,6 logits (≈ ±14 в. п. per daypart), no day noise — individual deviation alone                                                                                                                                                                                                                   | #56, #58                                                                                            |
| **N₈₀ = 21 … понад 120; понад 120 у 48 з 75**                 | paired-means floor, medians over 40 replicates rounded up; the GLMM's would be lower but not by the factor of four the centre world needs                                                                                                                                                                          | #57                                                                                                 |
| **вартість зрізу 0,03–17 в. п. / ≈ 0–4 в. п.**                | on randomized rows / at arm level; the draw is identical in both arms, the **cost** is not                                                                                                                                                                                                                         | #56 §4 item 6; #60 (h)                                                                              |
| **14 серйозних дефектів за 7 днів**                           | Pixel 7a (Android 17) 1–5 Sep over six builds + iPhone 12 (iOS 26.6) 7–8 Sep over two; ten first-occurrence moments produced them                                                                                                                                                                                  | #62                                                                                                 |
| **$0 до ≈ 3 тис. MAU; ≤ $25/міс до ≈ 50 тис.**                | **an audit estimate, never load-tested** (#3, #60 (j)); Oracle Always Free 2 OCPU / 12 GB, `eu-marseille-1`                                                                                                                                                                                                        | #26; spec-conflicts M1                                                                              |

### 2.2 Numbers in the draft that cannot be traced — flag, do not restate

| Draft text                                                                                                    | Problem                                                                                                                                                                                                                                           | What to do                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ВСТУП: «втрати двох-трьох продуктивних годин на день»                                                         | no source anywhere in the repo or the specs; #60 (b) already rules it unsourced                                                                                                                                                                   | delete the quantity; the sentence works without it (§3, item 60 b)                                                                                                             |
| §1.2: «19–34 дол./міс.», «≈15 дол./міс.», «понад 30 млн користувачів»                                         | vendor pricing and a user count read in early 2026, never re-verified; nothing in the repo dates them                                                                                                                                             | keep only with «станом на <місяць 2026 р.» and a dated citation, or drop the figures and compare on mechanism                                                                  |
| §5.5: «базовий рівень дотримання p(A) ≈ 0,45 (узгоджено з діапазонами телеметрії застосунків продуктивності)» | an assumption with no citation; the sensitivity grid says so in as many words («itself an assumption; swept»)                                                                                                                                     | say it is an assumption and that it was **swept** (0,30 / 0,45 / 0,60), with the measured consequence (§6)                                                                     |
| §2.2: «\|C\| ≈ 12–18», «50 × 15 = 750»                                                                        | the built value is **\|C\| = 14** (specs/07 §3.2.5's fresh/fatigued split applies only to weekday MO/AF — spec-conflicts M3, which never got a worklist row)                                                                                      | state 14 and keep the order-of-magnitude argument (**U9**)                                                                                                                     |
| §2.3 / Додаток Ж: «p = ε/m», «"propensity": 0.25»                                                             | **the deployed propensity is p = ε/\|A_m(x)\| with \|A_m(x)\| ∈ {2, 3, 4}**, i.e. 0,5 / 0,333… / 0,25 per row; the column is `double precision` for exactly this reason                                                                           | item 20 is amended in §11.1; the appendix shows the true value and the plan telemetry's `top_m`, from whose length \|A_m(x)\| is recovered — there is **no** `a_m_size` column |
| #62 / ВИСНОВКИ: «583 тести клієнта, 191 тест крайових функцій»                                                | **not traceable to any committed gate output** — the pair appears only in `thesis-corrections.md` and the explainer, and it is a snapshot from before 1 Sep; four phases have landed since                                                        | re-count at freeze time from a pasted gate run, and write «станом на <дата>»; otherwise drop the counts and say "the automated suites"                                         |
| §3.9 UC-05: «мінус 18 % оцінки виконання»                                                                     | **producible** — `est_completion_drop` is computed for the shrink option (`planner.py:433`) and rendered by `tradeoff.consequence.est_completion_drop`; but the heuristic engine emits only `pinned_overlap_minutes`/generic (`heuristic.ts:394`) | keep the example, and carry the consequence into §5.1's blinding threat (**U14**)                                                                                              |
| ВСТУП: «п'яти розділів», «66 найменувань», «понад 70 сторінках»                                               | all three change with the restructure and the reference work (§7, U20)                                                                                                                                                                            | last edit before freeze                                                                                                                                                        |

### 2.3 The two collisions to guard against

1. **1075 мс (simulator) vs 1,07 с (Pixel 7a).** Numerically almost identical, epistemically
   opposite. The first satisfies NFR-P2's threshold under a condition the requirement excludes;
   the second satisfies the requirement. Never let them appear as one series, and never write the
   simulator figure without the word «симулятор» in the same sentence (#11).
2. **Three latencies called "the plan time".** The server function (p50 135 / p90 487 ms,
   #37 — a true statement about the service), the post-ADR-0018 function (p95 1,10–1,34 s, #51)
   and the device end-to-end figure (3,7–4,1 s p95, #51). Item 37's «NFR-P1 met with margin» is
   the **service-side** statement and stays true; it must never stand next to the device figure as
   if they measured the same thing.

---

## 3. Rule 2 — the sentences that must survive at full strength

Four claims in the draft are weakened by measurement. Each is written here as the strongest true
sentence, because a hedge would be less defensible than the finding, not more. **If any of these
reads as softened in the final text, the text is wrong.**

**Where each one lands now that Розділ 6 is written:** §3.1 → `text/rozdil-6.md` §6.4.3 (and the
ВИСНОВКИ п. 7 of §10.1); §3.2 → §6.7.2 and табл. 5.1's arm A; §3.3 → §5.1's boundary paragraph and
§6.7.2; §3.4 → §6.7.3 and Розділ 1 §1.2's closing paragraph. This section stays the rule; those are
the canonical instances, and if they ever drift apart, the chapter file is what is wrong.

### 3.1 The learned policy only ties in the world our own prior describes

Not "performs comparably", not "shows no significant difference": the registered
substantive-failure test fired, and the reason is known per class.

> «У світі, який описує приор холодного старту — візерунок Файлу 04 §3.2 за припущеної сили, без
> індивідуальних відхилень, збіг за формою, — навчена політика **лише грає внічию** з евристикою
> «найраніший вільний слот»: **+0,4 в. п.** (MC SE ≈ 0,14 в. п.). Саме ця комірка — за нульового
> денного шуму — є зареєстрованим тестом на змістовну невдачу, і він спрацював; сусідні комірки
> денного шуму 0,6 і 0,9 підтверджують результат (−0,1 і +0,0 в. п.). Це не невизначеність
> вимірювання, а передбачений заздалегідь критерій, який справдився. Причина видима за класами: 52 % проміжних типів втрачають по 1,4–1,9 в. п. і 28 %
> ранкових — по 0,8–2,1 в. п., і це гасить виграш 20 % вечірніх типів у 4,8–10,2 в. п. Розклад втрати
> на сорока парних сидах: дисперсія семплера Томпсона пояснює близько половини втрати виразно
> ранкових типів, чверть — помірно ранкових і шосту частину — проміжних; зміщення рівня приору
> (він на 0,12–0,14 оптимістичніший за світ при p₀ = 0,45) — близько чверті кожної; решта —
> власна дисперсія оцінок на рівні людини (≈ 10 бернуллівських наслідків на комірку проти
> справжніх різниць 0,1–0,4 логіта).»

### 3.2 We beat one rule, and not the competitors

> «Правило, яке навчена політика перемагає або з яким грає внічию, одне — **«найраніший вільний
> слот»** (евристика плеча A: EDF за критичними задачами і списковий планувальник Грема за
> рештою). Порівняння з рушієм правил, у якому користувач сам описує свої вподобання — «карти
> часу» SkedPal, — **не проводилося**; порівняння з Motion і Reclaim.ai не проводилося; таблиця
> 1.1 порівнює декларовані можливості, а не виміряну якість розміщень.»

The draft's табл. 5.1 must lose «сумлінна репліка рушія класу Motion/Reclaim» (item 8 a) and
табл. 1.1 must stop implying a measured comparison (**U4**).

### 3.3 The field study is out of scope, and simulation does not stand in for it

The standing phrase is **«польове дослідження — поза межами роботи; оцінювання виконано в
симуляції»** (ADR-0020 §3). Never «дослідження не проводилося», «не виконано», «no study was
conducted». And the boundary is stated in the same breath as the claim:

> «Симуляція не перевіряє — і тим більше не спростовує — жодного твердження про поведінку людей.
> Імовірність виконання в ній задана генеративною моделлю, а не виміряна. Гіпотези H1–H4
> лишаються **неперевіреними гіпотезами**; ефекти дотримання, навчання під час фази A та користь
> хронотипних приорів **не є результатами**, і жодне речення роботи не подає їх як наслідки
> спостереження за людьми.»

### 3.4 The gap does not compound

> «Первинне позиціонування — «перевага зростає з кожним тижнем», «навчальна система виграє
> категорично» — у симуляції не підтверджується. Розрив у персоналізації **не накопичується**: він
> зростає на 0,3–1,4 в. п. за чотиритижневу половину дослідження за інформативного приору (0,3–1,8
> за плоского приору або сильних індивідуальних відхилень) — замало, щоб дослідження на 30 осіб
> його виявило (значущий у 3–10 % окремих досліджень), а у світі P11 він вийшов на плато вже в
> першій парі фаз.»

### 3.5 Hedges to delete on sight

| If the text says…                                       | Replace with                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| «результати свідчать про тенденцію до переваги»         | the WIN/TIE verdict of the cell, with its number and MC SE                                           |
| «в окремих сценаріях спостерігається незначне зниження» | «ранкові та проміжні типи втрачають по 0,8–2,1 в. п. там, де фіксоване правило вже майже оптимальне» |
| «дослідження заплановано провести»                      | «протокол спроєктовано, інструментовано та перевірено наскрізно; виконання — поза межами роботи»     |
| «система навчається вподобанням користувача»            | «система вловлює відхилення людини від профілю її хронотипного класу з поведінки»                    |
| «підтверджено», where a prediction came out partly      | «підтверджено частково» with the cell that failed named                                              |
| «близько», «приблизно» in front of a measured p95       | the number with its device, build and series size                                                    |

---

## 4. Анотація, ANNOTATION, ВСТУП

### 4.1 АНОТАЦІЯ — **С**, items 49, 54, 55, 56, 57, 58, 59

**Keep** paragraphs 1–2 (the formalisation, the unified bandit-solver method, the OPE
methodology, the implemented system) — they describe what was built and are true. **Insert**
the mechanism sentence into paragraph 1 and **add** a third paragraph before the keywords.

Into paragraph 1, after «…вичерпним (перишабельним) інвентарем часових інтервалів»:

> «Система експлуатує не хронотипний ритм як такий, а те, що конкретна людина _відхиляється_ від
> профілю свого хронотипного класу; модуль навчання на рівні окремого користувача відновлює ці
> відхилення за поведінкою, без того, щоб людина їх описувала.»

New third paragraph (replaces the last sentence of the current paragraph 2, «Розроблено
переддослідницьки зареєстрований протокол польового експерименту…», which moves inside it):

> «Розроблено протокол польового експерименту за схемою ABAB із вкладеним мікрорандомізованим
> випробуванням, узгодженою рандомізацією в обох плечах та обґрунтуванням статистичної
> потужності; протокол спроєктовано, інструментовано й перевірено наскрізно на розгорнутій
> системі, а його виконання лежить поза межами роботи. **Оцінювання виконано в симуляції.**
> Гіпотези, очікувані напрями та план аналізу зафіксовано в системі контролю версій до появи
> коду дослідження й до першого запуску. На 75 явно описаних змодельованих світах (по 40
> повторених досліджень на 120 користувачів) навчена політика перевершує евристику «найраніший
> вільний слот» у 58 світах, грає внічию у 17 і не програє в жодному; водночас у світі, який
> описує сам приор холодного старту, результат — нічия. Головний висновок: метод потребує
> індивідуальної варіації, щоб бути вартим своєї складності. Обсяг вибірки, потрібний
> спроєктованому польовому дослідженню, перераховано за симульованим ефектом і становить від 21
> до понад 120 завершених учасників залежно від світу. Симуляція не перевіряє тверджень про
> поведінку людей: гіпотези H1–H4 лишаються неперевіреними.»

**Ключові слова** — add: «симуляційне оцінювання», «аналіз чутливості», «попередня реєстрація».

### 4.2 ANNOTATION — **С**, same items

Mirror sentence for paragraph 1:

> «The system exploits not the chronotype rhythm as such, but the fact that an individual
> _deviates_ from their class profile; a per-user learner recovers those deviations from
> behaviour without the user having to declare them.»

New third paragraph:

> «An ABAB field-experiment protocol with a nested micro-randomized trial, matched randomization
> in both arms and a power analysis was developed; the protocol is designed, instrumented and
> verified end to end on the deployed system, and running it is out of the scope of this work.
> **The evaluation was performed in simulation.** Hypotheses, expected directions and the
> analysis plan were committed to version control before the study code existed and before any
> run. Across 75 explicitly specified simulated worlds (40 replicated 120-user studies each) the
> learned policy beats the earliest-free-slot heuristic in 58 worlds, ties in 17 and loses in
> none — yet in the world the cold-start prior itself describes it only ties. The headline
> finding is that the method needs individual variation to be worth its complexity. The number of
> completers the designed field study would require was recomputed from the simulated effect and
> ranges from 21 to more than 120 depending on the world. Simulation tests no claim about human
> behaviour: H1–H4 remain untested hypotheses.»

**Keywords** — add: simulation-based evaluation, sensitivity analysis, pre-registration.

### 4.3 ВСТУП — **С**, items 3, 36, 48, 49, 54, 57, 58, 59, 60, U1, U2

**(а) Актуальність, перший абзац — П (item 60 b + U3).** Delete the unsourced quantity and state
the literature at its real strength — which is the argument for learning per person:

> «Керування особистим часом залишається одним із найменш автоматизованих аспектів цифрового
> життя працівника розумової праці. Хронобіологічні дослідження, починаючи з опитувальника
> ранковості–вечірності Горна й Остберга [28] та його скороченої версії rMEQ [11], фіксують
> стійкі індивідуальні відмінності в розподілі когнітивної працездатності протягом доби. Проте
> сила популяційного ефекту синхронності в літературі помірна й неоднорідна: систематичний огляд
> 2025 року (65 досліджень) знаходить ефект синхронності приблизно в 45 % досліджень на
> дорослих, а головний ефект хронотипу — менш ніж у 20 %. Саме ця неоднорідність, а не сила
> популяційного візерунка, є підставою для системи, яка вчиться на рівні окремої людини: якщо
> ефект стабільний і однаковий для класу, його вистачає закодувати правилом; якщо він
> індивідуальний, його треба вивчити з поведінки.»

**(b) Наукова новизна, п. 3 — Ф (item 58, 60 o).** Add the honest scope to the cold-start claim:

> «…забезпечує узгоджений перехід від популяційних приорів до персональних апостеріорних оцінок
> без перезаписування накопичених свідчень; у симуляційному оцінюванні внесок самої популяційної
> таблиці приорів становить ±0,4 в. п., тобто вона є стартовим наближенням, а не механізмом
> переваги.»

**(c) Наукова новизна — new п. 5 (U1, recommended).** The sensitivity study and the
specification-as-hypothesis discipline are contributions and currently appear nowhere in the
novelty list:

> «5. набула подальшого розвитку методика оцінювання рекомендаційних систем планування за
> недоступності польового експерименту: оцінювання виконується на сітці явно специфікованих
> модельних світів із замкненим циклом на робочому коді сервісу, з попередньою реєстрацією
> гіпотез у системі контролю версій та з локалізацією межі застосовності методу замість
> твердження про його безумовну перевагу.»

**(d) Практичне значення — П (items 3, 36, 54).** The dataset sentence is now false as written:

> «Розроблений програмний комплекс Kairos є завершеним прототипом мобільного застосунку
> персонального планування, придатним до дослідної експлуатації; за оцінкою аудиту тарифів (без
> навантажувального випробування) його архітектура функціонує в межах безоплатних тарифів
> приблизно до трьох тисяч активних користувачів на місяць. Схема журналювання подій із
> фіксацією версії моделі та точного пропенсіті кожної рекомендації створює субстрат для
> незміщеного офлайн-оцінювання політик планування. У відкритий доступ передано **синтетичний**
> набір подій, згенерований із підігнаних моделей, разом з однокомандним стендом відтворення,
> який відтворює кожну таблицю офлайн-оцінювання; реальний журнал подій є псевдонімізованим, а не
> анонімним, і його депонування з обмеженим доступом є умовною клаузулою на випадок, якщо польове
> дослідження колись буде проведено.»

**(e) Завдання, п. 6 — Ф (items 49, 54).**

> «6. розроблено методику експериментального оцінювання ефективності системи: протокол польового
> дослідження за схемою ABAB із вкладеним мікрорандомізованим випробуванням (спроєктовано та
> інструментовано; виконання поза межами роботи) і виконане симуляційне оцінювання з попередньою
> реєстрацією гіпотез у системі контролю версій.»

**(f) Структура та обсяг роботи — Ф (U2).** Recount at freeze: number of chapters (six if the
split is taken), the reference count after §7 U20, the page count.

---

## 5. Розділ 1 — АНАЛІЗ ПРЕДМЕТНОЇ ОБЛАСТІ

### §1.1 — **П**, item 58

Replace the closing sentence of the second paragraph («Із цього випливає безпосередній практичний
висновок: два формально еквівалентні розклади… залежно від того, наскільки призначення узгоджені
з індивідуальним профілем енергії користувача»):

> «Із цього випливає практичний висновок: два формально еквівалентні розклади — обидва здійсненні,
> обидва дотримуються дедлайнів — можуть відрізнятися очікуваною часткою фактично виконаних
> блоків. Проте величина цієї різниці визначається не належністю людини до хронотипного класу як
> такою, а тим, наскільки її власний добовий профіль відхиляється від профілю класу: у
> симуляційному оцінюванні (розділ 6) популяційний візерунок за припущеної в літературі сили не
> давав навченій політиці переваги над простим правилом, а виграш з'являвся там, де індивідуальні
> відхилення сягали 0,3 логіта і більше.»

### §1.2 + табл. 1.1 — **П**, items 58, 59, 60 (d), U4, U5

**(a) Table caption and a preceding sentence (U4).** The table compares declared capabilities; the
draft lets it read as a measured comparison:

> «Узагальнене порівняння **декларованих** можливостей наведено в таблиці 1.1. Таблиця зіставляє
> функціональність за відкритими описами продуктів; емпіричного порівняння якості розміщень із
> Motion, Reclaim.ai чи SkedPal у цій роботі не проводилося — правило, з яким навчену політику
> порівняно експериментально, одне: «найраніший вільний слот» (підрозділ 5.2).»

**(b) Two cells (Ф).**

| Рядок                                          | Було                                 | Стало                                                                                                            |
| ---------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Навчання профілю енергії/хронотипу з поведінки | «так (байєсівська погодинна модель)» | «так (байєсівська погодинна модель на рівні людини; виміряний внесок популяційної таблиці приорів — ±0,4 в. п.)» |
| Приватність / он-девайс перспектива            | «так (у плані розвитку)»             | «частково: обробка в ЄС, RLS, мінімізація; он-девайс ранжування не реалізовано»                                  |

**(c) The closing paragraph after the table — П (item 59; this is a §3.4 "do not soften" case).**

> «З таблиці 1.1 випливає, що жодне з наявних рішень не замикає петлю зворотного зв'язку
> «рекомендація → поведінковий результат → оновлення моделі». Замикання цієї петлі є проєктною
> відмінністю системи, але не є автоматичною перевагою: у симуляційному оцінюванні розрив у
> персоналізації **не накопичується** — він зростає на 0,3–1,4 в. п. за чотиритижневу половину
> дослідження за інформативного приору, що замало для виявлення дослідженням на 30 осіб. Незайнятим
> на ринку лишається квадрант «низька ціна — навчання на поведінці — мобільність —
> пояснюваність»; питання про те, чи виправдовує навчання свою складність, є емпіричним, і межу
> відповіді локалізовано в розділі 6.»

### §1.4 + табл. 1.2 — **С** (argument rebuilt, not patched), items 49, 60 (n), U6

**The original argument and why patching it fails.** §1.4 introduces seven dimensions, shows that
each neighbouring field covers some, that no known work covers the whole row, and that Kairos does
— **including D7, розгорнуте польове оцінювання**. The field study is out of scope, so the row is
not complete. The tempting patch — «шість із семи, сьомий спроєктовано» — is both weaker than the
original and duller: it concedes the point without saying anything. What follows rebuilds the
argument instead, and §5's honest-assessment note says plainly what is lost.

**(a) Табл. 1.2, рядок «Kairos (ця робота)» — Ф.** D7: `+` → `◐`, with a footnote to the table:

> «◐ — протокол польового оцінювання спроєктовано, інструментовано та перевірено наскрізно на
> розгорнутій системі; виконання лежить поза межами роботи (підрозділ 5.1). Оцінювання виконано в
> симуляції (розділ 6).»

**(b) The gap paragraph after the table — С, replaced by four paragraphs.** The rebuilt argument
does not claim a completed row. It asks **why** the row is empty, answers with a property of the
problem class, and then shows that this work is the first to put a number on that property.

> «З матриці випливає формулювання наукового розриву: кожен окремий вимір присутній у літературі,
> проте жодна відома праця не поєднує обмеженого рекомендування часових інтервалів (D1+D2),
> керованого онлайн-навчанням на відкладених поведінкових винагородах (D3+D4), у домені
> персонального планування (D5), з методологією оцінювання, стійкою до контрфактичної
> розрідженості (D6). Ці шість вимірів робота закриває, і формалізація розділу 2 робить їхнє
> поєднання принциповим, а не механічним.
>
> Сьомий вимір — розгорнуте польове оцінювання — робота **не закриває**, і це не випадковість
> окремого проєкту, а властивість самого класу задач. Варто подивитися, які напрями в матриці
> мають D7. Його мають ті, чия інтервенція дешева в розгортанні, а результат — майже миттєвий:
> контекстні бандити на новинних стрічках, бандити для моментів надсилання сповіщень, своєчасні
> адаптивні інтервенції. Його не мають ті, хто працює з жорсткими ресурсними обмеженнями
> (дослідження операцій, календарні асистенти) — і саме вони найближчі до цієї роботи за D1+D2.
> Порожній рядок у матриці — не прогалина, яку ніхто не помітив, а наслідок того, що **властивості,
> які роблять рекомендування часових інтервалів складним, є тими самими властивостями, які роблять
> польове оцінювання дорогим**. Винагорода є відкладеним поведінковим результатом, тож одиницею
> спостереження стає тиждень, а не клік. Інтервал вичерпний, а призначення комбінаторно зв'язані,
> тож інтервенцією є цілий розклад, і рандомізувати окремий елемент дешево не вдається — звідси
> потреба вкласти мікрорандомізоване випробування всередину реверсивного дизайну (підрозділ 5.2).
>
> Внеском роботи щодо D7 є не його закриття, а **перетворення його з невизначеної перспективи на
> величину з ціною**. Протокол розроблено, інструментовано й перевірено наскрізно на розгорнутій
> системі: точні пропенсіті кожного рядка, перемикання плечей, блокова рандомізація, показник
> дотримання з фактів, стенд офлайн-оцінювання, перевірений на відомій істині. А симуляційне
> оцінювання (розділ 6) уперше дає відповідь на питання, скільки коштувало б його виконати саме для
> цього класу задач: **від 21 до понад 120 завершених учасників залежно від властивостей популяції,
> причому понад 120 — у 48 із 75 розглянутих світів**, тобто набір щонайменше 172 осіб (120 / 0,7 за припущеного відсіву 30 %) на
> восьмитижневий внутрішньосуб'єктний протокол. Попередня оцінка, з якої виходив протокол (30
> учасників), підтримується рівно однією коміркою сітки з сімдесяти п'яти, і та лежить на
> зареєстрованій верхній межі навантаження. Це число — і є відповідь на питання, чому рядок
> порожній.
>
> Отже, формулювання внеску таке: робота закриває шість вимірів із семи, доводить сьомий до стану,
> у якому його може виконати будь-яка лабораторія з ресурсом на набір, і **вимірює, яким має бути
> цей ресурс**. Останнє є самостійним результатом: попередні праці, що обіцяли польове оцінювання
> планувальника, обсягу вибірки з властивостей задачі не виводили.»

**(c) §1.7 (висновки до розділу 1) — Ф.** The chapter conclusion currently ends on «наявність
наукового розриву». Add one sentence so it matches:

> «Шість із семи вимірів цього розриву закриває ця робота; сьомий — розгорнуте польове оцінювання —
> лишається відкритим, і розділ 6 показує, чому: обсяг вибірки, якого він потребує для цього класу
> задач, перевищує 120 завершених учасників у 48 із 75 розглянутих світів.»

**(d) The honest assessment — for the owner, not for the draft.** The rebuilt argument is **weaker
as a claim and stronger as a defensible one**, and one thing is lost outright:

|                                            | Original                                                             | Rebuilt                                   |
| ------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Claim shape                                | completeness — "no work occupies the full row; this one does"        | six dimensions filled, the seventh costed |
| Survives "did the field study run?"        | **no** — it collapses on the first question                          | yes; the answer is part of the argument   |
| Says anything about _why_ the row is empty | no                                                                   | yes, with a measured number               |
| **Lost with no replacement**               | the sentence «жодна відома праця не займає повний рядок — ця займає» | —                                         |

That last row is the real cost and should not be talked around: the original had a single clean
sentence a reader remembers, and there is no equally clean replacement. What replaces it is longer
and conditional. Against that, the original sentence was **not true**, and a committee's first
question about a matrix with a D7 column is whether D7 was executed.

One further caution against over-reading the rebuild. The argument «the properties that make the
problem hard make evaluation expensive» is supported — the delayed reward sets the observation unit
at weeks, the combinatorial coupling forces the nested MRT, and the sample size follows the
measured effect — but it is an argument about **this** problem class made from **one** system's
simulation. It is not a general law about scheduling research, and the text should not let it read
as one.

### §1.5 + табл. 1.3 — **С**, items 26, 27, 42, 60 (c)(d)(o), U7, U8

**(a) Ринкові передумови — П (U7).** Two of the four preconditions are falsified; the honest
version is stronger, because one of them became a measured finding:

> «По-перше, безоплатні тарифи хмарних платформ на момент проєктування (початок 2026 р.)
> покривали базу даних, інференс і навчання за нульової вартості на ранньому масштабі [60, 30,
> 23]. Ця передумова **не втрималася під час реалізації**: у липні 2026 р. постачальник закрив
> безоплатний тариф, на якому мав працювати сервіс рекомендацій, і систему перенесено на
> контейнер у власному керуванні на віртуальній машині безстрокового безоплатного рівня Oracle
> Cloud у регіоні ЄС (підрозділ 3.3, ADR-0009). Сама подія є результатом роботи: залежність від
> безоплатних тарифів є окремим ризиком дослідницьких систем, і його пом'якшує лише
> інфраструктурно-незалежний контейнер. По-друге, ринок підтвердив готовність платити за
> автоматичне планування, залишивши порожнім квадрант недорогих рішень, що навчаються.
> По-третє, після поширення великих мовних моделей користувачі очікують, що програмне
> забезпечення адаптується до них. Передумову про зрілість он-девайс машинного навчання
> (ONNX Runtime) у роботі **не використано**: он-девайс ранжувальник не реалізовано, і
> приватність забезпечено обробкою в ЄС, RLS, мінімізацією даних та стиранням, а не перенесенням
> моделі на пристрій.»

**(b) «Конкурентна перевага, що накопичується» — П (item 59).** Source (1) is contradicted:

> «Конкурентна перевага має три джерела, з яких лише два підтверджені: (1) асиметрія структури
> витрат — безоплатно-нативна архітектура робить сталим сам безоплатний план; (2) схема даних як
> фора — журналювання правильних подій (рекомендація показана → результат, з контекстом і точним
> пропенсіті) від першого дня створює субстрат, придатний для незміщеного офлайн-оцінювання;
> (3) петля зворотного зв'язку, яка, всупереч первинному припущенню, **не дає накопичувального ефекту,
> який можна виміряти**: приріст персоналізації становить 0,3–1,4 в. п. за чотири тижні за
> інформативного приору (розділ 6), тож перевага навчання є не наслідком часу, а наслідком
> наявності індивідуальної варіації в популяції користувачів.»

**(c) Табл. 1.3 — Ф, два рядки (U8).**

| Ризик                                         | Було                                                                      | Стало                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Холодний старт: модель марна в перший тиждень | «Онбординг… + колаборативні популяційні приори + чесний «режим навчання»» | «Чесний «режим навчання» в інтерфейсі та навчання на рівні людини. Хронотипні приори **не знижують ризик першого тижня вимірно**: їхній внесок у симуляції становить ±0,4 в. п. (підрозділ 6.4)»                                         |
| Ліміти безоплатних тарифів у разі зростання   | «Архітектура з задокументованим шляхом платної міграції…»                 | «Ризик **реалізувався** під час виконання роботи — постачальник скасував безоплатний тариф сервісу (підрозділ 3.3). Пом'якшення: інфраструктурно-незалежний контейнер і постачальник із договірним, а не промоційним безоплатним рівнем» |

**(d) «Північною зіркою… PAR» — Ф (item 42).** Add: «PAR обчислюється зареєстрованим кодом
виключно з фактів (`events` + `recommendations`) і ніколи з таблиці винагород; спільними в них є
рівно дві константи — вікно ±15 хв і поріг 50 %.»

### §1.6 ДП1–ДП4 — **П**, items 58, 59, 60 (g)(h)(q)(r)

Add a closing paragraph that states each question's status — a committee reads §1.6 and ВИСНОВКИ
side by side, and today the draft promises four answers and delivers one and a half:

> «Стан відповідей на дослідницькі питання, отриманий у цій роботі, такий. **ДП1** — відповідь
> отримано частково: навчена політика порівнюється з детермінованим правилом «найраніший вільний
> слот» на сітці змодельованих світів, і межу переваги локалізовано (підрозділ 6.4); порівняння
> з неперсоналізованими популяційними середніми як окремим плечем не проводилося, а виміряний
> внесок популяційної таблиці приорів становить ±0,4 в. п. **ДП2** — відповіді не отримано:
> зважування сигналів зворотного зв'язку потребує реальних поведінкових даних, абляцій стратегій
> атрибуції не проводилося; правила атрибуції реалізовано й покрито тестами. **ДП3** — відповідь
> отримано частково: виміряно ціну рандомізованого зрізу (0,03–17 в. п. на рандомізованих блоках,
> ≈ 0–4 в. п. на рівні плеча) і розкладено внесок дисперсії семплінгу Томпсона; порівняння
> «дослідження проти чистої експлуатації» не проводилося, а довіра користувача в симуляції не
> вимірюється. **ДП4** — відповідь отримано: сімейство оцінювачів відновлює істинну цінність
> політики на відомій істині, а незважений replay виявився зміщеним за змінного розміру
> рандомізованого зрізу і замінений зваженим (підрозділ 6.1).»

---

## 6. Розділ 2 — МАТЕМАТИЧНА ФОРМАЛІЗАЦІЯ

### §2.1 — **Ф**, item 4 (spec-conflicts M6)

«…у якому кожна задача отримує не більше одного інтервалу» → **«…у якому кожен фрагмент задачі
отримує не більше одного інтервалу, а кожен інтервал — не більше одного фрагмента (для
неподільних задач фрагмент збігається із задачею)»**. Without this the formal statement forbids
constraint (C3) two pages later.

### §2.2 — **Ф**, U9 (spec-conflicts M3 — no worklist row exists)

«…|C| ≈ 12–18… ≈ 50 × 15 = 750 скалярних добутків» →

> «…де C — множина контекстних бакетів (частина доби × тип дня × клас відносної позиції). У
> реалізації |C| = 14: поділ «свіжий / втомлений» застосовується лише до MO та AF у робочі дні, інакше
> повний тривимірний добуток дав би 24 бакети. Бандит опитується один раз для кожної пари (τ, c):
> щонайбільше |T|·|C| ≈ 50 × 14 = 700 скалярних добутків незалежно від довжини горизонту.»

### §2.3 — **П**, items 18, 19, **20 (amended)**, 60 (l)

**(a) Warm start — Ф (item 18).** After the AddHint sentence in §2.4 or here, wherever the hint is
first promised to prevent thrashing:

> «Підказка CP-SAT лише засіває пошук і не зберігає порядок за однакової цільової функції
> (перевірено з 1, 2 та 8 робітниками), тому обіцянку «розміщення змінюються лише тоді, коли
> цільова функція це виправдовує» реалізовано явно: підказаний старт отримує одну масштабовану
> одиницю цілі (1·10⁻⁴ у вагових одиницях — нижче за будь-яку змістовну різницю оцінок).»

**(b) Chunk weights — Ф (item 19).** After (2.6):

> «Вага фрагмента є пропорційною до тривалості часткою ваги задачі, w(τ,k)·d(τ⁽ʲ⁾)/d(τ), тож
> повністю розміщена подільна задача отримує рівно стільки, скільки отримала б нерозділена в тих
> самих контекстах; кількість фрагментів обмежено чотирма.»

**(c) The exploration paragraph — П (item 20 amended + 60 l).** The draft's «p = ε/m» with a fixed
m = 4 is the **pre-P6 rule**; item 20 in the worklist still carries the constant 0,25 and is
amended here (§9, C1). Replacement:

> «Незалежно від цього, для забезпечення оцінюваності (підрозділ 2.6) застосовується бюджетоване
> явне дослідження: з імовірністю ε на план (за замовчуванням ε = 1, тобто один блок на день)
> одна некритична задача обирається рівномірно серед придатних, і її розміщення розігрується
> рівномірно з множини A_m(x) — її top-m кандидатних бакетів (m = 4), з яких на момент розіграшу
> лишилися досяжними та вільними. Задача вважається придатною, якщо |A_m(x)| ≥ 2. Пропенсіті
> такого розміщення відоме точно й дорівнює **p = ε/|A_m(x)|**, тобто набуває значень 0,5, 1/3
> або 0,25 залежно від рядка; воно зберігається в рядку рекомендації, а сама множина A_m(x) — у
> телеметрії плану (`telemetry.ef.experiment.top_m`), тож |A_m(x)| і p відновлювані точно й
> символьно. Поле пропенсіті має тип подвійної точності: у float4 значення
> 1/3 зберігається як 0,33333334, і ця відносна похибка ≈ 3·10⁻⁸ увійшла б у кожну вагу 1/p,
> суперечачи слову «точне». Сервіс відхиляє запит, у якому ε або m відрізняються від
> зареєстрованих констант (код 422), бо тотожність ε і m в обох плечах — умова засліплення
> (підрозділ 5.2). Блок відображається в інтерфейсі як «експеримент» (вимога FR-22).»

> **Джерельна правка (2026-09-09):** і цей запис, і коментар у міграції
> `20260827130000_p6_propensity_double.sql` називали похибку 6·10⁻⁸; правильне значення —
> ≈ 3·10⁻⁸ (float32(1/3) = 0,3333333432674408). Виправлено в `spec-conflicts.md` L22; коментар
> у вже застосованій міграції залишено без змін навмисно — його правка нічого не змінює в SQL і
> не варта дотику до застосованого файлу.

> **Consequence to carry to §2.6.2 and Додаток Ж:** because |A_m(x)| varies, the strict rule
> «≥ m досяжних бакетів» would make every task ≥ 60 хв ineligible on a plain 09–18 weekday.
> Measured on the eligibility code: P(a plan has an eligible task) rises from 0,57 to 0,86 at
> three tasks a day and from 0,00 to 0,22–0,48 on a four-meeting day — «≈ 4,3 експерименти на
> користувача за тиждень на звичайних тижнях і 1,1–2,4 на завантажених, **пораховані на коді
> придатності, а не спостережені**».

### §2.4 — **С**, items 17, 26, 37, 51, U10

The subsection currently states a size argument («≈ 1,5·10⁴ літералів, що для CP-SAT є малою
задачею») and a degradation trigger («за перевищення 4·10⁴ літералів») as design facts. Both were
tested and both failed. Rewrite the second half of the subsection as an empirical result — this
is one of the stronger passages available to the thesis, because it is a measured mechanism.

> «Оцінка розміру моделі — у найгіршому разі Σ|F(τ)| ≤ 50 × 300 ≈ 1,5·10⁴ літералів — була
> **припущенням про те, де зв'язує ліміт 1,5 с, і вимірювання його спростувало**. На моделі
> підрозділу 2.3 тижневі екземпляри моделі з гранулярністю 15 хв і 8–10·10³ літералами старту повертали
> UNKNOWN у межах ліміту, **жодного разу не розпочавши пошуку**: час поглинало передрозв'язувальне
> зондування (probing) над ≈ 11 тис. літералів значень кодування старту, тоді як 30-хвилинні
> задачі (3–4·10³ літерали) повертали FEASIBLE. Механізм: складність зондування надлінійно
> залежить від кількості булевих літералів кодування `AddElement`, тому практичний поріг лежить
> на порядок нижче за специфікований 4·10⁴. Наслідки, реалізовані в системі: зондування та
> симетрійний передрозв'язок вимкнено; каскад деградації додатково спрацьовує за **виміряним
> практичним порогом — 3·10³ літералів на машині розгортання** (8·10³ на машині розробника класу
> M-series) і за наслідком UNKNOWN; специфікований поріг 4·10⁴ лишається зовнішньою межею; ліміт
> 1,5 с є **бюджетом рівня плану**, спільним для щаблів каскаду.
>
> Друге вимірювання стосується того, на що витрачається цей бюджет. На класі задач, який дав сам
> пристрій — взаємозамінні задачі під двома дедлайнами, — розв'язувач у 12 із 15 запитів
> доходив до ліміту, і телеметрія показала чому: перше допустиме розв'язання з'являлося за
> 10–11 мс, останнє поліпшувальне — за 54 мс (p50), а решту секунди займало **доведення
> оптимальності, яке не завершується**: відносний розрив меж лишався 0,38–1,21. Тому до ліміту
> часу додано критерій зупинки за відносним розривом 0,01 та зупинку за відсутності поліпшення
> протягом 0,3 с. Втрата від обриву становить ≤ 0,3 % значення цільової функції (максимум 4,41 %
> за найкоротшого вікна) — на порядок менше за розкид самого семплінгу Томпсона на тій самій
> задачі (5,6–19,2 вагових одиниці між сидами): план є реалізацією з апостеріорного розподілу в
> будь-якому разі. Після розгортання зміни медіана часу розв'язання знизилася з 1003 до 400 мс, а
> частка евристичних резервів — з 1/10 до 0/10 на пристрої та з 1/36 до 0/36 у наскрізному
> прогоні.
>
> Виміряні характеристики на машині розгортання (Oracle A1, два закріплені ядра): денний план на
> 12 задач — OPTIMAL у 20 запусках з 20, наскрізно p50 135 мс / p90 487 мс. Для стрес-задачі на
> 50 задач і 7 днів бюджет 1,5 с дає допустимий план приблизно в 60 % запусків навіть на
> найкращому щаблі каскаду; продуктовим горизонтом є день, а тижневий план (FR-20) потребує
> окремого рішення щодо бюджету.»

**U10 — the sentence to delete:** «…що забезпечує вимогу NFR-P1 на двох віртуальних ядрах
безоплатного тарифу». NFR-P1 is now a device requirement (§7, item 51); the true statement is the
server-side one above, and the box is an Oracle A1, not a free Hugging Face tier.

### §2.5 — **П**, items 40, 58, 60 (o), U11

**(a) §2.5.2, after табл. 2.4 — Ф (U11).** The one prior cell the evidence disputes must be named
where the table is introduced, not only in the results:

> «Напрям та впорядкування значень відповідають літературі про ефект синхронності [41, 55];
> абсолютні значення є початковим наближенням нульового дня. Одне впорядкування таблиці є
> **неперевіреним припущенням**: для ранкових типів вона ставить AF вище за MD (DM 0,55 проти
> 0,50; MM 0,58 проти 0,52), тоді як генеративна модель, використана в замкненому симуляційному
> дослідженні, має зворотний порядок. Саме ця клітинка пояснює частину втрати ранкових типів у
> підрозділі 6.3 і зафіксована як припущення, а не як факт.»

**(b) §2.5.3–§2.5.4 — Ф (items 40, 60 g, 60 o).** Add after the fold-in and the empirical-Bayes
paragraphs:

> «Внесок обох механізмів у роботі виміряний лише частково: у симуляційному оцінюванні популяційна
> таблиця приорів проти плоского приору дає ±0,4 в. п. у п'яти світах абляції, а колаборативний
> шар (ALS + кластери) у симуляції участі не брав і на реальних даних не запускався. Хронотипне
> опитування й популяційні приори лишаються стартовим наближенням, а не механізмом переваги.»

**(c) §2.5.2 — Ф (item 40, labels).** Where the draft says corrections are applied as high-weight
labels (§2.7 / UC-08), define the weight:

> «Міткою тижневого огляду вважається одне «приорове» значення псевдоспостережень на названій
> Beta-комірці (вага α₀ + β₀), «підтверджую» → успіхи, «спростовую» → невдачі, із тим самим
> 28-денним напіврозпадом, що й свідчення; у силі лишається лише остання мітка комірки, а кожна
> доставка мітки запускає повну перебудову стану зі збережених кортежів винагород і міток. Мітки
> впливають **лише на енергетичну модель**: стан лінійного бандита (A, b) мітки не бачить, бо в
> мітки немає вектора ознак.»

### §2.6.2 — **П**, item 55 (E1), U12 — _the methodology claim changes here, not only in §6_

The draft argues replay is unbiased on the slice because the choice within top-m is uniform. With
a variable |A_m(x)| that argument holds **per context** and not in aggregate. This must be fixed
where the estimator is introduced:

> «Replay-оцінювач є незміщеним тоді й лише тоді, коли політика логування обирає дії рівномірно
> випадково над множиною кандидатів, а винагороди не залежать від логера. На рандомізованому
> зрізі вибір рівномірний **у межах A_m(x)**, і аргумент незміщеності [38] застосовний
> **окремо для кожного контексту**. Проте розмір зрізу не сталий: |A_m(x)| ∈ {2, 3, 4}, а рядок потрапляє в
> збіг з імовірністю 1/|A_m(x)|, тож рядки з малим зрізом збігаються вдвічі частіше за рядки з
> великим, і незважений replay оцінює цінність на розподілі контекстів, переваженому вагами
> 1/|A_m(x)|. Для політики, цінність якої корелює з розміром зрізу, це дає систематичне
> зміщення: виміряно −0,6 в. п. на оракульній політиці та +0,7 в. п. на антиоракульній (3,2 та 4,6
> стандартні похибки Монте-Карло на 200 повтореннях по 1 000 рядків), що збігається із замкненою
> формою (−0,55 та +0,54 в. п.). Оцінювачі IPS, SNIPS і DR зважують кожен збіг на |A_m(x)| і
> лишаються незміщеними. Нормативне рішення роботи: на зрізі replay подається **лише поряд** зі
> SNIPS та DR, або його збіги зважуються на |A_m(x)| — що тотожно IPS. Зміщення є прямим
> наслідком проєктного рішення пом'якшити правило придатності заради обсягу даних: сувора вимога
> |A_m| = 4 дала б ≈ 615 рядків із незміщеним replay (ESS ≈ 154) проти ≈ 930 рядків із IPS
> (ESS ≈ 310); ціну сплачено лише незваженим оцінювачем, і її повернено зважуванням.»

Source for the 615 / 154 arithmetic: spec-conflicts M14 — 930 × 0,57/0,86 ≈ 616 rows under the
strict rule, and with a fixed |A_m| = 4 replay keeps one row in four, 615/4 ≈ 154. Cite it: this
file's own Rule 1 applies to its own numbers.

### §2.6.3 — **Ф**, item 55

Add one sentence to the ESS paragraph: «Оцінки з ESS < 100 позначаються як недоказові, але
**ніколи не вилучаються з подання**: приховування слабкої оцінки є тим самим ступенем свободи
дослідника, проти якого спрямована попередня реєстрація.»

### §2.7 — **Ф**, items 30, 31, 32, 40

Replace the sentence «Базові правила: виконаний за розкладом блок отримує r = 1…» with the rules
as built:

> «Базові правила атрибуції такі. Сесії, що почалися в межах ±15 хв від початку інтервалу,
> належать блоку: r = 1, якщо сумарний сфокусований час у вікні становить ≥ 50 % запланованого,
> інакше r дорівнює цій частці. Виконання без фокус-сесії зараховується як внутрішньовіконне, якщо
> момент виконання лежить у межах [початок − 15 хв, кінець + 15 хв]. Виконання того самого дня
> поза вікном отримує r = 0,3, і лише під час авторитетної нічної атрибуції. Пропуск дає r = 0
> негайно й переводить рядок у стан `rejected` (окремого стану `skipped` у схемі немає; типи
> подій `block_skipped` і `lapse_observed` лишаються різними, щоб зареєстрований код PAR ніколи
> не сплутав власне спостереження клієнта з фактом). Пізніше «насправді я це зробив» протягом
> 7 днів переписує збережений пропуск на r = 1 і запускає повну перебудову стану, зберігаючи
> початковий момент атрибуції для загасання. Межу 23:55 місцевого часу обчислює SQL у часовому
> поясі користувача, і її перевірено на переходах літнього часу. Кортежі винагород **спершу
> зберігаються, а потім доставляються** сервісу з маркером підтвердження: недоступність сервісу
> затримує навчання, але нічого не втрачає (повторна доставка ідемпотентна). Оцінювач тривалості
> (UC-06 A2) — EWMA з α = 0,3 за співвідношенням сфокусованих і оцінених хвилин на завершених
> сесіях — обчислюється в крайовій функції та застосовується до оцінки задачі **для обох рушіїв**
> після трьох сесій, з обмеженням множника до [0,5; 2]; частиною стану бандита він не є.»

---

## 7. Розділ 3 — ПРОЄКТУВАННЯ

### §3.1.3 табл. 3.2 — **Ф**, items 3, 11, 45, 47, 51, 60 (i)(j)(k)

Four requirement rows are wrong as stated. Replacement cell text:

| ID          | Нова редакція вимоги                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-P1**  | «Запит плану завершується на пристрої (дотик → план отримано) за ≤ 6,0 с (95-й перцентиль, прогріто) на Android нижнього цінового сегмента 2022 р. за слабкого зв'язку; серверна функція `plan-request` — ≤ 1,5 с (95-й перцентиль); евристичний резерв обмежує очікування сервера 1,9 с»                                 |
| **NFR-P2**  | «Холодний старт застосунку ≤ 2 с (90-й перцентиль) на середньому пристрої 2022 р.; прокручування стрічки плану без пропущених кадрів на списках робочого розміру» — **і в тексті поруч: інтервал вимірювання визначено окремо для кожної платформи (підрозділ 6.6), бо `am start -W` і xctrace вимірюють різні відрізки** |
| **NFR-P3**  | «Базові операції читання/запису API ≤ 300 мс (95-й перцентиль), без урахування ML-ендпоїнта планування **та складених функцій**, які вимірюються й звітуються окремо»                                                                                                                                                     |
| **NFR-Sc1** | «Обслуговування до ≈ 3 тис. MAU в межах безоплатних тарифів (оцінка аудиту тарифів, без навантажувального випробування); задокументований шлях міграції до ≈ 25 дол./міс на 50 тис. MAU»                                                                                                                                  |

FR-50 in табл. 3.1: «з розумним випередженням» → «зі статичним випередженням 10 хв (навчене
випередження — вимога FR-51, поза обсягом v1)».

### §3.1.3 NFR-R2 та §4.3 — **Ф**, item 23

The fallback label is tied to the **reason**, not to the engine — otherwise it unblinds arm A:

> «За холодного або недоступного сервісу рекомендацій план синтезує детермінований евристичний
> планувальник крайової функції. Маркування «резервний план» прив'язане до **причини** (тайм-аут
> або недосяжність сервісу), а не до тегу рушія: плани плеча A в дослідженні також мають
> `engine = heuristic`, і маркування за рушієм зруйнувало б засліплення. Дні, у які стався збій
> сервісу, виключаються з аналізу. Бюджет резерву становить 1,9 с і відкалібрований для денного
> горизонту; тижневий план клієнт v1 не запитує.»

Note for §5.2/§5.6: «дні з відмовою сервісу виключаються з аналізу» is a registered exclusion and
belongs in the exclusions list beside «учасники з менш ніж 10 показаними блоками у фазі».

### §3.2 + рис. 3.1 — **П**, items 26, 27, 33, 60 (c)(d)

The figure caption is a specification for a drawing that has not been made, and three of its
components moved. Replacement caption text:

> «[РИСУНОК 3.1] Блок-схема чотирьох рівнів: (1) мобільний клієнт React Native + Expo (TypeScript
> strict; екрани Today/Inbox/Focus/Insights; Expo SQLite + Drizzle як офлайн-джерело істини та
> outbox операцій; власний хук живих запитів; chrono-node) — з'єднання HTTPS через
> @supabase/supabase-js; (2) Supabase у регіоні ЄС (eu-west-1): Postgres із RLS, Auth (JWT, OAuth,
> анонімні сесії), Edge Functions (Deno/TS), pg_cron; (3) сервіс RecSys: FastAPI (Python 3.12) у
> контейнері на віртуальній машині Oracle Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ) у
> регіоні ЄС France South (eu-marseille-1), за Caddy з автоматичним TLS; ендпоїнти /plan,
> /feedback, /insights, /parse-preview; (4) конвеєр навчання: нічний системний таймер на тій самій
> віртуальній машині — псевдонімізований експорт → перенавчання → оцінювальний бар'єр → реєстр
> моделей у Supabase Storage (ЄС). Стрілки: клієнт ↔ Supabase; Edge Function plan-request →
> FastAPI /plan; конвеєр навчання → Supabase Storage → model_registry. Розгортання сервісу —
> «підтягуванням» з реєстру контейнерів GitHub, без вхідного SSH із CI.»

### §3.3 табл. 3.3 — **Ф**, items 1, 2, 12, 13, 14, 26, 29, 41, 61

| Рядок                 | Стало                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Локальна БД + ORM     | «Expo SQLite + Drizzle ORM (власний хук живих запитів `useLiveRows`)» + обґрунтування: «живі запити роблять SQLite єдиним реактивним джерелом істини; власний хук замість `useLiveQuery` через відкриту ваду drizzle-orm #2620 — відсутність оновлення, коли запит не повертає рядків, тобто саме перехід «порожній Inbox → перша задача»» |
| Анімації та жести     | «react-native-reanimated 4 + gesture-handler: пружинні переходи діалогу та стрічки плану; перетягування не реалізовано»                                                                                                                                                                                                                    |
| Малювання             | «@shopify/react-native-skia — кільце фокус-таймера. **Теплокарту енергії (FR-40) намальовано нативними View з інтерполяцією в OKLCH**, бо канвас є одним непрозорим елементом для читача екрана і не масштабує підписи зі шрифтом (NFR-A1/A2)»                                                                                             |
| Природномовний розбір | «chrono-node — **розбір дат**; тривалості розбирає власна граматика, яка виконується першою та маскує свої фрагменти в тексті, що бачить chrono»                                                                                                                                                                                           |
| Он-девайс ML (план)   | **видалити рядок** — он-девайс ранжувальник не реалізовано (перспективи, підрозділ «Висновки»)                                                                                                                                                                                                                                             |

The prose paragraph after the table: «сервіс рекомендацій — FastAPI на Python 3.12 [21] на
безоплатному CPU-тарифі Hugging Face Spaces з реєстром моделей на HF Hub [30]» →

> «сервіс рекомендацій — FastAPI на Python 3.12 [21] у контейнері на віртуальній машині Oracle
> Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ, регіон eu-marseille-1) з реєстром моделей у
> Supabase Storage (ЄС); розв'язувач OR-Tools CP-SAT [25]; матрична факторизація — implicit [31];
> онлайн-оновлення вагових коефіцієнтів змішування — власний крок проєктованого стохастичного
> градієнта (River використовується як тестовий оракул); аналітика та моніторинг — PostHog [45] і
> Sentry [57] у регіоні ЄС; автоматизація — GitHub Actions [23]. Послідовнісна модель SASRec-lite,
> он-девайс ONNX-ранжувальник і текстові вкладення MiniLM у v1 **не реалізовані** і віднесені до
> перспектив. Версії інструментів фіксуються на момент реалізації (jest 29.7, ESLint 10,
> TypeScript 5.9.3 — останнє через діапазон сумісності openapi-typescript).»

**Add a paragraph on the cost of the free tier (U7, ADR-0009/ADR-0015).** This is a measured
operational finding and it makes the «$0» claim honest:

> «Безоплатний рівень не є безкоштовним у сенсі експлуатації. Постачальник повертає собі
> простоюючий екземпляр «Always Free», коли за сім днів усі три показники — процесор, мережа й
> пам'ять — лишаються нижче порогів, тому на машині працює **щогодинний синтетичний навантажувач**
> (`bench_solve.py`, 100 запусків, ≈ 3 хв процесорного часу), який утримує 95-й перцентиль
> завантаження процесора за сім днів не нижче 20 %. Нічний конвеєр навчання цю роль виконати не
> може: одного запуску на добу для семиденного вікна недостатньо. Це — прихована ціна безоплатної
> інфраструктури, яку варто називати, оцінюючи придатність безоплатних тарифів для дослідних
> систем.»

### §3.4 — **Ф**, items 5, 6, U13

- `user_model_state` → «`bandit_state` + `beta_cells` + `blend_state` — персональний стан
  нормалізовано на рівень комірок, бо теплокарта FR-40 і оновлення приорів емпіричним Байєсом
  читають комірки реляційно».
- `feedback_rewards` → «атрибутовані кортежі винагород (рекомендація, вектор ознак, категорія, r,
  причина, **прапорець виключення**). Кортеж, контекст якого став неоднозначним, зберігається зі
  значенням r **для аудиту** і прапорцем `excluded`, який не пускає його в жодне оновлення;
  витіснення зовнішньою подією не породжує рядка взагалі. Ці три стани — 0, виключено, відсутній —
  структурно різні, і жоден із них не кодується як r = 0».

### §3.6 — **Ф**, items 38, 39

Add to the sync paragraph:

> «Правило злиття для полів, якими володіє користувач, — найновіший час редагування між
> пристроями (за рівності — пристрій у руках); поля, похідні від фактів, монотонні (виконання
> ніколи не відкочується до планового стану, `postpone_count` береться максимумом). Злитий рядок
> відтворюється проти серверної версії, і всі поставлені в чергу операції сутності згортаються в
> нього, тож цикл розв'язання конфлікту обмежений за побудовою. Повторне відтворення того самого
> `op_id` є операцією без наслідків на рівні обмеження цілісності (журнал `sync_ops`).»

And to UC-09 / the ≤ 5 min bound:

> «Межу «не пізніше ніж за 5 хв» сформульовано як **серверну** властивість: push-канал Google
> (секунди, типово) з підстрахуванням п'ятихвилинним завданням pg_cron, яке пересинхронізовує
> будь-який під'єднаний календар, не синхронізований останні 5 хв, і продовжує канали. **Пристрій**
> дізнається про новий стан під час наступного переходу на передній план або 60-секундного
> опитування: offline-first клієнт є узгодженим із часом, і межа захищає шлях винагород —
> витіснення фіксується на сервері до того, як надійдуть факти.»

### §3.7 — **С**, items 27, 33, 34, 35, 36, 43, 44

The subsection is three sentences long and now carries the work's most defensible legal analysis.
Rebuild it around four paragraphs: (1) the threat model as written — keep; (2) **processors as
built**; (3) **the transfer analysis** — new; (4) export, erasure, retention.

**(2) Processors:**

> «Обробниками є: Oracle Cloud Infrastructure (інфраструктура як послуга, eu-marseille-1; угода
> про обробку даних Oracle інкорпорована договором про хмарні послуги), Supabase (бекенд як
> послуга, eu-west-1, угода про обробку даних), PostHog EU та Sentry EU. Рівень сервісу
> рекомендацій **розгорнуто самостійно** на віртуальній машині, якою адмініструє дослідник:
> оновлення операційної системи, контроль доступу та ротація ключів є його відповідальністю.»

**(3) Transfer analysis (item 34/35, approved wording — paste, do not rephrase):**

> «Розміщення даних у ЄС не робить обробку вільною від передавання. За Настановами EDPB 05/2021
> (v2.0) передаванням у розумінні розділу V GDPR є й розкриття даних обробником у ЄС контролеру,
> розташованому в третій країні, — приклад 10 Настанов. Оскільки контролер перебуває в Україні,
> для якої рішення про адекватність відсутнє, кожен експорт із європейських обробників на машину
> дослідника — включно з псевдонімізованими журналами подій — є таким передаванням. Архітектуру
> змінено так, щоб твердження було істинним за побудовою: **учасники набираються в Україні
> (університетські розсилки та місцеві спільноти продуктивності); резидентів ЄС/ЄЕЗ не
> виключено. Систему спроєктовано за суворішим європейським режимом незалежно від цього: усі дані
> учасників зберігаються й обробляються в регіонах ЄС — Supabase (eu-west-1) та віртуальна машина
> Oracle Cloud у Франції (eu-marseille-1), на якій виконуються також навчання моделей і аналіз
> дослідження. Дослідник, установлений в Україні, отримує лише анонімні агрегати; випадковий
> адміністративний доступ до окремих записів покривається явною згодою учасника (ст. 49(1)(a)
> GDPR; за Законом України № 2297-VI, ст. 29, держави ЄС/ЄЕЗ є адекватними напрямами передавання).
> Якщо до дослідження долучиться резидент ЄС/ЄЕЗ, GDPR застосовується до дослідника за
> ст. 3(2)(b), і до такого залучення призначається представник у Союзі за ст. 27.** Конвеєр
> неперервної інтеграції бачить лише синтетичні дані.»

**(4) Export, erasure, retention (items 43, 44):**

> «Стирання облікового запису підтверджується **в застосунку** — номером запису в журналі
> `deletion_audit` і часом завершення. Це спроєктований механізм, а не запасний варіант:
> електронна пошта не може бути універсальною, бо анонімні облікові записи не мають адреси, а
> ст. 12(3) вимагає інформувати «без невиправданої затримки», що синхронне підтвердження в
> застосунку задовольняє найкраще. Каскадне видалення виконується синхронно (виміряно 78–151 мс
> на боці сервера через діалоги застосунку) у межах законодавчої межі 30 днів. Анонімні облікові
> записи очищаються після **30 днів неактивності** (жодного входу, жодної події), а не через
> 30 днів без конверсії: активна пробна експлуатація не знищується. Двадцятичотиримісячне вікно
> зберігання сирих подій відлічується від завершення дослідження і виконується завданням
> архівування, а не підмітанням на видалення.»

### §3.8 — **П**, items 12, 25, 28, 41, 46, 61

Replace the interaction-principles sentence (item 61 as amended 2026-09-09) and the typography and
contrast claims:

> «Принципи взаємодії: **«фізика замість оздоблення» реалізовано на трьох поверхнях** — діалозі
> підтвердження (пружина ≤ 250 мс) та двох взаємодіях на стрічці «Сьогодні»: після «Виконано» /
> «Пропустити» / «Я зробив» рядки нижче з'їжджаються в проміжок, а перенесений блок їде на своє
> місце або список прокручується до нього з «приземленням» картки. Критерій єдиний: рух має
> сказати, **що** змінилося і **куди** воно поділося; решта переходів (поява плану, повернення в
> Inbox, шторки) навмисно миттєві, бо рух, який каже лише «щось сталося», є оздобленням.
> Перетягування не реалізовано: ручне перевизначення виконується вибором часу («Перенести…») і дає
> ту саму пару навчальних сигналів. Під reduced motion переходи проходять тим самим шляхом із
> нульовою тривалістю. Прощення за замовчуванням: деструктивні дії скасовні 6 с; «пропустити»
> ніколи не буває червоним. Типографіка: **статичні накреслення Inter (400/500/600/700)** —
> React Native не надає доступу до осей змінних шрифтів; JetBrains Mono з табличними цифрами для
> таймерів. **Не всі кольорові пари відповідають WCAG 2.2 AA як текст**: акцентні кольори
> (2,1–2,98:1) використовуються лише як заливки з текстовою альтернативою, для основного тексту
> застосовано токени `textPrimary`/`textSecondary`, а для деструктивних підписів введено окремий
> токен `danger-text` (6,47:1 у світлій темі, 6,10:1 у темній).»

Timeline sentence (item 25): «Today (таймлайн зі «скляними» блоками)» → «Today (**стрічка рядків
із часовою колонкою та маркером «зараз»**, а не пропорційний канвас — вибір продиктовано
масштабуванням шрифту до 200 % і читачами екрана; блоки з високою впевненістю щільніші, евристичні
рядки відображаються зі сталою щільністю без заявленого відсотка)».

### §3.9 — **П**, items 24, 28, 38, 43, 45, 52, U14

| UC        | Правка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UC-03** | «Система (о 06:00 місцевого часу або за першого відкриття)» → «Система за першого відкриття або переходу на передній план у плановий день, для якого плану ще немає (06:00 місцевого часу — межа планового дня, а не заплановане завдання: жодна коректність не залежить від фонового виконання; о 06:00 надсилається лише сповіщення)». **Add an alternative flow:** «Альтернатива: **день без робочого вікна** — запиту не надсилається, план не зберігається, вечірній ритуал не планується; екран пояснює причину (ADR-0019)». |
| **UC-05** | Keep the trade-off example; **add** to the postcondition: «наслідок кожної опції обчислюється рушієм: для скорочення — оцінка падіння ймовірності виконання, для перенесення за дедлайн — величина зсуву в хвилинах; евристичне плече повертає лише узагальнений наслідок».                                                                                                                                                                                                                                                        |
| **UC-07** | «Перетягування запропонованого блоку: гаптичне «прилипання»…» → «Виклик «Перенести…» на блоці: вибір нового часу на сітці 15 хв → оновлення розміщення → парний сигнал (негатив для початкового інтервалу 0,1 / слабкий позитив для цільового 0,7, одна пара на розміщення; цільовий контекст обчислюється на сервері тим самим кодом сітки та ознак). Жест перетягування є пізнішим удосконаленням інтерфейсу й не є частиною навчального сигналу».                                                                               |
| **UC-09** | Remove «сповіщення з пропозицією заміни»: «витіснена задача автоматично повертається в планування → **пристрій дізнається про витіснення під час наступного переходу на передній план, і поверхнею повідомлення є повідомлення на екрані «Сьогодні»** (окремого сповіщення про витіснення не надсилається) → тихий ремонт, якщо користувач ігнорує».                                                                                                                                                                               |
| **UC-10** | «…протягом щонайбільше 30 днів з підтвердженням листом» → «…з підтвердженням **у застосунку** (номер запису та час завершення); фактичне виконання є синхронним (десятки–сотні мілісекунд), 30 днів лишаються законодавчою межею».                                                                                                                                                                                                                                                                                                 |

---

## 8. Розділ 4 — ПРОГРАМНА РЕАЛІЗАЦІЯ

### §4.1 — **П**, items 13, 14, 15, 16, 28, 61, 63

Three sentences are false as written. Replacement for the second and third paragraphs:

> «Доменні дані течуть в інтерфейс виключно через реактивні живі запити до локальної бази Expo
> SQLite — власним хуком `useLiveRows`: будь-який локальний запис автоматично перерендерює залежні
> екрани без ручної інвалідизації.
>
> Ручне перевизначення (UC-07) реалізовано вибором часу на сітці 15 хв; після застосування клієнт
> журналює пару сигналів — негативний для початкового контексту та слабко-позитивний для
> цільового — разом зі знімками обох контекстів. Фізику перетягування не реалізовано. Дві
> взаємодії на стрічці «Сьогодні» анімовано ворклетами react-native-reanimated у потоці
> інтерфейсу (підрозділ 3.8); теплокарту енергії намальовано нативними View, кільце фокус-таймера
> — канвасом react-native-skia.
>
> Природномовне швидке додавання (FR-11) виконується на пристрої **двома розбирачами**: власна
> граматика тривалостей працює першою й маскує свої фрагменти, після чого chrono-node розбирає
> дати. Порядок є суттєвим: chrono тлумачить «2 год» як відносний час, тобто дедлайн через дві
> години, і без маскування кожна тривалість тихо перетворювалася б на дедлайн. Розбір працює
> **двома мовами** — англійською та українською (`chrono.uk`); нерозпізнана фраза лишається
> частиною назви, і застосунок каже про це прямо. Прев'ю-чип показує назву, тривалість і дедлайн,
> а решті полів FR-10 присвоюються **неявні значення за замовчуванням** — категорія «admin»,
> пріоритет 2, 30 хв за відсутності тривалості, — усі редаговані в аркуші задачі. Чипи уточнення
> відображаються **лише для випадку названо сам день тижня без дати**; решту двох видів неоднозначності (кілька дат,
> кілька тривалостей) парсер виявляє й розв'язує за першим збігом.»

### §4.2 + лістинг 4.1 — **Ф**, U15 _(no worklist row — see §10)_

The listing contradicts two normative resolutions and would be read by a reviewer as the system's
actual contract. Two edits inside the code block:

- `await enqueue(db, skipEvent(r, contextSnapshot(r, now)));` →
  `await enqueue(db, lapseObservedEvent(r, contextSnapshot(r, now)));`
  with a comment: `// lapse_observed — власне спостереження клієнта, не факт пропуску`
- add after the status update: `// статус lapsed лишається локальним: авторитетну атрибуцію`
  `// виконує нічне завдання; клієнт не володіє станами completed/lapsed на сервері`

Rationale for the caption or the surrounding text: «Клієнт позначає пропуск локально й журналює
власне спостереження (`lapse_observed`); явний пропуск користувачем — інша подія
(`block_skipped`). Розрізнення є нормативним: зареєстрований код PAR і відображення винагород
ніколи не повинні сплутати спостереження клієнта з дією користувача.»

### §4.4 + лістинг 4.2 — **П**, items 17, 26, 37, U16

Opening sentence: «у Docker-контейнері на безоплатному CPU-тарифі Hugging Face Spaces» → «у
Docker-контейнері на віртуальній машині Oracle Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ,
eu-marseille-1)».

**Лістинг 4.2 (U16)** must show the parameters that measurement changed, or §2.4's new text and
the listing will contradict each other. Add before `solver.Solve(model)`:

```python
solver.parameters.max_time_in_seconds = 1.5   # бюджет рівня плану (anytime)
solver.parameters.num_workers = 2             # два закріплені ядра
solver.parameters.cp_model_probing_level = 0  # зондування вимкнено (виміряно, §2.4)
solver.parameters.symmetry_level = 0
solver.parameters.relative_gap_limit = 0.01   # критерій зупинки за розривом
# + зупинка за відсутності поліпшення протягом 0,3 с через зворотний виклик розв'язання
```

and add the stability bonus to the hint line: `add_hint(model, previous_plan, stability_bonus=1e-4)`.

### §4.5 — **С**, items 9, 36, 40, U17 _(no worklist row for the scheduler itself)_

The subsection states the pipeline runs as a **GitHub Actions cron in the public repository**.
It does not: `train.yml` runs on pull request, push and manual dispatch **on synthetic data only**,
and the real nightly pipeline is a systemd timer on the EU virtual machine. Replacement:

> «Нічний конвеєр виконується **системним таймером на тій самій віртуальній машині в ЄС**
> (щодня о 00:30 UTC, з розсіюванням), у тому самому закріпленому контейнері, що обслуговує
> запити: (1) псевдонімізований експорт категоріальних та поведінкових ознак із Postgres за
> білим списком стовпців, який є даними, а не кодом, і звіряється тестом безперервної інтеграції
> проти реальної схеми (NFR-S3) — жоден рядок рівня події в міжкористувацьке навчання не
> потрапляє, бо об'єктами факторизації є комірки, а не події; (2) перенавчання
> ALS-факторизації бібліотекою implicit та переоцінювання кластерів k-середніх; (3) обчислення
> офлайн-метрик і оцінювальний бар'єр: нова версія публікується лише за непогіршення метрик;
> (4) публікація артефактів у **Supabase Storage (ЄС)** та рядок у `model_registry`;
> (5) Монте-Карло-оцінювання пропенсіті для трафіку семплінгу Томпсона (K = 32 вибірки). Конвеєр
> неперервної інтеграції GitHub Actions виконує **той самий код на синтетичній когорті** — на
> кожен запит на злиття і на кожне вливання, — щоб зміни конвеєра перевірялися без доступу до
> даних учасників. Послідовнісна модель SASRec-lite у v1 не навчається й віднесена до перспектив:
> жодна функціональна вимога її не потребує, і шлях обслуговування v1 її не читає.»

**Add one honest sentence about the MC propensities (U17, ADR-0015):**

> «Пропенсіті рандомізованого зрізу є точним і записується в момент рекомендації. Для решти
> трафіку воно **відновлюється** нічним завданням K = 32 вибірками з поточного збереженого стану
> бандита по всіх бакетах відповідного типу дня зі згладжуванням Лапласа: множина допустимих
> бакетів у журналі не зберігається, тому це наближення, і воно явно позначене як таке та
> супроводжується аналізом чутливості.»

### §4.6 — **П**, items 1, 48, U18 _(no worklist row — the strongest of the new findings)_

Three claims in this subsection are false, and one of them is the kind a reviewer checks.

**(a) Версії — Ф:** «ESLint 9» → «ESLint 10», «Jest 30» → «Jest 29.7 (внутрішні залежності
jest-expo 57 закріплені на лінії 29.x)».

**(b) Наскрізні тести — П.** The draft claims five nightly Maestro paths, including a
drag-override flow that cannot exist. What exists: ten flow files — onboarding, tasks, two
accessibility sweeps (`p2-a11y-sweep`, `p10-a11y-sweep`), two dialog flows (one of them itself an
accessibility sweep) and four Ukrainian flows (one of them an accessibility sweep) — run **on
demand**, not nightly; no scheduled workflow exists and Maestro is invoked by none. Replacement:

> «Наскрізні перевірки виконуються десятьма потоками Maestro на вимогу — онбординг, робота із
> задачами, огляди доступності на найбільшому масштабі шрифту, діалоги підтвердження та
> українські потоки. Апаратна перевірка (підрозділ 6.6) показала межу цього рівня свідчень: жоден із
> потоків не запускається на фізичному iPhone (Maestro не підтримує фізичні пристрої iOS), на
> реальному Android селектори вкладок не збігалися з жодним елементом, бо Android не додає до
> міток рядка «, tab», а одне твердження про формат дати містило екрановану послідовність у
> лапках YAML і **не могло спрацювати від моменту його додавання**. Ці три факти є не дефектами
> тестів, а свідченням про межу переносності наскрізних наборів між платформами.»

**(c) Збірка та випуск — Ф (item 48):** «EAS Build для магазинних бінарників… EAS Update…» →
«…профілі EAS Build і EAS Update підготовлено та перевірено; жодного подання до магазинів не
виконано (підрозділ 6.7): облікові записи розробника не придбано за рішенням власника, а
розповсюдження для дослідження є безобліковим — збірка APK для Android; каналу для учасників з
iOS не існує.»

---

## 9. Розділ 5 і новий Розділ 6 — the evaluation, rebuilt

> Items 8, 10, 21, 22, 23, 48, 49, 52, 53, 54, 55, 56, 57, 59, 62. This is the part of the draft
> that changes most and the part `docs/study/` was written for. **What follows is the chapter in
> order** — what it should contain and in which sequence — with the load-bearing Ukrainian
> sentences written out.

### 9.1 Розділ 5 — **written; lives in `docs/thesis/text/rozdil-5.md`**

Items 8 (all five sub-edits), 10, 21, 22, 23, 36, 42, 48, 49, 54, 57, 60 (f) and U14 land in this
chapter. It is rebuilt rather than edited — the draft's version specifies a study in the future
tense and contains none of the evaluation that was performed — so it is written as continuous
Ukrainian in its own file.

**Contents as written** (5.1–5.9, tables 5.1–5.2):

| §   | Title                                      | Carries                                                                                                                                               |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Межа оцінювання                            | the boundary paragraph; nothing in the chapter is readable before it                                                                                  |
| 5.2 | Протокол польового дослідження як артефакт | табл. 5.1's arm A with its citations; blinding with the rejected sham-badge alternative; **U14's residual asymmetry named**; Android-only recruitment |
| 5.3 | Показники ефективності                     | PAR as an operational definition, computed from facts, sharing exactly two constants with the reward mapping                                          |
| 5.4 | Гіпотези та план статистичного аналізу     | H1–H4 with «у цій роботі вони не перевірялися»; the both-arms robustness refit; outage days excluded                                                  |
| 5.5 | Обсяг вибірки та частота рандомізації      | item 21's experiment rate; **the three assumptions behind N = 30, each named as an assumption**; §5.5.3                                               |
| 5.6 | Загрози валідності                         | the three threats simulation added: learning during A, H4 underpowered, sample-composition dependence                                                 |
| 5.7 | Методика симуляційного оцінювання          | pre-registration in git with verifiable timestamps; the world model; E1–E3; **the two falsification criteria**                                        |
| 5.8 | Відтворюваність та артефакти               | synthetic dataset + replay harness; why the real log is not published                                                                                 |
| 5.9 | Висновки до розділу 5                      | —                                                                                                                                                     |

**The two owner directives of 2026-09-09 applied here.** First, **instrument discipline**: where a
number depends on how it was measured, that is in the sentence. §5.5.2 is the densest case — p(A)
≈ 0,45 is an assumption whose cited source is a range, not a measurement, and it is swept in §6.4;
+8 в. п. is a decision about practical significance, not an estimate; ≈ 4 blocks per weekday is an
assumption about usage that the device pass measured differently (8 blocks placed from a 14-task
inbox; 7 on a Kyiv evening and 13 on a full day from a 25-task one —
and a Kyiv evening caps at six whatever the inbox holds); 30 % attrition is taken as typical, not
piloted; the 0,84 / 0,82 power figures are the paired-means floor with the GLMM **not fitted**.
Second, **the N₈₀ correction is not buried**: §5.5.3 states that exactly one cell of 75 supports
N = 30 and that it is the least plausible world on the grid, and says the number came out of a
recomputation that corrected the study document's own summary.

### 9.2 Розділ 6 [NEW] — **written; lives in `docs/thesis/text/rozdil-6.md`**

Items 11, 21 (in §5.4), 49, 50, 51, 52, 53, 55, 56, 57, 59, 62 and U19, U23–U40 land in this
chapter. It is a chapter the draft does not have, not a set of edits, so it is written as
continuous Ukrainian in its own file — see `docs/thesis/text/README.md` for why the two artefacts
are kept apart.

**Contents as written** (6.1–6.9, tables 6.1–6.7):

| §   | Title                                                | Carries                                                                                           |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 6.1 | Оцінювачі політики на відомій істині                 | E1; the replay-bias finding as a methodology consequence, not a curiosity                         |
| 6.2 | Потужність первинного контрасту                      | E2; both τ readings; the mis-specified type-I band reported as an error                           |
| 6.3 | Замкнений цикл на розкладі ABAB                      | E3 with its four deviations; the "properties of one world" qualifier at first mention             |
| 6.4 | Сітка світів: межа застосовності методу              | the world model, the boundary, **the substantive-failure result**, the loss decomposition, S1–S12 |
| 6.5 | Обсяг вибірки, перерахований за симульованим ефектом | N₈₀ 21 … > 120; the decision rule with N following its inputs                                     |
| 6.6 | Верифікація на реальних пристроях                    | item 62 in Ukrainian with §11.3's corrections applied, plus U23–U40's instrument discipline       |
| 6.7 | Обговорення                                          | established / not established / the boundary of the protocol-as-contribution claim                |
| 6.8 | Специфікація як гіпотеза                             | U19 — the twelve refuted assumptions as a table                                                   |
| 6.9 | Висновки до розділу 6                                | —                                                                                                 |

**Two corrections to `docs/study/sensitivity-results.md` came out of writing it, both dated in
place.** (i) Its summary said File 06's N = 30 "is supported in none of the 75 cells (the smallest
adult-mix N₈₀ is 33)". Cell 66 is adult mix with N₈₀ = 21, so both halves were wrong. (ii) The
corrected paragraph then said the smallest N₈₀ at four tasks a day is 33 — that is the smallest
**adult-mix** value; across mixes it is **31** (cell 49, uniform, s = 2), a figure the same
document's own sweep table already printed. Both recomputed from `results/sensitivity.json`. The
chapters state it accurately: **exactly one** cell of 75 supports N = 30, it sits at the grid's
registered upper stress bound (s = 2), and at four tasks a day the minimum is 31 across mixes and
33 within the adult mix. The framing was corrected too — numerically the recomputation **weakens**
the claim (from "no cell" to "one"); what survives is the conclusion, not a strengthening.

## 10. ВИСНОВКИ і ДОДАТКИ

### 10.1 АНОТАЦІЯ, ANNOTATION і ВИСНОВКИ — **written; live in `text/anotaciya-ta-vysnovky.md`**

Items 3, 36, 48, 49, 54, 56, 57, 58, 59, 62. Written in one file because the three texts share a
vocabulary: everything they assert repeats §3's wording rather than reaching for a stronger version
of it, which is the specific way a summary goes wrong.

**Could all four §3 statements survive an abstract without softening? Yes.** The hardest was §3.1 —
«навчена політика лише грає внічию у світі, який описує її власний приор» — because the genre of an
abstract is to state what was achieved, and that sentence describes the boundary of what was
achieved. What made it hold at full strength: **the conclusion leads, not the number.** The
paragraph says first what the method needs in order to be worth its complexity, and only then gives
both facts — 58 wins and the tie in the prior's own world — in one sentence and at equal standing.
Leading with «виграє у 58 світах» invites the reader to stop there; leading with «лише внічию» reads
as a failure report, which it is not. No statement needed a hedge.

The block below is superseded by that file and kept only as the item→destination map.

### 10.1a ВИСНОВКИ — the item map, items 48, 49, 54, 56, 57, 58, 59, 62

**п. 1 — Ф.** Add the honest strength of the literature and the D7 consequence:
«…а побудована семивимірна порівняльна матриця наукових напрямів довела наявність незайнятого
наукового розриву на перетині рекомендаційних систем, комбінаторних бандитів, офлайн-оцінювання
політик та адаптивних поведінкових інтервенцій; **шість із семи вимірів закрито в цій роботі,
сьомий — розгорнуте польове оцінювання — лишається відкритим.**»

**п. 5 — Ф.** «Архітектура функціонує в межах безоплатних тарифів до ≈ 3 тис. активних
користувачів на місяць» → «…за оцінкою аудиту тарифів (без навантажувального випробування)
функціонує в межах безоплатних тарифів до ≈ 3 тис. активних користувачів на місяць, причому
припущення про безоплатний рівень **було спростоване постачальником під час реалізації**, і
сервіс перенесено на самостійно кероване розгортання в ЄС».

**п. 6 — С.** Rewrite entirely (this paragraph currently reports a study as delivered):

> «6. Розроблено методику експериментального оцінювання. Протокол польового дослідження —
> реверсивний дизайн ABAB/BABA із засліпленням, узгодженою рандомізацією в обох плечах, вкладеним
> мікрорандомізованим випробуванням, первинним показником дотримання плану та змішаною логістичною
> моделлю аналізу — **спроєктовано, інструментовано й перевірено наскрізно на розгорнутій
> системі**; його виконання лежить поза межами роботи. Оцінювання виконано в симуляції з
> попередньою реєстрацією гіпотез у системі контролю версій.»

**новий п. 7 — С (items 55, 56, 57, 59).** The results have no paragraph at all today:

> «7. Виконано двоетапне симуляційне оцінювання. На відомій істині показано, що сімейство
> оцінювачів IPS / SNIPS / DR відновлює цінність політики незміщено за проєктної щільності
> даних, тоді як незважений replay виявився зміщеним через власне рішення про змінний розмір
> рандомізованого зрізу — і оцінювач замінено зваженим. На сітці з 75 явно специфікованих світів
> навчена політика перемагає евристику «найраніший вільний слот» у 58 світах, грає внічию у 17 і
> не програє в жодному, **проте у світі, для якого писався приор холодного старту, — лише
> внічию**: 52 % проміжних типів втрачають по 1,4–1,9 в. п., а 28 % ранкових — по 0,8–2,1 в. п.
> через шум навчання на людину, і це гасить виграш вечірніх типів у 4,8–10,2 в. п. Головний висновок:
> **метод потребує індивідуальної варіації, щоб бути вартим своєї складності; там, де поведінка
> йде за популяційним хронотипним візерунком за припущеної сили, достатньо правила «найраніший
> вільний слот»**. Внесок популяційної таблиці приорів становить ±0,4 в. п.; розрив у
> персоналізації не накопичується (0,3–1,4 в. п. за чотиритижневу половину). Обсяг вибірки, якого
> потребувало б польове дослідження, перераховано за симульованим ефектом: 21 … понад 120
> завершених учасників, понад 120 — у 48 із 75 світів.»

**новий п. 8 — С (item 62).** The device pass, in the sentence item 62 wrote for exactly this
place (with §11.2's corrections applied):

> «8. Автоматизовані свідчення — модульні тести клієнта та крайових функцій, набори на Python і
> pgTAP, огляди на симуляторі й наскрізні перевірки на розгорнутому бекенді — були необхідними й
> **нечутливими до шести класів дефектів**, бо кожен із них залежить від входу, який постачає лише
> операційна система телефона, його апаратура, календар або користувач. Семиденна перевірка на
> двох реальних пристроях виявила чотирнадцять серйозних дефектів у цих класах, з них чотири
> спотворювали навчальний сигнал, не спричиняючи жодної помилки, і жоден із них не був би
> знайдений ще одним читанням коду.»

**Перспективи — Ф.** Replace «виконання зареєстрованого польового дослідження та публікацію
анонімізованого датасету» with «виконання спроєктованого польового дослідження — у першу чергу
пілота, який виміряв би індивідуальний розкид слотового ефекту, бо саме ця величина визначає, чи
варте дослідження проведення, і саме її в роботі не виміряно; публікацію синтетичного набору
подій разом зі стендом відтворення»; keep the on-device ranker, notification-timing bandit,
wearables and non-additive slates.

### 10.2 Додаток В — **Ф**, items 12, 41, 46, U21

- «Inter Variable» → «Inter (статичні накреслення 400/500/600/700)» (both places).
- The blanket claim «Усі кольорові пари задовольняють вимоги контрасту WCAG 2.2 AA» → «Пари,
  використані для тексту, задовольняють WCAG 2.2 AA (≥ 4,5:1); **акцентні кольори (success,
  warning, energy-high/low, danger) використовуються лише як заливки** — як текст на світлій
  поверхні вони дають 2,06–3,60:1 — і завжди супроводжуються текстовою альтернативою.»
- **Add the missing token row (U21):** `danger-text` | `#B91C1C` (6,47:1 на світлій поверхні) |
  `#F87171` (6,10:1 на `#1A1D24`) | «підписи деструктивних дій». Without it the appendix
  documents a palette the app does not ship.
- Heatmap sentence — add the resolution honesty (item 41): «…інтерполюються в OKLCH нативними
  View, а не канвасом; **роздільність сітки слід називати чесно: 126 клітинок повторюють частину
  доби по її годинах і тип дня по днях тижня**.»

### 10.3 Додаток Г — **Ф**, item 5

Either update the fragment or label it «спрощений ілюстративний фрагмент». If updated:
`events.op_id` is `text` (клієнтський ULID) with `unique (user_id, op_id)`, not a bigint;
`recommendations` additionally carries `plan_id`, `chunk_index`, `context_bucket`, `features`,
`q_hat`, `rationale_key` + `rationale_params` (no free-text `rationale`), `is_experiment`,
`engine`, `attributed_at`, and `propensity` is `double precision`;
`model_version text references model_registry(version)` is invalid because `version` is not unique
— the system stores a plain tagged string.

### 10.4 Додаток Д — **П**, item 63

Resolve the placeholder rather than leaving it:

> «Опитувальник **не перекладено**. П'ять пунктів і варіанти відповідей лишаються англійською в
> будь-якій мові інтерфейсу, і на екрані сказано чому: межі класів 22/18/12/8 валідовано саме для
> цього формулювання, валідованої української версії rMEQ не існує, а валідованими українськими
> інструментами хронотипу є CSM і MCTQ (Senyk, Jankowski & Cholii, _Biological Rhythm Research_,
> 53(6):878–896) — інший набір пунктів із власними межами (≤ 23 / ≥ 42), який потребував би
> власного виведення «бал → клас → приор». Ціну названо прямо: україномовний користувач частіше
> пропустить опитування, а пропуск є **спроєктованим шляхом** (клас INT з удвічі меншою силою
> приору), а не збоєм.»

### 10.5 Додаток Е — **Ф**, item 51, U22

Row «NFR-P1 (план ≤ 2,5 с)» → «NFR-P1 (план ≤ 6,0 с на пристрої; функція ≤ 1,5 с)», mechanism
column → «anytime CP-SAT 1,5 с з критеріями зупинки за розривом і відсутністю поліпшення; каскад
деградації; евристичний резерв 1,9 с». **U22:** regenerate the whole appendix from
`docs/traceability.md` at freeze time and add the chapter column for the new Розділ 6 rows
(NFR-P2, FR-26, FR-50, UC-03, FR-42 verification rows).

### 10.6 Додаток Ж — **Ф**, items 7, 20

- `"engine": "bandit_cpsat"` → `"engine": "learned"`; `"category": "deep_work"` → `"category": "deep"`.
- `"solver": {...}` → `"telemetry": {...}`.
- `"rationale": "…"` → `"rationale_key": "…", "rationale_params": { … }` with a note that the
  Ukrainian sentence is rendered client-side.
- `"propensity": 0.25` → `"propensity": 0.3333333333333333` **plus a sentence**: «пропенсіті
  дорівнює ε/|A_m(x)| і набуває значень 0,5, 1/3 або 0,25 залежно від рядка; сама множина A_m(x)
  зберігається в телеметрії плану (`telemetry.ef.experiment.top_m`), тож її потужність і величину
  p можна відновити символьно». **There is no `a_m_size` column** — do not invent one for the
  example; show `top_m` inside the response's `telemetry` object instead.
- `"unplaced": [{ "reason": "no_feasible_slot" }]` → `"no_feasible_start"` — the closed vocabulary
  is `no_feasible_start | deferred | infeasible` (`schemas.py:36`, `_shared/types.ts:15`), and
  `no_feasible_start` is the value every task returned on the Friday-evening Saturday plan (#52).

### 10.7 Нові додатки — **written**: `text/dodatok-z.md`, `text/dodatok-y.md`

**Додаток З — generated, not written.** `docs/thesis/gen-dodatok-z.py` emits it from
`docs/study/results/sensitivity.json`, and CI runs `--check` on every push: the appendix cannot
drift from the run it claims to report. That is the mechanism behind the claim «наведено кожну
комірку, включно з програшами й нічиями» — the claim is now enforced rather than asserted.

**All 75 cells are printed, and they are scannable** because the appendix follows the grid's own
block structure instead of dumping one wide table: each block shows only the factors that vary
inside it, with five value columns (ефект ± MC SE, вердикт, ефективність, N₈₀, частка «> 0»). З.1
Блок A carries 45 rows, З.2–З.5 the other four blocks, З.6 the two cells the text singles out.
The check was verified to fail on a changed value and on a dropped row.

**Додаток И — the registered predictions with their criteria and the four commits that date them.**
Its purpose is narrow and stated in the file: to let a reader verify that the predictions were fixed
before the outcomes were known.

### 10.7a Which appendices belong in the repository rather than on the page

| Appendix              | Verdict                      | Why                                                                                                                                                                                                            |
| --------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **В** колірні токени  | print in full                | twelve rows; the `danger-text` addition matters and the table is the artefact                                                                                                                                  |
| **Г** SQL-фрагмент    | print in full                | already written; it is one of the few things a reader can check against the public repository                                                                                                                  |
| **Д** rMEQ            | print in full                | five items; a committee reading a chronotype claim wants the instrument in front of it                                                                                                                         |
| **Ж** приклад /plan   | print in full                | one response; carries the propensity and the engine tag                                                                                                                                                        |
| **З** сітка світів    | **print in full** (75 rows)  | it _is_ the "every cell reported" claim; abridging it would retract the claim                                                                                                                                  |
| **Е** простежуваність | **print abridged + pointer** | the complete matrix is 40+ requirements; print the ~15 that carry the argument and cite `docs/traceability.md` for the rest. The draft already abridges it — what changes is that the pointer becomes explicit |
| **И** пре-реєстрації  | **print abridged + pointer** | print the predictions with their criteria and the commit hashes (≈ 2,5 pages); the full texts are ≈ 8 pages that do not become more checkable by being printed — the commits are what makes them checkable     |
| **А, Б** діаграми     | print                        | figures, unchanged                                                                                                                                                                                             |

The general rule the two abridgements follow: **print what a reader must weigh, cite what a reader
must be able to check.** A prediction table is weighed; a generative model's parameter list is
checked, and a commit hash checks it better than a printed page does.

### 10.7b Superseded plan for the new appendices

- **Додаток З** — the full 75-cell sensitivity table (generated from
  `docs/study/results/sensitivity.json`; the appendix table in `sensitivity-results.md` is
  ready to paste, with columns: block, s, σ_shape, σ_day, mix, p₀, K, prior, effect ± MC SE,
  ceiling, attainable ceiling, efficiency, share > 0, verdict, N₈₀, rejection at 30/60/120, and
  the five per-class columns).
- **Додаток И** — the frozen pre-registration and the world grid (hypotheses E1–E3 and S1–S12 with
  their criteria, and the commit hashes that date them). Without it, «зафіксовано до запуску» is a
  claim the reader cannot check.

---

## 11. Amendments to the worklist itself

Five worklist entries are stale, internally inconsistent, or overstate their evidence. They are
amended here; `thesis-corrections.md` should carry a dated line for each.

### 11.1 Item 20 — the propensity constant is from before the P6 rule

The entry reads «the propensity is logged as the within-slice value p = ε/m = **0.25**». Since
2026-08-26 (ADR-0008 §1, spec-conflicts M9/L22) the per-row value is **p = ε/|A_m(x)|** with
|A_m(x)| ∈ {2, 3, 4} — 0,5, 1/3 or 0,25 — and the column is `double precision` precisely because
1/3 in float4 would contradict the word "exact" (`exploration.py:47–99` is the only producer).
Writing 0,25 as _the_ propensity puts a wrong constant in §2.3 and Додаток Ж. The rest of item 20
(the service refusing drifted ε or m) stands.

### 11.2 Item 51 — the item contradicts itself, and one number is modelled

- **The reference figure.** The 2026-09-05 amendment says «state the reference as 3.7–4.1 s, never
  as one number», but an earlier paragraph of the same item still says «the reference measurement
  … is 3.7 s p95». Use the amended form; the "before" figure has the same problem (3,84 s p95 on
  the 2 Sep 14-task series; 4,58 s p95 on the 3 Sep 15-task series) — name the series with the
  number or drop it.
- **«of the 3.9 s p95 sum, 2.6 s is server-side» reads as a measurement and is not.** 3,9 s is the
  **sum of the decomposition's components** (server 2,60 + network 0,90 + device 0,40); the
  measured series p95 is 3,68 s, and the notes state «percentiles do not add — the sum is
  conservative». In the thesis: «за консервативним розкладом (сума перцентилів компонент,
  3,9 с проти виміряних 3,68 с) серверна частка становить 2,6 с».
- The 14- vs 15-task erratum is correctly recorded in the item; `device-checklist.md`'s NFR-P1 row
  still runs the two series together («the same inbox») and should be corrected in place.

### 11.3 Item 62 — four positive claims overstate their evidence

Item 62's §verification text is draft-ready except in four places, and each is fixable by adding
the condition rather than removing the claim.

| As written                                                                                    | The evidence                                                                                                                                                                                            | Use instead                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «exact reminders within half a second of their alarm»                                         | +109, +147, +335, +345, +377, +471 and **+531 ms**                                                                                                                                                      | «точні будильники спрацьовували в межах 0,11–0,53 с від запланованого часу — на під'єднаному та від'єднаному від живлення телефоні»                                 |
| «erasure through the in-app dialogs in 78–180 ms»                                             | the **180 ms** erasure went through the **OS alerts** (build 5); the in-app dialogs measured **78, 113 і 151 ms**                                                                                       | «стирання через діалоги застосунку — 78, 113 і 151 мс на боці сервера (окремий, ранній вимір через системні діалоги — 180 мс)»                                      |
| «a real thumb scroll with zero hitches on the iPhone and zero janky frames on the Pixel»      | 0 hitches on a **7-block** iPhone list under the owner's thumb; 0 janky on an **8-block** Pixel list. The 13-block Pixel runs show **1 janky frame**; the 16-block scripted iPhone runs, **8 hitches**  | name the list length and the input: a thumb and a scripted drag are different inputs, and the hitch count depends on which one is used (§12, U33)                   |
| «cold start p90 1.07 s on the Pixel 7a … and 0.50 s on the iPhone 12 (0.95 s after a reboot)» | Android's `am start -W` measures process start → first frame; the iPhone's 488/503 ms measures **initial frame → foreground-active** and excludes 413 ms of process creation reported by the same trace | quote each platform with its interval, and make only the defensible cross-platform statement: post-reboot **0,95 с (iPhone 12) проти 1,07 с (Pixel 7a)** (§12, U26) |

Three further qualifications for the same section:

- **«the cap holding on real days on both platforms, the fifth slot going to the ritual»** — on
  7 September the fifth delivery **was the duplicated ritual**, i.e. the defect the same section
  reports. The clean cap demonstration is the Android day of 5 September (four nudges + ritual, no
  sixth) and the iOS day of 8 September.
- **The stale-session reward defect is fixed on the branch and not re-checked on hardware**; and
  the Android focus session of 2026-09-02 (164,5 wall-clock minutes) «had the same shape and its
  tuple was never checked». Present the third reward defect as «виправлено; повторну перевірку на
  пристрої не виконано».
- **Scope.** The section scopes the pass to Pixel 1–5 Sep (builds 1–6) and iPhone 7–8 Sep
  (builds 1–2), then counts eight Android builds and PRs #37–#52, #56–#58 — figures that include
  the dialog pass (6 Sep), the motion pass (8–9 Sep) and the simulator i18n sweep (9 Sep). Say
  which passes the counts include.

### 11.4 Item 50 — do not imply the client was changed

Every account created on the Pixel **after** the fix still records `timezone: Europe/Kiev`: the
repair was server-side (a `tzdata` dependency plus a build-time assertion), not a client change.
Wording: «сервіс навчився приймати назву, яку надсилає пристрій», not «пристрій почав надсилати
канонічну назву».

### 11.5 Item 47 — the promise «the device pass measures» was not kept

NFR-P3 still has **no handset number**: the device-checklist row for a handset-side latency series
(LTE and Wi-Fi, `sync_completed` durations, one timed export) is open. The thesis must state the
two Node-side numbers with their condition and say plainly that a device figure does not exist —
not defer it to a pass that has already happened.

### 11.6 Item 55 — label the E3 effects as world-properties at first mention

`simulation-results.md` §6a already supersedes them, and item 56 says so, but item 55 still opens
with «the learned arm beats the heuristic by 2.5 pp». In the thesis the first mention carries the
qualifier (§9.2 §6.3).

---

## 12. Things the draft gets wrong that no correction covers

Twenty-two of these come from reading the draft against the repository; eighteen more come from the
verification notes, which produced findings that never got a worklist row. **U6, U7, U14, U15,
U17, U18, U19, U20, U23 and U34 are the ones worth acting on first.**

### 12.1 From the draft against the repository

| ID      | Draft anchor           | What is wrong / missing                                                                                                                                                                                                                                                                              | Value  |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **U1**  | ВСТУП, наукова новизна | The sensitivity study and the pre-registration-in-git discipline are contributions and appear in no novelty item (§4.3 c writes one)                                                                                                                                                                 | high   |
| **U2**  | ВСТУП, структура       | «п'яти розділів», «66 найменувань», «понад 70 сторінках» all change                                                                                                                                                                                                                                  | low    |
| **U3**  | ВСТУП / §1.1           | The synchrony literature is quoted at full strength; the systematic review the study's own world model cites says the effect appears in ≈ 45 % of adult studies and the chronotype main effect in < 20 %. Stating that **strengthens** the argument for per-user learning                            | high   |
| **U4**  | §1.2, табл. 1.1        | The table reads as a measured comparison with Motion / Reclaim / SkedPal. None was run                                                                                                                                                                                                               | high   |
| **U5**  | §1.2, табл. 1.1        | «Приватність / он-девайс перспектива — так» — the on-device ranker was never built                                                                                                                                                                                                                   | medium |
| **U6**  | §1.4, табл. 1.2        | **The research-gap argument is built on Kairos occupying all seven dimensions including D7 (deployed field evaluation). It no longer does.** The gap must be re-argued over six dimensions with D7 stated as open                                                                                    | high   |
| **U7**  | §1.5                   | Two of the four market preconditions are falsified (free Docker tier withdrawn; on-device ML not used). **And the free tier has a measured operational cost:** an hourly synthetic load (`bench_solve.py`, ≈ 3 min CPU) keeps the 7-day CPU p95 ≥ 20 % so the provider does not reclaim the instance | high   |
| **U8**  | §1.5, табл. 1.3        | Two mitigation rows are contradicted: priors do not measurably de-risk week 1 (±0,4 в. п.), and the free-tier risk **materialised**                                                                                                                                                                  | medium |
| **U9**  | §2.2                   | \|C\| = 14 as built (spec-conflicts M3 never got a worklist row)                                                                                                                                                                                                                                     | low    |
| **U10** | §2.4                   | «забезпечує вимогу NFR-P1 на двох віртуальних ядрах безоплатного тарифу» — wrong requirement, wrong box                                                                                                                                                                                              | medium |
| **U11** | §2.5.2                 | The AF-above-MD ordering for morning types is an **unmeasured assumption** on which the prior table and the P11 generator disagree — and it is the source of a measured loss. Currently presented as literature-backed                                                                               | medium |
| **U12** | §2.6.2                 | The replay bias is a **methodology** correction and belongs where the estimator is introduced, not only in the results                                                                                                                                                                               | high   |
| **U13** | §3.4                   | The `excluded` flag is missing from the entity list; it is the mechanism that carries invariant 3                                                                                                                                                                                                    | low    |
| **U14** | §5.1 / §5.6, UC-05     | **The «pixel-identical UI» blinding claim has a hole:** the trade-off sheet's consequence is computed by the learned engine (`est_completion_drop`) and generic in arm A (`heuristic.ts:394`)                                                                                                        | high   |
| **U15** | §4.2, лістинг 4.1      | The listing enqueues `skipEvent` and writes `lapsed`. Normative: the client logs **`lapse_observed`**, and `lapsed`/`completed` are not client-owned server statuses. A reviewer reads listings                                                                                                      | high   |
| **U16** | §4.4, лістинг 4.2      | The listing shows none of the parameters measurement changed (probing off, gap limit, no-improvement stop, two workers, the hint's stability bonus) and will contradict the rewritten §2.4                                                                                                           | medium |
| **U17** | §4.5                   | **The nightly pipeline is a systemd timer on the EU VM**, and `train.yml` in GitHub Actions runs the same code on **synthetic data only**, on PR and push. Also: the propensity for non-slice traffic is **reconstructed** nightly (K = 32), an approximation the draft presents as logged           | high   |
| **U18** | §4.6                   | **The five nightly Maestro paths do not exist**: no scheduled workflow; the flows are onboarding / tasks / a11y sweeps / dialogs / i18n; and one of the five named paths (drag-override) is a feature the system does not have                                                                       | high   |
| **U19** | —                      | **`spec-conflicts.md` has no home in the draft** (§13.4)                                                                                                                                                                                                                                             | high   |
| **U20** | Список джерел          | ≈ 5 sources orphaned by the corrections (HF [30], ONNX [44], PyTorch [46], MiniLM [56], and Maestro [40] if §4.6 is rewritten); ≈ 11 new ones needed (§12.3)                                                                                                                                         | high   |
| **U21** | Додаток В              | The `danger-text` token (`#B91C1C` / `#F87171`) is shipped and missing from the appendix (spec-conflicts L41 has no worklist row)                                                                                                                                                                    | medium |
| **U22** | Додаток Е              | Regenerate from `docs/traceability.md`; add the new chapter's rows                                                                                                                                                                                                                                   | low    |

### 12.2 From the verification notes — findings with no worklist row

| ID      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Where it belongs                                      | Value  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------ |
| **U23** | **The capacity envelope of the deployed architecture.** 45-request sweep: the round-trip floor edge function (eu-west-1) → VM (Marseille) is ≈ 0,43 с; function work outside the call 0,45–0,9 с; the effective solver slice is **1,0 с, not the nominal 1,5 с** (the ladder reserves 0,5 с). Sum 1,9–2,3 с against a 1,9 с budget — the budget is over-subscribed **by construction**. Learned path reliable while the solve finishes under ≈ 0,6 с: any inbox on a ≤ 4,5-hour window, or ≤ 12 tasks on a full day; a coin flip at 14–16 tasks on a 9-hour window | §2.4 and §6.6                                         | high   |
| **U24** | **The measuring instrument was validated before the measurement, and one build's results were withdrawn.** «Build 2» shipped a bundle with no project URL, so there was no backend; its headline result was retracted rather than annotated, and every later APK was gated on the project host inside the bundle plus a server read-back                                                                                                                                                                                                                           | §6.6, methodology paragraph                           | high   |
| **U25** | **A green accessibility result measured nothing.** React Native's `isReduceMotionEnabled` reads `TRANSITION_ANIMATION_SCALE`; the 6 September dialog measurement had set `animator_duration_scale`, so its "reduced motion → one frame" reading is **void**. Re-measured on the right switch, the dialog's behaviour is «inconclusive with this tool»                                                                                                                                                                                                              | §6.6, and the reduced-motion claim in §3.8            | high   |
| **U26** | **Cold start is not one measurement.** `am start -W` (process start → first frame) and xctrace (initial frame → foreground-active) measure different intervals; the app emits no "Today rendered" marker. NFR-P2's «середній пристрій 2022 р.» is also not a performance class — a 2020 iPhone 12 beats the 2022 Pixel 7a                                                                                                                                                                                                                                          | §3.1 табл. 3.2 note, §6.6                             | high   |
| **U27** | **There is no route back for a wrong fact after the 6-second undo** — the only correction fact is `lapse_corrected` (lapsed → "I did it"). When two taps on blank cards produced a completion and a focus start, the owner refused to edit the database: the events are append-only and the reward chain derives from facts                                                                                                                                                                                                                                        | §6.6 and §5.6 (data-integrity policy)                 | high   |
| **U28** | **The ≤ 5/day cap held and the behaviour was still wrong**: on 8 September all four nudges went to blocks that had already lapsed before the first foreground, so no nudge was scheduled for the three blocks the user could still have done                                                                                                                                                                                                                                                                                                                       | §6.6 — a spec-conformant design failing on a real day | high   |
| **U29** | **Two data-definition traps in the log.** The phone's clock ran ≈ 0,7 с ahead of the server (a fact's `server_ts` preceded its own `client_ts`) — pair rows by intervals, never by equality. And `notification_response.latency_ms` is measured from `scheduled_for`, not from the post time, which is why a body tap on a stale ritual reported 12,9 hours                                                                                                                                                                                                        | §5.3 (metric definitions) and §6.6                    | high   |
| **U30** | **The accessibility evidence is language-conditioned.** Every NFR-A2 row was closed in English; Ukrainian labels are +56 % longer on a 16-label risk set (+150 % for «Пропустити»), so the rows do not transfer, and the block action row **wraps** at accessibility-XXXL                                                                                                                                                                                                                                                                                          | §5.6 threats, §6.6 "what remains unverified"          | medium |
| **U31** | **A cross-platform e2e suite can be structurally unable to run on one of its targets** — Maestro does not run on physical iPhones at all; on real Android all 11 tab selectors in four flows matched nothing; a date assertion contained an escape sequence inside single-quoted YAML and **had never passed since it was added**                                                                                                                                                                                                                                  | §4.6 and §6.6 (this is U18's evidence)                | high   |
| **U32** | **A method for verifying time-triggered behaviour without waiting for it**: reconstruct from the notification archive, the alarm list, the server rows and the system log after the moment has passed — with the uncertainty stated (Android's relative labels floor to the minute, giving ±1 min)                                                                                                                                                                                                                                                                 | §6.6, methodology                                     | medium |
| **U33** | **Hitch counts depend on the input**: the owner's thumb on a 7-block list gave 0 hitches / 841 frames; 20 scripted 0,25 s drags on a 16-block list gave 8 hitches. A 60 fps claim is only comparable between identical inputs                                                                                                                                                                                                                                                                                                                                      | §6.6, and it justifies the before/after design        | medium |
| **U34** | **A code review found the defect class and the same class shipped anyway.** The P9 adversarial pass found an `accessible` wrapper swallowing child controls in `BeliefCard`; `ConfidenceBlock` repeats it verbatim, and both automated accessibility trees listed the buttons regardless. **This is the strongest available argument that reviews and screen-reader passes are complements, not substitutes**                                                                                                                                                      | §6.6 — put it in the class table's screen-reader row  | high   |
| **U35** | **A re-plan while a focus session runs drops the running block out of Today** (the old recommendation stays `accepted`, the Focus tab keeps the session): the plan surface and the fact surface disagreed in front of the user                                                                                                                                                                                                                                                                                                                                     | §6.6, and §3.6 as a design consequence                | medium |
| **U36** | **The plan rate limiter spends the user's daily budget on the system's own failures** — 30 plans per rolling 24 h counted by rows, so day 1's 30 zero-block fallback rows locked the account out, and the Friday empty Saturday plan consumed a slot too                                                                                                                                                                                                                                                                                                           | §6.6; a free-tier constraint leaking into UX          | medium |
| **U37** | **The horizon, not the inbox, caps the plan** (30-min minimum block, grid stops at midnight), so a Kyiv evening caps at 6 blocks whatever the inbox holds — producing a 13-block list for the blank-card and motion evidence required shifting the device and profile to a Pacific timezone. A stated limitation of that evidence                                                                                                                                                                                                                                  | §6.6                                                  | medium |
| **U38** | **Anonymous rows accumulate from mere app opens** (68 → 69 across "Start over" plus one relaunch; 7 in one day of throwaway testing) — measured material for the 30-day-inactivity retention rule                                                                                                                                                                                                                                                                                                                                                                  | §3.7 retention, §6.6                                  | low    |
| **U39** | **A root cause was held as «probable» for a day because the owner's recollection contradicted the code history**, and flipped only when an artefact (the owner's own screenshots) settled it                                                                                                                                                                                                                                                                                                                                                                       | §6.6, methodology                                     | low    |
| **U40** | Smaller ones worth a sentence each: an `Animated.View` per cell costs nothing measurable (1825 vs 1824 frames, 1 janky each); the arrival settle **never played on the first motion build and the frame tool could not tell** — a fresh-context review found it in code; VoiceOver's "Activate" does not fire RN Pressables, which is why the iOS pass needed WebDriverAgent for every touch; one native error appeared once per sync for 90 minutes and was never diagnosed                                                                                       | §6.6                                                  | low    |

### 12.3 The reference list (U20) — **step 8**

Last, because every deletion and insertion renumbers every citation in the draft.

#### (a) Delete — cited for something the work does not do

D4 as decided kept [44] and [46] «on the on-device перспективи sentence». **That decision is
revised here, and the reason is the owner's own test: a reference to something we removed is the
same class of problem as a number nobody rechecked.** When the перспективи paragraph was actually
written (`text/anotaciya-ta-vysnovky.md`), it named neither ONNX Runtime nor PyTorch — it names the
substance, «перенесення персонального ранжувальника на пристрій», which is stronger without a tool
name. So both references have **no citation site left**, and keeping them would mean adding tool
names to a sentence that reads better without them, purely to justify the entries.

| №        | Джерело                        | Why it goes                                                                                                                                   |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **[30]** | Hugging Face Hub Documentation | the service moved to a self-managed EU deployment and the model registry to Supabase Storage; nothing in the corrected text cites it          |
| **[44]** | ONNX Runtime Documentation     | the on-device ranker was never built; its §1.5 market-precondition citation is deleted (D2/U7), and the перспективи sentence names no runtime |
| **[46]** | PyTorch Documentation          | SASRec-lite is not trained and is not in перспективи either (item 9); no citation site remains                                                |
| **[56]** | Sentence-Transformers          | text embeddings were never built                                                                                                              |

**Kept, but with a narrowed citation site — check each when renumbering:** [50] Skia (the heatmap
moved to native Views; Skia remains for the focus-timer ring only), [23] GitHub Actions (no longer
the nightly training runner; still CI and the synthetic pipeline), [18] Drizzle (the ORM stands;
only `useLiveQuery` was replaced), [40] Maestro (§4.6 still names the flows), [42] [51] [58] [63]
the four products (D2 removes their prices and user counts, not the products).

**Kept without change:** [32] SASRec and [27] GRU4Rec are literature citations in §1.3.1, not
implementation tools — deleting [46] does not touch them.

#### (b) Add — arguments that currently cite nothing

Fully specifiable; insert and renumber:

| Argument                                          | Reference                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| arm A's EDF rule (item 22, §5.2.1)                | Liu C. L., Layland J. W. Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment. _Journal of the ACM_. 1973. Vol. 20, No. 1. P. 46–61.                                                                                 |
| arm A's list scheduling (item 22)                 | Graham R. L. Bounds for Certain Multiprocessing Anomalies. _Bell System Technical Journal_. 1966. Vol. 45, No. 9. P. 1563–1581.                                                                                                            |
| the blend's simplex projection (item 29, §2.x)    | Duchi J., Shalev-Shwartz S., Singer Y., Chandra T. Efficient Projections onto the ℓ₁-Ball for Learning in High Dimensions. _Proceedings of the 25th International Conference on Machine Learning (ICML 2008)_. Helsinki, 2008. P. 272–279. |
| the transfer analysis (items 34–35, §3.7)         | Guidelines 05/2021 on the Interplay between the application of Article 3 and the provisions on international transfers as per Chapter V of the GDPR. Version 2.0. European Data Protection Board, adopted 14 February 2023.                |
| the acceptability argument for NFR-P1 (item 51 c) | Nielsen J. _Usability Engineering_. San Francisco : Morgan Kaufmann, 1993. 362 p. (розділ про час відгуку: межі 0,1 / 1 / 10 с).                                                                                                           |
| chronotype by age, the student mix (grid §1)      | Roenneberg T., Kuehnle T., Juda M., Kantermann T., Allebrandt K., Gordijn M., Merrow M. Epidemiology of the human circadian clock. _Sleep Medicine Reviews_. 2007. Vol. 11, No. 6. P. 429–438.                                             |
| typical mobile latency (item 51)                  | Speedtest Global Index: Q4 2024. Ookla. URL: … (дата звернення: …).                                                                                                                                                                        |

Two need no new entry: the Ukrainian data-protection law is already **[4]** (cite Art. 29
explicitly in §3.7), and the rMEQ cut-offs are already **[11]**.

#### (c) **Cannot be produced from the repository — four blockers**

These are the reference-list equivalent of an unverifiable number, and they are listed separately
because three of them are load-bearing. The repository records the claim but not enough of the
source to cite it.

| What the text needs it for                                                                                                                                                                                                                                                                     | What the repo actually records                                                                                                                         | Consequence if it cannot be found                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The 2025 systematic review of synchrony effects.** Justifies §1.1's honest statement of the literature's strength («ефект синхронності ≈ у 45 % досліджень на дорослих, головний ефект хронотипу — менш ніж у 20 %») **and the whole s-range of the frozen grid** (`sensitivity-grid.md` §1) | «the 2025 synchrony-effect systematic review», «Chronobiology International, 65 studies» — no authors, no title, no volume, no pages                   | **The most serious of the four.** Without it §1.1's paragraph loses its source and must say the literature is mixed without quantifying it; and the grid's s-range stops being literature-derived and becomes a stated assumption. The grid is frozen, so this would be a dated erratum, not an edit |
| **The MEQ 28/52/20 worker split.** The «adult» class mix of the grid, and the «52 % проміжних, 28 % ранкових» in the abstract, §6.4 and ВИСНОВКИ                                                                                                                                               | «MEQ in a middle-aged worker sample (Horne–Östberg validation, cited in the MEQ literature)» — that is a description, not a citation                   | The mix must be attributed to a specific study or relabelled as an assumed distribution. The percentages are used in three chapters, so the relabelling would touch all three                                                                                                                        |
| **Senyk, Jankowski & Cholii (2022).** Додаток Д and §2.5 — why the rMEQ stays English                                                                                                                                                                                                          | authors, journal, volume 53(6), pages 878–896, year — **no title**                                                                                     | Cheapest to fix: the title is one lookup. Until then Додаток Д cannot carry a complete entry                                                                                                                                                                                                         |
| **Opensignal weak-cell and 3G latency.** The NFR-P1 derivation's network component (item 51)                                                                                                                                                                                                   | «Opensignal country reports, 2018», already labelled in item 51 as conservative estimates from older public measurements that «could not be retrieved» | Least serious, because item 51 already states the limitation. Either cite a specific retrievable report or keep the figures as explicitly stated estimates with no citation — which is what the text already does                                                                                    |

**⛔ For the owner: the first two need a decision or a lookup before §1.1, §6.4, the abstract and
ВИСНОВКИ can be frozen.** The honest fallback, if neither source can be produced, is to demote both
from «літературa показує» to «припущення, зафіксоване в моделі світу» — which the sensitivity study
survives (its whole point is that the world is an object of study, and s is swept from 0 to 2), but
which weakens §1.1's argument for learning per person, because that argument leans on the
literature being mixed.

## 13. The four sources — does the draft have a home for each?

### 13.1 `docs/study/` — **yes, but the chapter must be rebuilt**

Home: Розділ 5 (method) + the new Розділ 6 (results), §9 above. This is the evaluation chapter's
material and there is no other. Four things it supplies that the draft has nowhere to put today:
the **world model stated explicitly** (what is assumed about people, where each range comes from,
what the model cannot represent), the **prediction-by-prediction comparison** including the misses,
the **75-cell table**, and the **recomputed sample size**. Two of them need appendices (Додаток З,
Додаток И — §10.7).

The order in §9.2 is not cosmetic: E1 licenses every later estimate, so it comes first; the world
grid must come after E3, because its central point is that E3's numbers were properties of one
world; sample size follows the effect, not the other way round.

### 13.2 `docs/verification/` — **no home exists; §6.6 is new**

Seven days of notes across two hardware passes, plus a dialog pass, a motion pass and a simulator
i18n sweep. The draft has §4.6 «Забезпечення якості» — a page about CI gates — and nothing else.
Item 62 supplies the section as an argument; §11.3 lists the four places it overstates.

**What the notes add beyond item 62** is in §12.2: U23–U40. The ones that change what the chapter
says rather than adding a paragraph: **U24** (the instrument was validated first and one build's
results were withdrawn), **U25** (a green accessibility result measured the wrong OS switch and was
voided), **U26** (the two platforms' cold-start numbers measure different intervals), **U34**
(a review found the defect class and the same class shipped anyway), and **U23** (the plan budget
was over-subscribed by construction — this one belongs in §2.4, not in §6.6).

### 13.3 `docs/decisions/` — **partly; four ADRs need text, the rest need a footnote or nothing**

The ADRs carry the alternatives considered and rejected, which is exactly what a committee asks.
Ranked by the question each one answers:

| ADR                               | The committee question it answers                                                                                                                                   | Where it goes                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **0011** cross-border transfers   | «Контролер в Україні, дані в ЄС — чи є тут передавання і на якій підставі?» The naive answer is wrong under EDPB 05/2021 Example 10                                 | §3.7 (§7 above writes it), §5.2 |
| **0008** arm A + eligibility      | «Чим ваше контрольне плече чесне, чи засліплений учасник і скільки рандомізованих рішень ви насправді збираєте?»                                                    | §5.2, §5.4, §2.3                |
| **0015** training + OPE           | «Чому вашим офлайн-оцінкам можна вірити?» — the estimator family, the ESS non-evidence rule, the features DR deliberately excludes, the MC-propensity approximation | §2.6, §4.5, §6.1                |
| **0018** solver stopping          | «У вас ліміт 1,5 с — скільки оптимальності ви віддаєте?» Answer: a proof, not a solution — ≤ 0,3 % objective                                                        | §2.4 (§6 above writes it), §4.4 |
| **0005** cold-start instantiation | «Звідки числа приорів і що робити з наполовину заповненим опитувальником?» Refusing to invent a prorating rule for a published instrument                           | §2.5                            |
| **0020** local pre-registration   | «Це було зареєстровано, і що саме ви оцінили?»                                                                                                                      | §5.1, §5.3, ВИСНОВКИ            |
| **0007** service + exact ε        | «Чи справді ваше пропенсіті точне, і чи розв'язується модель на заявленому залізі?»                                                                                 | §2.2–§2.4, §4.4                 |
| **0009** hosting                  | The literal «чому не X?» — eight alternatives against four constraints, including why a WASM/Deno re-encoding was rejected as a **method** change                   | §3.3, §4.4, §1.5                |
| 0013 trust surfaces               | «Користувач каже моделі, що вона помиляється — що відбувається і наскільки це важить?»                                                                              | §2.7, §3.8                      |
| 0010 feedback loop                | «Як ви уникаєте вгадування винагороди, коли факти неоднозначні?»                                                                                                    | §2.7                            |
| 0012 sync                         | «Що коли зовнішній календар і офлайновий пристрій розходяться?»                                                                                                     | §3.6                            |
| 0023 localisation                 | «Чому опитувальник хронотипу не мовою учасників?»                                                                                                                   | §2.5, Додаток Д, §5.6           |
| 0016, 0019, 0021, 0022, 0014      | one sentence each, where the corrections already place them                                                                                                         | §3.7, §3.9, §3.8                |
| 0001–0004, 0006, 0017             | engineering housekeeping — the versions appendix at most                                                                                                            | —                               |

**One structural recommendation:** the rejected alternatives are the most valuable and the most
scattered part of the repository. Rather than folding them one by one into prose, give §3.3 a
short table «Розглянуті й відхилені альтернативи» with four or five rows (hosting, the WASM
solver port, the strict eligibility rule, the sham experiment badges, e-mail confirmation of
erasure), each with the reason for rejection in one clause. A committee reads that table and stops
asking.

**Also from `revisit.md`:** several open items are now **permanent stated limitations**, not future
work, because the "first real data" review they were deferred to will never happen (ADR-0020).
Name them as such in §6.7: the λ_f = 0,5 fragmentation penalty retune, second-move semantics, the
per-arm solidity comparison, and the trade-off-sheet asymmetry (U14).

### 13.4 `docs/thesis/spec-conflicts.md` — **no home, and it deserves its own subsection (U19)**

Today the errata layer is scattered across the corrections: M8 lands in §2.4, H4 in §3.3, M13 in
§2.6, H6/H7 in §1 and §6, L39/L41 in §3.8. Each lands correctly, and the **story disappears**: that
the specification set was a set of generated assumptions, that measurement contradicted it in a
dozen places, and that the specifications were rewritten on the evidence rather than the evidence
being trimmed to fit.

That story is a contribution, and it is the one the draft's own design-science framing (Hevner
[26]) predicts: the artefact tests its specification. Give it **§6.8, one page and one table**:

> «Специфікації системи (файли 01–06) є **згенерованими припущеннями, а не вихідними даними**. У
> ході реалізації дванадцять із них було перевірено вимірюванням, і там, де вимірювання
> суперечило специфікації, переписували специфікацію, а не результат. Нижче — ці випадки, кожен із
> вимірюванням, яке його вирішило, і наслідком для системи.»

| Припущення специфікації                                  | Що показало вимірювання                                                               | Наслідок                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Тижнева задача ≈ 1,5·10⁴ літералів — «мала для CP-SAT»   | presolve-зв'язана, UNKNOWN у межах ліміту, пошук не починався                         | зондування вимкнено; поріг 3·10³ на машині розгортання                                 |
| Підказка попереднього плану сама запобігає «трясінню»    | підказка не зберігає порядок за однакової цілі                                        | явний бонус стабільності 1·10⁻⁴                                                        |
| Один експеримент на день за суворим правилом придатності | на звичайному дні всі задачі ≥ 60 хв неприйнятні                                      | \|A_m(x)\| ∈ {2, 3, 4}, p = ε/\|A_m(x)\|; ≈ 4,3 експерименти на користувача за тиждень |
| Незважений replay незміщений на зрізі                    | зміщений на −0,6 / +0,7 в. п. за змінного \|A_m(x)\|                                  | зважений replay = SNIPS; File 04 §2.2 переписано                                       |
| N = 30 за ефекту +8 в. п.                                | ефект — властивість світу; N₈₀ 21 … понад 120                                         | N іде за пілотною оцінкою розкиду                                                      |
| Безоплатний Docker-тариф із хостингом у ЄС               | тариф скасовано; безоплатний і PRO працюють лише в США                                | самостійне розгортання в ЄС; NFR-S2 стало істинним                                     |
| «Контролер в Україні, дані в ЄС — передавання немає»     | EDPB 05/2021, приклад 10: експорт обробника контролеру в третій країні є передаванням | обробка й навчання в ЄС; лише агрегати                                                 |
| «Усі кольорові пари відповідають WCAG AA»                | акценти як текст 2,06–3,60:1                                                          | акценти — лише заливки; окремий токен `danger-text`                                    |
| «Пружинні переходи ≤ 250 мс»                             | у застосунку не було **жодного** переходу                                             | три поверхні за одним критерієм; решта — миттєві навмисно                              |
| «chrono-node лише англійська»                            | `chrono.uk` є в повній підтримці версії 2.10.1                                        | FR-11 двомовний; обмеження знято                                                       |
| NFR-P1 ≤ 2,5 с (оцінка до розгортання)                   | 3,7–4,1 с p95 на еталонному пристрої; дві третини — серверна частка                   | вимогу виведено з вимірювання: ≤ 6,0 с                                                 |
| Хронотип як механізм переваги                            | у світі приору — нічия; виграш дає індивідуальне відхилення                           | механізм переформульовано (§3.1, §3.4 цього документа)                                 |

---

## 14. Order of work

Step 1 is done: **six chapters** (§1). The spine below — steps 1–4 — is decision-free; every open
decision sits in step 5 and later, which is why the back matter is written last.

1. **§3 first, not last.** The four full-strength statements set the tone of Розділ 1, Розділ 6 and
   ВИСНОВКИ; writing them after the surrounding prose invites hedging them back. No open decisions.
2. **Розділ 6**, in the order of §9.2 — the largest new material, and it fixes the vocabulary the
   other chapters must use. No open decisions; §6.6 needs the 583/191 recount only at step 6.
3. **Розділ 5**, rewritten around §5.1's boundary paragraph, with item 21 opening §5.4. No open
   decisions.
4. **Розділ 2–4 edits** — mechanical once §2.3, §2.4, §2.6.2, §4.5 and §4.6 are done. No open
   decisions, but §4.6's forward reference to §6.6 needs Розділ 6 to exist first.
5. **Розділ 1 §1.1, §1.4–§1.5 and §1.6** — depends on Розділ 6's numbers, and on **D2** (the
   competitor figures) and **D3** (the unsourced «2–3 години»).
6. **Анотація and ВИСНОВКИ** — they summarise numbers that are only final after step 2, and they
   depend on **D1** (a fifth novelty item) and **D6** (the test counts).
7. **Appendices** — Додаток В, Г, Д, Е, Ж plus the two new ones; depends on **D5** (Додаток Г's
   approach) and **D8** (whether Додаток З carries all 75 cells).
8. **Reference list, then the ВСТУП's structure sentence** — the list renumbers every citation in
   the draft, so it is genuinely last; depends on **D4** (the orphaned sources).

### Decisions D1–D8 — DECIDED by the owner, 2026-09-09

| ID     | The call                                                                  | Decision                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | A fifth наукова новизна item for the sensitivity study + pre-registration | **Yes.** Text is written in §4.3 (c); it is the main quantitative contribution and appeared in no novelty item                                                                                                                                                                    |
| **D2** | §1.2's undated competitor figures                                         | **Drop them.** Compare on mechanism; табл. 1.1's price row goes with them                                                                                                                                                                                                         |
| **D3** | ВСТУП's «втрати двох-трьох продуктивних годин на день»                    | **Delete.** §4.3 (a) rewrites the paragraph to read better without a number                                                                                                                                                                                                       |
| **D4** | The five orphaned sources                                                 | **Keep [44] ONNX and [46] PyTorch** on the on-device перспективи sentence; **delete [30] HF and [56] MiniLM**; keep [40] Maestro (§4.6 names it)                                                                                                                                  |
| **D5** | Додаток Г — real schema or illustrative label                             | **Real schema.** Owner's push-back accepted: the cost was measured at ≈ 20 min (22 base columns + 4 added by ALTER, no drops, three CHECKs, one grants block), not an hour — written as `text/dodatok-g.md`. «Ілюстративний» would only invite the question of why it is not real |
| **D6** | The 583/191 test counts                                                   | **Re-run the gates and paste the output** at freeze time; until then §6.6 says «автоматизовані набори» without the pair                                                                                                                                                           |
| **D7** | ВСТУП «Апробація» / «Публікації»                                          | **Owner's own.** No conference, no publications — both stay minimal                                                                                                                                                                                                               |
| **D8** | Додаток З scope                                                           | **All 75 cells.** The claim is "every cell reported, including losses and ties"                                                                                                                                                                                                   |

**Progress:** steps 1–8 are done — the writing is complete. §3's four statements; `text/rozdil-6.md`; `text/rozdil-5.md`;
D5 as `text/dodatok-g.md`; and the Розділ 2–4 edits, which are anchored fragments and stay in this
file (§6, §7, §8) — every constant they quote is now verified against the code that defines it
(§2.0), and every study-derived number in §2.1 against the results JSON by
`docs/thesis/verify-numbers.py` — which now runs in CI as the `thesis-numbers` job, so a drifted
number fails the build. Step 5: Розділ 1's §1.4 argument rebuilt (§5 of this file), §1.1/§1.5/§1.6
edits in place. Step 6: `text/anotaciya-ta-vysnovky.md`. Step 7: `text/dodatok-z.md` (generated, CI-checked) and
`text/dodatok-y.md`, with §10.7a deciding which appendices are printed and which become repository
pointers. Step 8: the reference list audited (§12.3) — four entries deleted, seven added, and **four
citations that cannot be produced from the repository, two of them load-bearing**. The assembly
order for the .docx is `docs/thesis/ASSEMBLY.md`: thirty steps in document order.

### Sanity checks before freeze

- Grep the draft for: «Jest 30», «ESLint 9», «Inter Variable», «Hugging Face», «bandit_cpsat»,
  «HF Hub», «onnxruntime», «SASRec», «useLiveQuery», «перетягування», «анонімізований датасет»,
  «підтвердженням листом», «4·10⁴», «10 тис. MAU», «2,5 с», «1 слот на день», «0.25» as _the_
  propensity — each must be gone or qualified.
- Grep for «не проводилося», «не виконано», «no study was conducted» — the standing phrase is
  «польове дослідження — поза межами роботи; оцінювання виконано в симуляції».
- Grep for «енергетичні ритми», «хронотип» as the mechanism, «виграє категорично», «з кожним
  тижнем» — each must carry the §3.1–§3.4 wording or be gone.
- Every performance number in the text has a device, a build or a box, a date and a series size in
  the same sentence (§2.1). No simulator number stands against a device-conditioned requirement.
- The four statements of §3 read at full strength; none of the §3.5 hedges appears.
- Every «підтверджено» next to a prediction matches the verdict table (E1 8/1/0, E2 6/0/1,
  E3 3/5/1, S1–S12 2/5/5).
- The 75-cell appendix, the pre-registration appendix and the reference list are regenerated last.
