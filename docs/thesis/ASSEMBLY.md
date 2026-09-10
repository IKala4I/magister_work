# Assembly of `draft.docx`

**The thirty-step manual pass is superseded.** `docs/thesis/text/full.md` is the whole thesis in
document order with every correction already applied — six chapters, references renumbered,
citations rewritten, appendices in place. Your job is moving continuous text into a formatted
template, not executing patches.

It is **generated**, never hand-edited:

```
python3 docs/thesis/assemble.py          # rebuilds text/full.md from draft.docx + text/*.md
python3 docs/thesis/verify-numbers.py    # 144 study numbers, recomputed from the results JSON
python3 docs/thesis/gen-dodatok-z.py --check
python3 docs/thesis/verify-docx.py docs/thesis/text/full.md   # 52 needles; 0 failures
```

## The guarantee, and its exact limit

The assembler copies every paragraph the corrections do not touch **verbatim** from `draft.docx`
and reports the counts: 400 from the draft untouched, 37 edited, 15 inserted, 90 renumbered, 254
from the `text/*.md` chapters. It then asserts that **every block still marked "from draft" is
byte-identical to the source** — `untouched_drift 0`. A silent alteration of your prose cannot
happen without that number moving.

What it does **not** guarantee: that the 37 edits are the _right_ edits. Those are checked by the
needle list and by having been written against the rollup, not by the assembler.

## What markdown cannot carry — all of it formatting

Verified against the file rather than assumed: the draft has **no** equations (formulas are plain
text), **no** footnotes, endnotes, comments, tracked changes, hyperlinks or images. So the losses
are exactly:

| Lost                                                                                        | Consequence                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Paragraph styling: indents, 1.5 spacing, justification, ДСТУ margins, Times New Roman 14 pt | re-apply by template                                        |
| The 44 tab stops that right-align formula numbers                                           | formula lines come across as text; `(2.1)` needs re-tabbing |
| Table column widths, borders, the 8 dashed figure-placeholder boxes                         | re-apply by template                                        |
| The generated ЗМІСТ                                                                         | Word rebuilds it                                            |
| Run-level bold/italic **is** carried (`**`/`_`), but heading bold is dropped as styling     | intended                                                    |

Two things markdown cannot do anything about, which the step-by-step could not either: the figures
themselves (still placeholders) and the two ВСТУП items that are yours (D7).

## If you would rather do it by hand

The per-anchor mapping still exists — `corrections-rollup.md` §§4–12 — and the table below is the
document-order list it was built from. Nothing has been deleted; the assembler is a faster route to
the same result, with a fidelity check the manual route does not have.

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

## What the 2026-09-10 pass changed

`assemble.py` previously encoded only a subset of the rollup's approved payloads — the Розділ 3–4
anchored fixes, the Анотація/ВИСНОВКИ splices and the whole-chapter replacements. **Twenty-six of
the rollup's approved Ukrainian payloads for Розділи 1–4 and Додаток Д were not applied at all**,
including the §1.4 rebuilt gap argument, the §2.4 measured solver result, the §2.6.2 replay-bias
paragraph, the §2.7 attribution rules and the three §3.7 privacy paragraphs.

They are applied now, and the mechanism changed so this cannot recur quietly: the payloads are
**read out of `corrections-rollup.md`** by `load_rollup_payloads()` and placed by a declarative
table (`ROLLUP_EDITS`), keyed by the rollup heading and the payload's position under it. The
approved Ukrainian is never retyped into the program, an anchor that no longer matches is reported
in `SKIPPED` rather than guessed at, and editing the rollup changes the output.

Citations in the chapter files are written symbolically — `[@chauhan]`, `[@liulayland]` — and
resolved to numbers after the list is renumbered, so adding or dropping a reference cannot leave a
citation pointing at the wrong entry. See `reference-audit.md` for the reference list itself.
