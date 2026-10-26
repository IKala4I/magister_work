# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-10-26 — **post-p12/four-chapters** (section right below): four chapters, 74 body pages. Before it, 2026-10-13 — **post-p12/metodychka-2026** (PR #88; section right below): the thesis
> follows the department's 2026 guideline. Expo's patch drift went in first as PR #89.
> Before it, 2026-09-29 — **post-p12/thesis-private-docs**: schema names in the text, 3.2 in,
> private data in MagisterDocs (below). Before it, **post-p12/thesis-figures**: the figures render
> in the pipeline and a PDF builds; the figures pass's own waiting items are superseded. Before
> that, 2026-09-28 — **post-p12/docx-pipeline**: the formatter's `full.md` → `.docx` pipeline is in
> the repo (`docs/thesis/docx-pipeline/`), §6.6's opening is fixed at the source, and the three
> pipeline mismatches found on the way are fixed on the owner's decision; Expo's patch drift went in
> first as PR #82. Nothing waited on the owner then. Earlier: the submission report and the
> formatter's second patch set (PR #80), the business-style pass (PR #78), the nine number decisions
> (PR #79), and the corrections rollup (2026-09-09), which is no longer an index: all 63 items carry
> the Ukrainian sentences the draft should read, tagged Ф / П / С, every number with its measurement
> condition. **The thesis text is assembled and green on every gate.**

## IN PROGRESS (2026-10-26) — post-p12/second-wave: «магістерська, а не стаття»

Owner-approved plan: `/Users/vladyslav/.claude/plans/pasted-content-id-bd21-plan-mode-soft-blum.md`
(copy of its decisions below once done). Branch `post-p12/second-wave`. Owner decisions: arm-A wording
carries both facts (protocol arm = deadline/priority/earliest-slot rule class of Motion/Reclaim by
their public descriptions; in the simulated worlds tasks are identical, so it reduces to
earliest-free-slot; the products themselves were never compared); body floor stays 60 pages;
реферат/ABSTRACT — only the competitor sentence is realigned.

Done: (1) pipeline typography + table keep/margin (`0f2f0b5`); (2) inline math `$…$` (`f860ad1`:
build sets Latin single letters italic, Greek upright, real sub/sup; verify has its own `$…$` rule
and a self-test mutation; audit skips `$…$`; formula (4.1) for the world model already in place,
so formulas are 21 until step 6 cuts them to 10). Body after (2): 77 PDF pages (4/10/16/18/26/3) —
the table margin and (4.1) added three. regress.py vs golden on the golden's own source: 312
differences, all typography only (closes steps 1–3). (4) ВСТУП 4 → 3 pages, novelty 5 → 3 points,
реферат/ABSTRACT competitor sentence carries both arm-A facts, new placeholder
`[обсяг основного тексту]` (build `--body-pages`, `layout.py body --total`, run_all fixed point,
verify.py + verify-guideline own checks; ВСТУП no longer states figures/tables/formulas). (5)
Розділ 1 10 → 8 pages (≈ 7 of text; p. 16 half white under табл. 1.1): 1.3 compressed with every
source kept (41 cited in ch. 1), 1.5 «Постановка задачі» without ДП1–ДП4, arm-A sentence in 1.2.
(6) Розділ 2 16 → 12 pages (pages full; plan guessed ≈ 9.5): formulas 21 → 10 (2.1–2.9 + 4.1,
registry rewritten, FORMULA_SPLIT empty), tables 29 → 26 (2.2, 2.5, 2.6 out; 2.3 → 2.2, 2.4 → 2.3
everywhere), API names out, ДП2 out; the 3.6 paragraph restating the CP-SAT build went here (it
cited old (2.5)). Body 69. (7) Розділ 3 18 → 16: MoSCoW → обов’язкова/бажана, stack as a plain
list, legal text one paragraph, solver parameters one paragraph (1,5 с, 1003 → 400 мс, 20/20
OPTIMAL, the 60 % weekly limitation kept), contrast via додаток И; fig. 3.1 source loses the hook.
Brief rows for four strings that no longer exist anywhere were removed. Body 68. (8) Chapter 4 /
ВИСНОВКИ light pass: arm-A wording with both facts in табл. 4.1, 4.6.1, 4.10.1, ВИСНОВКИ 7 (and
реферат, 1.2 earlier — all «якими Motion і Reclaim.ai описують себе»); SkedPal sentence in
4.10.1; plain openings of 4.4 and 4.6.1; ВИСНОВКИ 3–4 without ±0,4 and −0,6/+0,7. Body 70 (two
widow pages of two lines each, end of 4.11 and of ВИСНОВКИ). Next: abbreviations, sources, counts →
docs → adversarial review → PR. Removed numbers so far — ВСТУП: 29/64, 45 %, 18–45,
80 %/65, 21–120+, 48/75, 172, 0,7, 30 %, ±0,4; розділ 1: ±0,4 (табл. 1.1 cell), 0,3–1,4,
0,03–17, ≈ 0–4, 19–34 дол. (prose only; table keeps it), 30 млн. Baseline `full.md`
for the no-number-changed diff: `git show 2427b15:docs/thesis/text/full.md` (token diff: numbers
only, `$…$` and Unicode subscripts normalised before comparing).

## Current state (2026-10-26) — post-p12/four-chapters: four chapters, 74 body pages

The owner approved a plan (2026-10-26) and decided the blocks to remove along the way. Done and
green on every gate:

- **`text/full.md` is the thesis's only source.** `assemble.py`, `verify-payloads.py` and the chapter
  files left the tree; `corrections-rollup.md` and `ASSEMBLY.md` are frozen records. Edit `full.md`
  directly. `gen-dodatok-k.py --check` compares Додаток К's rows in `full.md` with the run;
  `verify-state.py` pins the single-source claims; `verify-guideline.py` also checks that every
  «підрозділ / пункт / розділ N» names an existing heading (18 negative controls).
- **Four chapters** (guideline p. 15): Системний аналіз · Моделювання системи (математична модель) ·
  Розробка системи Hourwell (old 3 + 4) · Результати дослідження (old 5 + 6). Body (ВСТУП →
  ВИСНОВКИ) **74 PDF pages** (ВСТУП 4, 9 / 15 / 18 / 25, ВИСНОВКИ 3; was 119), owner's limit ≤ 75 with
  margin for рис. 3.4 screenshots, «Апробація» and Word drift. `layout.py body` prints it in every build.
- Removed as blocks (owner): old 1.5 + табл. 1.3; лістинги 3.1–3.2; табл. 3.3 → a paragraph with the
  same sources; табл. 4.2 (secondary metrics); E2 (old 4.5, табл. 4.4) folded into 4.2; the
  hardware-pass chronicle (4.8 keeps табл. 4.6 and four findings). Everything else is repetition and
  recap. Tables 29, figures 7 (рис. 4.1 → 3.4; `MagisterDocs/figures/3.4`), formulas 20, sources 71
  (all cited; [61] only in дод. А, as before). Estimator table is now 4.2, grid table 4.4.
- No number changed: a token diff of the body against the pre-cut text finds none new. A
  fresh-context adversarial review found one blocker (an H1/H4 sentence that had lost «а не про
  людей») and six should-fix items — all fixed in `97f3e5c`.
- **Theme of the order** in `MagisterDocs/private/titulka.json` (`тема`, `тема_англійською`);
  `full.md` carries placeholders; title page, реферат, ABSTRACT, завдання get it from the pipeline.
  Conference theses keep their own title (owner). Supervisor, order number and the deans' degrees are
  recorded there and in `kartka.json` / `zavdannia.json` / `make_tezy.py`.
- Golden refreshed in `MagisterDocs/golden` (120 PDF pages = card + 119 numbered).

**Waiting on the owner:** student's name (three forms) in `titulka.json`, the card's name in the
genitive; screenshots for рис. 3.4; the AI-use declaration; open `hourwell.docx` in Word once;
«Апробація» after 10–11 November (wording in `MagisterDocs/conference/aprobatsiia.md`; in `full.md`
it now goes in directly — there is no assembler any more); supervisor questions 23–24 in
`MagisterDocs/pytannia-do-kerivnyka.md` (`.docx` copy not regenerated).

**Next session reads:** this section; `docs/thesis/text/README.md`; `docs/thesis/docx-pipeline/README.md`.

## Current state (2026-10-13) — post-p12/metodychka-2026: the department guideline (PR #88)

The department's 2026 guideline for master's theses appeared (54-page PDF in
`MagisterDocs/sources/`, **never copied into the repo, extracts included**; printed page = PDF page
− 1). The thesis was checked against it and the owner decided, 2026-10-13:

1. **Formatting follows the guideline, not ДСТУ 3008** — chapter heading «РОЗДІЛ 1» with the title
   on the next line; пункт headings run-in, spaced, with a full stop; 6–9 mm between a heading and
   text; captions «Рис. 1.1 Назва» and «Таблиця 1.1» (right) + title (centred); a free line above
   and below each formula, one symbol per line after «де»; «Продовження таблиці N»; appendix
   heading «Додаток А» right + title centred; appendix letters without Г and З. The ВСТУП sentence
   that names ДСТУ 3008 changes with it.
2. **Order of parts and the title page per the guideline's Додаток В**; завдання and картка are
   private parts in MagisterDocs that the pipeline puts in their places; the реферат goes out of
   the bound document (it is enclosed in an envelope).
3. Кафедра інженерії програмного забезпечення; спеціальність F2 «Інженерія програмного
   забезпечення» — into `titulka.json`; the old department name must remain nowhere.
4. Реферат: counts of pages, figures, tables, appendices, sources; names the об'єкт and the мета;
   stays within 3 pages; **no limitation statement is removed**.
5. Fix: ВСТУП «Структура» (pages, sources, appendices, chapters with a short description), every
   table referenced in the text, every appendix table numbered and titled, appendices in the order
   they are referenced, 66 → 71 sources.
6. Six chapters stay. 7. No department publications are added. 8. The AI-use declaration is the
   owner's own document — not written here.
7. **«Апробація»: wording prepared, NOT inserted** — the conference is 10–11 November 2026 (ІТЕТО,
   ФІТ НУБіП); it goes into the text only after it has happened.
8. **Conference theses** (deadline 8 November): requirements and sections from the invitation in
   `MagisterDocs/sources/`; numbers only from `full.md` with their conditions; the .docx goes to
   MagisterDocs, never into the repo.
9. A short list of decisions to check with the supervisor later — a file in MagisterDocs.
10. At the end: rebuild and repeat the compliance check with the same table.

Owner's working rule for this pass: **commit after every finished item**, this section refreshed
after the first commit.

**Appendix letters — the mapping this pass applies** (order = order of first reference in the
text, letters without Г, Ґ, Є, З, І, Ї, Й, О, Ч, Ь):

| Was | Becomes | Appendix                                | First referenced in |
| --- | ------- | --------------------------------------- | ------------------- |
| Д   | А       | rMEQ questionnaire                      | 2.5.1               |
| Е   | Б       | traceability matrix (табл. Е.1 → Б.1)   | 3.1                 |
| Г   | В       | SQL fragment (Г.1–Г.3 → В.1–В.3)        | 3.4                 |
| Ж   | Д       | `POST /plan` response                   | 3.5                 |
| А   | Е       | UC-04 sequence (рис. А.1 → Е.1)         | 3.6                 |
| Б   | Ж       | sync sequence (рис. Б.1 → Ж.1)          | 3.6                 |
| В   | И       | colour tokens (табл. В.1 → И.1)         | 3.8                 |
| З   | К       | grid of worlds (З.1–З.7 → К.1–К.7)      | 5.5.2               |
| И   | Л       | registered predictions (И.1–И.7 → Л.1…) | 6.1                 |

Old and new letter sets overlap, so «no old letter left» cannot be a grep: each reference is
checked against the title of the appendix it now points to.

**Done (committed on the branch):**

- ВСТУП counts its own list (71) and Maestro [43] is cited (`assemble.py`).
- Appendices reordered and relettered (table above; `APPENDICES`, `reorder_appendices`,
  `reference_appendices`), files renamed, ten appendix tables numbered and titled, references to
  tables 6.1–6.5 / Б.1 / И.1 and to six figures added (`reference_figures` — the first compliance
  table wrongly said all seven figures were referenced; only 3.1 was). `verify-guideline.py` in CI
  with ten negative controls. `run_all.sh` green, PDF 163 pages.

- The guideline's layout: `assemble.py` writes the forms (`guideline_forms`: `# РОЗДІЛ 1 НАЗВА`,
  `## Додаток А Назва`, `Рис. N Назва`, `Таблиця N` + title as two paragraphs; `split_legends`),
  `build.py` lays them out (chapter title on a new line, 18 pt under subsection headings, пункт
  headings spaced and run in, captions, free lines round formulas, appendix heading in two
  paragraphs, перелік in two columns), `verify.py` check 9 measures it in the .docx (9 negative
  controls, `--self-test`, in `run_all.sh`). PDF 164 pages. **Gotchas:** пункт and appendix
  headings are not Heading paragraphs — they reach the contents page through `TC` fields at level 2
  (LibreOffice 26.8.0 puts a TC entry one level lower than Word; `\l 3` vanishes from the PDF);
  Word's style separator renders broken in LibreOffice for headings longer than a line. **Word is
  not installed here — nothing of this was seen in Word.**

