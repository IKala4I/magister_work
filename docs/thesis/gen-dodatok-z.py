#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate Додаток З (all 75 sensitivity cells) from `docs/study/results/sensitivity.json`.

The appendix carries the claim "every cell reported, including losses and ties", so it must be
complete AND scannable. A 25-column dump is complete and unreadable; this emits one table per
registered block, showing only the factors that vary inside that block, with five value columns:
effect ± MC SE, verdict, efficiency, N₈₀ and the share of replicates with a positive effect.

Generated, never hand-edited — CI regenerates it and fails on a diff, so the appendix cannot drift
from the run. Per-class effects and the attainable ceilings stay in the repository (see the file's
own closing note); printing them would add five columns for a claim that does not need them.

Usage:  python3 docs/thesis/gen-dodatok-z.py            # writes docs/thesis/text/dodatok-z.md
        python3 docs/thesis/gen-dodatok-z.py --check    # exit 1 if the file is out of date
"""
from __future__ import annotations

import io
import json
import math
import re
import sys

SRC = "docs/study/results/sensitivity.json"
OUT = "docs/thesis/text/dodatok-z.md"
VERDICT = {"WIN": "В", "TIE": "Н", "LOSS": "П"}


def n80(cell) -> str:
    if cell["n80_over_grid_max"] or cell["n80_median"] is None:
        return "> 120"
    return str(math.ceil(cell["n80_median"]))


def row_values(c) -> list[str]:
    e = c["effect"]
    return [
        f"{e['mean'] * 100:+.2f} ± {e['mc_se'] * 100:.2f}",
        VERDICT[c["verdict"]],
        f"{c['efficiency']:.2f}" if c["efficiency"] is not None else "—",
        n80(c),
        f"{c['share_effect_positive']:.2f}",
    ]


VALUE_HEADS = ["Ефект, в. п. ± MC SE", "Верд.", "Ефект-ність", "N₈₀", "Частка «> 0»"]


def table(rows: list[list[str]], heads: list[str]) -> str:
    body = ["| " + " | ".join(heads) + " |",
            "| " + " | ".join("---" for _ in heads) + " |"]
    body += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(body)


def main() -> int:
    cells = json.load(io.open(SRC, encoding="utf-8"))["cells"]
    by_index = {c["index"]: c for c in cells}
    verdicts = [c["verdict"] for c in cells]

    def pick(**kw):
        return sorted((c for c in cells if all(c[k] == v for k, v in kw.items())),
                      key=lambda c: c["index"])

    centre = dict(mix="adult", p0=0.45, tasks=4, prior="informative")

    parts: list[str] = []
    parts.append("""# Додаток З. Повна сітка змодельованих світів

> **Статус: генерований текст.** Файл створює `docs/thesis/gen-dodatok-z.py` з
> `docs/study/results/sensitivity.json`; редагувати вручну не можна — CI перегенерує його й
> завалить збірку на розбіжності. Це і є механізм, який тримає обіцянку «наведено кожну комірку,
> включно з програшами й нічиями».

У таблицях наведено **всі 75 комірок** сітки. Щоб таблиці лишалися читними, кожен блок сітки
подано окремо і в ньому показано лише ті фактори, які в цьому блоці змінюються; решта тримається на
центральному значенні (доросла вибірка, базовий рівень 0,45, чотири задачі на день, інформативний
приор). Вердикт: **В** — виграш (ефект понад +1 в. п. і додатний щонайменше у 90 % повторень),
**Н** — нічия, **П** — програш (дзеркальна умова). Ефективність — відношення ефекту до аналітичної
стелі світу. N₈₀ — медіана по 40 повтореннях кількості завершених учасників для потужності 0,80,
округлена вгору; «> 120» означає, що медіана перевищує максимум сітки.
""")

    parts.append(f"""**Підсумок за всіма 75 комірками: {verdicts.count('WIN')} виграшів,
{verdicts.count('TIE')} нічиїх, {verdicts.count('LOSS')} програшів.**
""")

    # ---- Block A: s x sigma_shape x sigma_day at the centre (45 cells)
    a = pick(block="A", **centre)
    parts.append(f"\n## З.1. Блок A — ядро світу: сила візерунка × індивідуальне відхилення × денний шум ({len(a)} комірок)\n")
    parts.append(table(
        [[str(c["index"]), f"{c['s']:g}", f"{c['sigma_shape']:g}", f"{c['sigma_day']:g}"] + row_values(c) for c in a],
        ["№", "s", "σ_shape", "σ_day"] + VALUE_HEADS))

    # ---- Block B: mix x s
    b = pick(block="B")
    shared_b = [c for c in a if c["s"] in {x["s"] for x in b} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## З.2. Блок B — склад вибірки за хронотипом × сила візерунка ({len(b) + len(shared_b)} комірок, з них {len(shared_b)} спільні з блоком A)\n")
    parts.append(table(
        [[str(c["index"]), c["mix"], f"{c['s']:g}"] + row_values(c) for c in sorted(b + shared_b, key=lambda c: (c["mix"], c["s"]))],
        ["№", "Склад", "s"] + VALUE_HEADS))

    # ---- Block C: p0 x s
    cblk = pick(block="C")
    shared_c = [c for c in a if c["s"] in {x["s"] for x in cblk} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## З.3. Блок C — базовий рівень дотримання × сила візерунка ({len(cblk) + len(shared_c)} комірок, з них {len(shared_c)} спільні з блоком A)\n")
    parts.append(table(
        [[str(c["index"]), f"{c['p0']:g}", f"{c['s']:g}"] + row_values(c) for c in sorted(cblk + shared_c, key=lambda c: (c["p0"], c["s"]))],
        ["№", "p₀", "s"] + VALUE_HEADS))

    # ---- Block D: K x s
    dblk = pick(block="D")
    shared_d = [c for c in a if c["s"] in {x["s"] for x in dblk} and c["sigma_shape"] == 0.3 and c["sigma_day"] == 0.6]
    parts.append(f"\n## З.4. Блок D — кількість задач на день × сила візерунка ({len(dblk) + len(shared_d)} комірок, з них {len(shared_d)} спільні з блоком A)\n")
    parts.append(table(
        [[str(c["index"]), str(c["tasks"]), f"{c['s']:g}"] + row_values(c) for c in sorted(dblk + shared_d, key=lambda c: (c["tasks"], c["s"]))],
        ["№", "K", "s"] + VALUE_HEADS))

    # ---- Block E: prior x s
    e = pick(block="E")
    parts.append(f"\n## З.5. Блок E — тип приору × сила візерунка ({len(e)} комірок; порівнюються з відповідними комірками блоку A)\n")
    parts.append(table(
        [[str(c["index"]), c["prior"], f"{c['s']:g}"] + row_values(c) for c in sorted(e, key=lambda c: c["s"])],
        ["№", "Приор", "s"] + VALUE_HEADS))

    # ---- the two cells the text singles out
    own = [c for c in a if c["s"] == 1.0 and c["sigma_shape"] == 0.0]
    support = [c for c in cells if not c["n80_over_grid_max"] and c["n80_median"] is not None
               and math.ceil(c["n80_median"]) <= 30]
    parts.append(f"""
