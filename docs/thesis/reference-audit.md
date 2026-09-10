# Reference audit — 2026-09-10

Every entry in `text/full.md`'s reference list was checked against a publisher record, not from
memory. Sources used, in order of preference: the publisher's own page, the DOI record via
Crossref, OpenAlex, then the field's consistent secondary record where the publisher no longer
exists. **Where none of those could be reached, the entry is flagged below rather than left
looking verified.**

The list went from 72 entries to **71**: one entry was dropped because it could not be verified
(see §3), and the claim it supported is now framed as our own measurement.

## 1. Source-language constraint

**Satisfied for all 71 entries.** Nothing in the list is Russian-language, Russian-hosted, or
reachable only through such a source, and nothing is in a language outside English and Ukrainian.

| Group                                               | Count | Language                                          |
| --------------------------------------------------- | ----- | ------------------------------------------------- |
| Ukrainian journals, standards, legislation           | 9     | Ukrainian (publishers: КубГ, НУПП, НУ ЛП, УкрНДНЦ, ВРУ) |
| English-language journals and conference proceedings | 43    | English                                           |
| English-language books                               | 1     | English                                           |
| EU legal instruments                                 | 2     | English (Official Journal / EDPB English version) |
| Product and library documentation                    | 16    | English                                           |

Two entries deserve a note because their form could be mistaken for something else:

- **[36] Kuliahin et al.** and **[45] Meleshko et al.** carry Latin-transliterated author names
  above Ukrainian titles. That is not an inconsistency introduced here — it is how the journal
  (СУНЗ, Полтавська політехніка) renders its own author metadata on the Ukrainian page. Kept as
  the publisher prints it.
- **[68] Taillard et al.** studies French workers; the paper itself is English, in
  _Journal of Biological Rhythms_. No French-language source is relied on.

## 2. Corrected

| №    | Entry                | What was wrong                                                  | Verified against                                     |
| ---- | -------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| [24] | Gomez-Uribe & Hunt   | year **2016 → 2015**; article number and extent added           | Crossref + OpenAlex, both from DOI 10.1145/2843948   |
| [27] | EDPB Guidelines      | **26 p. → 24 p.**; adoption date added (**24 February 2023**)   | the EDPB's own PDF (page count read from the file)   |
| [36] | Kuliahin et al.      | **two authors → four** (Tkachov V., Kuchuk H. missing); pages and DOI added; bare journal URL dropped | journals.nupp.edu.ua article page                    |
| [45] | Meleshko et al.      | pages and DOI added; bare journal URL dropped                   | journals.nupp.edu.ua article page                    |
| [5]  | Мелешко Ю.           | pages **С. 120–124** added; volume/issue confirmed              | DOI 10.26906/SUNZ.2018.4.120                         |
| [7]  | Міхав & Мелешко      | pages **С. 112–117** added                                      | DOI 10.26906/SUNZ.2023.1.112                         |
| [1]  | ДСТУ 3008:2015       | unverifiable extent removed; effective date **2017-07-01** added | standards catalogue record                           |
| [2]  | ДСТУ 8302:2015       | unverifiable extent removed; effective date **2016-07-01** added | standards catalogue record                           |

The five Ukrainian entries that the draft carried **without authors at all** ([3]–[7]) were given
their author lists in the same pass; each was confirmed at the journal, and all five are
Ukrainian-language.

## 3. Dropped — one

**Ookla, _Speedtest Global Index_.** Ookla blocks automated access, so the figure could not be
checked against the publisher. Rather than leave a citation that looks verified, the entry is
removed and the sentence it supported now says what is true: the 0,90 s network component of the
NFR-P1 decomposition is **this work's own measurement on the reference device**, not a figure from
the literature. The weak-cell and 3G values remain explicitly labelled as estimates from older
public measurements that could not be retrieved, and carry no citation — which is what §12.3 (d)
of the rollup already decided for them.

## 4. Confirmed exactly — publisher record matched field for field

[3] [4] [5] [6] [7] [8] [9] [11] [13] [15] [16] [18] [19] [26] [31] [33] [34] [35] [38] [39] [40]
[42] [44] [47] [57] [58] [59] [61] [64] [67] [68] [70] — authors, year, venue, volume, issue and
pages all agree with the DOI record or the publisher's own page.

