#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check an assembled `draft.docx` for edits that were missed and values that went stale.

Why this exists: `verify-numbers.py` guards the markdown, and the guard stops at the moment text
enters Word. Pasting rather than retyping is the main defence, but it does not catch an edit that
was skipped entirely, and it does not catch a stale sentence that nobody re-read. This does.

What it CANNOT do: it does not verify prose, argument, or numbers it was not told about. A clean
run means "none of the known-stale strings survive and every checked landmark is present" — not
"the chapter is right".

Run:  python3 docs/thesis/verify-docx.py [path/to/draft.docx]
      (default: docs/thesis/draft.docx — which is git-ignored, so this is a local check)

Exit 1 if any check fails. Run it BEFORE assembly too: it then lists what is still to do.
"""
from __future__ import annotations

import re
import sys
import zipfile

DEFAULT = "docs/thesis/draft.docx"

# --- (1) strings that must be GONE after assembly ------------------------------------------------
# each is (needle, why it must go)
BANNED = [
    ("Jest 30", "item 1 — the project pins jest 29.7"),
    ("ESLint 9", "item 1 — ESLint 10"),
    ("Inter Variable", "item 12 — static Inter instances"),
    ("Hugging Face", "item 26 — the service moved to a self-managed EU deployment"),
    ("bandit_cpsat", "item 7 — engine is learned | heuristic"),
    ("deep_work", "item 7 — the category enum is deep"),
    ("живі запити Drizzle useLiveQuery", "item 13 — the client uses its own useLiveRows hook;\n     # a bare «useLiveQuery» also matches табл. 3.3, which names it to explain the deviation"),
    ("onnxruntime", "item 60 (d) — the on-device ranker was not built"),
    ("SASRec-lite", "item 9 — deferred, and not in перспективи either"),
    ("no_feasible_slot", "item 7 — the service returns no_feasible_start"),
    ("10 тис. MAU", "item 3 — the audited figure is ≈ 3 тис."),
    ("≤ 2,5 с (95-й перцентиль, прогрітий бекенд)", "item 51 — NFR-P1 is ≤ 6,0 с on the device;\n     # «2,5 с» alone also matches Розділ 6, where the superseded figure is quoted on purpose"),
    ("підтвердженням листом", "item 43 — erasure is confirmed in-app"),
    ("анонімізований датасет", "item 36 — the released dataset is synthetic"),
    ("Анонімізований датасет", "item 36 — the released dataset is synthetic"),
    ("за перевищення 4·10⁴ літералів", "item 17 — the measured threshold is 3·10³;\n     # «4·10⁴» alone also matches §2.4 and §6.8, which cite it as the outer bound"),
    ("реєстрація OSF", "item 54 — no OSF registration"),
    ("реєстрацію OSF", "item 54 — no OSF registration"),
    ("сумлінна репліка", "item 8 (a) — arm A is heuristic + matched randomization"),
    ("перетягування блоку", "item 28 — v1 has a Move… picker, not drag"),
    ("п'яти розділів", "the work now has six chapters"),
    ("не проводилось", "ADR-0020 — the standing phrase is «поза межами роботи»"),
    ("не проводилося дослідження", "ADR-0020 — standing phrase"),
]

# --- (2) landmarks that must be PRESENT after assembly -------------------------------------------
PRESENT = [
    ("шести розділів", "ВСТУП structure sentence (assembly step 30)"),
    ("поза межами роботи", "the standing scope phrase (ADR-0020)"),
    ("цінювання виконано в симуляції", "the standing scope phrase, second half"),
    ("найраніший вільний слот", "§3.2 — the one rule compared against"),
    ("індивідуальної варіації", "the headline finding"),
    ("РОЗДІЛ 6", "the new chapter (assembly step 20)"),
    ("Додаток З", "the 75-cell grid (assembly step 28)"),
    ("Додаток И", "the registered predictions (assembly step 29)"),
    ("lapseObservedEvent", "лістинг 4.1 (U15)"),
    ("Taillard", "the MEQ class-mix citation"),
    ("Chauhan", "the 2025 synchrony review"),
    ("Senyk", "the Ukrainian CSM/MCTQ instruments"),
    ("Liu", "arm A's EDF citation"),
    ("Graham", "arm A's list-scheduling citation"),
    ("danger-text", "Додаток В's derived token (U21)"),
]

# --- (3) numbers that must appear with their corrected value -------------------------------------
# (needle that must be present, needle that must be absent, why)
NUMBER_PAIRS = [
    ("6,0 с", "≤ 2,5 с (95-й перцентиль", "NFR-P1 restated from device measurement (item 51);\n     # «≤ 2,5 с» alone matches §6.8, which cites the superseded figure as the refuted assumption"),
    ("3,7–4,1", "3,7 с p95", "the reference is a range, never one number (item 51 amended)"),
    ("172", "набір 170", "120 / 0,7 = 172; «170» rounds the recruitment burden down"),
    ("4,8", "виграш вечірніх типів у 5–10", "the evening gain is 4,8–10,2, not 5–10"),
    ("|A_m", "p = ε/m = 0,25", "the propensity is per-row ε/|A_m(x)| (item 20 amended)"),
]

# --- (4) references that must be gone / present --------------------------------------------------
REF_GONE = ["Hugging Face Hub", "ONNX Runtime Documentation", "PyTorch Documentation",
            "Sentence-Transformers"]
REF_PRESENT = ["Journal of the ACM", "Bell System Technical Journal", "Chronobiology International",
               "Journal of Biological Rhythms", "Biological Rhythm Research"]


def extract(path: str) -> str:
    if path.endswith(".md"):
        # the assembled markdown, checked before it ever reaches Word.
        # It goes through the same normalisation as the .docx path below — folding only the
        # needles and not the text was a real bug: «3,7–4,1» never matched its own en-dash.
        text = open(path, encoding="utf-8").read()
        for variant in "\u2019\u02bc\u2018\u00b4":
            text = text.replace(variant, "'")
        for variant in "\u2013\u2014\u2212":
            text = text.replace(variant, "-")
        return text
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    text = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml, re.S))
    text = (text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", '"').replace("&apos;", "'"))
    # Word stores the Ukrainian apostrophe as U+2019 and the dashes vary; normalise both, or a
    # stale string slips through on a character nobody typed deliberately. This was a real
    # false negative: «п'яти розділів» read as absent because the draft uses U+2019.
    for variant in "\u2019\u02bc\u2018\u00b4":
        text = text.replace(variant, "'")
    for variant in "\u2013\u2014\u2212":
        text = text.replace(variant, "-")
    return text


def norm(needle: str) -> str:
    """Apply to needles the same normalisation `extract` applies to the document."""
    for variant in "\u2019\u02bc\u2018\u00b4":
        needle = needle.replace(variant, "'")
    for variant in "\u2013\u2014\u2212":
        needle = needle.replace(variant, "-")
    return needle


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    try:
        text = extract(path)
    except FileNotFoundError:
        print(f"{path} not found — nothing to check (the .docx is git-ignored and lives locally)")
        return 0

    fails: list[str] = []
    checks = 0

    def report(ok: bool, label: str, why: str) -> None:
        nonlocal checks
        checks += 1
        print(f"{'ok  ' if ok else 'FAIL'} {label}" + ("" if ok else f"   — {why}"))
        if not ok:
            fails.append(label)

    print(f"== {path}: {len(text):,} characters ==\n-- strings that must be gone --")
    for needle, why in BANNED:
        report(norm(needle) not in text, f"absent: «{needle}»", why)

    print("-- landmarks that must be present --")
    for needle, why in PRESENT:
        report(norm(needle) in text, f"present: «{needle}»", why)

    print("-- corrected values --")
    for good, bad, why in NUMBER_PAIRS:
        report(norm(good) in text and norm(bad) not in text,
               f"«{good}» present and «{bad}» gone", why)

    print("-- reference list --")
    for needle in REF_GONE:
        report(norm(needle) not in text, f"reference removed: «{needle}»", "rollup §12.3 (a)")
    for needle in REF_PRESENT:
        report(norm(needle) in text, f"reference added: «{needle}»", "rollup §12.3 (b)")

    print(f"\n{checks} checks, {len(fails)} failures")
    for f in fails:
        print("  " + f)
    if fails:
        print("\nBefore assembly this list IS the remaining work — see docs/thesis/ASSEMBLY.md.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