- Front matter per the guideline: `assemble.py` (`title_page`, `referat`, `structure_paragraph`,
  `count_items`); `build.py` (`build_title`, `emit_private_part` for
  `MagisterDocs/private/kartka.json` + `zavdannia.json`, an unnumbered front section, the numbered
  section starting at 3, `build_referat` → `build/referat.docx`); `layout.py` (pdfplumber) reads
  the page count back and `run_all.sh` rebuilds with `--pages` until it stops changing — 161 pages;
  реферат 3 + 2 pages. `titulka.json` has new keys (README in MagisterDocs); the student's and the
  supervisor's names are empty — the owner fills them. **Gotchas:** python-docx's `add_section`
  copies the previous `sectPr`, including `pgNumType` — remove it or every later section restarts
  numbering (check 9 caught a doubled `pgNumType`); keep-verbatim strings of the реферат are
  looked for in `referat.docx` too.

- «Продовження таблиці N»: `layout.py tables` (PDF → which rows on which page → `build/tables.json`
  plan), `build.py --splits`, the pass loop in `run_all.sh` (one boundary per chapter per pass; min
  two rows per part; rows `cantSplit`). 9 tables continue, 3 start on a new page; 5 passes ≈ 2 min;
  **165 pages**; `verify.py` re-joins the parts for the cell-by-cell check and check 9 covers the
  labels (12 controls). The first pass of each run is the negative control (13 crossings found).

