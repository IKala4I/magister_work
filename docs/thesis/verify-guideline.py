#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The assembled thesis obeys the department's 2026 guideline where the rule is about the text.

The guideline (a department document kept outside the repository) sets rules of two kinds. Layout
— margins, fonts, spacing, where a caption sits — belongs to the .docx pipeline and is checked
there (`docx-pipeline/verify.py`). The rules below are about what the text itself says, so they
are checked on `text/full.md`, the product, on every change:

  appendices   lettered in order from the Ukrainian alphabet without Г, Ґ, Є, З, І, Ї, Й, О, Ч, Ь;
               each one referred to in the body; placed in the order of their first reference;
               no reference to an appendix that does not exist                        (p. 22)
  tables       every table has a caption with a number and a title, numbers run in order within
               the chapter or appendix, and every table is referred to in the text    (p. 20)
  figures      numbered within the chapter, every figure referred to, and never placed before
               its first reference                                                    (p. 18–19)
  sources      every entry of the list is cited                                       (p. 13)
  counts       what ВСТУП («Структура та обсяг роботи») and the реферат say the thesis contains –
               sources, appendices, figures, tables, formulas, chapters – is what it contains;
               the page count stays a placeholder here, filled from the rendered PDF  (p. 11, 15)

A check that has never failed has proved nothing, so `--self-test` breaks the text once per rule
and requires the rule to notice; CI runs both.

