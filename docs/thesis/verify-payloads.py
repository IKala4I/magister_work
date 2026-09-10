#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Every approved payload in corrections-rollup.md must have a placement in full.md.

The 2026-09-10 audit found 26 approved Ukrainian payloads that had never been assembled —
including the rebuilt §1.4 gap argument, the single longest-argued passage in the thesis.
Nothing about the assembler noticed: an edit that is never applied leaves the draft paragraph
looking untouched, and the fidelity report calls that success.

This checker closes the hole from the other side. It reads every blockquote payload out of the
rollup and asks whether its sentences actually reached the assembled text.

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


def main() -> int:
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

    total = sum(len(v) for v in payloads.values())
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

    ok = len(placed) + len(carried) + len(excluded)
    bad = len(partial) + len(missing) + len(broken)
    print(f"\n{ok} of {total} payloads accounted for; {bad} unaccounted.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