- The nine terms of the ПЕРЕЛІК sorted alphabetically (`sort_terms`); `verify-guideline.py` has 15
  controls. Golden in MagisterDocs refreshed (the old one is not comparable: 482 intended diffs).
- In MagisterDocs, outside the repo: `conference/tezy-iteto-2026.docx` (exactly 2 pages, section 5,
  names are placeholders) + `make_tezy.py`; `conference/aprobatsiia.md` (two variants, **not
  inserted**); `pytannia-do-kerivnyka.md` (22 points); `private/kartka.json`, `zavdannia.json`.
- Final state: assemble 0 skipped / 0 drift; nine thesis checkers green; `run_all.sh` green —
  verify OK, layout self-test 12/12, **PDF 166 pages = card + 165 numbered**, реферат 3 + 2 pages;
  `pnpm typecheck / lint / format:check / test` green (2026-10-13).

**Merged:** PR #88, after PR #89 (ten Expo SDK 57 patch releases — expo-doctor had turned red on
upstream publications alone; the usual separate bump). CI's database job failed twice on the image
registry's rate limit (`toomanyrequests` pulling `postgres-meta`) and passed on a rerun — a rerun is
the fix, nothing in the repo.

**After the merge, same day:** the owner decided the one open point — (2.4), (2.7), (2.17) end in a
comma (`FORMULA_COMMAS` in `assemble.py` + `formulas.py`; `verify.py` compares the closing
punctuation; `verify-guideline.py` has 16 controls). 165 pages, unchanged; golden refreshed.

**Waiting on the owner:**

- names in `MagisterDocs/private/titulka.json` (the student's three forms, the supervisor and the
  supervisor's degree) and in the theses (`conference/make_tezy.py`: `SUPERVISOR`; the author comes
  from `titulka.json`); the dean, the head of the department and the guarantor were filled from the
  guideline's sample — to be confirmed;
- the картка (name in the genitive, order number and date), the завдання (a form with blanks now),
  4.1's screenshots, the AI-use declaration (the owner's own document);
- open `hourwell.docx` in Word (never seen there): contents (Ctrl+A, F9), the run-in пункт
  headings, the nine tables with «Продовження таблиці»;
- after 10–11 November 2026: «Апробація результатів» goes into ВСТУП — wording in
  `MagisterDocs/conference/aprobatsiia.md`; in `assemble.py` the `para_delete` of the draft's
  placeholder becomes a `para_replace`, and `verify-guideline.py` should then require the element.

**Next session reads:** this section; `docs/thesis/docx-pipeline/README.md` («Верстка», «Складання
йде в кілька проходів», «Приватні частини»); `docs/thesis/ASSEMBLY.md`, «What the 2026-10-13 pass
changed»; `MagisterDocs/README.md`.

**Resume:** `git log --oneline main..HEAD` shows what landed; the checks are
`python3 docs/thesis/assemble.py --draft …/MagisterDocs/sources/draft.docx`, the seven CI thesis
checkers, and `./run_all.sh` in `docs/thesis/docx-pipeline/`.

## Earlier state (2026-09-29) — post-p12/thesis-private-docs

**Done and green.** The text names the schema's tables (`bandit_state` + `beta_cells` +
`blend_state`, `profiles`; assemble.py run_subs, the rollup's А.1 payload, the А.1 participant,
specs/05–07 with spec-conflicts L44); Рисунок 3.2 redrawn in PlantUML and inserted (portrait, 10.4
pt). **Private data and outputs live in `/Users/vladyslav/Workspace/MagisterDocs`** (README there):
`private/titulka.json` (names; `build.py --private`; `verify.py` check 8 fails on a full value or a
surname in any case in `full.md` and on a filled value without its placeholder; CI's `verify-docx`
requires the five placeholders), `sources/draft.docx` (`assemble.py --draft PATH`, required),
`figures/4.1/`, `build/` (.docx, PDF), `golden/`. Build:
`./run_all.sh ../text/full.md ../formatter-brief.md /Users/vladyslav/Workspace/MagisterDocs` from
`docs/thesis/docx-pipeline/` — 6 figures, PDF 162 pages; it refuses a folder inside the repo.