Run:  python3 docs/thesis/verify-guideline.py [--self-test]
"""
from __future__ import annotations

import io
import re
import sys

FULL = "docs/thesis/text/full.md"
LETTERS = "АБВДЕЖИКЛМНПРСТУФХЦШЩЮЯ"
NUM = r"(?:\d+|[А-ЯІЇЄҐ])\.\d+"
TABLE_CAP = re.compile(rf"^Таблиця ({NUM})(?:\s+–\s+\S|$)")
FIG_CAP = re.compile(rf"^(?:Рисунок|Рис\.) ({NUM})(?:\s+–)?\s+\S")
APP_HEAD = re.compile(r"^## Додаток ([А-ЯІЇЄҐ])\b")
APP_REF = re.compile(r"(?i)(?:додат(?:ок|ку|ка|ком|ки|ків|ках|ками|кам)|дод\.)\s+([А-ЯІЇЄҐ])(?:\s+і\s+([А-ЯІЇЄҐ]))?(?![\w’'])")
CITE = re.compile(r"(?<!∈ )(?<!∈)\[(\d+(?:\s*,\s*\d+)*)(?:,\s*с\.\s*[\d–-]+)?\]")


def _ref(kind: str, num: str) -> re.Pattern:
    stems = {"table": r"(?:таблиц[яіюеї]|таблицею|табл\.)", "figure": r"(?:рисун(?:ок|ку|ка|ком)|рис\.)"}[kind]
    return re.compile(rf"(?i){stems}\s+(?:\d+\.\d+[–,]\s*)?{re.escape(num)}(?!\d)")


def check(lines: list[str]) -> list[str]:
    bad: list[str] = []
    fence = False
    prose: list[tuple[int, str]] = []          # (line number, text) outside code, captions excluded later
    for n, s in enumerate(lines, 1):
        if s.startswith("```"):
            fence = not fence
            continue
        if not fence:
            prose.append((n, s))
    heads = {s: n for n, s in prose if s.startswith("# ")}
    refs_at = next((n for s, n in heads.items() if "СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ" in s), None)
    apps_at = next((n for s, n in heads.items() if s.strip() == "# ДОДАТКИ"), None)
    if refs_at is None or apps_at is None:
        return ["structure: «СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ» or «ДОДАТКИ» heading not found"]

    # ---- appendices
    apps = [(n, APP_HEAD.match(s).group(1)) for n, s in prose if APP_HEAD.match(s)]
    got = "".join(letter for _, letter in apps)
    if got != LETTERS[:len(apps)]:
        bad.append(f"appendices: lettered «{got}», expected «{LETTERS[:len(apps)]}»")
    first: dict[str, int] = {}
    for n, s in prose:
        if s.startswith("#"):
            continue
        for m in APP_REF.finditer(s):
            for letter in (m.group(1), m.group(2)):
                if letter is None:
                    continue
                if letter not in got:
                    bad.append(f"appendices: L{n} refers to «додаток {letter}», which does not exist")
                elif n < refs_at:
                    first.setdefault(letter, n)
    for _, letter in apps:
        if letter not in first:
            bad.append(f"appendices: Додаток {letter} is never referred to in the body")
    order = "".join(sorted(first, key=lambda k: (first[k], got.index(k))))
    if order != "".join(c for c in got if c in first):
        bad.append(f"appendices: first referred to in the order «{order}», placed in the order «{got}»")

    # ---- tables and figures
    def unit(n: int) -> str:
        """The chapter number or appendix letter a line belongs to."""
        cur = ""
        for hn, hs in sorted((v, k) for k, v in heads.items()):
            if hn > n:
                break
            m = re.match(r"^# РОЗДІЛ (\d+)", hs)
            cur = m.group(1) if m else ""
        for an, letter in apps:
            if an <= n:
                cur = letter
        return cur

    body = [(n, s) for n, s in prose if not s.startswith("|")]
    for kind, cap in (("table", TABLE_CAP), ("figure", FIG_CAP)):
        seen: dict[str, int] = {}
        counter: dict[str, int] = {}
        for n, s in body:
            m = cap.match(s)
            if not m:
                continue
            num = m.group(1)
            u, k = num.split(".")
            counter[u] = counter.get(u, 0) + 1
            if num in seen:
                bad.append(f"{kind}s: number {num} is used twice (L{seen[num]}, L{n})")
            seen[num] = n
            if u != unit(n) or int(k) != counter[u]:
                bad.append(f"{kind}s: L{n} is numbered {num}; expected {unit(n)}.{counter[u]}")
            rx = _ref(kind, num)
            hits = [bn for bn, bs in body if bn != n and not cap.match(bs) and not bs.startswith("[МІСЦЕ ДЛЯ")
                    and rx.search(bs)]
            if not hits:
                bad.append(f"{kind}s: {num} (L{n}) is never referred to in the text")
            elif kind == "figure" and min(hits) > n:
                bad.append(f"figures: {num} (L{n}) stands before its first reference, L{min(hits)}")
    # a table without a caption: the nearest non-empty line above a table's first row
    for i, (n, s) in enumerate(prose):
        if s.startswith("|") and not prose[i - 1][1].startswith("|"):
            j = i - 1
            while j >= 0 and not prose[j][1].strip():
                j -= 1
            above = [prose[j][1]] + ([prose[k][1] for k in range(j - 1, -1, -1) if prose[k][1].strip()][:1])
            if not any(TABLE_CAP.match(a) for a in above):
                bad.append(f"tables: the table at L{n} has no caption «Таблиця N» above it")

    # ---- sources
    entries = [int(m.group(1)) for n, s in prose if refs_at < n < apps_at
               for m in [re.match(r"^(\d+)\. ", s)] if m]
    if entries != list(range(1, len(entries) + 1)):
        bad.append("sources: the list is not numbered 1..N in order")
    cited = {int(x) for n, s in prose if not (refs_at < n < apps_at)
             for m in CITE.finditer(s) for x in re.split(r"\s*,\s*", m.group(1))}
    for k in entries:
        if k not in cited:
            bad.append(f"sources: entry [{k}] is never cited")
    # ---- counts stated in ВСТУП and in the реферат (both languages)
    formulas = sum(1 for n, s in prose if re.search(r"\s{2,}\(\d+\.\d+\)\s*$", s))
    n_tables = sum(1 for n, s in body if TABLE_CAP.match(s))
    n_figs = sum(1 for n, s in body if FIG_CAP.match(s))
    chapters = sum(1 for s in heads if re.match(r"^# РОЗДІЛ \d", s))
    words = {"шести": 6, "п’яти": 5, "чотирьох": 4, "семи": 7}
    stated = [
        ("ВСТУП", r"^Структура та обсяг роботи\.", [
            (r"із (\d+) найменуван", len(entries), "sources"), (r"і (\d+) додатк", len(apps), "appendices"),
            (r"рисунків – (\d+)", n_figs, "figures"), (r"таблиць – (\d+)", n_tables, "tables"),
            (r"формул – (\d+)", formulas, "formulas"), (r"сторінок – (\[кількість сторінок\])", None, "pages")]),
        ("реферат", r"^Обсяг роботи: ", [
            (r"рисунків – (\d+)", n_figs, "figures"), (r"таблиць – (\d+)", n_tables, "tables"),
            (r"додатків – (\d+)", len(apps), "appendices"), (r"джерел – (\d+)", len(entries), "sources"),
            (r"сторінок – (\[кількість сторінок\])", None, "pages")]),
        ("abstract", r"^The thesis comprises ", [
            (r"(\d+) figures", n_figs, "figures"), (r"(\d+) tables", n_tables, "tables"),
            (r"(\d+) appendices", len(apps), "appendices"), (r"(\d+) references", len(entries), "sources"),
            (r"(\[number of pages\]) pages", None, "pages")]),
    ]
    for where, start, items in stated:
        line = next((s for n, s in prose if re.match(start, s)), None)
        if line is None:
            bad.append(f"counts: {where} has no sentence starting «{start.strip('^')}»")
            continue
        for rx, want, what in items:
            m = re.search(rx, line)
            if not m:
                bad.append(f"counts: {where} does not state the number of {what}")
            elif want is not None and int(m.group(1)) != want:
                bad.append(f"counts: {where} says {m.group(1)} {what}, the thesis has {want}")
        if where == "ВСТУП":
            m = re.search(r"(\w+) розділів", line)
            if not m or words.get(m.group(1)) != chapters:
                bad.append(f"counts: ВСТУП says «{m.group(1) if m else '?'} розділів», the thesis has {chapters}")
    return bad


# One mutation per rule: (what it breaks, find, replace, a fragment the failure message must carry).
def mutations(text: str) -> list[tuple[str, str, str]]:
    first_table = next(m.group(0) for m in re.finditer(r"(?m)^Таблиця 1\.1.*$", text))
    return [
        ("an appendix lettered with an excluded letter",
         text.replace("## Додаток В", "## Додаток Г", 1), "lettered"),
        ("an appendix nobody refers to",
         re.sub(r"(?i)наведено в додатку А\.", "наведено окремо.", text, count=1), "never referred to in the body"),
        ("a reference to an appendix that does not exist",
         text.replace("в додатку А.", "в додатку Ю.", 1), "does not exist"),
        ("an abbreviated reference («дод. Ю») to an appendix that does not exist",
         re.sub(r"дод\. [А-Я]", "дод. Ю", text, count=1), "does not exist"),
        ("appendices out of the order of reference",
         text.replace("в додатку А.", "в додатку Б.", 1).replace("в додатку Б (", "в додатку А (", 1), "placed in the order"),
        ("a table without a caption",
         text.replace(first_table + "\n", "", 1), "has no caption"),
        ("a table nobody refers to",
         re.sub(r"(?i)таблиц[яіюеї]\s+1\.1(?!\d)", "таблиці", text.replace(first_table, "\x00", 1)).replace("\x00", first_table),
         "1.1 (L"),
        ("a table numbered out of order",
         text.replace("Таблиця 1.2", "Таблиця 1.9", 1), "expected 1.2"),
        ("a figure before its first reference",
         text.replace("; рисунок 3.3)", ")", 1) + "\nДіаграму наведено на рисунку 3.3.\n",
         "3.3 (L"),
        ("a figure nobody refers to",
         text.replace("(рисунок 3.1)", "", 1), "3.1 (L"),
        ("a table count in the реферат that the thesis does not have",
         re.sub(r"(Обсяг роботи: [^\n]*таблиць – )\d+", r"\g<1>99", text, count=1), "реферат says 99 tables"),
        ("a source count in ВСТУП that the list does not have",
         re.sub(r"із \d+ найменуван", "із 66 найменуван", text, count=1), "ВСТУП says 66 sources"),
        ("a page count typed by hand",
         text.replace("сторінок – [кількість сторінок]", "сторінок – 162", 1), "does not state the number of pages"),
        ("a source nobody cites",
         re.sub(r"\[(\d+)\] на вимогу", "на вимогу", text, count=1), "is never cited"),
    ]


def main() -> int:
    text = io.open(FULL, encoding="utf-8").read()
    if "--self-test" in sys.argv:
        failed = 0
        for what, broken, needle in mutations(text):
            if broken == text:
                print(f"  FAIL self-test «{what}»: the mutation changed nothing"); failed += 1
                continue
            got = check(broken.split("\n"))
            ok = any(needle in g for g in got)
            print(f"  {'ok  ' if ok else 'FAIL'} breaks on {what}" + ("" if ok else f" — got {got[:2]}"))
            failed += not ok
        print(f"\n{len(mutations(text))} negative controls, {failed} did not fire")
        return 1 if failed else 0
    bad = check(text.split("\n"))
    for b in bad:
        print("  FAIL", b)
    print(f"\n{len(bad)} guideline violations")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
