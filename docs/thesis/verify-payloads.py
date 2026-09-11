#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Every approved payload in corrections-rollup.md must have a placement in full.md.

The 2026-09-10 audit found 26 approved Ukrainian payloads that had never been assembled —
including the rebuilt §1.4 gap argument, the single longest-argued passage in the thesis.
Nothing about the assembler noticed: an edit that is never applied leaves the draft paragraph
looking untouched, and the fidelity report calls that success.

This checker closes the hole from the other side. It reads every blockquote payload out of the
rollup and asks whether its sentences actually reached the assembled text.

**Inline corrections too, since 2026-09-11.** The rollup does not state every correction as a
blockquote: some are written inline as `X` → `Y` — a table cell, a version string, a JSON field.
Nothing checked those, and §1.4 (a) («табл. 1.2, рядок D7: `+` → `◐`») proved what that costs: its
footnote payload was placed, so the legend under the table defined a symbol no cell in the table
used, and the row went on claiming a completed field study that §1.4's own next three paragraphs
deny. Every delimited `X → Y` outside a blockquote is now checked for the right-hand side. A
right-hand side too short to be evidence on its own — `◐` appears in the legend as well — needs a
`CELL_WITNESS` entry naming a longer string that must be present, on the same principle as
CARRIED_ELSEWHERE: an exemption is a claim about the text, and the claim is checked.

Two kinds of payload legitimately have no verbatim placement, and neither is allowed to pass
silently:

  * NOT_THESIS_TEXT — owner notes, English commentary, source errata. Each carries its reason.
  * CARRIED_ELSEWHERE — the payload's substance is in the thesis, in the wording a chapter file
    settled on rather than the rollup's draft of it. Each carries a **witness**: a sentence that
    must be present in full.md. If the witness disappears, the exemption fails with it. An
    exemption here is a claim about the text, and the claim is checked.