**Waiting on the owner:** fill `MagisterDocs/private/titulka.json`; put 4.1's screenshots in
`MagisterDocs/figures/4.1/`. «Апробація» / «Публікації» are dropped from ВСТУП (optional, none;
2026-09-30, `para_delete` in `assemble.py`). 1.1 stays five points (owner, 2026-09-29).

**Gotchas:** never write names into the draft (its text flows into the public `full.md`); the old
table names remain on purpose in `assemble.py` (they match the draft) and in the change records.

## Earlier state (2026-09-29) — post-p12/thesis-figures

**Done and green.** `run_all.sh` renders the figures from `docs/thesis/text/diagrams/`
(`render_figures.py`, `figures.json`; ≥ 8 pt gate), builds, verifies (check 7: every image by
SHA-256), and makes the PDF (`make_pdf.py`: pinned LibreOffice 26.8.0 in `render/.tools`, contents
page built by a macro) — 162 pages, ≈ 15 s; every appendix from a new page. In the document: 1.1
(10.0 pt), 3.1 (PlantUML, 8.7 pt), 3.3 (PlantUML, landscape, 8.1 pt), А.1 (4 sheets) and Б.1 (3
sheets), 8.5 pt at the smallest. The golden (`docx-pipeline/golden/`) keeps its renders in
`golden/figures`. `ASSEMBLY.md`, 2026-09-29, has everything; tools and pins in `docs/versions.md`.

**Waiting on the owner:** superseded by the private-docs pass above.

**Gotchas:** puppeteer finds `.puppeteerrc.cjs` only from its working directory (mmdc runs with
`cwd=render/`); PlantUML crops images wider than 4096 px unless `-DPLANTUML_LIMIT_SIZE` is raised;
Mermaid ignores a frame's `direction` when arrows cross into it; Mermaid draws sequence step numbers
at a fixed 12 px (overridden in `render/mermaid.css`; the gate measures the SVG, so a new hard-coded
size fails loudly); python-docx's `add_section` adds an empty break paragraph (`build.py` moves the
break into the neighbouring paragraph); a headless LibreOffice macro that
errors hangs on an invisible dialog (the macro terminates itself); LibreOffice's bundled Python is
killed on this machine (exit 137), so the PDF step uses Basic.

## Current state (2026-09-28) — post-p12/docx-pipeline

**Done and green on every gate.** The formatter's pipeline (it had lived only in a chat sandbox) is
committed in `docs/thesis/docx-pipeline/`; its `README.md` is the manual. Run from that directory:
`./run_all.sh ../text/full.md ../formatter-brief.md out/` — needs Python ≥ 3.10 with `python-docx`
and `lxml`, `pandoc` and `unzip`; LibreOffice only for the PDF. Proven from a fresh copy, another
working directory and `env -i`. The formatter's §6.6 hunk («серед знахідок … виокремлюються шість
класів») is in `rozdil-6.md`; the patch file is deleted.

**Three pipeline mismatches, found on the way and fixed on the owner's decision** (each its own
commit, each shown on the golden as exactly its own change; `ASSEMBLY.md` 2026-09-28 has the
evidence): the decimal comma skips section columns (табл. Е.1's `3.7`) and `verify.py` now checks
from the raw source with its own admissibility rules; the legend check reads «–» and runs a
negative control on every call; fenced code keeps its blank lines and `verify.py` compares code
blocks line by line. The registry's Додаток Г insert carries the source's current wording. Expo's
SDK 57 patch drift, the only red CI check on PR #81, was fixed first in its own PR (#82).

**The regression golden is local and git-ignored, refreshed after the fixes:**
`docs/thesis/docx-pipeline/golden/` holds `hourwell.docx`, the exact `full.md` and
`formatter-brief.md` it was built from, `report.json` and `SOURCE.txt`. A fresh clone does not have
it; rebuild it from `full.md` blob `858654e8` with the pipeline as merged (the last commit touching
`docs/thesis/docx-pipeline/build.py`). Before changing any pipeline code: build `golden/full.md`
with the new code and run `regress.py golden/hourwell.docx <new>`; every difference it shows is
either intended or a bug.

**The pipeline runs in its own uv environment** (`docs/thesis/docx-pipeline/pyproject.toml`,
`uv.lock`, uv-managed Python 3.12 only, python-docx 1.2.0 and lxml 6.1.1 pinned exactly):
`run_all.sh` runs every step through `uv run --locked` and prints the Python, package and pandoc
versions first. From the system it needs only `uv`, `pandoc` and `unzip`. The owner removed
Anaconda on 2026-09-28 (pandoc went with it) and reinstalled pandoc with Homebrew: 3.11 reproduces
the golden part-for-part identical, as did 3.8 and 3.8.2.1 — after any pandoc upgrade, run
`regress.py` against the golden before trusting a build.

**Waiting on the owner — nothing.** Gates: assemble `untouched_drift 0`, no SKIPPED; verify-numbers
144/0; verify-payloads 67/67 + 12/12; verify-brief 46/0; verify-state 14/0; verify-style 0;
verify-docx on `full.md` 63/0; gen-dodatok-z --check ok; format:check clean; `run_all.sh` exit 0
(Python 3.12.14 via uv, pandoc 3.11; `verify.py` OK: 33 tables with 0 cells differing, 6 code
blocks with 0 differences; legend check 1 legend, negative control 1 of 1; markup audit 40
candidates, 2 high — both the known `clip[0,1](` false positive). Two fresh-context adversarial
passes; the second's findings (a false blank-line path, two latent `verify.py` holes) are fixed.

## Earlier state (2026-09-15) — post-p12/submission-report

**Done and green on every gate.** The owner read the pages and sent a six-item submission report
(items 1–2 were already in the source); items 3–8 are applied at the sources — placement and order
only, no claim changed: the strongest sentence of the work moved from §1.4 to §1.6 with one sentence
on the reproducibility package and one closing sentence on the evaluation boundary; §6.6 titled by
its result and opening with табл. 6.6 (6.6.4–6.6.6 → 6.6.3–6.6.5); §4.1's bilingual parser tied to
табл. 6.7; ВИСНОВКИ п.7 and §6.9 with the prior-world tie before the win count. The formatter's two patches
are merged at the sources and every hunk checked against the regenerated `full.md`
(`docs/thesis/plan-change-audit.md`, last section; `ASSEMBLY.md`, 2026-09-15 section).

**Found on the way, fixed:** the assembler placed a payload's extra paragraphs by a 60-character
text search, and two paragraphs approved for §1.4 had been landing in ВСТУП since PR #78 (the second
pass adapted them there). The placement stands as reviewed — now explicit as 4.3 (h) — and extra
paragraphs follow their head by position. Додаток Ж's JSON fence closed after the last assignment
object; it closes after the final brace.

