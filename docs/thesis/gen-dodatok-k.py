#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate Додаток К (all 75 sensitivity cells) from `docs/study/results/sensitivity.json`.

The appendix carries the claim "every cell reported, including losses and ties", so it must be
complete AND scannable. A 25-column dump is complete and unreadable; this emits one table per
registered block, showing only the factors that vary inside that block, with five value columns:
effect ± MC SE, verdict, efficiency, N₈₀ and the share of replicates with a positive effect.

Generated, never hand-edited – CI regenerates it and fails on a diff, so the appendix cannot drift
from the run. Since 2026-10-26 `text/full.md` is the thesis's only source, so the check reads the
appendix there: every table row of Додаток К in full.md must equal a generated row, in order, and
the summary sentence must match. The prose around the tables is the thesis's own text. Per-class effects and the attainable ceilings stay in the repository (see the file's
own closing note); printing them would add five columns for a claim that does not need them.

Usage:  python3 docs/thesis/gen-dodatok-k.py            # prints the generated appendix (to paste)
        python3 docs/thesis/gen-dodatok-k.py --check    # exit 1 if full.md's К tables drifted
"""
from __future__ import annotations

import io
import json
import math
import re
import sys

SRC = "docs/study/results/sensitivity.json"
FULL = "docs/thesis/text/full.md"
VERDICT = {"WIN": "В", "TIE": "Н", "LOSS": "П"}


def dec(x: str) -> str:
    """ДСТУ decimal comma and a real minus (U+2212) – the notation табл. 6.4 already uses.

    The appendix and Розділ 6 print the same grid ten pages apart, and before this they printed
    it in two notations: «+0,09 Н» in the chapter, «+0.09 ± 0.11» here. `formatter-brief.md` §7
    keeps the en dash and the apostrophe as they are precisely because a formatter would
    normalise them the wrong way; this normalisation goes the way the brief asks for.

    The English ANNOTATION is the one place that keeps the decimal point – a comma there reads
    as a thousands separator – and it contains no generated cell, so it is out of reach of this
    function by construction.
    """
    return x.replace(".", ",").replace("-", "\u2212")


def n80(cell) -> str:
    if cell["n80_over_grid_max"] or cell["n80_median"] is None:
        return "> 120"
    return str(math.ceil(cell["n80_median"]))


def row_values(c) -> list[str]:
    e = c["effect"]
    return [
        dec(f"{e['mean'] * 100:+.2f} ± {e['mc_se'] * 100:.2f}"),
        VERDICT[c["verdict"]],
        dec(f"{c['efficiency']:.2f}") if c["efficiency"] is not None else "–",
        n80(c),
        dec(f"{c['share_effect_positive']:.2f}"),
    ]


VALUE_HEADS = ["Ефект, в. п. ± MC SE", "Верд.", "Ефект-ність", "$N_{80}$", "Частка «> 0»"]


def table(rows: list[list[str]], heads: list[str]) -> str:
    body = ["| " + " | ".join(heads) + " |",
            "| " + " | ".join("---" for _ in heads) + " |"]
    body += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(body)


def caption(n: int, title: str) -> str:
    """Every table carries a number and a title (department guideline 2026, p. 20); the
    number is the appendix letter and the table's order in it."""
    return f"Таблиця К.{n} – {title}\n"


