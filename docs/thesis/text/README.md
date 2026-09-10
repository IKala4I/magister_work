# `docs/thesis/text/` — finished Ukrainian, ready to move into the draft

Two kinds of artefact live in `docs/thesis/`, and the split is deliberate.

| File                       | What it is                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `../corrections-rollup.md` | The **edit set** for chapters that already exist: "replace this phrase at this anchor with that text". Anchored fragments.          |
| `text/*.md`                | **Whole chapters and appendices that the draft does not have yet**, written as continuous Ukrainian prose to be moved in as a unit. |

A chapter that does not exist is not an edit, and mixing the two makes both unusable: the rollup
becomes impossible to scan for "what do I paste into §3.3", and the chapter becomes impossible to
read as a chapter. So the rollup keeps the anchored edits for Розділи 1–4, the annotation, the
introduction, the conclusions and the existing appendices, and points here for the rest.

**The .docx is assembled by the owner in a separate session. Nothing in this repository touches the
Word file.**

## Contents

| File                       | Draft destination                             | Status                                                                     |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| `rozdil-6.md`              | **РОЗДІЛ 6** (new; owner decision 2026-09-09) | ✅ written — 6.1–6.9, tables 6.1–6.7                                       |
| `dodatok-g.md`             | **Додаток Г** (replaces the existing one)     | ✅ written — the deployed schema, not an illustration (decision D5)        |
| `rozdil-5.md`              | **РОЗДІЛ 5** (rebuilt)                        | ✅ written — 5.1–5.9, tables 5.1–5.2                                       |
| `anotaciya-ta-vysnovky.md` | **АНОТАЦІЯ**, **ANNOTATION**, **ВИСНОВКИ**    | ✅ written — all four §3 statements carried without softening              |
| `dodatok-z.md`             | **Додаток З** (new)                           | ✅ **generated** from the results JSON by `gen-dodatok-z.py`; CI checks it |
| `dodatok-y.md`             | **Додаток И** (new)                           | ✅ written — registered predictions, criteria, the four dating commits     |

## Rules these files were written under

Both come from `corrections-rollup.md` and they are not stylistic:

1. **Every number carries the condition it is only true under** — device, build, box, date, series
   size — in the same sentence as the number (§2 of the rollup, and its ledger of what may be
   quoted at all).
2. **The four claims measurement weakened stand at full strength** (§3): the learned policy only
   ties in the world its own prior describes; one rule is beaten and the competitors were never
   compared; the field study is out of scope and simulation does not stand in for it; the gap does
   not compound. §3.5 lists the hedges that must not reappear.

3. **Instrument discipline** (owner directive 2026-09-09, extending to the whole text what §6.6
   does for the device pass): where a number depends on **how** it was measured, that goes in the
   same sentence, not in a footnote. An assumption is called an assumption, a figure computed on
   code is called computed rather than observed, a lower bound is called a lower bound. Розділ 5
   §5.5 is the densest application — the protocol's N = 30 rests on three assumptions and not one
   of them is a measurement.

Percentage points are «в. п.»; the research questions are ДП1–ДП4.

## What was corrected in the sources while writing