**Waiting on the owner — nothing.** Gates: assemble `untouched_drift 0`, no SKIPPED; verify-numbers
144/0; verify-payloads 67/67 + 12/12; verify-brief 46/0; verify-state 14/0; verify-style 0;
verify-docx on `full.md` 63/0 (on the un-assembled draft.docx it lists the remaining work); gen-dodatok-z --check ok; format:check clean.

## Earlier state (2026-09-14) — post-p12/thesis-style-pass (PR #78)

**Done and green on every gate.** The owner read `text/full.md` as pages on 2026-09-13 and gave
eight edits; seven are in. (1–6) Business style at the sources: bold only in headings, «–» for the
prose dash, listings as fenced code blocks without comments (the explanation is prose; the U16
solver parameters are in лістинг 4.2), «Джерела:» lines without paths, no ADR mentions, monospace
only for code/identifiers/fields/file names; `verify-style.py` holds the rules in CI. (7) The text
says what was chosen and why, never what was planned first: `docs/thesis/plan-change-audit.md` is
the record — 18 type-1 passages removed, 16 borderline cases rewritten with the owner's three
clarifications (hosting stated directly as a free Oracle Cloud VM in Marseille with EU region /
two real cores / no cold start / zero cost and no previous provider anywhere; §5.5.3 and §6.5
keep the recomputation argument in full; «згенеровані» → «апріорні»), nine stale draft sentences
aligned, табл. 6.7 down to eleven rows with the count following. A second fresh-context pass
(five subagents, whole text) fixed ~40 dangling contrasts, wrong cross-references and older seams
the removal exposed; all applied at the sources (audit, section «Другий прохід»).

**Waiting on the owner — none blocks the merge:**

- **Item 8** («підсили подачу» from the owner's eight-item report) — the report was composed
  outside the repository; the owner will paste it. Apply only what needs no content change.
- ~~Nine number disagreements~~ — decided by the owner and applied on 2026-09-14 (audit, last
  section). One was a pipeline defect, not a text one: the citation renumberer rewrote the set
  «R ∈ [4, 25]» to «[8, 25]»; groups after «∈» are exempt now and `verify-docx` pins both forms.

**How the pipeline works now (read before touching the thesis text):** `docs/thesis/ASSEMBLY.md`
(the 2026-09-13 section) and `text/README.md` rule 6. Sources are the rollup's blockquote
payloads, `text/*.md`, `gen-dodatok-z.py` and the `run_sub`/`cell_sub` literals in `assemble.py`;
`full.md` is never edited by hand. Hard-wrapped prose is edited by unwrapping the paragraph,
substituting with dash/apostrophe folding and rewrapping at 100 columns **without splitting a
backtick span** — prettier drops the blockquote prefix from a line that leaves a code span open,
and the payload silently splits in two (`verify-payloads` catches it). Gates: assemble
(`untouched_drift 0`, no SKIPPED), verify-numbers, -payloads, -brief, -state, -style, -docx,
`gen-dodatok-z --check`, `format:check`.

## What the rollup phase established (2026-09-09)

**The artefact.** `docs/thesis/corrections-rollup.md` (≈ 1 600 lines) in fourteen sections: the
chapter map with a structural verdict per chapter; the numbers ledger and the untraceable list;
the four claims that must survive at full strength; then the paste-ready Ukrainian per chapter,
including the evaluation chapters written **in order**; the amendments the worklist itself needed;
forty findings no correction covered (U1–U40); a source-by-source answer to "does the draft have a
home for this?"; and an order of work.

**Three structural findings** (the answer to "where am I rewriting versus editing"):

1. **Розділ 5 is rebuilt.** It specifies a field study in the future tense and contains none of the
   evaluation that was performed.
2. **A Розділ 6 is needed.** Everything the corrections address to «§6 (обговорення)» (item 59) or
   «§verification» (items 50–53, 62) has **no referent in the draft**. **DECIDED (owner, 2026-09-09): six chapters** — Розділ 5
   «Методика оцінювання», Розділ 6 «Результати оцінювання та їх обговорення», with the device pass
   as §6.6 and `spec-conflicts.md` as §6.8.
3. **§1.4's research-gap argument no longer holds.** It rests on the work occupying all seven
   dimensions D1–D7 including a deployed field evaluation. D7 is now ◐, and the gap must be
   re-argued over six dimensions with D7 stated as open.

**Six worklist entries were wrong and are amended in place** (dated lines in
`thesis-corrections.md`): #20 (propensity constant from the superseded eligibility rule — the
deployed value is p = ε/|A_m(x)|), #47 (the device measurement it promised was never taken; NFR-P3
still has no handset number), #50 (the fix was server-side; the device still sends `Europe/Kiev`),
#51 (self-contradictory reference figure; a modelled decomposition sum presented as measured),
#55 (E3's 2.5 / 5.4 pp are properties of one world), #62 (four positive claims overstate their
evidence).

**The strongest of the forty uncovered findings**, each verified against the code: the five nightly
Maestro paths of §4.6 do not exist (no `schedule:` in any workflow, Maestro is invoked by none, and
one named path is the drag interaction the system does not have); the nightly training pipeline is
`hourwell-train.timer` on the EU VM while `train.yml` runs the same code on synthetic data only;
лістинг 4.1 logs `skipEvent` where the client logs `lapse_observed` and writes a status the
`tg_guard_recommendation_status` trigger refuses from clients; the "pixel-identical UI" blinding
claim has a hole (the trade-off sheet computes `est_completion_drop` in the learned arm and returns
generic in the heuristic one); the free tier costs an hourly `bench_solve.py` load to hold CPU p95
≥ 20 % against Oracle's reclamation rule; `|C| = 14`, not «12–18»; the `dangerText` token ships and
is missing from Додаток В; and the reference list orphans five sources while eleven arguments cite
none.

