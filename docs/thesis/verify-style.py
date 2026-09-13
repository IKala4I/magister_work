#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The assembled thesis obeys the style decisions the owner made on reading the pages.

Owner directive 2026-09-13, after reading `text/full.md` as pages: business style. Bold is for
headings only; the prose dash is the spaced en dash, never the em dash; a code listing carries
code and nothing else — its explanation is prose; repository paths, ADR numbers and other
project-internal artefacts do not belong in a thesis at all, so no font decision about them is
needed. Each rule is stated once here and checked on every change; a rule that is only written
down in the README drifts the way every other description of state has (README rule 5).

Runs on `text/full.md`, the product, because `assemble.py` cannot run in CI (it reads the
git-ignored `draft.docx`).

Run:  python3 docs/thesis/verify-style.py
"""
from __future__ import annotations

import io
import re
import sys

FULL = "docs/thesis/text/full.md"

WHOLLY_BOLD = re.compile(r"^\*\*[^*]+\*\*$")
PLACEHOLDER = re.compile(r"^\*\*\[МІСЦЕ ДЛЯ")
COMMENT = {
    "typescript": re.compile(r"\s//"),
    "python": re.compile(r"\s#"),
    "sql": re.compile(r"(^|\s)--"),
}


def main() -> int:
    lines = io.open(FULL, encoding="utf-8").read().split("\n")
    bad: list[tuple[int, str, str]] = []
    fence: str | None = None
    for n, line in enumerate(lines, 1):
        if line.startswith("```"):
            fence = None if fence is not None else line[3:].strip()
            continue
        if fence is not None:
            if "\u2019" in line:
                bad.append((n, "listing", "typographic apostrophe inside code"))
            rx = COMMENT.get(fence)
            if rx and rx.search(line):
                bad.append((n, "listing", f"comment in a {fence} listing — the explanation goes to prose"))
            continue
        if "\u2014" in line:
            bad.append((n, "dash", "em dash — the prose dash is the spaced en dash «–»"))
        if "**" in line and not (line.startswith("#") or WHOLLY_BOLD.match(line.strip())
                                 or PLACEHOLDER.match(line.strip())):
            bad.append((n, "bold", "bold inside a paragraph — bold is for headings only"))
        if "ADR-" in line:
            bad.append((n, "artefact", "ADR number — decisions are stated, not cited to a record"))
        if re.search(r"(?<![\w/])(docs|specs)/", line) and "http" not in line:
            bad.append((n, "artefact", "repository path — name the file or say «у репозиторії»"))
    for n, kind, why in bad:
        print(f"  FAIL L{n:<5} {kind:9} {why}")
        print(f"        {lines[n - 1][:110]}")
    print(f"\n{len(lines)} lines, {len(bad)} style violations")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