Two that took a second look:

- **[70] Wen, Kveton, Ashkan** — a search snippet claimed four authors including Eydgahi. PMLR
  (the publisher) lists **three**. The entry was already correct; the snippet was wrong. This is
  why the audit uses publisher records and not snippets.
- **[28] Hevner et al.** — Crossref's JSTOR-supplied record says pages 75–**106**; OpenAlex and the
  journal's own pagination say 75–**105**. Kept as 75–105 (two sources against one, and 75–106 is
  the familiar last-page-plus-one artefact in JSTOR deposits).

## 5. Could not be fully confirmed — flagged, not silently accepted

| №    | Entry             | What is confirmed                                    | What is not                                                                                  |
| ---- | ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [30] | Horne & Östberg 1976 | authors, title, year, volume 4, issue 2, pages 97–110 | _International Journal of Chronobiology_ ceased publication in 1982 and has no online archive or DOI; verified against the field's consistent secondary record, not the publisher |
| [55] | GDPR              | OJ **L 119**, **4.5.2016** (EUR-Lex record)          | the page range **1–88** — EUR-Lex returns an empty body to automated requests, so the extent is the standard citation rather than one read off the publisher's record             |
| [1] [2] | ДСТУ standards | number, title, publisher, year, effective date        | the printed extent (removed from the entries rather than asserted)                                                                                                                |

Neither [30] nor [55] is load-bearing for a numeric claim: [30] supports the existence of the MEQ
instrument, and the operative rMEQ cut-offs come from [9], which is confirmed exactly.

## 6. The eleven arguments that cited nothing

Each now carries a source, or is explicitly framed as our own result. **None is left presented as
established knowledge with nothing behind it.**

| Argument                                  | Where                | Resolution                                               |
| ----------------------------------------- | -------------------- | -------------------------------------------------------- |
| arm A's EDF rule                          | §5.2.1, табл.        | [42] Liu & Layland 1973                                  |
| arm A's list scheduling                   | §5.2.1, табл.        | [26] Graham 1966                                         |
| the blend's simplex projection            | §4.3                 | [18] Duchi et al. 2008                                   |
| the transfer analysis                     | §3.7                 | [27] EDPB Guidelines 05/2021 v2.0                        |
| Art. 29 adequacy for EU/EEA               | §3.7                 | [8] Закон України № 2297-VI, cited at the article        |
| the NFR-P1 acceptability argument         | §6.6                 | [48] Nielsen 1993 (the 0,1 / 1 / 10 s response limits)   |
| chronotype by age, the student class mix  | §6.4                 | [57] Roenneberg et al. 2007                              |
| the 2025 synchrony review                 | ВСТУП, §1.1          | [13] Chauhan et al. 2025                                 |
| the MEQ worker split (28/52/20)           | §6.4                 | [68] Taillard et al. 2004, **with the adapted-cutoffs qualification travelling with it** |
| no validated Ukrainian rMEQ exists        | Додаток Д            | [61] Senyk et al. 2022                                   |
| the rMEQ class cut-offs                   | §2.5.1, табл. 2.3    | [9] Adan & Almirall 1991                                 |
| UMUX-Lite as the secondary outcome        | §5.3, табл.          | [38] Lewis et al. 2013                                   |
| typical mobile latency                    | §6.6                 | **framed as our own measurement**; no citation claimed   |

## 7. Mechanical guarantees now enforced

Three properties are checked by a program on every run, not by reading:

1. **No listed reference is uncited.** All 71 are cited at least once in the body or appendices.
2. **No citation points at nothing.** Citations are written symbolically (`[@chauhan]`) in the
   chapter files and resolved to numbers *after* renumbering, so adding or removing an entry can
   no longer leave a citation stale. `verify-docx.py` fails on any surviving `[@`, `[nn` or `‹?›`.
3. **Formulas are not citations.** The renumberer treated `clip[0,1]` in (2.9) and (2.10) as a
   citation and rewrote it to `clip[‹?›, 1]` — silently, and the corruption was already in the
   committed `full.md`. A bracketed group is now rewritten only when every number in it is one the
   draft's own list used, and both formulas are asserted by name in `verify-docx.py`.
