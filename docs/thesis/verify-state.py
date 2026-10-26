#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Claims the documentation makes about the pipeline's own state must match the state.

Two of these have already gone stale, and neither was caught by reading:

  * `docs/study/sensitivity-results.md` summarised the grid as "N = 30 is supported in none of the
    75 cells (the smallest adult-mix N₈₀ is 33)". Cell 66 is adult mix with N₈₀ = 21. Both halves
    were wrong, and the wrong version had been quoted forward into a chapter draft.
  * `ASSEMBLY.md` said the inline-correction gap was "recorded but not closed, re-read §1.2/§1.4/
    §1.5 by hand". It had been closed the previous day, by the checker described two paragraphs
    above it in the same file. (ASSEMBLY.md is a frozen record since 2026-10-26; the claims pinned
    now are the ones `text/README.md` makes about the single source.)

Documentation about state drifts exactly the way the thesis text drifts, only more quietly,
because nobody re-reads it. The defence is the one that worked for the numbers: a claim that can
be checked programmatically is checked, not described.

Each entry below pins one sentence to a live value. Adding a claim to the prose without adding it
here is allowed — this file cannot know what it was not told — but a claim that IS here can no
longer rot silently: change the pipeline and the sentence fails until someone rewrites it.

Run:  python3 docs/thesis/verify-state.py
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

TEXT_README = "docs/thesis/text/README.md"
FULL = "docs/thesis/text/full.md"
SENSITIVITY = "docs/study/results/sensitivity.json"


def read(path: str) -> str:
    return io.open(path, encoding="utf-8").read()


def check_single_source() -> list[tuple[bool, str, str]]:
    """text/README says full.md is the only source: then the folder holds nothing a reader could
    mistake for another source of the text, and the retired assembler is gone."""
    said = "**`full.md` is the thesis's only source**" in read(TEXT_README)
    files = sorted(n for n in os.listdir("docs/thesis/text") if n.endswith(".md"))
    extra = [n for n in files if n not in ("full.md", "README.md")]
    gone = not os.path.exists("docs/thesis/assemble.py")
    return [(said and not extra and gone, "text/README 'full.md is the only source'",
             f"claim={said}, other .md in text/: {extra or 'none'}, assemble.py gone={gone}")]


def check_chapters() -> list[tuple[bool, str, str]]:
    """text/README's «Розділів: N.» against the chapters full.md has."""
    m = re.search(r"\*\*Розділів: (\d+)\.\*\*", read(TEXT_README))
    live = len(re.findall(r"^# РОЗДІЛ \d+ ", read(FULL), re.M))
    if m is None:
        return [(False, "text/README chapter count", f"no '**Розділів: N.**' sentence; live is {live}")]
    return [(int(m.group(1)) == live, "text/README chapter count", f"says {m.group(1)}, live {live}")]


def check_grid() -> list[tuple[bool, str, str]]:
    """The «всі 75 комірок» claim, against the results file the appendix is generated from."""
    live = len(json.load(io.open(SENSITIVITY, encoding="utf-8"))["cells"])
    # Only the TOTAL is a claim about the grid. К.1–К.5 count their own blocks (45, 15, 9, 12, 5)
    # and those are right; an earlier version of this function flagged all five.
    total = re.compile(r"(?:всі|усі|всіма|усіма|all)\s+\*{0,2}(\d+)\s*(?:cells|комірок|комірками)"
                       r"|(?<![\wа-яА-ЯіїєІЇЄ])(\d+) cells")
    hits = []
    for path in (FULL, TEXT_README):
        for m in total.finditer(read(path)):
            said = int(m.group(1) or m.group(2))
            hits.append((said == live, f"{path} grid total", f"says {said}, live {live}"))
    return hits or [(False, "grid total", "no cell-count claim found to check")]


def main() -> int:
    rows: list[tuple[bool, str, str]] = []
    for fn in (check_single_source, check_chapters, check_grid):
        rows.extend(fn())
    bad = [r for r in rows if not r[0]]
    for ok, what, detail in rows:
        print(f"  {'ok  ' if ok else 'STALE'} {what:44} {detail}")
    print(f"\n{len(rows)} state claims checked, {len(bad)} stale.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
