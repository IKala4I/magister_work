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


# ----------------------------------------------------------------- locating
def find(blocks: list[dict], needle: str, start: int = 0) -> int:
    for i in range(start, len(blocks)):
        if blocks[i]["kind"] == "p" and fold(needle) in fold(blocks[i]["text"]):
            return i
    raise LookupError(f"locator not found: {needle!r}")


# ----------------------------------------------------------------- rendering
def render(blocks: list[dict]) -> str:
    out: list[str] = []
    for b in blocks:
        if b["kind"] == "table":
            rows = b["rows"]
            if not rows:
                continue
            width = max(len(r) for r in rows)
            rows = [r + [""] * (width - len(r)) for r in rows]
            out.append("| " + " | ".join(rows[0]) + " |")
            out.append("| " + " | ".join("---" for _ in range(width)) + " |")
            for r in rows[1:]:
                out.append("| " + " | ".join(c.replace("|", "\\|") for c in r) + " |")
            out.append("")
            continue
        text = b["text"]
        style = b.get("style", "")
        if style.startswith("Heading"):
            level = int(style[-1])
            # headings are wholly bold in the source; the marks are styling, not emphasis
            out.append("#" * level + " " + re.sub(r"^\*\*(.*)\*\*$", r"\1", text).strip())
        elif text.startswith("\t"):
            # a numbered formula: tabs are Word tab stops, flattened here
            out.append(re.sub(r"\t+", "    ", text).strip())
        else:
            out.append(text)
        out.append("")
    return "\n".join(out).replace("\n\n\n", "\n\n").strip() + "\n"


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
    "Speedtest Global Index: Q4 2024. Ookla. URL: https://www.speedtest.net/global-index (дата звернення: 10.09.2026).",
    "Taillard J., Philip P., Chastang J.-F., Bioulac B. Validation of Horne and Ostberg Morningness-Eveningness Questionnaire in a Middle-Aged Population of French Workers. Journal of Biological Rhythms. 2004. Vol. 19, No. 1. P. 76–86. DOI: 10.1177/0748730403259849.",
]


def sort_key(entry: str) -> tuple:
    """ДСТУ ordering as the draft already uses it: ДСТУ, then Cyrillic, then Latin."""
    body = re.sub(r"^\d+\.\s*", "", entry)
    if body.startswith("ДСТУ"):
        return (0, body)
    first = body[0] if body else ""
    return (1, body.lower()) if "А" <= first <= "я" or first in "ІЇЄҐіїєґ" else (2, body.lower())


def rebuild_references(blocks: list[dict]) -> dict[int, int]:
    head = find(blocks, "СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ")
    end = find(blocks, "ДОДАТКИ", head + 1)
    entries = []
    for i in range(head + 1, end):
        if blocks[i]["kind"] == "p" and re.match(r"^\d+\.\s", blocks[i]["text"]):
            n = int(re.match(r"^(\d+)\.", blocks[i]["text"]).group(1))
            entries.append((n, re.sub(r"^\d+\.\s*", "", blocks[i]["text"])))
    kept = [(n, b) for n, b in entries if not any(d in b for d in DELETE_REFS)]
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
    """Rewrite [n] and [n, m] citations in the body. Deleted refs leave a marker."""
    changed = 0

    def one(m: re.Match) -> str:
        nums = [x.strip() for x in m.group(1).split(",")]
        out = []
        for x in nums:
            if not x.isdigit():
                return m.group(0)
            out.append(str(mapping[int(x)]) if int(x) in mapping else "‹?›")
        return "[" + ", ".join(out) + "]"

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
    run_sub(blocks, "По-перше, дозріло он-девайс машинне навчання",
            "По-перше, дозріло он-девайс машинне навчання: середовища виконання ONNX Runtime роблять персоналізовані ранкери обсягом до 10 МБ практичними на телефонах середнього класу [44]. По-друге, безоплатні тарифи хмарних платформ стали справді придатними для промислової експлуатації: Supabase, Hugging Face Spaces та GitHub Actions покривають базу даних, інференс і навчання за нульової вартості на ранньому масштабі [60, 30, 23].",
            "По-перше, безоплатні тарифи хмарних платформ на момент проєктування (початок 2026 р.) покривали базу даних, інференс і навчання за нульової вартості на ранньому масштабі [60, 23]. Ця передумова **не втрималася під час реалізації**: у липні 2026 р. постачальник закрив безоплатний тариф, на якому мав працювати сервіс рекомендацій, і систему перенесено на контейнер у власному керуванні на віртуальній машині безстрокового безоплатного рівня Oracle Cloud у регіоні ЄС (підрозділ 3.3). Сама подія є результатом роботи: залежність від безоплатних тарифів є окремим ризиком дослідницьких систем, і його пом'якшує лише інфраструктурно-незалежний контейнер.",
            "§1.5 market preconditions")
    # §2.4 — the degradation ladder constant
    run_sub(blocks, "Каскад деградації: за перевищення",
            "Каскад деградації: за перевищення 4·10⁴ літералів гранулярність збільшується до 30 хв",
            "Каскад деградації спрацьовує за **виміряним практичним порогом 3·10³ літералів на машині розгортання** (специфікований 4·10⁴ лишається зовнішньою межею): гранулярність збільшується до 30 хв",
            "§2.4 degradation threshold")
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
    run_sub(blocks, "Взаємодія «перетягнути — значить навчити»",
            "Взаємодія «перетягнути — значить навчити» (UC-07) реалізована ворклетами react-native-reanimated у поєднанні з gesture-handler: уся фізика перетягування виконується в потоці інтерфейсу, не торкаючись потоку JavaScript, що гарантує 60 кадрів/с навіть під час фонової синхронізації. Після «прилипання» блоку до нового інтервалу клієнт журналює",
            "Ручне перевизначення (UC-07) реалізовано вибором часу на сітці 15 хв; фізику перетягування не реалізовано. Після застосування нового часу клієнт журналює",
            "§4.1 drag interaction")
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
