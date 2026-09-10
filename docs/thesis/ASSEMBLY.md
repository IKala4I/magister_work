# Assembly order for `draft.docx`

Everything below is in **document order**, top to bottom, so it can be done in one sitting without
jumping between files. Two sources only:

- **`text/*.md`** — whole chapters and appendices that do not exist in the draft. Move them in as a
  unit; they are continuous prose, already in Ukrainian.
- **`corrections-rollup.md`** — anchored edits to sections that do exist. Each carries the exact
  replacement text under its own §.

**The .docx is yours. Nothing in this repository touches it**, which is why this file exists.

Before you start, run once from the repository root:

```
python3 docs/thesis/verify-numbers.py        # 144 checks against docs/study/results/*.json
python3 docs/thesis/gen-dodatok-z.py --check # Додаток З still matches the run it reports
```

Both also run in CI as the `thesis-numbers` job, so a green branch means the numbers in the text
files are the numbers in the results.

**After assembly, run the third one against the Word file itself:**

```
python3 docs/thesis/verify-docx.py            # defaults to docs/thesis/draft.docx
```

Paste-don't-retype is still the main defence — it is what keeps the _numbers_ right, and no script
can check prose or argument. But pasting does not catch **an edit that was skipped entirely**, and
it does not catch **a stale sentence nobody re-read**, which are the two things that actually go
wrong in a thirty-step pass. `verify-docx.py` catches exactly those: 52 checks over strings that
must be gone, landmarks that must be present, five corrected values with their superseded forms, and
the reference deletions and additions.

**Run it before you start, too.** On the un-assembled draft it fails 49 of 52, and that failure list
is a live progress bar for the table below — work down the list and watch it shrink. A clean run
means "no known-stale string survived and every checked landmark is present"; it does **not** mean
the chapter is right.

One thing it taught us about itself: it first reported «п'яти розділів» as already absent, because
Word stores the Ukrainian apostrophe as U+2019 and the needle used U+0027. It now normalises
apostrophes and dashes on both sides. A checker that silently passes is worse than none, so if you
add a needle, add it in the form the draft actually uses.

---

## The order