## З.6. Дві комірки, на які спирається текст

**Світ, для якого писався приор холодного старту** (s = 1, σ_shape = 0): комірки
{", ".join("№ " + str(c["index"]) for c in own)} — ефекти
{", ".join(f"{c['effect']['mean'] * 100:+.2f}" for c in own)} в. п. за денного шуму
{", ".join(f"{c['sigma_day']:g}" for c in own)} відповідно, усі три — нічия. Комірка з нульовим
денним шумом і є зареєстрованим тестом на змістовну невдачу методу (підрозділ 5.7.4).

**Єдина комірка, у якій достатньо 30 завершених учасників**: {", ".join("№ " + str(c["index"]) for c in support)}
— {", ".join(str(c["tasks"]) for c in support)} задачі на день за s = {", ".join(f"{c['s']:g}" for c in support)},
тобто на зареєстрованій верхній межі навантаження сітки (N₈₀ = {", ".join(n80(c) for c in support)}).

## З.7. Що лишилося в репозиторії, а не на цих сторінках

Для кожної комірки прогін також дає ефекти за п'ятьма класами хронотипу, приріст між парами фаз,
вартість рандомізованого зрізу окремо для кожного плеча, аналітичну стелю світу та стелю з
урахуванням зрізу. Ці величини наведено в `docs/study/sensitivity-results.md` (додаток) і в
машиночитаному вигляді в `docs/study/results/sensitivity.json` та
`ceilings_attainable.json`. Друкувати їх означало б додати п'ять–сім стовпців до кожної таблиці
вище для тверджень, які цих стовпців не потребують: обіцянка «наведено кожну комірку» стосується
ефекту та вердикту, і саме вони наведені тут повністю.
""")

    text = "\n".join(parts).rstrip() + "\n"

    if "--check" in sys.argv:
        try:
            current = io.open(OUT, encoding="utf-8").read()
        except FileNotFoundError:
            print(f"FAIL {OUT} does not exist; run python3 {sys.argv[0]}")
            return 1
        # Prettier pads markdown table cells and normalises blank lines, so compare with runs of
        # whitespace collapsed and empty lines dropped: that tolerates the formatter and still
        # catches any changed value, added row or removed row, since values live on non-empty lines.
        def norm(t: str) -> str:
            out = []
            for line in t.strip().split("\n"):
                line = " ".join(line.split())
                if not line:
                    continue
                # a table's separator row: prettier widens the dashes to the column width
                if set(line) <= set("|- "):
                    line = re.sub(r"-+", "-", line)
                out.append(line)
            return "\n".join(out)

        if norm(current) != norm(text):
            print(f"FAIL {OUT} is out of date with {SRC}; regenerate it")
            return 1
        print(f"ok   {OUT} matches {SRC} ({len(cells)} cells)")
        return 0

    io.open(OUT, "w", encoding="utf-8").write(text)
    print(f"wrote {OUT}: {len(cells)} cells, {verdicts.count('WIN')} WIN / "
          f"{verdicts.count('TIE')} TIE / {verdicts.count('LOSS')} LOSS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
