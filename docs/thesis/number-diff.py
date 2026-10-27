#!/usr/bin/env python3
"""Multiset diff of the numeric tokens of full.md: a base commit against the working tree.

A text-wide wave (style, cuts) must not change a number; this lists every numeric token removed
(-) or added (+) per top-level '# ' section, so each one is justified in the commit message.
Not a gate — it has no notion of "allowed"; it is the evidence the gates cannot give.

Run from the repository root:  python3 docs/thesis/number-diff.py <base-commit> [section-prefix]
"""
import collections
import io
import re
import subprocess
import sys

P = "docs/thesis/text/full.md"
NUM = re.compile(r"(?<![\w$])[+−-]?\d+(?:[  ]\d{3})*(?:[,.·]\d+)*(?:⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?")


def sections(text):
    out, cur = collections.OrderedDict(), "(front)"
    out[cur] = []
    for line in text.split("\n"):
        if line.startswith("# "):
            cur = line[2:].strip()[:40]
            out.setdefault(cur, [])
        out[cur].append(line)
    return {k: collections.Counter(NUM.findall("\n".join(v))) for k, v in out.items()}


base = subprocess.run(["git", "show", f"{sys.argv[1]}:{P}"], capture_output=True, text=True).stdout
now = io.open(P, encoding="utf-8").read()
b, n = sections(base), sections(now)
only = sys.argv[2] if len(sys.argv) > 2 else ""
tot = 0
for k in list(dict.fromkeys(list(b) + list(n))):
    if only and not k.startswith(only):
        continue
    bb, nn = b.get(k, collections.Counter()), n.get(k, collections.Counter())
    rem, add = bb - nn, nn - bb
    if rem or add:
        tot += sum(rem.values()) + sum(add.values())
        print(f"== {k}")
        if rem:
            print("  -", " ".join(f"{t}×{c}" if c > 1 else t for t, c in sorted(rem.items())))
        if add:
            print("  +", " ".join(f"{t}×{c}" if c > 1 else t for t, c in sorted(add.items())))
print(f"total changed tokens: {tot}")