| #   | Where in the draft                                                                                     | What to do                                                                                                                    | Source                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **АНОТАЦІЯ**                                                                                           | keep ¶1 (bibliographic); replace ¶2 and ¶3; insert the new ¶4; extend the keyword list                                        | `text/anotaciya-ta-vysnovky.md` § «АНОТАЦІЯ»                                                          |
| 2   | **ANNOTATION**                                                                                         | same three edits, mirrored                                                                                                    | same file § «ANNOTATION»                                                                              |
| 3   | **ПЕРЕЛІК СКОРОЧЕНЬ**                                                                                  | add: ICC, MC SE, N₈₀, σ_shape, «в. п.»                                                                                        | rollup §12.1 U-row for the abbreviations                                                              |
| 4   | **ВСТУП** — актуальність ¶1                                                                            | replace the paragraph (drops «2–3 години», states the literature at its real strength)                                        | rollup §4.3 (a)                                                                                       |
| 5   | **ВСТУП** — наукова новизна                                                                            | edit п. 3; **add the new п. 5**                                                                                               | rollup §4.3 (b), (c)                                                                                  |
| 6   | **ВСТУП** — практичне значення                                                                         | replace the paragraph (synthetic dataset, not «анонімізований»)                                                               | rollup §4.3 (d)                                                                                       |
| 7   | **ВСТУП** — завдання п. 6                                                                              | replace                                                                                                                       | rollup §4.3 (e)                                                                                       |
| 8   | **ВСТУП** — структура роботи                                                                           | **do this last, at #26** — the counts change                                                                                  | rollup §4.3 (f)                                                                                       |
| 9   | **§1.1**                                                                                               | replace the closing sentence of ¶2 (mechanism)                                                                                | rollup §5 «§1.1»                                                                                      |
| 10  | **§1.2 + табл. 1.1**                                                                                   | add the pre-table sentence; two table cells; replace the post-table paragraph; **drop the price and user-count figures** (D2) | rollup §5 «§1.2»                                                                                      |
| 11  | **§1.4 + табл. 1.2**                                                                                   | табл. 1.2 Kairos row D7 `+` → `◐` with its footnote; **replace the gap paragraph with the four rebuilt paragraphs**           | rollup §5 «§1.4»                                                                                      |
| 12  | **§1.5 + табл. 1.3**                                                                                   | replace the market-preconditions paragraph and the «конкурентна перевага» paragraph; two risk rows; the PAR sentence          | rollup §5 «§1.5»                                                                                      |
| 13  | **§1.6**                                                                                               | add the closing ДП1–ДП4 status paragraph                                                                                      | rollup §5 «§1.6»                                                                                      |
| 14  | **§1.7**                                                                                               | add the closing sentence about six of seven dimensions                                                                        | rollup §5 «§1.4» (c)                                                                                  |
| 15  | **Розділ 2** — §2.1, §2.2, §2.3, §2.4, §2.5, §2.6.2, §2.6.3, §2.7                                      | eight anchored edits, in that order; §2.4 is the big one (the solver's size argument becomes an empirical result)             | rollup §6                                                                                             |
| 16  | **Розділ 3** — §3.1.3 табл. 3.2, NFR-R2, §3.2 + рис. 3.1, §3.3 табл. 3.3, §3.4, §3.6, §3.7, §3.8, §3.9 | nine anchored edits; §3.7 is a rebuild (the transfer analysis is new material)                                                | rollup §7                                                                                             |
| 17  | **Розділ 4** — §4.1, §4.2 + лістинг 4.1, §4.4 + лістинг 4.2, §4.5, §4.6                                | five anchored edits; both listings change                                                                                     | rollup §8                                                                                             |
| 18  | **Розділ 4** — after §4.6                                                                              | add the two-sentence forward reference to §6.6                                                                                | rollup §8 «§4.6»                                                                                      |
| 19  | **РОЗДІЛ 5**                                                                                           | **replace the chapter entirely**                                                                                              | `text/rozdil-5.md`                                                                                    |
| 20  | **РОЗДІЛ 6**                                                                                           | **insert the new chapter** after Розділ 5                                                                                     | `text/rozdil-6.md`                                                                                    |
| 21  | **ВИСНОВКИ**                                                                                           | edit п. 1, 2, 3, 4, 5; replace п. 6; **add п. 7 and п. 8**; replace перспективи                                               | `text/anotaciya-ta-vysnovky.md` § «ВИСНОВКИ»                                                          |
| 22  | **СПИСОК ДЖЕРЕЛ**                                                                                      | delete four entries, add seven, renumber every citation in the body                                                           | rollup §12.3 (a), (b) — **and read (c) first: four citations cannot be produced from the repository** |
| 23  | **Додаток В**                                                                                          | two typography edits; the blanket contrast claim; **add the `danger-text` row**                                               | rollup §10.2                                                                                          |
| 24  | **Додаток Г**                                                                                          | **replace the appendix entirely**                                                                                             | `text/dodatok-g.md`                                                                                   |
| 25  | **Додаток Д**                                                                                          | replace the closing placeholder with the resolved paragraph                                                                   | rollup §10.4                                                                                          |
| 26  | **Додаток Е**                                                                                          | update the NFR-P1 row; regenerate from `docs/traceability.md`; **abridged + explicit pointer** (§10.7a)                       | rollup §10.5                                                                                          |
| 27  | **Додаток Ж**                                                                                          | five value edits inside the JSON                                                                                              | rollup §10.6                                                                                          |
| 28  | **Додаток З**                                                                                          | **insert new** — all 75 cells                                                                                                 | `text/dodatok-z.md`                                                                                   |
| 29  | **Додаток И**                                                                                          | **insert new** — registered predictions and the four dating commits                                                           | `text/dodatok-y.md`                                                                                   |
| 30  | **ВСТУП** — структура роботи                                                                           | now do #8: «шести розділів», the new reference count, the page count                                                          | rollup §4.3 (f)                                                                                       |

---

## Four things to know while assembling

**Renumbering is the one irreversible-feeling step.** Do #22 in a single pass and only after #21,
because four deletions and seven insertions shift almost every bracket in the body. The four
deletions are [30], [44], [46], [56]; nothing else in the list is removed.

**Cross-references that change chapter number.** Розділ 6 is new, so every «розділ 5» in Розділи 1–4
that pointed at _results_ now points at Розділ 6. The `text/` chapters already use the six-chapter
numbering; the anchored edits in the rollup do too. What needs a sweep is the draft's **untouched**
prose — search for «розділ 5», «розділі 5», «розділу 5» and check each.

**Two placeholders stay yours.** ВСТУП's «Апробація» and «Публікації» (D7 — no conference, no
publications, keep both minimal).

**Two numbers are deliberately absent** and must not be reinstated from memory: the test counts
(583 / 191) are not in ВИСНОВКИ п. 8 until the gates are re-run at freeze time and pasted (D6);
`docs/HANDOFF.md` carries the last recorded values, which are **not** those two.

---

## What is not in this list, and why

- **Рисунки 1.1, 3.1–3.3, 4.1, 5.1** are figure placeholders. §3.2's caption text is rewritten in
  rollup §7 because it names three components that moved; the others are unchanged.
- **Розділи 2–4's own numbers** were verified against the code that defines them (rollup §2.0), so
  the anchored edits can be pasted without re-checking constants.
- **The four unproducible citations** (rollup §12.3 c) are the only open blocker in the text. Two of
  them — the 2025 synchrony review and the MEQ 28/52/20 split — are load-bearing in §1.1, §6.4, the
  abstract and ВИСНОВКИ, and §12.3 (c) states the fallback if they cannot be found.