Writing `rozdil-6.md` turned up an error in `docs/study/sensitivity-results.md`: its summary said
File 06's N = 30 "is supported in none of the 75 cells (the smallest adult-mix N₈₀ is 33)". Cell 66
is adult mix with N₈₀ = 21, so both halves were wrong. Recomputed from `results/sensitivity.json`
and corrected in place, with the correction dated in the document. The chapter carries the accurate
statement: exactly one cell of 75 supports N = 30, and it sits at the grid's registered upper stress
bound (s = 2, twice the table's pattern strength).

The adversarial pass then found a **second** error, this time in the corrected paragraph and in the
first draft of both chapters: "the smallest N₈₀ at four tasks a day is 33" is the smallest
**adult-mix** value; across mixes it is **31** (cell 49, uniform, s = 2). Both are now stated, and
`sensitivity-results.md` carries the correction.

### The failure mode both corrections shared

Worth recording as a pattern, not as two incidents. In each case a recomputation was read in the
direction the reader already wanted:

- The session wrote that the correction «посилює висновок» — it does not; numerically it weakens
  the claim, and only the conclusion survives.
- The owner, reviewing that same correction, read it the same way for the same reason, and named it:
  "I did exactly what I warned you about — read a recomputation as strengthening the claim because
  that's the direction I wanted."

The obvious reading is self-flattery — reading results in the direction you hoped for. **That
reading is wrong here, and believing it is what leaves you unguarded.** Four roundings have now been
caught, and they do not point the same way about the method:

| Rounding                         | Direction          | What it made look better             |
| -------------------------------- | ------------------ | ------------------------------------ |
| morning-type loss 0,85 → «0,9»   | loss larger        | nothing — the method looks **worse** |
| smallest N₈₀ at K = 4, 31 → «33» | sample size larger | nothing — the study looks **harder** |
| recruitment 172 → «170»          | burden smaller     | the protocol's feasibility           |
| evening gain 4,8 → «5»           | gain larger        | the cancellation argument's drama    |

Two of the four make the work look worse. What they share is not a preferred conclusion but **the
pull of the sentence being written at that moment**: each rounding made _that_ sentence more
emphatic. A loss being described wants to be a rounder loss; a burden being conceded wants to be a
rounder burden; a cancellation being demonstrated wants a rounder thing cancelled.

This matters for how to guard against it. **"Did I want this?" is a filter that passes half the
cases** — it returns "no" for the two that make the work look worse, and lets them through. The
guard that works is indifferent to direction: **check every number against its source regardless of
which way it points**, because the bias is introduced by the act of writing a sentence, not by the
writer's hopes for the finding. That is why the checker asserts exact bounds rather than plausible ones, and
why it runs in CI instead of on request.

**The rule that follows** (owner directive 2026-09-09, applies from here without asking): a
recomputation is reported in its own direction, whichever way it goes. And more strongly — **if a
number in the draft or in any study document cannot be reproduced from
`docs/study/results/*.json`, it does not go into the thesis until it can.** The prose summaries of
the study documents are not a trustworthy source for their own numbers: three errors have now been
found in places that read as already-checked, twice in the corrected sentence itself.

Owner directive 2026-09-09: **do not bury that correction.** It is stated in both places the number
is used — `rozdil-6.md` §6.5, where the recomputation happened, and `rozdil-5.md` §5.5.3, where the
protocol's own N = 30 is assessed — on the reasoning that a claim which survived its own
recomputation has a different epistemic status from one nobody checked. The framing is honest about
direction: **numerically the recomputation weakens the claim** (from "no cell" to "one"); what
survives is the conclusion, because the single supporting world sits on the grid's own
implausibility bound. An earlier draft said the correction "strengthens" the conclusion — it does
not, and that overstatement was itself caught by the adversarial pass.

### A needle that is too narrow is a silent pass, not a warning

Three times now the same shape: a check ran, reported clean, and the thing it was meant to catch
was sitting in the file.

- `verify-docx.py` folded apostrophes in its needles but not in the text it searched, so
  «3,7–4,1» never matched its own en-dash.
- A scan for `[nn]` reported zero unresolved citation placeholders. The placeholders in
  `rozdil-5.md` read `[nn — Liu & Layland, 1973]`; the needle matched neither.
- The reference renumberer matched `[0,1]` inside `clip[0,1]` and rewrote formula (2.9) to
  `clip[‹?›, 1]`. Nothing failed. The corrupted formula was committed and stayed committed.

The failures are not "the checker was wrong". Each checker did exactly what it was told. The
lesson is narrower and more useful: **a check that can only report "found nothing" has two
readings, and the wrong one is the comfortable one.** So a checker gets an assertion in both
directions where that is possible — `verify-docx.py` now asserts the clip bounds are *present*,
not merely that no marker is absent — and a needle written against remembered text is verified
against the actual bytes before it is trusted.

The same reasoning retired a whole class of manual work in this pass. Sixteen `run_sub` calls were
deleted by a multiline regex meant to remove three; the program's own fidelity report did not
notice, because deleted edits leave paragraphs looking untouched. `verify-docx.py` caught it —
seven banned strings had reappeared. The edits are now driven from a table read out of
`corrections-rollup.md` itself, so the approved Ukrainian is never retyped, and the checker is
what stands between a lost edit and the defence.
