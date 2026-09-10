#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The formatter brief quotes the text verbatim; this proves it still does.

A do-not-touch list is only useful if its strings are the ones actually in the document. When
the text is revised, a line here stops matching and this fails — which is the signal to update
the brief, not to quietly let it describe a document that no longer exists.

Run:  python3 docs/thesis/verify-brief.py
"""
from __future__ import annotations

import io
import re
import sys

BRIEF = "docs/thesis/formatter-brief.md"
FULL = "docs/thesis/text/full.md"

_FOLD = {ord(c): "'" for c in "’ʼ‘´"}
_FOLD.update({ord(c): "-" for c in "–—−"})


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", t.translate(_FOLD).replace("**", ""))


def main() -> int:
    brief = io.open(BRIEF, encoding="utf-8").read()
    m = re.search(r"```keep-verbatim\n(.*?)```", brief, re.S)
    if not m:
        print("no ```keep-verbatim``` block in the brief")
        return 1
    wanted = [ln.strip() for ln in m.group(1).split("\n") if ln.strip()]
    full = norm(io.open(FULL, encoding="utf-8").read())

    missing = [w for w in wanted if norm(w) not in full]
    for w in wanted:
        print(f"  {'ok  ' if norm(w) in full else 'GONE'} {w}")
    print(f"\n{len(wanted)} strings, {len(missing)} no longer in {FULL}")
    if missing:
        print("\nThe brief describes text that has changed. Update the brief — do not delete the line.")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
