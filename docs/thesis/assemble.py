#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble the whole thesis into `docs/thesis/text/full.md`, in document order.

Why a program and not a hand-edit: re-emitting 592 paragraphs by hand is exactly the thirty-step
manual pass this is meant to replace, with the same failure mode. Here every paragraph the
corrections do not touch is copied **verbatim** from `draft.docx`, and the run prints how many
were copied, edited, inserted and deleted — so a silent alteration of untouched prose is not
possible without the count moving.

    python3 docs/thesis/assemble.py            # writes docs/thesis/text/full.md
    python3 docs/thesis/assemble.py --report   # counts only, no write

What it deliberately does NOT carry: Word paragraph styling (indents, 1.5 spacing, justification,
ДСТУ margins, Times New Roman 14 pt), the 44 tab stops that right-align formula numbers, table
column widths and borders, the 8 dashed figure-placeholder boxes, and the generated ЗМІСТ. Those
are formatting and belong to whoever builds the .docx.
"""
from __future__ import annotations

import io
import json
import re
import unicodedata
import sys
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DOCX = "docs/thesis/draft.docx"
TEXT = "docs/thesis/text/"
OUT = TEXT + "full.md"


# ----------------------------------------------------------------- extraction
def _runs(el) -> str:
    out = []
    for r in el.iter(f"{W}r"):
        rpr = r.find(f"{W}rPr")
        bold = rpr is not None and rpr.find(f"{W}b") is not None
        ital = rpr is not None and rpr.find(f"{W}i") is not None
        txt = ""
        for child in r:
            if child.tag == f"{W}t":
                txt += child.text or ""
            elif child.tag == f"{W}tab":
                txt += "\t"
            elif child.tag == f"{W}br":
                txt += "\n"
        if not txt:
            continue
        if txt.strip() and (bold or ital):
            mark = "**" if bold else "_"
            lead = " " if txt.startswith(" ") else ""
            trail = " " if txt.endswith(" ") else ""
            txt = f"{lead}{mark}{txt.strip()}{mark}{trail}"
        out.append(txt)
    return "".join(out)


def extract(path: str = DOCX) -> list[dict]:
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    blocks: list[dict] = []
    for el in root.find(f"{W}body"):
        if el.tag == f"{W}p":
            ppr = el.find(f"{W}pPr")
            st = ppr.find(f"{W}pStyle") if ppr is not None else None
            blocks.append({"kind": "p", "style": st.get(f"{W}val") if st is not None else "",
                           "text": _runs(el), "origin": "draft"})
        elif el.tag == f"{W}tbl":
            rows = [[_runs(tc).strip() for tc in tr.findall(f"{W}tc")]
                    for tr in el.findall(f"{W}tr")]
            # a table whose every cell is bold is uniformly styled, not emphasised
            flat = [c for r in rows for c in r if c]
            if flat and all(c.startswith("**") and c.endswith("**") for c in flat):
                rows = [[re.sub(r"^\*\*(.*)\*\*$", r"\1", c) for c in r] for r in rows]
            blocks.append({"kind": "table", "rows": rows, "origin": "draft"})
    return blocks


# ----------------------------------------------------------------- text files
def load_text_file(name: str) -> list[dict]:
    """A `text/*.md` chapter: drop the front-matter blockquote, keep the rest as blocks."""
    raw = io.open(TEXT + name, encoding="utf-8").read().split("\n")
    out: list[dict] = []
    seen_front_matter = False
    buf: list[str] = []

    def flush():
        if buf:
            out.append({"kind": "p", "style": "", "text": " ".join(buf).strip(), "origin": name})
            buf.clear()

    i = 0
    while i < len(raw):
        line = raw[i]
        if line.startswith(">"):
            if not seen_front_matter:
                while i < len(raw) and (raw[i].startswith(">") or not raw[i].strip()):
                    i += 1
                seen_front_matter = True
                continue
        if line.startswith("#"):
            flush()
            level = len(line) - len(line.lstrip("#"))
            out.append({"kind": "p", "style": f"Heading{min(level, 3)}",
                        "text": line.lstrip("#").strip(), "origin": name})
        elif line.startswith("|"):
            flush()
            rows = []
            while i < len(raw) and raw[i].startswith("|"):
                cells = [c.strip() for c in raw[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            out.append({"kind": "table", "rows": rows, "origin": name})
            continue
        elif not line.strip():
            flush()
        else:
            buf.append(line.strip())
        i += 1
    flush()
    return [b for b in out if b["kind"] == "table" or b["text"]]


def load_quoted_payloads(name: str) -> list[list[str]]:
    """`anotaciya-ta-vysnovky.md` interleaves instructions with quoted payloads; return the
    payloads in order, each already unwrapped from `> ` and from the outer guillemets."""
    raw = io.open(TEXT + name, encoding="utf-8").read().split("\n")
    payloads, cur = [], []
    for line in raw:
        if line.startswith(">"):
            cur.append(line.lstrip(">").strip())
        elif cur:
            payloads.append(cur)
            cur = []
    if cur:
        payloads.append(cur)
    out = []
    for p in payloads:
        text = " ".join(x for x in p if x).strip()
        text = re.sub(r"^«(.*)»$", r"\1", text).strip()
        out.append(text)
    return out



ROLLUP = "docs/thesis/corrections-rollup.md"


def load_rollup_payloads(path: str = ROLLUP) -> dict[str, list[list[str]]]:
    """The approved Ukrainian payloads, read from the rollup itself so the rollup stays the
    single source of truth: retyping them here is exactly the transcription step this program
    exists to remove. Keyed by the leading token of the heading they sit under; each payload is
    one contiguous blockquote, split into paragraphs on its blank quote lines."""
    raw = io.open(path, encoding="utf-8").read().split("\n")
    out: dict[str, list[list[str]]] = {}
    key, run = None, None

    def close():
        nonlocal run
        if run is not None and key:
            paras, cur = [], []
            for ln in run:
                if not ln.strip():
                    if cur:
                        paras.append(" ".join(cur))
                        cur = []
                else:
                    cur.append(ln)
            if cur:
                paras.append(" ".join(cur))
            paras = [x.strip() for x in paras if x.strip()]
            if paras:
                # the outer guillemets wrap the whole payload, not each paragraph
                if paras[0].startswith("\u00ab") and paras[0].count("\u00ab") > paras[0].count("\u00bb"):
                    paras[0] = paras[0][1:]
                if paras[-1].endswith("\u00bb") and paras[-1].count("\u00bb") > paras[-1].count("\u00ab"):
                    paras[-1] = paras[-1][:-1]
                if len(paras) == 1:
                    paras[0] = re.sub(r"^\u00ab(.*)\u00bb$", r"\1", paras[0])
                out.setdefault(key, []).append([x.strip() for x in paras])
        run = None

    for ln in raw:
        m = re.match(r"^#{2,4}\s+(.*)", ln)
        if m:
            close()
            key = m.group(1).strip().split()[0]
            continue
        if ln.startswith(">"):
            if run is None:
                run = []
            run.append(ln[1:].strip())
        else:
            close()
    close()
    return out


# Each row: (rollup key, payload index, op, anchor, marker).
#   replace  the anchor paragraph becomes the payload (extra paragraphs follow it)
#   from     the anchor keeps its text up to `marker`, then the payload replaces the rest
#   after / before   the payload is inserted after / before the anchor paragraph
#   append   the payload is appended to the anchor paragraph
# Anchors are draft prose; a miss is reported in SKIPPED rather than guessed at.
ROLLUP_EDITS: list[tuple] = [
    # --- ВСТУП -----------------------------------------------------------------------------
    ("4.3", 0, "from", "Актуальність теми. Керування особистим часом", "Керування особистим часом"),
    ("4.3", 1, "from", "3. удосконалено метод холодного старту рекомендаційної", "забезпечує узгоджений перехід"),
    ("4.3", 2, "after", "4. набули подальшого розвитку методи офлайн-оцінювання", None),
    ("4.3", 3, "from", "Практичне значення одержаних результатів.", "Розроблений програмний комплекс Kairos"),
    ("4.3", 4, "replace", "6. розроблено методику експериментального оцінювання ефективності системи у формі", None),
    # --- Розділ 1 --------------------------------------------------------------------------
    ("§1.1", 0, "from", "починаючи з класичного опитувальника", "Із цього випливає безпосередній практичний висновок"),
    ("§1.2", 0, "from", "Узагальнене порівняння можливостей наведено", "Узагальнене порівняння можливостей наведено"),
    ("§1.2", 1, "replace", "З таблиці 1.1 випливає, що жодне з наявних рішень", None),
    ("§1.4", 1, "replace", "З матриці випливає формулювання наукового розриву", None),
    ("§1.4", 0, "before", "З матриці випливає формулювання наукового розриву", None),
    ("§1.4", 2, "append", "У розділі проаналізовано предметну область персонального планування", None),
    ("§1.5", 0, "from", "Хоча робота є науково-прикладною", "По-перше, дозріло он-девайс машинне навчання"),
    ("§1.5", 1, "replace", "Конкурентна перевага, що накопичується", None),
    ("§1.6", 0, "after", "потребує математичної формалізації задачі та методів", None),
    # --- Розділ 2 --------------------------------------------------------------------------
    ("§2.3", 2, "replace", "Незалежно від цього, для забезпечення оцінюваності", None),
    ("§2.3", 1, "after", "(C3) τ → {τ(1), …, τ(m)}", None),
    ("§2.3", 0, "after", "Практична реалізація використовує рідну мову моделювання CP-SAT", None),
    ("§2.4", 0, "after", "Підказка CP-SAT лише засіває пошук", None),
    ("§2.5", 0, "before", "Інші категорії задач отримуються логіт-афінним перетворенням", None),
    ("§2.5", 2, "after", "Сила приору n₀ (у псевдоспостереженнях) становить 8", None),
    ("§2.5", 1, "after", "тобто таблиця 2.4 є нульовою версією навчуваного об", None),
    ("§2.6.2", 0, "replace", "і є незміщеним тоді й лише тоді, коли політика логування", None),
    ("§2.7", 0, "from", "Поведінкові сигнали перетворюються на винагороди", "Базові правила: виконаний за розкладом блок"),
    # --- Розділ 3 --------------------------------------------------------------------------
    ("§3.6", 0, "after", "Конфлікти поділяються на три класи", None),
    ("§3.6", 1, "after", "Принципове проєктне рішення: виявлення пропусків є лінивим", None),
    ("§3.7", 0, "after", "Модель загроз і відповідні контрзаходи", None),
    ("§3.7", 1, "after", "Обробниками є: Oracle Cloud Infrastructure", None),
    ("§3.7", 2, "after", "Розміщення даних у ЄС не робить обробку вільною від передавання", None),
    # --- Розділ 4 --------------------------------------------------------------------------
    ("§4.1", (0, 1), "replace", "Взаємодія «перетягнути — значить навчити» (UC-07) реалізована", None),
    ("§4.1", (0, 2), "replace", "Природномовне швидке додавання задач (FR-11) реалізовано бібліотекою", None),
    ("§3.1.3", 0, "after", "Edge Functions реалізовано на Deno/TypeScript", None),
    ("§4.5", 1, "after", "Нічний конвеєр виконується", None),
    # --- Додаток Д -------------------------------------------------------------------------
    ("10.4", 0, "replace", "Опитувальник", None),
]

# The rollup writes «[nn]» wherever it had found no verified entry at the time. Each one is
# resolved to a symbolic key, so the number is filled in after the list is renumbered.
NN_PLACEHOLDERS: list[tuple[str, str, str]] = [
    ("систематичний огляд", "[nn]", "[@chauhan]"),
    ("Senyk, Jankowski & Cholii", "[nn]", "[@senyk]"),
]

# Citation sites the rollup names in its "arguments that currently cite nothing" table but
# does not write out as replacement prose. Each adds the source to a sentence already there.
CITE_SITES: list[tuple[str, str, str, str]] = [
    ("Обробник /feedback застосовує кортежі винагород",
     "кроки стохастичного градієнта River для вагових коефіцієнтів",
     "кроки стохастичного градієнта River для вагових коефіцієнтів змішування з проєкцією на "
     "ймовірнісний симплекс [@duchi] після кожного кроку",
     "§4.3 blend projection (Duchi)"),
    ("За Настановами EDPB 05/2021", "За Настановами EDPB 05/2021 (v2.0)",
     "За Настановами EDPB 05/2021 (v2.0) [@edpb]", "§3.7 transfer analysis (EDPB)"),
    ("за Законом України № 2297-VI, ст. 29", "за Законом України № 2297-VI, ст. 29",
     "за Законом України № 2297-VI [@zakon], ст. 29", "§3.7 Art. 29 of the Ukrainian law"),
]

# Sentences the rollup approves inline rather than as a blockquote payload.
LITERAL_EDITS: list[tuple] = [
    ("append", "Північною зіркою продуктових метрик обрано саме рівень дотримання плану",
     "PAR обчислюється зареєстрованим кодом виключно з фактів (`events` + `recommendations`) і "
     "ніколи з таблиці винагород; спільними в них є рівно дві константи — вікно ±15 хв і поріг 50 %.",
     "§1.5 PAR provenance"),
    ("append", "Незалежно від цього, для забезпечення оцінюваності",
     "Цей рандомізований зріз є субстратом незміщеного офлайн-оцінювання. Частота дослідницьких "
     "блоків становить ≈ 4,3 експерименти на користувача за тиждень на звичайних тижнях і 1,1–2,4 "
     "на завантажених, **пораховані на коді придатності, а не спостережені** (підрозділ 6.2).",
     "§2.3 slice frequency"),
    ("append", "і оцінки з ESS < 100 трактуються як недоказові",
     "Оцінки з ESS < 100 позначаються як недоказові, але **ніколи не вилучаються з подання**: "
     "приховування слабкої оцінки є тим самим ступенем свободи дослідника, проти якого спрямована "
     "попередня реєстрація.",
     "§2.6.3 ESS reporting"),
]


# ----------------------------------------------------------------- locating
def find(blocks: list[dict], needle: str, start: int = 0) -> int:
    for i in range(start, len(blocks)):
        if blocks[i]["kind"] == "p" and fold(needle) in fold(blocks[i]["text"]):
            return i
    raise LookupError(f"locator not found: {needle!r}")


# ----------------------------------------------------------------- rendering
def _w(text: str) -> int:
    """Display width: East-Asian wide characters count double, combining marks zero."""
    return sum(0 if unicodedata.combining(c) else
               (2 if unicodedata.east_asian_width(c) in "WF" else 1) for c in text)


def render(blocks: list[dict]) -> str:
    out: list[str] = []
    for b in blocks:
        if b["kind"] == "table":
            rows = b["rows"]
            if not rows:
                continue
            width = max(len(r) for r in rows)
            rows = [[c.replace("|", "\\|") for c in r] + [""] * (width - len(r)) for r in rows]
            # Pad to the widest cell per column: `prettier --check` runs over the repository,
            # and a generated file has to come out of the generator already formatted, or
            # every assemble run leaves the tree dirty. Width is counted in display columns.
            col = [max(3, max(_w(r[i]) for r in rows)) for i in range(width)]  # readable
            def line(cells: list[str], fill: str = " ") -> str:
                return "| " + " | ".join(
                    c + fill * (col[i] - _w(c)) for i, c in enumerate(cells)) + " |"
            out.append(line(rows[0]))
            out.append(line(["-" * col[i] for i in range(width)], "-"))
            for r in rows[1:]:
                out.append(line(r))
            out.append("")
            continue
        text = b["text"]
        style = b.get("style", "")
        if style.startswith("Heading"):
            level = int(style[-1])
            # headings are wholly bold in the source; the marks are styling, not emphasis
            out.append("#" * level + " " + re.sub(r"^\*\*(.*)\*\*$", r"\1", text).strip())
        elif text.startswith("\t"):
            # A numbered formula: tabs are Word tab stops, flattened to spaces. The spacing
            # is kept exactly as the draft has it — `prettier` would collapse it, and worse,
            # would read «E(x~D) E(a~π» in (2.15) as strikethrough and rewrite the formula.
            # That is why this file is in `.prettierignore`.
            out.append(re.sub(r"\t+", "    ", text).strip())
        else:
            out.append(text)
        out.append("")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"


# ----------------------------------------------------------------- edit ops
def splice_tail(original: str, payload: str) -> str:
    """A payload written as «…tail» replaces `original` from where the tail begins."""
    tail = payload.lstrip("…").strip()
    anchor = " ".join(re.sub(r"[*_]", "", tail).split()[:4])
    plain = fold(re.sub(r"[*_]", "", original))
    idx = plain.find(fold(anchor))
    if idx < 0:
        raise LookupError(f"tail anchor not found: {anchor!r}")
    return original[:idx].rstrip() + " " + tail if idx else tail


APPLIED: list[str] = []
SKIPPED: list[str] = []

# Word uses U+2019 for the Ukrainian apostrophe and en/em dashes vary. The mapping is
# character-for-character, so indices survive it and a match can be sliced out of the original.
_FOLD = {ord(c): "'" for c in "\u2019\u02bc\u2018\u00b4"}
_FOLD.update({ord(c): "-" for c in "\u2013\u2014\u2212"})


def fold(t: str) -> str:
    return t.translate(_FOLD)


def para_replace(blocks, locator, new, label):
    i = find(blocks, locator)
    blocks[i] = {**blocks[i], "text": new, "origin": "edited"}
    APPLIED.append(label)


def para_tail(blocks, locator, payload, label):
    i = find(blocks, locator)
    blocks[i] = {**blocks[i], "text": splice_tail(blocks[i]["text"], payload), "origin": "edited"}
    APPLIED.append(label)


def para_insert_after(blocks, locator, new, label):
    i = find(blocks, locator)
    blocks.insert(i + 1, {"kind": "p", "style": "", "text": new, "origin": "inserted"})
    APPLIED.append(label)


def run_sub(blocks, locator, old, new, label):
    try:
        i = find(blocks, locator)
    except LookupError:
        SKIPPED.append(f"{label} (locator not found: {locator[:40]!r})")
        return
    text = blocks[i]["text"]
    at = fold(text).find(fold(old))
    if at < 0:
        SKIPPED.append(f"{label} (substring not found: {old[:40]!r})")
        return
    blocks[i] = {**blocks[i], "text": text[:at] + new + text[at + len(old):], "origin": "edited"}
    APPLIED.append(label)


def para_before(blocks, locator, new, label):
    i = find(blocks, locator)
    blocks.insert(i, {"kind": "p", "style": "", "text": new, "origin": "inserted"})
    APPLIED.append(label)


def para_append(blocks, locator, new, label):
    try:
        i = find(blocks, locator)
    except LookupError:
        SKIPPED.append(f"{label} (locator not found: {locator[:40]!r})")
        return
    blocks[i] = {**blocks[i], "text": blocks[i]["text"].rstrip() + " " + new, "origin": "edited"}
    APPLIED.append(label)


def para_from(blocks, locator, marker, new, label):
    """Keep the anchor paragraph up to `marker`, then let the payload replace the rest."""
    try:
        i = find(blocks, locator)
    except LookupError:
        SKIPPED.append(f"{label} (locator not found: {locator[:40]!r})")
        return
    text = blocks[i]["text"]
    at = fold(text).find(fold(marker))
    if at < 0:
        SKIPPED.append(f"{label} (marker not found: {marker[:40]!r})")
        return
    blocks[i] = {**blocks[i], "text": (text[:at] + new).strip(), "origin": "edited"}
    APPLIED.append(label)


def apply_rollup_edits(blocks) -> None:
    """Apply every approved payload the rollup carries for Розділи 1-4 and Додаток Д."""
    pay = load_rollup_payloads()
    for key, idx, op, anchor, marker in ROLLUP_EDITS:
        label = f"{key}[{idx}] {op}"
        try:
            paras = pay[key][idx[0]][idx[1]:idx[1] + 1] if isinstance(idx, tuple) else pay[key][idx]
        except (KeyError, IndexError):
            SKIPPED.append(f"{label} (no such payload in the rollup)")
            continue
        head, rest = paras[0], paras[1:]
        try:
            if op == "replace":
                para_replace(blocks, anchor, head, label)
            elif op == "from":
                para_from(blocks, anchor, marker, head.lstrip("\u2026").strip(), label)
            elif op == "after":
                para_insert_after(blocks, anchor, head, label)
            elif op == "before":
                para_before(blocks, anchor, head, label)
            elif op == "append":
                para_append(blocks, anchor, head, label)
            else:
                raise ValueError(op)
        except LookupError:
            SKIPPED.append(f"{label} (anchor not found: {anchor[:44]!r})")
            continue
        prev = head[:60]
        for extra in rest:
            para_insert_after(blocks, prev, extra, f"{label} +para")
            prev = extra[:60]
    for op, anchor, text, label in LITERAL_EDITS:
        if op == "append":
            para_append(blocks, anchor, text, label)
    # the payload was written before D2 removed the HF Hub entry; the sentence it supports
    # is precisely that this precondition did not hold, so the citation goes with it
    run_sub(blocks, "безоплатні тарифи хмарних платформ на момент проєктування",
            "за нульової вартості на ранньому масштабі [60, 30, 23]",
            "за нульової вартості на ранньому масштабі [60, 23]", "§1.5 dropped HF Hub citation")
    for anchor, old, new in NN_PLACEHOLDERS:
        run_sub(blocks, anchor, old, new, f"[nn] -> {new}")
    for anchor, old, new, label in CITE_SITES:
        run_sub(blocks, anchor, old, new, label)


def replace_range(blocks, start_locator, end_locator, new_blocks, label):
    a = find(blocks, start_locator)
    b = find(blocks, end_locator, a + 1)
    blocks[a:b] = new_blocks
    APPLIED.append(label)


def cell_set(blocks, table_index, row, col, new, label):
    tables = [i for i, x in enumerate(blocks) if x["kind"] == "table"]
    t = blocks[tables[table_index]]
    t["rows"][row][col] = new
    t["origin"] = "edited"
    APPLIED.append(label)


# ----------------------------------------------------------------- references
# Ukrainian-language entries the draft carried without authors or pages. Verified 2026-09-10
# against each journal's own record; all five are Ukrainian-language, as the source-language
# constraint requires. Author names are given in Cyrillic per ДСТУ 8302 for Ukrainian sources.
REPLACE_REFS = {
    "Дослідження робастності рекомендаційних систем":
        "Мелешко Є., Хох В., Улічев О. Дослідження робастності рекомендаційних систем з колаборативною фільтрацією до інформаційних атак. Кібербезпека: освіта, наука, техніка. 2019. Т. 1, № 5. С. 95–104. DOI: 10.28925/2663-4023.2019.5.95104.",
    "Метод роботи рекомендаційної системи у комп":
        "Міхав В., Мелешко Є. Метод роботи рекомендаційної системи у комп'ютерній мережі типу peer to peer. Системи управління, навігації та зв'язку. 2023. Т. 1, № 71. С. 112–117. DOI: 10.26906/SUNZ.2023.1.112.",
    "Моделі і методи прогнозування рекомендацій":
        "Лобур М. В., Шварц М. Є., Стех Ю. В. Моделі і методи прогнозування рекомендацій для колаборативних рекомендаційних систем. Вісник Національного університету «Львівська політехніка». Інформаційні системи та мережі. 2018. Вип. 901. С. 68–75.",
    "Покращення якості рекомендаційних систем":
        "Кучерук В., Глушко М. Покращення якості рекомендаційних систем на основі кваліметричних методів вимірювання. Вимірювальна та обчислювальна техніка в технологічних процесах. 2022. № 2. С. 65–72. DOI: 10.31891/2219-9365-2022-70-2-9.",
    "Проблеми сучасних рекомендаційних систем":
        "Мелешко Ю. Проблеми сучасних рекомендаційних систем та методи їх рішення. Системи управління, навігації та зв'язку. 2018. Т. 4, № 50. С. 120–124. DOI: 10.26906/SUNZ.2018.4.120.",
    # Verified 2026-09-10 against the publishers' own records; see docs/thesis/reference-audit.md.
    "ДСТУ 3008:2015":
        "ДСТУ 3008:2015. Інформація та документація. Звіти у сфері науки і техніки. Структура та правила оформлювання. Чинний від 2017-07-01. Київ : ДП «УкрНДНЦ», 2016.",
    "ДСТУ 8302:2015":
        "ДСТУ 8302:2015. Інформація та документація. Бібліографічне посилання. Загальні положення та правила складання. Чинний від 2016-07-01. Київ : ДП «УкрНДНЦ», 2016.",
    "Kuliahin A., Narozhnyi V.":
        "Kuliahin A., Narozhnyi V., Tkachov V., Kuchuk H. Дослідження методів побудови рекомендаційних систем для розв'язання задачі вибору найбільш релевантного відео при створенні віртуальних арт-композицій. Системи управління, навігації та зв'язку. 2022. Т. 4, № 70. С. 94–99. DOI: 10.26906/SUNZ.2022.4.094.",
    "Meleshko Ye., Khokh V., Ulichev O. Дослідження відомих":
        "Meleshko Ye., Khokh V., Ulichev O. Дослідження відомих моделей атак на рекомендаційні системи з колаборативною фільтрацією. Системи управління, навігації та зв'язку. 2019. Т. 5, № 57. С. 67–71. DOI: 10.26906/SUNZ.2019.5.067.",
    "The Netflix Recommender System":
        "Gomez-Uribe C. A., Hunt N. The Netflix Recommender System: Algorithms, Business Value, and Innovation. ACM Transactions on Management Information Systems. 2015. Vol. 6, No. 4. Article 13. 19 p. DOI: 10.1145/2843948.",
    "Guidelines 05/2021":
        "Guidelines 05/2021 on the Interplay between the application of Article 3 and the provisions on international transfers as per Chapter V of the GDPR. Version 2.0. European Data Protection Board, adopted 24 February 2023. 24 p.",
}

# Symbolic citation keys: the text files write [@key] and the assembler resolves them to the
# final number after renumbering, so adding or removing a reference cannot silently break a
# citation. The value is a substring that identifies the entry uniquely.
CITE_KEYS = {
    "chauhan": "Chronotype and synchrony effects",
    "duchi": "Efficient Projections onto",
    "graham": "Bounds for Certain Multiprocessing",
    "edpb": "Guidelines 05/2021",
    "liulayland": "Scheduling Algorithms for Multiprogramming",
    "nielsen": "Usability Engineering",
    "roenneberg": "Epidemiology of the human circadian clock",
    "senyk": "Ukrainian versions of the Composite Scale",
    "taillard": "Validation of Horne and Ostberg",
    "lewis": "UMUX-LITE",
    "zakon": "Про захист персональних даних",
    "adan": "Horne & Östberg Morningness-Eveningness Questionnaire: A reduced scale",
}

DELETE_REFS = ["Hugging Face Hub Documentation", "ONNX Runtime Documentation",
               "PyTorch Documentation", "Sentence-Transformers Documentation"]
ADD_REFS = [
    "Chauhan S., Vanova M., Tailor U., Asad M., Faßbender K., Norbury R., Ettinger U., Kumari V. Chronotype and synchrony effects in human cognitive performance: a systematic review. Chronobiology International. 2025. Vol. 42, No. 4. P. 463–499. DOI: 10.1080/07420528.2025.2490495.",
    "Duchi J., Shalev-Shwartz S., Singer Y., Chandra T. Efficient Projections onto the ℓ1-Ball for Learning in High Dimensions. Proceedings of the 25th International Conference on Machine Learning (ICML 2008). Helsinki, 2008. P. 272–279.",
    "Graham R. L. Bounds for Certain Multiprocessing Anomalies. Bell System Technical Journal. 1966. Vol. 45, No. 9. P. 1563–1581.",
    "Guidelines 05/2021 on the Interplay between the application of Article 3 and the provisions on international transfers as per Chapter V of the GDPR. Version 2.0. European Data Protection Board, 2023. 26 p.",
    "Liu C. L., Layland J. W. Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment. Journal of the ACM. 1973. Vol. 20, No. 1. P. 46–61.",
    "Nielsen J. Usability Engineering. San Francisco : Morgan Kaufmann, 1993. 362 p.",
    "Roenneberg T., Kuehnle T., Juda M., Kantermann T., Allebrandt K., Gordijn M., Merrow M. Epidemiology of the human circadian clock. Sleep Medicine Reviews. 2007. Vol. 11, No. 6. P. 429–438.",
    "Senyk O., Jankowski K. S., Cholii S. Ukrainian versions of the Composite Scale of Morningness and Munich Chronotype Questionnaire. Biological Rhythm Research. 2022. Vol. 53, No. 6. P. 878–896. DOI: 10.1080/09291016.2020.1788807.",
    "Taillard J., Philip P., Chastang J.-F., Bioulac B. Validation of Horne and Ostberg Morningness-Eveningness Questionnaire in a Middle-Aged Population of French Workers. Journal of Biological Rhythms. 2004. Vol. 19, No. 1. P. 76–86. DOI: 10.1177/0748730403259849.",
]


def sort_key(entry: str) -> tuple:
    """ДСТУ ordering as the draft already uses it: ДСТУ, then Cyrillic, then Latin."""
    body = re.sub(r"^\d+\.\s*", "", entry)
    if body.startswith("ДСТУ"):
        return (0, body)
    first = body[0] if body else ""
    return (1, body.lower()) if "А" <= first <= "я" or first in "ІЇЄҐіїєґ" else (2, body.lower())


DRAFT_REF_NUMBERS: set[int] = set()


def rebuild_references(blocks: list[dict]) -> dict[int, int]:
    head = find(blocks, "СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ")
    end = find(blocks, "ДОДАТКИ", head + 1)
    entries = []
    for i in range(head + 1, end):
        if blocks[i]["kind"] == "p" and re.match(r"^\d+\.\s", blocks[i]["text"]):
            n = int(re.match(r"^(\d+)\.", blocks[i]["text"]).group(1))
            entries.append((n, re.sub(r"^\d+\.\s*", "", blocks[i]["text"])))
    DRAFT_REF_NUMBERS.clear()
    DRAFT_REF_NUMBERS.update(n for n, _ in entries)
    kept = []
    for n, b in entries:
        if any(d in b for d in DELETE_REFS):
            continue
        for needle, full in REPLACE_REFS.items():
            if needle in b:
                b = full
                break
        kept.append((n, b))
    merged = [(None, a) for a in ADD_REFS] + kept
    merged.sort(key=lambda x: sort_key(x[1]))
    mapping: dict[int, int] = {}
    new_blocks = []
    for pos, (old_n, body) in enumerate(merged, start=1):
        if old_n is not None:
            mapping[old_n] = pos
        new_blocks.append({"kind": "p", "style": "", "text": f"{pos}. {body}",
                           "origin": "renumbered" if old_n is not None else "inserted"})
    blocks[head + 1:end] = new_blocks
    APPLIED.append(f"references: -{len(DELETE_REFS)} +{len(ADD_REFS)}, renumbered to {len(merged)}")
    return mapping


def renumber_citations(blocks: list[dict], mapping: dict[int, int], stop_at: int) -> int:
    """Rewrite [n] and [n, m] citations in the body. Deleted refs leave a marker.

    A bracketed group is a citation only if every number in it is a reference number the
    draft's own list used — otherwise it is left untouched, because «clip[0, 1]» and «[0, 1]»
    are mathematics, not citations, and rewriting them corrupts a formula silently.
    """
    changed = 0

    def one(m: re.Match) -> str:
        nums = [x.strip() for x in m.group(1).split(",")]
        if not all(x.isdigit() and int(x) in DRAFT_REF_NUMBERS for x in nums):
            return m.group(0)
        return "[" + ", ".join(str(mapping[int(x)]) if int(x) in mapping else "‹?›" for x in nums) + "]"

    for i in range(stop_at):
        b = blocks[i]
        if b["kind"] == "table":
            for r in b["rows"]:
                for j, c in enumerate(r):
                    new = re.sub(r"\[(\d+(?:\s*,\s*\d+)*)\]", one, c)
                    if new != c:
                        r[j] = new
                        b["origin"] = "renumbered"
                        changed += 1
        elif b["kind"] == "p":
            new = re.sub(r"\[(\d+(?:\s*,\s*\d+)*)\]", one, b["text"])
            if new != b["text"]:
                b["text"] = new
                if b["origin"] == "draft":
                    b["origin"] = "renumbered"
                changed += 1
    return changed


def resolve_cite_keys(blocks: list[dict], head: int) -> tuple[int, list[str]]:
    """Turn [@key] into the entry's final number, so citations survive renumbering."""
    numbers: dict[str, int] = {}
    for i in range(head + 1, len(blocks)):
        b = blocks[i]
        if b["kind"] != "p":
            continue
        m = re.match(r"^(\d+)\.\s", b["text"])
        if not m:
            continue
        for key, needle in CITE_KEYS.items():
            if needle in b["text"]:
                numbers[key] = int(m.group(1))
    resolved, missing = 0, set()

    def one(m: re.Match) -> str:
        key = m.group(1)
        if key in numbers:
            return f"[{numbers[key]}]"
        missing.add(key)
        return m.group(0)

    for b in blocks:
        if b["kind"] == "table":
            for r in b["rows"]:
                for j, c in enumerate(r):
                    new = re.sub(r"\[@([a-z]+)\]", one, c)
                    if new != c:
                        r[j] = new
                        resolved += 1
        elif b["kind"] == "p":
            new = re.sub(r"\[@([a-z]+)\]", one, b["text"])
            if new != b["text"]:
                b["text"] = new
                resolved += 1
    return resolved, sorted(missing)


