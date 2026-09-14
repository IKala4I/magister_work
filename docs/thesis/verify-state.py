#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Claims the documentation makes about the pipeline's own state must match the state.

Two of these have already gone stale, and neither was caught by reading:

  * `docs/study/sensitivity-results.md` summarised the grid as "N = 30 is supported in none of the
    75 cells (the smallest adult-mix N₈₀ is 33)". Cell 66 is adult mix with N₈₀ = 21. Both halves
    were wrong, and the wrong version had been quoted forward into a chapter draft.
  * `ASSEMBLY.md` said the inline-correction gap was "recorded but not closed, re-read §1.2/§1.4/
    §1.5 by hand". It had been closed the previous day, by the checker described two paragraphs
    above it in the same file.

Documentation about state drifts exactly the way the thesis text drifts, only more quietly,
because nobody re-reads it. The defence is the one that worked for the numbers: a claim that can
be checked programmatically is checked, not described.

Each entry below pins one sentence to a live value. Adding a claim to the prose without adding it
here is allowed — this file cannot know what it was not told — but a claim that IS here can no
longer rot silently: change the pipeline and the sentence fails until someone rewrites it.

Run:  python3 docs/thesis/verify-state.py
"""
from __future__ import annotations

import importlib.util
import io
import json
import re
import sys

sys.path.insert(0, "docs/thesis")
import assemble as A  # noqa: E402

_spec = importlib.util.spec_from_file_location("vp", "docs/thesis/verify-payloads.py")
vp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vp)

ASSEMBLY = "docs/thesis/ASSEMBLY.md"
TEXT_README = "docs/thesis/text/README.md"
SENSITIVITY = "docs/study/results/sensitivity.json"


def read(path: str) -> str:
    return io.open(path, encoding="utf-8").read()


def check_counts() -> list[tuple[bool, str, str]]:
    """Numbers the prose states about payload coverage, against what the checker reports."""
    c = vp.classify()
    asm = read(ASSEMBLY)
    out = []

    m = re.search(r"\*\*(\d+) of (\d+) accounted for\.\*\*", asm)
    live = (c["accounted"], c["total"])
    if m is None:
        out.append((False, "ASSEMBLY.md payload coverage",
                    f"no '**N of M accounted for.**' sentence found; live is {live[0]} of {live[1]}"))
    else:
        said = (int(m.group(1)), int(m.group(2)))
        out.append((said == live, "ASSEMBLY.md payload coverage",
                    f"says {said[0]} of {said[1]}, live {live[0]} of {live[1]}"))

    m = re.search(r"reached `full\.md` — (\d+) of (\d+)", asm)
    live = (len(c["inline_ok"]), c["inline_total"])
    if m is None:
        out.append((False, "ASSEMBLY.md inline coverage",
                    f"no 'reached `full.md` — N of M' sentence found; live is {live[0]} of {live[1]}"))
    else:
        said = (int(m.group(1)), int(m.group(2)))
        out.append((said == live, "ASSEMBLY.md inline coverage",
                    f"says {said[0]} of {said[1]}, live {live[0]} of {live[1]}"))

    # "Three of the twelve pass on a witness rather than on the text itself"
    witnessed = sum(1 for row in c["inline_ok"] if row[3])
    m = re.search(r"(\w+) of the twelve pass on a witness", asm)
    words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
    if m is None:
        out.append((False, "ASSEMBLY.md witness count",
                    f"no 'N of the twelve pass on a witness' sentence; live is {witnessed}"))
    else:
        said = words.get(m.group(1).lower())
        out.append((said == witnessed, "ASSEMBLY.md witness count",
                    f"says {m.group(1)} ({said}), live {witnessed}"))
    return out


def check_closed_claim() -> list[tuple[bool, str, str]]:
    """`ASSEMBLY.md` claims the inline-correction gap is closed. It is closed only while the
    checker actually runs the check — the sentence that went stale said the opposite."""
    asm = read(ASSEMBLY)
    says_closed = "the class of miss is\nclosed" in asm or "class of miss is closed" in asm
    has_check = hasattr(vp, "check_inline") and hasattr(vp, "CELL_WITNESS")
    return [(says_closed == has_check, "ASSEMBLY.md 'class of miss is closed'",
             f"prose says closed={says_closed}, verify-payloads has the check={has_check}")]


def check_text_files() -> list[tuple[bool, str, str]]:
    """Every file the text/README table marks ✅ must exist and be reachable by the assembler."""
    out = []
    for m in re.finditer(r"^\| `([\w.-]+\.md)`\s*\|.*\|\s*✅", read(TEXT_README), re.M):
        name = m.group(1)
        try:
            blocks = A.load_text_file(name)
            out.append((bool(blocks), f"text/README ✅ {name}",
                        f"{len(blocks)} blocks" if blocks else "loads empty"))
        except Exception as e:  # noqa: BLE001
            out.append((False, f"text/README ✅ {name}", f"does not load: {type(e).__name__}"))
    return out


def check_grid() -> list[tuple[bool, str, str]]:
    """The «всі 75 комірок» claim, against the results file the appendix is generated from."""
    live = len(json.load(io.open(SENSITIVITY, encoding="utf-8"))["cells"])
    # Only the TOTAL is a claim about the grid. З.1–З.5 count their own blocks (45, 15, 9, 12, 5)
    # and those are right; an earlier version of this function flagged all five.
    total = re.compile(r"(?:всі|усі|всіма|усіма|all)\s+\*{0,2}(\d+)\s*(?:cells|комірок|комірками)"
                       r"|(?<![\wа-яА-ЯіїєІЇЄ])(\d+) cells")
    hits = []
    for path in (ASSEMBLY, "docs/thesis/text/dodatok-z.md", TEXT_README):
        for m in total.finditer(read(path)):
            said = int(m.group(1) or m.group(2))
            hits.append((said == live, f"{path} grid total", f"says {said}, live {live}"))
    return hits or [(False, "grid total", "no cell-count claim found to check")]


def main() -> int:
    rows: list[tuple[bool, str, str]] = []
    for fn in (check_counts, check_closed_claim, check_text_files, check_grid):
        rows.extend(fn())
    bad = [r for r in rows if not r[0]]
    for ok, what, detail in rows:
        print(f"  {'ok  ' if ok else 'STALE'} {what:44} {detail}")
    print(f"\n{len(rows)} state claims checked, {len(bad)} stale.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