Run:  python3 docs/thesis/verify-payloads.py
"""
from __future__ import annotations

import io
import re
import sys

sys.path.insert(0, "docs/thesis")
import assemble as A  # noqa: E402

FULL = "docs/thesis/text/full.md"

NOT_THESIS_TEXT: dict[tuple[str, int], str] = {
    ("§2.3", 3): "source erratum — records that spec-conflicts L22 was corrected; not text to print",
    ("§2.3", 4): "English note carrying the consequence to §2.6.2 and Додаток Ж",
    ("4.2", 0): "ANNOTATION payload — assembled from text/anotaciya-ta-vysnovky.md",
    ("4.2", 1): "ANNOTATION payload — same",
    ("9.", 0): "English description of the Розділ 5/6 rebuild, not a paragraph of the thesis",
}

# (key, index) -> (why it has no verbatim placement, the sentence that must be there instead)
CARRIED_ELSEWHERE: dict[tuple[str, int], tuple[str, str]] = {
    ("3.1", 0): (
        "§3 states the four full-strength claims as vocabulary for the summaries; the finding "
        "itself is argued in Розділ 6 §6.3–§6.4 and restated in Анотація and ВИСНОВКИ",
        "зареєстрований заздалегідь тест на змістовну невдачу методу спрацював",
    ),
    ("3.2", 0): (
        "same — the one-rule scope limit is stated wherever the comparison is reported",
        "порівняння з наявними планувальниками не проводилося",
    ),
    ("3.3", 0): (
        "same — the field-study scope limit travels with every simulation claim",
        "гіпотези H1–H4 лишаються неперевіреними",
    ),
    ("3.4", 0): (
        "same — the non-compounding result is reported with its bounds at each mention",
        "він зростає на 0,3–1,4 в. п. за чотиритижневу половину дослідження",
    ),
    ("4.1", 1): (
        "АНОТАЦІЯ ¶ — written out in text/anotaciya-ta-vysnovky.md and spliced from there",
        "обґрунтуванням статистичної потужності",
    ),
    ("10.1a", 1): (
        "ВИСНОВКИ п.7 — written out in text/anotaciya-ta-vysnovky.md and spliced from there",
        "Виконано двоетапне симуляційне оцінювання",
    ),
    ("13.4", 0): (
        "the specs-as-assumptions framing opens Розділ 6 §6.8, without the file-number aside",
        "Специфікації системи є **згенерованими припущеннями, а не вихідними даними**",
    ),
    ("(c)", 0): (
        "the Taillard class-mix qualification is in Розділ 6 §6.4, carrying its citation",
        "за межами\nкласів, які автори адаптували саме для цієї вибірки",
    ),
    ("§4.1", 0): (
        "paragraph 1 of 3 — the live-query hook is corrected in place in §4.1 by run_sub, so the "
        "surrounding sentences about Zustand and Expo Router are not disturbed",
        "власним хуком `useLiveRows`",
    ),
}

_PUNCT = re.compile(r"[^0-9A-Za-zА-Яа-яЇїІіЄєҐґ ]+")


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", _PUNCT.sub(" ", A.fold(t))).strip().lower()


def coverage(payload: str, haystack: str) -> float:
    """Share of the payload's 40-character shingles present in the assembled text."""
    p = norm(payload)
    if len(p) < 60:
        return 1.0 if p in haystack else 0.0
    step = max(30, (len(p) - 40) // 14 or 1)
    sh = [p[i:i + 40] for i in range(0, len(p) - 40, step)]
    return sum(1 for s in sh if s in haystack) / len(sh)


ARROW = re.compile(r"(`[^`]+`|«[^»]+»)\s*→\s*(`[^`]+`|«[^»]+»)")

# A right-hand side shorter than this cannot prove its own placement: it would match text that
# was already there. Each needs a witness below. So does any right-hand side carrying an `…`
# ellipsis — the rollup writes those for "the tail of the sentence, unchanged", and they have no
# verbatim form to look for.
MIN_EVIDENCE = 3


def tight(t: str) -> str:
    """Whitespace folded, nothing else. `norm()` strips punctuation and case, which is right for
    a paragraph and wrong here: it turned `"telemetry": {...}` into `telemetry` and matched the
    word in a §4 sentence, passing a Додаток Ж correction that had never been applied."""
    return re.sub(r"\s+", " ", t).strip()

# rollup line -> (why the arrow alone is not evidence, the string that must be in full.md).
# A witness prefixed with "!" is an ABSENCE claim: that string must NOT be there. Use it where
# the correction landed in a wording a chapter settled on, so the only checkable fact is that
# the old wording is gone.
CELL_WITNESS: dict[int, tuple[str, str]] = {
    479: ("`◐` also appears in the legend under the table, so presence proves nothing; the "
          "claim is that the row's own D7 cell carries it",
          "| Hourwell (ця робота)"),
    1010: ("the rollup writes the correction elliptically («…з підтвердженням…») and UC-10 "
           "closes on the 30-day legal limit rather than the rollup's millisecond aside",
           "з підтвердженням **у застосунку** (номер запису та час завершення)"),
    1344: ("the rollup writes the object as `{...}`; the appendix carries its real body",
           '"telemetry": { "status": "FEASIBLE"'),
    1345: ("elliptical in the rollup; the appendix carries the service's real shapes "
           "(`rationale.py`), with `n_effective` elided the way it elides identifiers",
           '"rationale_key": "energy_peak"'),
    1297: ("applied in both places, each in the wording its own section settled on — §3.8 "
           "«Inter (400/500/600/700)», Додаток В «Inter (статичні накреслення …; інтерфейс і "
           "заголовки)». What is checkable is that the old name is gone from both",
           "!Inter Variable"),
}


def inline_corrections(path: str = A.ROLLUP) -> list[tuple[int, str, str]]:
    """Every delimited `X` → `Y` the rollup states outside a blockquote or a fenced block."""
    out, fenced = [], False
    for n, line in enumerate(io.open(path, encoding="utf-8").read().split("\n"), 1):
        if line.startswith("```"):
            fenced = not fenced
            continue
        if fenced or line.startswith(">"):
            continue
        for m in ARROW.finditer(line):
            out.append((n, m.group(1)[1:-1], m.group(2)[1:-1]))
    return out


def check_inline(full: str, full_tight: str) -> tuple[list, list]:
    ok, bad = [], []
    for n, lhs, rhs in inline_corrections():
        if n in CELL_WITNESS:
            why, witness = CELL_WITNESS[n]
            if witness.startswith("!"):
                good = norm(witness[1:]) not in full
                why = f"absence witness — {why}"
            else:
                good = norm(witness) in full
            (ok if good else bad).append((n, lhs, rhs, witness, why))
            continue
        if len(rhs.strip()) < MIN_EVIDENCE or "…" in rhs:
            why = ("carries an … ellipsis" if "…" in rhs
                   else f"right-hand side is {len(rhs.strip())} chars")
            bad.append((n, lhs, rhs, None, f"{why} — add a CELL_WITNESS entry"))
            continue
        (ok if tight(rhs) in full_tight else bad).append((n, lhs, rhs, None, "not found in full.md"))
    return ok, bad


def classify() -> dict:
    """Every payload and inline correction, sorted into outcomes. Returned rather than printed so
    `verify-state.py` can check the counts the prose in ASSEMBLY.md claims against the live ones —
    a documented state claim drifts as quietly as a thesis sentence does, and twice already has."""
    raw = io.open(FULL, encoding="utf-8").read()
    full = norm(raw)
    payloads = A.load_rollup_payloads()

    placed, excluded, carried, missing, partial, broken = [], [], [], [], [], []
    for key in sorted(payloads):
        for i, paras in enumerate(payloads[key]):
            ref = f"{key}[{i}]"
            if (key, i) in NOT_THESIS_TEXT:
                excluded.append((ref, NOT_THESIS_TEXT[(key, i)]))
                continue
            if (key, i) in CARRIED_ELSEWHERE:
                why, witness = CARRIED_ELSEWHERE[(key, i)]
                if norm(witness) in full:
                    carried.append((ref, why))
                else:
                    broken.append((ref, witness))
                continue
            cov = min(coverage(p, full) for p in paras)
            if cov >= 0.80:
                placed.append((ref, cov))
            elif cov >= 0.30:
                partial.append((ref, cov, paras[0][:66]))
            else:
                missing.append((ref, cov, paras[0][:66]))

    inline_ok, inline_bad = check_inline(full, tight(raw))
    return {
        "placed": placed, "carried": carried, "excluded": excluded,
        "partial": partial, "missing": missing, "broken": broken,
        "inline_ok": inline_ok, "inline_bad": inline_bad,
        "total": sum(len(v) for v in payloads.values()),
        "accounted": len(placed) + len(carried) + len(excluded),
        "inline_total": len(inline_ok) + len(inline_bad),
    }


def main() -> int:
    c = classify()
    placed, carried, excluded = c["placed"], c["carried"], c["excluded"]
    partial, missing, broken = c["partial"], c["missing"], c["broken"]
    inline_ok, inline_bad, total = c["inline_ok"], c["inline_bad"], c["total"]

    print(f"corrections-rollup.md carries {total} blockquote payloads.\n")
    print(f"  placed verbatim in full.md              {len(placed):3}")
    print(f"  carried elsewhere, witness present      {len(carried):3}")
    for ref, why in carried:
        print(f"      {ref:12} {why}")
    print(f"  not thesis prose, excluded by name      {len(excluded):3}")
    for ref, why in excluded:
        print(f"      {ref:12} {why}")

    for label, rows in (("EXEMPTION BROKEN — witness gone", broken),):
        if rows:
            print(f"  {label:38} {len(rows):3}")
            for ref, w in rows:
                print(f"      {ref:12} witness absent: {w[:60]!r}")
    for label, rows in (("PARTIALLY PLACED", partial), ("NOT PLACED", missing)):
        print(f"  {label:38} {len(rows):3}")
        for ref, cov, head in rows:
            print(f"      {ref:12} {cov:4.0%}  {head}…")

    n_in = c["inline_total"]
    print(f"\n  inline `X` → `Y` corrections placed     {len(inline_ok):3} of {n_in}")
    for n, lhs, rhs, witness, why in inline_ok:
        if witness:
            print(f"      rollup:{n:<6} {lhs} → {rhs}   witness present: {witness[:44]!r}")
    if inline_bad:
        print(f"  INLINE CORRECTION NOT PLACED           {len(inline_bad):3}")
        for n, lhs, rhs, witness, why in inline_bad:
            print(f"      rollup:{n:<6} {lhs[:30]} → {rhs[:30]}  — {why}")

    ok = c["accounted"]
    bad = len(partial) + len(missing) + len(broken) + len(inline_bad)
    print(f"\n{ok} of {total} payloads accounted for, "
          f"{len(inline_ok)} of {n_in} inline corrections placed; {bad} unaccounted.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