**Three numbers were wrong and are now right — the pattern is worth carrying.** Each was found by
a fresh-context adversarial pass, and each was in a place that reads as already-checked. (i) An
`a_m_size` column that does not exist would have entered §2.3 and Додаток Ж. (ii)
`sensitivity-results.md` claimed N = 30 "is supported in none of the 75 cells"; one cell supports
it. (iii) The fix for (ii) then said the smallest N₈₀ at four tasks a day is 33 — that is the
adult-mix minimum; across mixes it is 31, a number the same document's own table printed one
sentence earlier. **The lesson for the remaining steps: the study documents' prose summaries are
not a trustworthy source for their own numbers; recompute from `docs/study/results/*.json`.**

**Verification depth: thesis-critical.** Two source sweeps (23 ADRs; seven days of device notes
plus the checklist) and a fresh-context adversarial pass ran as subagents. The adversarial pass
returned **three blocking findings and eleven accuracy fixes**, all applied: an `a_m_size` column
that does not exist and would have entered the thesis through §2.3 and Додаток Ж (|A_m(x)| is
recovered from `telemetry.ef.experiment.top_m`); the new Розділ 6 delivered as an ordering rather
than as text, for a file whose first promise is finished Ukrainian sentences — §6.3, §6.4, §6.6,
§6.7 and §6.8 are now written, and item 21, which had no home at all, opens §5.4; and a broken
markdown table. Among the accuracy fixes: the function latency 1,10–1,34 s was a p50→p95 pair, not
a p95 range; /plan 135 / 487 ms is the pre-rollout image (shipped: 139 / 555); accent-as-text
contrast is 2,06–3,60:1 and the 2,98:1 was a different pairing **fixed in P10**; the iPhone's
0,49–0,50 s is a warm series with no 413 ms subtracted; two motion frame series came from two
builds; the product was **Kairos** in the thesis text — superseded 2026-09-11: the thesis now carries **Hourwell** throughout (a rename sweep at the end of `assemble.py`; `specs/` keeps the codename, `docs/naming.md`). Percentage points are now
**«в. п.»** (the ДСТУ form the draft already uses) rather than the repository's «п.п.», which is
the standard abbreviation for «пункти».

## Exact next actions

1. **Structure is DECIDED (owner, 2026-09-09): six chapters** — Розділ 5 «Методика оцінювання»,
   Розділ 6 «Результати оцінювання та їх обговорення», the device pass as §6.6 and the
   specification-as-hypothesis material as §6.8. Reason on record: that material is strong enough
   to carry its own chapter, and folding it into five would bury the best part of the work.
2. **Steps 1–3 of §14 are DONE.** §3's four statements; **Розділ 6** written as
   `docs/thesis/text/rozdil-6.md` (§6.1–§6.9, tables 6.1–6.7); **Розділ 5** written as
   `text/rozdil-5.md` (§5.1–§5.9, tables 5.1–5.2); and D5 delivered early as `text/dodatok-g.md`
   (the deployed schema, not an illustration — the owner's push-back was right and the measured
   cost was ≈ 20 min). **Next is step 4**, the Розділ 2–4 edits, which are anchored fragments and
   stay in `corrections-rollup.md` (§6, §7, §8). Then step 5 (Розділ 1), step 6 (Анотація and
   ВИСНОВКИ), step 7 (appendices), step 8 (reference list + the ВСТУП structure sentence).

   **Steps 4–6 are done too.** Step 4: the Розділ 2–4 fragments stay in the rollup (§6–§8), every
   constant verified against the code that defines it (rollup §2.0). Step 5: §1.4's gap argument
   **rebuilt, not patched** — it no longer claims a completed seven-dimension row but asks why the
   row is empty and answers with a measured cost; §1.1/§1.5/§1.6 edits are in the rollup §5. Step 6:
   `text/anotaciya-ta-vysnovky.md`, with all four §3 statements carried without softening. Step 7:
   `text/dodatok-z.md` — **generated** from the results JSON and CI-checked — plus
   `text/dodatok-y.md`, and rollup §10.7a decides print-vs-pointer for every appendix. Step 8: the
   reference list audited (rollup §12.3).

   **The writing is complete. `docs/thesis/ASSEMBLY.md` is the next thing to read** — thirty steps
   in document order for moving the text into the .docx in one sitting.

   **The citation blocker is closed (2026-09-10).** All three were found and confirmed against the
   publishers' records, so nothing was demoted to «stated assumption»: the 2025 synchrony review is
   Chauhan et al., _Chronobiology International_ 42(4):463–499 — and every figure the repository had
   summarised from it was right; the 28/52/20 MEQ split is Taillard et al., _Journal of Biological
   Rhythms_ 19(1):76–86; Senyk et al.'s title is _Ukrainian versions of the Composite Scale of
   Morningness and Munich Chronotype Questionnaire_. **One qualification came with the second and
   must travel with the number:** 28.1/51.7/20.2 holds under cutoffs Taillard et al. adapted for
   their sample (566 French workers, mean age 51.2); under the original Horne–Östberg cutoffs the
   same people split 62.1/36.6/2.2, and the system uses the standard rMEQ cutoffs, which are
   neither. The frozen grid carries a dated erratum for the misattribution. Only the Opensignal
   weak-cell figures remain uncited, and item 51 already labels them as estimates.

   **New layout to know about:** `docs/thesis/text/` holds whole chapters and appendices the draft
   does not have yet, written as continuous Ukrainian to be moved in as a unit; the rollup keeps
   the anchored edits for chapters that exist. `text/README.md` explains the split and the three
   rules the prose is written under. **The .docx is the owner's — nothing in this repo touches it.**

3. **D1–D8 are all DECIDED** (owner, 2026-09-09) and recorded in §14 of the rollup: a fifth novelty
   item **yes**; the competitor figures **dropped**; «2–3 години» **deleted**; of the orphaned
   sources keep ONNX and PyTorch on the on-device перспективи sentence, delete HF and MiniLM, keep
   Maestro; Додаток Г **as the real schema**; the test counts **re-run and pasted** at freeze;
   Додаток З **all 75 cells**; D7 the owner's own (no conference, no publications).