# ----------------------------------------------------------------- the pass
def build() -> tuple[list[dict], dict]:
    blocks = extract()
    src = {i: b.get("text", "") for i, b in enumerate(blocks) if b["kind"] == "p"}
    pay = load_quoted_payloads("anotaciya-ta-vysnovky.md")

    # --- АНОТАЦІЯ (assembly steps 1–2) -------------------------------------------------
    para_replace(blocks, "Кваліфікаційну роботу присвячено розробленню", pay[2], "анотація ¶2")
    para_replace(blocks, "Спроєктовано та реалізовано програмний комплекс: мобільний застосунок на React Native (Expo, TypeScript)", pay[3], "анотація ¶3")
    para_insert_after(blocks, pay[3][:60], pay[4], "анотація ¶4 (new)")
    run_sub(blocks, "Ключові слова:", "offline-first.",
            "offline-first, симуляційне оцінювання, аналіз чутливості, попередня реєстрація.",
            "анотація: ключові слова")

    a, b_ = pay[6].split(" … ", 1)
    para_insert_after(blocks, "The thesis is devoted to the development of methods", a, "ANNOTATION: mechanism sentence")
    run_sub(blocks, "A software system was designed and implemented",
            "A pre-registered ABAB field-study protocol with an embedded micro-randomized trial and a power analysis was developed for the empirical evaluation of the system.",
            pay[7], "ANNOTATION ¶3")
    para_insert_after(blocks, "A software system was designed and implemented", pay[8], "ANNOTATION ¶4 (new)")
    run_sub(blocks, "Keywords: recommender system", "offline-first.",
            "offline-first, simulation-based evaluation, sensitivity analysis, pre-registration.",
            "ANNOTATION: keywords")

    # --- Розділи 1–4: anchored edits (steps 9–18) --------------------------------------
    # §1.5 — the falsified market preconditions
    # §2.4 — the degradation ladder constant
    # §3.3 — stack prose
    run_sub(blocks, "Серверна частина: Supabase у регіоні ЄС",
            "сервіс рекомендацій — FastAPI на Python 3.12 [21] на безоплатному CPU-тарифі Hugging Face Spaces з реєстром моделей на HF Hub [30]",
            "сервіс рекомендацій — FastAPI на Python 3.12 [21] у контейнері на віртуальній машині Oracle Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ, регіон eu-marseille-1) з реєстром моделей у Supabase Storage (ЄС)",
            "§3.3 hosting prose")
    run_sub(blocks, "Серверна частина: Supabase у регіоні ЄС",
            "послідовнісна модель SASRec-lite на PyTorch [46] з експортом в ONNX [44]; текстові вкладення — sentence-transformers MiniLM [56]; ",
            "", "§3.3 unbuilt components")
    # §3.7 — the on-device roadmap sentence
    run_sub(blocks, "Модель загроз і відповідні контрзаходи",
            " Дорожня карта передбачає перенесення персонального ранкера на пристрій через onnxruntime-react-native — ті самі ONNX-артефакти дають одночасний виграш приватності та латентності.",
            "", "§3.7 on-device roadmap")
    # §3.8 — typography, motion, drag
    run_sub(blocks, "Візуальний напрям «спокійна точність»",
            "фізика замість оздоблення (пружинні переходи ≤ 250 мс, повага до reduced-motion); перетягнути — значить навчити (перетягування блоку — першокласна пара негативного/позитивного сигналу); ",
            "«фізика замість оздоблення» реалізовано на трьох поверхнях — діалозі підтвердження та двох взаємодіях на стрічці «Сьогодні»; решта переходів навмисно миттєві, а перетягування не реалізовано: ручне перевизначення виконується вибором часу; ",
            "§3.8 interaction principles")
    run_sub(blocks, "Візуальний напрям «спокійна точність»", "Inter Variable для інтерфейсу",
            "Inter (статичні накреслення 400/500/600/700) для інтерфейсу", "§3.8 typography")
    run_sub(blocks, "Візуальний напрям «спокійна точність»", "усі пари кольорів задовольняють WCAG 2.2 AA.",
            "пари, використані для тексту, задовольняють WCAG 2.2 AA, тоді як акцентні кольори застосовуються лише як заливки з текстовою альтернативою.",
            "§3.8 contrast claim")
    # §3.9 UC-10 — erasure confirmation
    run_sub(blocks, "UC-10. Реалізація прав на дані",
            "протягом щонайбільше 30 днів з підтвердженням листом",
            "з підтвердженням **у застосунку** (номер запису та час завершення); фактичне виконання є синхронним, а 30 днів лишаються законодавчою межею",
            "§3.9 UC-10 erasure")
    # §4.1 — the live-query hook and the drag interaction
    run_sub(blocks, "Мобільний клієнт реалізовано на React Native",
            "реактивні живі запити Drizzle useLiveQuery до локальної бази Expo SQLite",
            "реактивні живі запити до локальної бази Expo SQLite власним хуком `useLiveRows`",
            "§4.1 live queries")
    run_sub(blocks, "Теплокарта енергії, кільце фокус-таймера",
            "Теплокарта енергії, кільце фокус-таймера та «скляні» блоки з кодуванням упевненості намальовані декларативним канвасом react-native-skia.",
            "Теплокарту енергії намальовано нативними View з інтерполяцією в OKLCH, а кільце фокус-таймера — канвасом react-native-skia.",
            "§4.1 heatmap")
    # §4.5 — the nightly pipeline
    run_sub(blocks, "Нічний конвеєр реалізовано робочим процесом GitHub Actions",
            "Нічний конвеєр реалізовано робочим процесом GitHub Actions за розкладом cron у публічному репозиторії (безоплатні хвилини standard-runner)",
            "Нічний конвеєр виконується системним таймером на тій самій віртуальній машині в ЄС (щодня о 00:30 UTC), у тому самому закріпленому контейнері, що обслуговує запити",
            "§4.5 nightly runner")
    run_sub(blocks, "Нічний конвеєр", "(3) навчання послідовнісної моделі SASRec-lite на PyTorch з експортом в ONNX; ", "", "§4.5 SASRec step")
    run_sub(blocks, "Нічний конвеєр", "(5) публікація артефактів на Hugging Face Hub",
            "(5) публікація артефактів у Supabase Storage (ЄС)", "§4.5 registry")
    # §4.6 — tool versions and the e2e claim
    run_sub(blocks, "Конвеєр перевірки кожного pull-request", "ESLint 9 (flat config", "ESLint 10 (flat config", "§4.6 ESLint")
    run_sub(blocks, "Конвеєр перевірки кожного pull-request", "Jest 30 із React Native Testing Library", "Jest 29.7 із React Native Testing Library", "§4.6 Jest")
    run_sub(blocks, "Конвеєр перевірки кожного pull-request",
            "Наскрізні тести виконуються щоночі: потоки Maestro [40] для п'яти критичних шляхів — онбординг, швидке додавання, прийняття плану, перетягування-перевизначення, офлайн-виконання з подальшою синхронізацією.",
            "Наскрізні перевірки виконуються десятьма потоками Maestro [40] на вимогу — онбординг, робота із задачами, огляди доступності на найбільшому масштабі шрифту, діалоги підтвердження та українські потоки.",
            "§4.6 e2e flows")

    # --- Розділи 1-4: the rollup's own approved payloads (steps 9-18) -------------------
    apply_rollup_edits(blocks)

    # §2.1 — the formal statement forbade (C3) two pages later (spec-conflicts M6)
    run_sub(blocks, "у якому кожна задача отримує не більше одного інтервалу",
            "у якому кожна задача отримує не більше одного інтервалу",
            "у якому кожен фрагмент задачі отримує не більше одного інтервалу, а кожен інтервал — "
            "не більше одного фрагмента (для неподільних задач фрагмент збігається із задачею)",
            "§2.1 fragment-level assignment")
    # §2.2 — |C| is 14 in the implementation, not 12–18 (spec-conflicts M3)
    run_sub(blocks, "Ключовим розв", "|C| ≈ 12–18. Бандит опитується один раз для кожної пари (τ, c): "
            "щонайбільше |T|·|C| ≈ 50 × 15 = 750 скалярних добутків незалежно від довжини горизонту.",
            load_rollup_payloads()["§2.2"][0][0].lstrip("\u2026").strip().split("(частина доби × тип дня × клас відносної позиції). ", 1)[1],
            "§2.2 context buckets")
    # §2.4 — the two design facts the measurement refuted, and the free-tier NFR-P1 claim (U10)
    run_sub(blocks, "Практична реалізація використовує рідну мову моделювання CP-SAT",
            "Оцінка розміру: у найгіршому разі Σ(τ)|F(τ)| ≤ 50 × 300 ≈ 1,5·10⁴ літералів, що для CP-SAT є малою задачею. ",
            "", "§2.4 size estimate (superseded by the measurement)")
    run_sub(blocks, "Практична реалізація використовує рідну мову моделювання CP-SAT",
            ", що забезпечує вимогу NFR-P1 на двох віртуальних ядрах безоплатного тарифу", "",
            "§2.4 NFR-P1 on the free tier (U10)")
    run_sub(blocks, "Практична реалізація використовує рідну мову моделювання CP-SAT",
            " Каскад деградації: за перевищення 4·10⁴ літералів гранулярність збільшується до 30 хв; "
            "якщо задача досі «гаряча» — застосовується ковзна поденна декомпозиція тижня; обидва режими "
            "фіксуються в телеметрії.", "", "§2.4 cascade sentence (superseded)")

    # --- tables (steps 10, 16, 23, 26) --------------------------------------------------
    # табл. 3.2 — the requirement rows measurement changed
    cell_set(blocks, 10, 1, 2,
             "Запит плану завершується на пристрої (дотик → план отримано) за ≤ 6,0 с (95-й перцентиль, прогріто) на Android нижнього цінового сегмента 2022 р. за слабкого зв'язку; серверна функція `plan-request` — ≤ 1,5 с (95-й перцентиль); евристичний резерв обмежує очікування сервера 1,9 с",
             "табл. 3.2 NFR-P1")
    cell_set(blocks, 10, 3, 2,
             "Базові операції читання/запису API ≤ 300 мс (95-й перцентиль), без урахування ML-ендпоїнта планування та складених функцій, які вимірюються й звітуються окремо",
             "табл. 3.2 NFR-P3")
    cell_set(blocks, 10, 8, 2,
             "Обслуговування до ≈ 3 тис. MAU в межах безоплатних тарифів (оцінка аудиту тарифів, без навантажувального випробування); задокументований шлях міграції до ≈ 25 дол./міс. на 50 тис. MAU",
             "табл. 3.2 NFR-Sc1")
    # табл. 3.3 — the stack rows whose named mechanism changed
    cell_set(blocks, 11, 4, 1, "react-native-reanimated 4 + gesture-handler [49]", "табл. 3.3 motion row (choice)")
    cell_set(blocks, 11, 4, 2,
             "Ворклети в потоці інтерфейсу: пружинні переходи діалогу та стрічки плану; перетягування не реалізовано",
             "табл. 3.3 motion row (rationale)")
    cell_set(blocks, 11, 5, 2,
             "Кільце фокус-таймера. Теплокарту енергії (FR-40) намальовано нативними View з інтерполяцією в OKLCH: канвас є одним непрозорим елементом для читача екрана і не масштабує підписи зі шрифтом (NFR-A1/A2)",
             "табл. 3.3 Skia row")
    cell_set(blocks, 11, 6, 1, "Expo SQLite + Drizzle ORM (власний хук живих запитів `useLiveRows`) [18]", "табл. 3.3 ORM row (choice)")
    cell_set(blocks, 11, 6, 2,
             "Типобезпечні схема та міграції в TS; живі запити роблять SQLite єдиним реактивним джерелом істини для доменних даних. Власний хук замість `useLiveQuery` через відкриту ваду drizzle-orm #2620 — відсутність оновлення, коли запит не повертає рядків",
             "табл. 3.3 ORM row (rationale)")
    cell_set(blocks, 11, 10, 2,
             "Розбір дат — chrono-node; тривалості розбирає власна граматика, яка виконується першою та маскує свої фрагменти в тексті, що бачить chrono. Працює на пристрої двома мовами (FR-11)",
             "табл. 3.3 chrono row")
    # the on-device row is dropped: the ranker was never built
    del blocks[[i for i, x in enumerate(blocks) if x["kind"] == "table"][11]]["rows"][12]
    APPLIED.append("табл. 3.3 on-device row removed")
    # табл. Е.1 — the NFR-P1 traceability row
    cell_set(blocks, 16, 8, 0, "NFR-P1 (план ≤ 6,0 с на пристрої; функція ≤ 1,5 с)", "табл. Е.1 NFR-P1")
    cell_set(blocks, 16, 8, 2,
             "anytime CP-SAT 1,5 с з критеріями зупинки за розривом і відсутністю поліпшення; каскад деградації; евристичний резерв 1,9 с",
             "табл. Е.1 mechanism")
    # табл. В.1 — the derived destructive-label token
    blocks[[i for i, x in enumerate(blocks) if x["kind"] == "table"][15]]["rows"].append(
        ["danger-text", "#B91C1C (6,47:1)", "#F87171 (6,10:1)", "підписи деструктивних дій"])
    APPLIED.append("табл. В.1 danger-text row added")

    # --- Додаток В prose, Додаток Ж values, лістинг 4.1 ---------------------------------
    run_sub(blocks, "Теплокарти енергії інтерполюються", "Усі кольорові пари задовольняють вимоги контрасту WCAG 2.2 AA (не менше 4,5:1 для основного тексту).",
            "Пари, використані для тексту, задовольняють WCAG 2.2 AA (≥ 4,5:1); акцентні кольори (success, warning, energy, danger) використовуються лише як заливки — як текст на світлій поверхні вони дають 2,06–3,60:1 — і завжди супроводжуються текстовою альтернативою, а для деструктивних підписів введено окремий токен danger-text. Роздільність теплокарти слід називати чесно: 126 клітинок повторюють частину доби по її годинах і тип дня по днях тижня.",
            "Додаток В contrast claim")
    run_sub(blocks, "Теплокарти енергії інтерполюються", "Inter Variable (інтерфейс і заголовки)",
            "Inter (статичні накреслення 400/500/600/700; інтерфейс і заголовки)", "Додаток В typography")
    run_sub(blocks, '"engine": "bandit_cpsat"', '"bandit_cpsat"', '"learned"', "Додаток Ж engine")
    run_sub(blocks, '"category": "deep_work"', '"deep_work"', '"deep"', "Додаток Ж category")
    run_sub(blocks, '"reason": "no_feasible_slot"', '"no_feasible_slot"', '"no_feasible_start"', "Додаток Ж unplaced reason")
    run_sub(blocks, '"propensity": 0.25', '"propensity": 0.25', '"propensity": 0.3333333333333333', "Додаток Ж propensity")
    run_sub(blocks, "await enqueue(db, skipEvent(r, contextSnapshot(r, now)));",
            "skipEvent(r, contextSnapshot(r, now))", "lapseObservedEvent(r, contextSnapshot(r, now))",
            "лістинг 4.1 event type")

    # рис. 3.1 caption — three components moved
    run_sub(blocks, "МІСЦЕ ДЛЯ РИСУНКА 3.1",
            "сервіс RecSys: FastAPI (Python 3.12) на Hugging Face Spaces, ендпоїнти /plan, /feedback, /insights; передобчислення допустимих стартів; бандитно-зважений CP-SAT; реєстр моделей на HF Hub; (4) конвеєр навчання: нічний cron GitHub Actions",
            "сервіс RecSys: FastAPI (Python 3.12) у контейнері на віртуальній машині Oracle Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ) у регіоні ЄС eu-marseille-1, за Caddy з автоматичним TLS; ендпоїнти /plan, /feedback, /insights, /parse-preview; передобчислення допустимих стартів; бандитно-зважений CP-SAT; реєстр моделей у Supabase Storage (ЄС); (4) конвеєр навчання: нічний системний таймер на тій самій машині",
            "рис. 3.1 caption")
    run_sub(blocks, "МІСЦЕ ДЛЯ РИСУНКА 3.1", "нічний конвеєр → HF Hub → реєстр", "конвеєр навчання → Supabase Storage → реєстр", "рис. 3.1 arrows")
    # §3.10 — the chapter conclusion still names the withdrawn host
    run_sub(blocks, "У розділі систематизовано вимоги до системи",
            "(React Native + Expo, Supabase, FastAPI на Hugging Face Spaces, GitHub Actions)",
            "(React Native + Expo, Supabase, FastAPI у контейнері на віртуальній машині в регіоні ЄС, GitHub Actions)",
            "§3.10 hosting")
    # §2.7 — the signal is a Move, not a drag
    run_sub(blocks, "Поведінкові сигнали перетворюються на винагороди",
            "оцінка енергії, перетягування блоку", "оцінка енергії, перенесення блоку", "§2.7 signal name")

    run_sub(blocks, "МІСЦЕ ДЛЯ РИСУНКА 3.1", "chrono-node; у перспективі onnxruntime-react-native", "chrono-node", "рис. 3.1 on-device")
    run_sub(blocks, "Сервіс рекомендацій — застосунок FastAPI",
            "у Docker-контейнері на безоплатному CPU-тарифі Hugging Face Spaces",
            "у Docker-контейнері на віртуальній машині Oracle Cloud «Always Free» (Ampere A1, 2 OCPU / 12 ГБ, регіон eu-marseille-1)",
            "§4.4 hosting")

    # --- РОЗДІЛ 5 replaced, РОЗДІЛ 6 inserted (steps 19–20) ----------------------------
    replace_range(blocks, "РОЗДІЛ 5. МЕТОДИКА ЕКСПЕРИМЕНТАЛЬНОГО", "ВИСНОВКИ",
                  load_text_file("rozdil-5.md") + load_text_file("rozdil-6.md"),
                  "Розділ 5 replaced + Розділ 6 inserted")

    # --- ВИСНОВКИ (step 21) -------------------------------------------------------------
    para_tail(blocks, "Проаналізовано предметну область персонального планування часу та показано", pay[10], "висновки п.1")
    para_tail(blocks, "Уперше формалізовано задачу персонального планування", pay[11], "висновки п.2")
    para_tail(blocks, "Розроблено метод холодного старту, що поєднує психометричну", pay[12], "висновки п.3")
    para_tail(blocks, "Розроблено методику офлайн-оцінювання політик планування за екстремальної", pay[13], "висновки п.4")
    para_replace(blocks, "Спроєктовано та реалізовано програмний комплекс Kairos: мобільний застосунок", pay[14], "висновки п.5")
    para_replace(blocks, "Розроблено переддослідницьки реєстровану методику польового оцінювання", pay[15], "висновки п.6")
    para_insert_after(blocks, pay[15][:60], pay[16], "висновки п.7 (new)")
    para_insert_after(blocks, pay[16][:60], pay[17], "висновки п.8 (new)")
    para_replace(blocks, "Перспективи подальших досліджень включають", pay[18], "висновки: перспективи")

    # --- appendices (steps 24, 28, 29) --------------------------------------------------
    dg = load_text_file("dodatok-g.md")
    for b in dg:
        if b["kind"] == "p" and b.get("style", "").startswith("Heading"):
            b["style"] = f"Heading{min(int(b['style'][-1]) + 1, 3)}"
    replace_range(blocks, "Додаток Г. Фрагмент SQL-схеми", "Додаток Д. Мікроопитувальник",
                  dg, "Додаток Г replaced")
    for name in ("dodatok-z.md", "dodatok-y.md"):
        part = load_text_file(name)
        for b in part:                      # demote: an appendix is Heading2 in this document
            if b["kind"] == "p" and b.get("style", "").startswith("Heading"):
                b["style"] = f"Heading{min(int(b['style'][-1]) + 1, 3)}"
        blocks.extend(part)
    APPLIED.append("Додаток З and Додаток И appended")

    # --- references, then citations (step 22) -------------------------------------------
    mapping = rebuild_references(blocks)
    head = find(blocks, "СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ")
    changed = renumber_citations(blocks, mapping, head)
    APPLIED.append(f"citations renumbered in {changed} blocks")
    resolved, unresolved = resolve_cite_keys(blocks, head)
    APPLIED.append(f"symbolic citations resolved: {resolved}")
    for u in unresolved:
        SKIPPED.append(f"unresolved citation key [@{u}]")

    # --- global sweeps -------------------------------------------------------------------
    sweeps = 0
    for b in blocks:
        if b["kind"] != "p" or b["origin"] not in ("draft", "edited", "renumbered"):
            continue
        t = b["text"]
        n = t
        n = n.replace("п'яти розділів", "шести розділів").replace("п’яти розділів", "шести розділів")
        # results now live in Розділ 6; §2.6/5.x design references are unaffected
        n = n.replace("методики оцінювання (підрозділ 2.6 і розділ 5)", "методики оцінювання (підрозділ 2.6, розділи 5 і 6)")
        n = n.replace("що є первинним у науковому оцінюванні розділу 5", "що є первинним у науковому оцінюванні розділів 5 і 6")
        if n != t:
            b["text"] = n
            b["origin"] = "edited"
            sweeps += 1
    APPLIED.append(f"global sweeps applied to {sweeps} paragraphs")

    stats = {
        "blocks": len(blocks),
        "from_draft": sum(1 for b in blocks if b["origin"] == "draft"),
        "edited": sum(1 for b in blocks if b["origin"] == "edited"),
        "inserted": sum(1 for b in blocks if b["origin"] == "inserted"),
        "renumbered": sum(1 for b in blocks if b["origin"] == "renumbered"),
        "from_text_files": sum(1 for b in blocks if b["origin"].endswith(".md")),
    }
    # fidelity: every block still marked "draft" must be byte-identical to the source
    drift = 0
    src_texts = set(src.values())
    for b in blocks:
        if b["kind"] == "p" and b["origin"] == "draft" and b["text"] not in src_texts:
            drift += 1
    stats["untouched_drift"] = drift
    return blocks, stats


def main() -> int:
    blocks, stats = build()
    print("== assembly ==")
    for line in APPLIED:
        print("  applied:", line)
    for line in SKIPPED:
        print("  SKIPPED:", line)
    print("\n== fidelity ==")
    for k, v in stats.items():
        print(f"  {k:22s} {v}")
    if stats["untouched_drift"]:
        print("  !! paragraphs still marked untouched differ from the source — assembly is unsafe")
        return 1
    print("  (every block still marked 'from_draft' is byte-identical to draft.docx)")
    if "--report" in sys.argv:
        return 0
    io.open(OUT, "w", encoding="utf-8").write(render(blocks))
    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