def main() -> int:
    cells = json.load(io.open(SRC, encoding="utf-8"))["cells"]
    by_index = {c["index"]: c for c in cells}
    verdicts = [c["verdict"] for c in cells]

    def pick(**kw):
        return sorted((c for c in cells if all(c[k] == v for k, v in kw.items())),
                      key=lambda c: c["index"])

    centre = dict(mix="adult", p0=0.45, tasks=4, prior="informative")

    parts: list[str] = []
    parts.append("""# Додаток К. Повна сітка змодельованих світів

> Статус: генерований текст. Файл створює `docs/thesis/gen-dodatok-k.py` з
> `docs/study/results/sensitivity.json`; редагувати вручну не можна – CI перегенерує його й
> завалить збірку на розбіжності. Це і є механізм, який тримає обіцянку «наведено кожну комірку,
> включно з програшами й нічиями».

У таблицях наведено всі 75 комірок сітки. Щоб таблиці лишалися читними, кожен блок сітки
подано окремо і в ньому показано лише ті фактори, які в цьому блоці змінюються; решта тримається на
центральному значенні (доросла вибірка, базовий рівень 0,45, чотири задачі на день, інформативний
приор, індивідуальне відхилення 0,3 і денний шум 0,6). Вердикт: В – виграш (ефект понад +1 в. п. і додатний щонайменше у 90 % повторень),
Н – нічия, П – програш (дзеркальна умова); ефекти округлено до сотих, вердикт визначено за
неокругленим значенням. Ефективність – відношення ефекту до аналітичної
стелі світу. $N_{80}$ – медіана по 40 повтореннях кількості завершених учасників для потужності 0,80,
округлена вгору; «> 120» означає, що медіана перевищує максимум сітки.
""")

    parts.append(f"""Підсумок за всіма 75 комірками: {verdicts.count('WIN')} виграшів,
{verdicts.count('TIE')} нічиїх, {verdicts.count('LOSS')} програшів.
""")

    # ---- Block A: s x sigma_shape x sigma_day at the centre (45 cells)
    a = pick(block="A", **centre)
    parts.append(f"\n## К.1. Блок A – ядро світу: сила візерунка × індивідуальне відхилення × денний шум ({len(a)} комірок)\n")
    parts.append("Комірки блоку A наведено в таблиці К.1; її ефекти та вердикти повторюють таблицю 6.4.\n")
    parts.append(caption(1, "Блок A сітки світів: сила візерунка × індивідуальне відхилення × денний шум"))
    parts.append(table(
        [[str(c["index"]), dec(f"{c['s']:g}"), dec(f"{c['sigma_shape']:g}"), dec(f"{c['sigma_day']:g}")] + row_values(c) for c in a],
        ["№", "s", "$σ_{shape}$", "$σ_{day}$"] + VALUE_HEADS))

    # ---- Block B: mix x s
    b = pick(block="B")
    shared_b = [c for c in a if c["s"] in {x["s"] for x in b} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## К.2. Блок B – склад вибірки за хронотипом × сила візерунка ({len(b) + len(shared_b)} комірок, з них {len(shared_b)} спільні з блоком A)\n")
    parts.append("Комірки блоку B наведено в таблиці К.2.\n")
    parts.append(caption(2, "Блок B сітки світів: склад вибірки за хронотипом × сила візерунка"))
    parts.append(table(
        [[str(c["index"]), c["mix"], dec(f"{c['s']:g}")] + row_values(c) for c in sorted(b + shared_b, key=lambda c: (c["mix"], c["s"]))],
        ["№", "Склад", "s"] + VALUE_HEADS))

    # ---- Block C: p0 x s
    cblk = pick(block="C")
    shared_c = [c for c in a if c["s"] in {x["s"] for x in cblk} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## К.3. Блок C – базовий рівень дотримання × сила візерунка ({len(cblk) + len(shared_c)} комірок, з них {len(shared_c)} спільні з блоком A)\n")
    parts.append("Комірки блоку C наведено в таблиці К.3.\n")
    parts.append(caption(3, "Блок C сітки світів: базовий рівень дотримання × сила візерунка"))
    parts.append(table(
        [[str(c["index"]), dec(f"{c['p0']:g}"), dec(f"{c['s']:g}")] + row_values(c) for c in sorted(cblk + shared_c, key=lambda c: (c["p0"], c["s"]))],
        ["№", "$p_0$", "s"] + VALUE_HEADS))

    # ---- Block D: K x s
    dblk = pick(block="D")
    shared_d = [c for c in a if c["s"] in {x["s"] for x in dblk} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## К.4. Блок D – кількість задач на день × сила візерунка ({len(dblk) + len(shared_d)} комірок, з них {len(shared_d)} спільні з блоком A)\n")
    parts.append("Комірки блоку D наведено в таблиці К.4.\n")
    parts.append(caption(4, "Блок D сітки світів: кількість задач на день × сила візерунка"))
    parts.append(table(
        [[str(c["index"]), str(c["tasks"]), dec(f"{c['s']:g}")] + row_values(c) for c in sorted(dblk + shared_d, key=lambda c: (c["tasks"], c["s"]))],
        ["№", "K", "s"] + VALUE_HEADS))

    # ---- Block E: prior x s
    e = pick(block="E")
    parts.append(f"\n## К.5. Блок E – тип приору × сила візерунка ({len(e)} комірок; порівнюються з відповідними комірками блоку A)\n")
    parts.append("Комірки блоку E наведено в таблиці К.5.\n")
    parts.append(caption(5, "Блок E сітки світів: тип приору × сила візерунка"))
    parts.append(table(
        [[str(c["index"]), c["prior"], dec(f"{c['s']:g}")] + row_values(c) for c in sorted(e, key=lambda c: c["s"])],
        ["№", "Приор", "s"] + VALUE_HEADS))

    # ---- the two cells the text singles out
    own = [c for c in a if c["s"] == 1.0 and c["sigma_shape"] == 0.0]
    support = [c for c in cells if not c["n80_over_grid_max"] and c["n80_median"] is not None
               and math.ceil(c["n80_median"]) <= 30]
    parts.append(f"""
## К.6. Комірки, на які спирається текст

Світ, для якого писався приор холодного старту (s = 1, $σ_{{shape}}$ = 0): комірки
{", ".join("№ " + str(c["index"]) for c in own)} – ефекти
{", ".join(dec(f"{c['effect']['mean'] * 100:+.2f}") for c in own)} в. п. за денного шуму
{", ".join(dec(f"{c['sigma_day']:g}") for c in own)} відповідно, усі три – нічия. Комірка з нульовим
денним шумом і є зареєстрованим тестом на змістовну невдачу методу (підрозділ 5.7.4).

Єдина комірка, у якій достатньо 30 завершених учасників: {", ".join("№ " + str(c["index"]) for c in support)}
– {", ".join(str(c["tasks"]) for c in support)} {"задачі" if all(2 <= c["tasks"] <= 4 for c in support) else "задач"} на день за s = {", ".join(dec(f"{c['s']:g}") for c in support)},
тобто на зареєстрованій верхній межі навантаження сітки ($N_{{80}}$ = {", ".join(n80(c) for c in support)}).

## К.7. Що лишилося в репозиторії, а не на цих сторінках

Для кожної комірки прогін також дає ефекти за п'ятьма класами хронотипу, приріст між парами фаз,
вартість рандомізованого зрізу окремо для кожного плеча, аналітичну стелю світу та стелю з
урахуванням зрізу. Ці величини наведено у зведенні `sensitivity-results.md` і в машиночитаному
вигляді у файлах `sensitivity.json` та `ceilings_attainable.json` відкритого репозиторію
(перелік файлів – у додатку Л, п. Л.7). Друкувати їх означало б подвоїти ширину кожної таблиці
вище для тверджень, які цих стовпців не потребують: обіцянка «наведено кожну комірку» стосується
ефекту та вердикту, і саме вони наведені тут повністю.
""")

    text = "\n".join(parts).rstrip() + "\n"

    if "--check" in sys.argv:
        full = io.open(FULL, encoding="utf-8").read()
        m = re.search(r"^## Додаток К .*?(?=^## Додаток )", full, re.S | re.M)
        if not m:
            print(f"FAIL no «## Додаток К» section in {FULL}")
            return 1

        # Prettier pads markdown table cells, so rows compare with runs of whitespace collapsed;
        # a separator row compares as a separator. Values live only in table rows and in the
        # summary sentence, so those two are what must match.
        def rows(t: str) -> list[str]:
            out = []
            for line in t.split("\n"):
                if not line.startswith("|"):
                    continue
                line = " ".join(line.split())
                if set(line) <= set("|- "):
                    line = re.sub(r"-+", "-", line)
                out.append(line)
            return out

        def summary(t: str) -> str:
            hit = re.search(r"Підсумок за всіма[^.]*\.", " ".join(t.split()))
            return hit.group(0) if hit else ""

        want, have = rows(text), rows(m.group(0))
        bad = want != have or summary(text) != summary(m.group(0)) or not summary(text)
        if bad:
            diff = next((i for i, (a, b) in enumerate(zip(want, have)) if a != b), min(len(want), len(have)))
            print(f"FAIL Додаток К in {FULL} drifted from {SRC}: {len(have)} rows vs {len(want)} generated; "
                  f"first difference at row {diff}; summary {'ok' if summary(text) == summary(m.group(0)) else 'differs'}")
            return 1
        print(f"ok   Додаток К in {FULL} matches {SRC} ({len(cells)} cells, {len(want)} table rows)")
        return 0

    sys.stdout.write(text)
    print(f"\n<!-- {len(cells)} cells, {verdicts.count('WIN')} WIN / "
          f"{verdicts.count('TIE')} TIE / {verdicts.count('LOSS')} LOSS -->")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