4. **Re-count the test suites at freeze time** and paste the gate output (D6) — the 583/191 pair in
   #62 and the conclusions is traceable to nothing (the last recorded runs are jest 519/521 and
   Deno 187).
5. Two new appendices to generate: the 75-cell sensitivity table (Додаток З) and the frozen
   pre-registration plus world grid (Додаток И).

## What the next phase needs to read

- `docs/thesis/corrections-rollup.md` — §1 (chapter map), §2 (numbers), §3 (the four statements),
  then the chapter section you are writing. **Do not re-read all of `specs/`.**
- `docs/thesis/thesis-corrections.md` only for the reasoning behind an item you are pasting.
- `docs/study/simulation-results.md` and `sensitivity-results.md` when writing Розділ 6 §6.1–§6.5;
  `sensitivity-grid.md` §1 for the world model, which is quoted almost verbatim.
- `docs/thesis/spec-conflicts.md` before implementing anything a spec file describes, and in full
  when writing §6.8.
- The draft itself is git-ignored; extract its text with `python3 -c` over `word/document.xml` if
  you need the current wording.

## Open items for the owner (none block the writing)

- **Four device-checklist rows under "Ukrainian interface"** remain deferred by the owner
  (2026-09-09) — NFR-A2 in Ukrainian at 200 % on both phones, a real Ukrainian IME's apostrophe,
  Ukrainian month/weekday names under Hermes on **Android**, and notification copy after a switch.
- **`docs/verification/uk-a11y-sweep.sh` leaks a Metro bundler**; the fix is `--no-bundler` on the
  `npx expo run:ios` line. Owner's instruction: no PR for one line — fold it into the next phase
  that touches main. Still pending.
- **`device-checklist.md` has two stale spots** the rollup names: the NFR-P1 row runs the 2 Sep and
  3 Sep series together as "the same inbox", and the iOS NFR-A2 Settings-path row reads ⬜ while
  `ios-20260908-1215` item 69 records it as PASS.

---

## Earlier state (localisation, 2026-09-09) — superseded above but still current for its rows

### What the localisation phase established (2026-09-09)

**Shipped (`38543d8`, `f71a3f3`, `f5fff2f` + docs):** a second catalog (465 strings + 13 counted
sentences) with a `Системна / English / Українська` switch in Settings; plural forms as a mechanism
(Ukrainian needs three integer forms, English two); dates bound to the app's language while
regional conventions follow the phone; Ukrainian natural-language quick-add; and an honest hint
when nothing parses, in either language.

**The two findings that changed the brief.**

1. **`chrono.uk` exists.** Two hardware notes recorded "chrono-node is English-only". Measured on
   the pinned 2.10.1, it ships a Ukrainian parser in upstream's full-support tier — the English-only
   property was our configuration. FR-11 is now bilingual; both notes carry dated corrections and
   spec-conflicts L22 records it. Residual gap: «цими вихідними» (chrono returns no parse and the
   whole line stays the title). «за 30 хвилин» was a _defect_ the adversarial pass caught, not a
   gap — it read as a 30-minute estimate; it is now a deadline, like «через 30 хвилин».
2. **No validated Ukrainian rMEQ exists.** The validated Ukrainian chronotype instruments are the
   CSM and MCTQ (Senyk, Jankowski & Cholii, Biological Rhythm Research 53(6):878–896). The five
   items stay English in every catalog, pinned by a test, with the reason on the screen. Owner
   decided this (and the full-parsing option) before implementation.

**Measured (iOS simulator, iPhone 16, Release):** four Maestro flows — onboard, switch, sweep at
accessibility-XXXL, a real plan — all pass. The block action row **wraps** rather than clips
(«Пропустити» is +150 % on `Skip`); FR-21 rationales read as Ukrainian sentences; the _few_ plural
form appears correctly; `Intl` gives «середа, 9 вересня» on iOS. Evidence:
`docs/verification/i18n-uk-20260909/notes.md` + 7 screenshots.

**Corrected in the records, not quietly:** the first draft of ADR-0023, the explainer and one commit
message said a language change returns the user to Today. It does not — expo-router restores the
route, so Settings stays open and re-renders. Fixed where claimed; the older font-scale claim it
reasoned from is untouched because this run did not test it.

**Adversarial pass (fresh-context subagent) → `c272d69`:** seventeen findings, five of them
blocking. Two were real parser defects — «г» read as _hours_ when it is the abbreviation for _gram_
(«купити 100 г кави» became a 6000-minute task the solver could never place), and «за 30 хвилин»
read as a 30-minute estimate instead of a deadline, which four records described as a graceful
fallback. Two were tests that could not fail: the gendered-past-tense tripwire used ASCII `\b`/`\w`
and matched nothing in Cyrillic, and the region-tag case sliced its own input down to `'uk'` —
fixing it exposed `resolveLocale` failing on a device reporting `uk-UA`. The fifth was the
verification directory claiming four passing flows while committing three JUnit files. All fixed;
the remaining twelve are small and logged in `revisit.md` or addressed in place.

**Verification depth: routine**, as the owner scoped it. No hardware was needed and none is claimed.

## Exact next actions

**None of its own.** The phase is merged and nothing is pending. A fresh session picks the next item
with the owner from `docs/decisions/revisit.md`.

**One deferred one-liner to carry:** `docs/verification/uk-a11y-sweep.sh` documents a build step
that leaks a Metro bundler (see "Environment" below). The fix is `--no-bundler` on the
`npx expo run:ios` line plus a word in the header comment. The owner's instruction (2026-09-09) is
**not** to open a PR for one line — **fold it into the next phase that touches main.** Logged in
`revisit.md` so it is not lost.

If a catalog string is ever edited: regenerate the owner's review surface with
`node scripts/i18n-copy-review.mjs && pnpm format` — the prettier pass is not optional, or the
committed doc and a fresh run differ by hundreds of lines of table padding.

## Open items for the owner (none block anything)

- **Four device-checklist rows** under "Ukrainian interface", **deferred by the owner on 2026-09-09
  to a later pass — they will say when they want a build on the Android phone.** No device is
  connected and none was needed for this phase. The rows: NFR-A2 in Ukrainian at 200 % on both
  phones (the English rows do **not** transfer — mean +56 % label growth); a real Ukrainian IME
  (which apostrophe it emits; the parser folds four variants); Ukrainian month/weekday names under
  Hermes on **Android** (iOS is settled — `Intl` gave «середа, 9 вересня» on the simulator);
  notification copy and the Android channel rename after a switch.
- ~~One copy trade worth a listen: «%» vs "percent"~~ — **owner reviewed the copy on 2026-09-09 and
  approved it unchanged, «%» included.** Closed; do not re-raise it.
- **revisit.md gained four lines**: arm A always falls through to the generic trade-off consequence
  (`pinned_overlap_minutes` vs `pinned_conflict` — a small hole in the study's "pixel-identical UI"
  claim); the Ukrainian CSM as a future cold-start instrument; PLAN §2's stale `packages/shared`
  promise; and `e2e/p2-a11y-sweep.yaml` being stale against the current Settings and Insights.

## What the next phase needs to read

- `docs/decisions/ADR-0023-localisation-boundary.md` — the whole decision, including the English
  list written to be quoted.
- `apps/mobile/src/i18n/` — five files: `locale.ts` (which catalog), `plural.ts` (the rules),
  `format.ts` (dates), `en.ts` (reference catalog + `MessageKey`), `uk.ts`.
- `docs/verification/i18n-uk-20260909/notes.md` for what the simulator did and did not settle, and
  its gotchas (Maestro screenshot paths, `accessible` Pressables hiding their child text, the
  simulator keyboard).
- A third language is again "add a file": add it to `CATALOG_LOCALES`, write the catalog, and the
  parity/hygiene/slot tests hold it to English automatically.

## Environment left as found

- **Simulator: shut down** (owner's instruction, 2026-09-09). iPhone 16 (`5C080B83-…`), iOS 18.3,
  still holds the Release build of `bc753eb`, text size `medium`, app in Ukrainian on a throwaway
  anonymous account with one plan. Several throwaway anonymous accounts were created on the hosted
  project across the sweep runs (retention-purge material, like the session-only rows from earlier
  passes), and a handful of plan requests were made. Nothing needs cleaning up; the next session may
  boot it and `clearState` freely.
- **A leftover Metro bundler was killed at the end of the session.** `npx expo run:ios` was invoked
  **without** `--no-bundler`, so after the build installed, Metro kept running and streaming the
  simulator's log for ~2.5 h — it looked like a stalled build from the outside (no build output, a
  log file still growing with app-runtime noise). It was never waiting for a device: the command
  targeted the simulator UDID. See the deferred fix below.
- **This session's Release build added a DerivedData tree** (`~/Library/Developer/Xcode/DerivedData/
Hourwell-blsssfravpwaygfiszsljufasxeb`) — relevant to the standing disk-space item below.
- **Phones:** untouched this session; the owner has since unplugged both. Pixel 7a and iPhone 12
  remain as the motion phase left them.

---

## Earlier state (motion phase, 2026-09-08 → 09) — superseded above but still current for its rows

**post-p12/motion is merged** (PR #60, plus PR #61 with the owner's-eyes judgement). File 02 §3.4 is
closed on the plan surface (spec-conflicts L42), ADR-0022 accepted with hardware results from both
phones. S1 — after Done / Skip / I did it the rows settle on a cell `layout` spring registered for a
350 ms window; S2 — a moved block travels, or the list scrolls to it and the arrived card plays a
transform-only settle once.

**Measured:** Pixel 7a, the same 13-block plan under a build of main and the motion build — NFR-P2
equal (1825 / 1824 frames, 1 janky, p99 10 ms); Done 11 frames, Skip 10, I did it 14, on-screen move
12, off-screen move = a 17–19-frame scroll then a 7-frame arrival settle; one frame per interaction
under reduced motion **on `transition_animation_scale 0`**. iPhone 12, a 16-block plan — NFR-P2 8 = 8
hitches (847 / 807 frames); Reduce Motion via the daemon hold verified by a second client. Evidence:
`docs/verification/device-pass/android-20260908-motion/notes.md`,
`ios-20260909-motion/notes.md`.

**Open owner items from that phase:** Auto-Lock back to the usual value on the iPhone; the Mac's disk
(22 GB free; `~/Library/Developer/Xcode/iOS DeviceSupport` 14 GB, Xcode caches, simulators are the
big items — note this session's Release build added a DerivedData tree); optionally an iOS build
with `ac99dea` if the arrival settle should be seen on the iPhone.

**Tools left in `docs/verification/`:** `hw-motion-frames.py`, `hw-motion-drive.py`,
`hw-scroll-frames.sh`, `hw-set-profile-timezone.mjs`, `hw-ios-hitches.sh`, `hw-ios-paint.py`,
`hw-ios-motion-drive.py`, `hw-ios-wda.py`, and now `uk-a11y-sweep.sh`. Gotchas are at the end of each
notes file — the two that bit hardest before: never pass driver steps through a double-quoted shell
string, and delete `$TMPDIR/instruments*.ktrace` after every xctrace run.

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1–5. ✅ (migration, role, DPIA, store decision, Android hardware pass). 6. Hardware-pass
prerequisites only (Google OAuth Web client, mailbox) — for the device-checklist auth/calendar rows
and the two-device sync row. 7. ~~Pre-enrollment list~~, ~~OSF freeze~~ retired. 8. iPhone pass —
done (2026-09-07/08).

## Standing gotchas (earlier lists in this file's git history still apply)

- **Auto-merge:** arm it once right after `gh pr create`; never re-run `gh pr merge` after a push.
  `enforce_admins` is on, so a premature merge is refused.
- **The iOS simulator and the phones share the hosted project.** A "newest auth user" read is
  ambiguous while both run.
- **RN Modal presents from its nearest view controller** — a new native modal screen needs its own
  `DialogHost`.
- **Maestro on the simulator cannot dismiss the keyboard** (`hideKeyboard` fails) and cannot walk
  the P4 onboarding at accessibility sizes; a relaunch is the reliable way past a stuck keyboard.
- **expo-doctor 20/21:** TypeScript ~6.0.3 expected vs 5.9.3 pinned (ADR-0004) — pre-existing.
- **Prettier pads markdown table cells** — scripted edits anchor on cell content, then `pnpm format`.
