#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Що вийшло на сторінках: читає готовий PDF і каже конвеєру те, чого з .docx не видно.

    python3 layout.py pages   hourwell.pdf            # обсяг роботи: номер останньої сторінки
    python3 layout.py referat referat.pdf             # сторінок у рефераті кожною мовою (≤ 3)
    python3 layout.py tables  hourwell.pdf hourwell.docx --plan tables.json --out tables.next.json
                                                      # які рядки кожної таблиці на якій сторінці

Номер сторінки в .docx — поле, а кількість сторінок залежить від верстки, тож число «сторінок – N»
у вступі й рефераті не можна ані набрати руками, ані порахувати з .docx. run_all.sh складає
документ, рендерить PDF, питає тут обсяг і складає вдруге вже з числом (`build.py --pages`), доки
число не перестане змінюватися.

Те саме з таблицями. Методичка (с. 20) вимагає над кожною частиною таблиці, що перейшла на нову
сторінку, напис «Продовження таблиці N». Де саме таблиця переходить, з .docx не видно. `tables`
знаходить на кожній сторінці PDF таблиці з лінійками, рахує їхні рядки й зіставляє з таблицями
.docx по порядку: частина .docx, що вмістилася на сторінці цілком, дає один фрагмент із тією самою
кількістю рядків; частина, що перейшла на наступну сторінку, — кілька, і кожен наступний
починається повтореною головкою.

Поділ фіксується по одній межі за прохід, у порядку документа. Напис «Продовження таблиці» додає
рядок, а розрив сторінки зсуває все, що далі, тож межа, знята з верстки до поділу попередньої
таблиці, застаріває — і лишає майже порожню сторінку (перша спроба так і зробила: +6 сторінок).
Тому план (--plan) пам'ятає, що вже зафіксовано: у кожному розділі чи додатку — вони починаються з
нової сторінки, тож один на одного не впливають — за прохід фіксується одна нова межа першої ще не
зафіксованої таблиці, а таблиці після неї складаються цілими, доки до них не дійде черга. Таблиця
не лишає на сторінці менше двох рядків: якщо під головкою вміщується один — уся таблиця
починається з нової сторінки, якщо один лишається на останню частину — межа відступає на рядок.
Код виходу 0, коли план більше не змінюється і жодна частина не переходить сторінку без напису.

Рядки таблиць не рвуться між сторінками (cantSplit у build.py) — інакше рядок рахувався б двічі.

Обсяг — номер останньої сторінки за нумерацією роботи (методичка, с. 10): титульний лист — 1,
завдання — 2, зміст — 3. Картка, якщо вона стоїть у файлі першою, у відлік не входить.
"""
import argparse, json, os, re, sys

import pdfplumber
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

REFERAT_MAX = 3                           # методичка, с. 12: «Обсяг реферату до 3-х сторінок»
BODY_RANGE = (60, 80)                     # основний текст, ВСТУП – ВИСНОВКИ включно (власник, 2026-10-26)


def page_texts(path):
    with pdfplumber.open(path) as pdf:
        return [' '.join((p.extract_text() or '').split()) for p in pdf.pages]


def thesis_pages(path):
    """(обсяг, сторінок PDF, сторінок перед змістом). Зміст — перша сторінка, чий текст
    починається з «3 ЗМІСТ»: номер сторінки вгорі, під ним заголовок."""
    texts = page_texts(path)
    toc = next((i for i, t in enumerate(texts) if re.match(r'^3\s+ЗМІСТ\b', t)), None)
    if toc is None:
        raise SystemExit(f'{path}: сторінки «3 ЗМІСТ» не знайдено — без неї обсяг не порахувати')
    last = len(texts) - toc + 2
    m = re.match(r'^(\d+)\b', texts[-1])
    if not m or int(m.group(1)) != last:
        raise SystemExit(f'{path}: остання сторінка має номер {m.group(1) if m else "?"}, а за підрахунком {last}')
    return last, len(texts), toc


def referat_pages(path):
    """Сторінок в українському рефераті й у рефераті іноземною мовою."""
    texts = page_texts(path)
    en = next((i for i, t in enumerate(texts) if t.startswith('ABSTRACT')), None)
    if not texts or not texts[0].startswith('РЕФЕРАТ') or en is None:
        raise SystemExit(f'{path}: не знайдено сторінок, що починаються з «РЕФЕРАТ» і «ABSTRACT»')
    return en, len(texts) - en


def body_pages(path):
    """Обсяг основного тексту — від ВСТУПУ до кінця ВИСНОВКІВ — і кожної його частини, у сторінках.
    Кожна частина починається з нової сторінки, тож межі — це сторінки, на яких заголовок стоїть
    окремим рядком (у змісті він іде з крапками й номером і не рахується). Повертає [(назва,
    перша друкована сторінка, сторінок)] і загальний обсяг."""
    marks = []
    with pdfplumber.open(path) as pdf:
        texts = [(p.extract_text() or '').split('\n') for p in pdf.pages]
    toc = next(i for i, t in enumerate(texts) if t and re.match(r'^3\s*$', t[0].strip()) and 'ЗМІСТ' in ' '.join(t[:3]))
    for i, lines in enumerate(texts):
        for ln in (x.strip() for x in lines):
            if ln in ('ВСТУП', 'ВИСНОВКИ', 'СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ') or re.fullmatch(r'РОЗДІЛ \d+', ln):
                marks.append((ln, i)); break
    names = [m[0] for m in marks]
    if 'ВСТУП' not in names or 'СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ' not in names:
        raise SystemExit(f'{path}: не знайдено сторінок «ВСТУП» і «СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ»')
    a, b = names.index('ВСТУП'), names.index('СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ')
    parts = [(n, i - toc + 3, nxt - i) for (n, i), (_, nxt) in zip(marks[a:b], marks[a + 1:b + 1])]
    return parts, marks[b][1] - marks[a][1]


WNS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
RE_PART = re.compile(r'(Таблиця|Продовження таблиці) ((?:\d+|[А-ЯІЇЄҐ])\.\d+)')


def docx_parts(path):
    """Частини таблиць даних у .docx по порядку: [(номер таблиці, рядків разом із головкою, стовпців)].
    Номер — з підпису «Таблиця N» або напису «Продовження таблиці N» перед частиною."""
    doc, parts, last = Document(path), [], None
    for el in doc.element.body.iterchildren():
        if el.tag == WNS + 'p':
            m = RE_PART.fullmatch(' '.join(Paragraph(el, doc).text.split()))
            if m: last = m.group(2)
        elif el.tag == WNS + 'tbl':
            t = Table(el, doc)
            if t.style is not None and t.style.name == 'Table Grid':
                if last is None: raise SystemExit(f'{path}: таблиця даних без підпису «Таблиця N» перед нею')
                parts.append((last, len(t.rows), len(t.columns)))
    return parts


def pdf_fragments(path, skip):
    """Таблиці з лінійками на сторінках PDF по порядку: [(сторінка, рядків, стовпців)]. Перші
    `skip` сторінок (картка, титульний лист, завдання) таблиць даних не мають; рамки без
    стовпців (плейсхолдер рисунка) — не таблиці."""
    out = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            if i < skip: continue
            for t in sorted(page.find_tables(), key=lambda t: t.bbox[1]):
                cols = max(len(r.cells) for r in t.rows)
                if cols > 1: out.append((i + 1, len(t.rows), cols))
    return out


MIN_ROWS = 2                              # менше рядків тіла частина таблиці на сторінці не лишає


def table_plan(pdf, docx, prev):
    """Наступний план поділу таблиць і те, чи він відрізняється від попереднього.
    План: {номер: {"before": таблиця з нової сторінки, "parts": [рядків тіла в частинах] або null,
    "final": поділ зафіксовано}}."""
    _, _, front = thesis_pages(pdf)
    parts, frags = docx_parts(docx), pdf_fragments(pdf, front)
    tables, k = {}, 0                                    # номер → [[рядків тіла у фрагментах] на кожну частину .docx]
    for num, rows, cols in parts:
        left, pieces = rows - 1, []
        while left > 0:
            if k >= len(frags):
                raise SystemExit(f'таблиця {num}: у PDF скінчилися таблиці (фрагментів {len(frags)})')
            page, frows, fcols = frags[k]; k += 1
            if fcols != cols or frows - 1 > left or frows < 2:
                raise SystemExit(f'таблиця {num}: фрагмент на с. {page} має {frows} рядків і {fcols} стовпців, '
                                 f'а очікувано ≤ {left + 1} рядків і {cols} стовпців — PDF і .docx не від одного проходу?')
            pieces.append(frows - 1); left -= frows - 1
        tables.setdefault(num, []).append(pieces)
    if k != len(frags):
        raise SystemExit(f'у PDF {len(frags)} фрагментів таблиць, а таблицям .docx відповідає лише {k}')

    plan, changed, crossed, closed = {}, False, 0, set()
    for num, per_part in tables.items():
        unit = num.split('.')[0]                         # розділ або додаток: починається з нової сторінки
        old = prev.get(num) or {'before': False, 'parts': None, 'final': False}
        cur = {'before': bool(old['before']), 'parts': old['parts'], 'final': bool(old['final'])}
        whole = all(len(p) == 1 for p in per_part)
        crossed += not whole
        if unit in closed:                               # вище в цьому розділі щойно з'явилася межа:
            plan[num] = {'before': False, 'parts': None, 'final': False}   # ця таблиця чекає цілою
            changed |= plan[num] != old
            continue
        if whole:
            cur['final'] = True
        else:
            done, tail = per_part[:-1], per_part[-1]
            if any(len(p) != 1 for p in done) or len(tail) == 1:
                # зафіксована частина перестала вміщатися: верстка вище змінилася — починаємо таблицю знову
                cur = {'before': False, 'parts': None, 'final': False}
            elif not done and not cur['before'] and tail[0] < MIN_ROWS:
                cur['before'] = True                     # під головкою один рядок — уся таблиця на нову сторінку
            else:
                first, rest = tail[0], sum(tail) - tail[0]
                if rest < MIN_ROWS and first - (MIN_ROWS - rest) >= MIN_ROWS:
                    first -= MIN_ROWS - rest             # остання частина не лишається з одним рядком
                cur['parts'] = [p[0] for p in done] + [first, sum(tail) - first]
            cur['final'] = False
            closed.add(unit)
        plan[num] = cur
        changed |= cur != old
    return plan, changed, crossed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=('pages', 'referat', 'tables', 'body')); ap.add_argument('pdf')
    ap.add_argument('docx', nargs='?', help='tables: .docx, з якого зроблено цей PDF')
    ap.add_argument('--plan', help='tables: план поділу, з яким складено цей .docx (JSON; може не існувати)')
    ap.add_argument('--out', help='tables: куди записати наступний план (JSON)')
    a = ap.parse_args()
    if a.what == 'tables':
        prev = json.load(open(a.plan, encoding='utf-8')) if a.plan and os.path.exists(a.plan) else {}
        plan, changed, crossed = table_plan(a.pdf, a.docx, prev)
        if a.out: json.dump(plan, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        split = {k: v for k, v in plan.items() if v['parts'] or v['before']}
        print(f'таблиць {len(plan)}; поділено або перенесено {len(split)}; частин, що перейшли сторінку '
              f'без напису: {crossed}; план {"змінився" if changed else "без змін"}')
        if not changed and not crossed:
            for k, v in split.items():
                print(f'   {k}: ' + ('з нової сторінки' if v['before'] else '')
                      + (', ' if v['before'] and v['parts'] else '')
                      + (f'рядків тіла в частинах {v["parts"]}' if v['parts'] else ''))
        return 1 if changed or crossed else 0
    if a.what == 'pages':
        last, total, front = thesis_pages(a.pdf)
        print(last)
        print(f'обсяг {last} с.: у PDF {total} сторінок, перед змістом {front}', file=sys.stderr)
        return 0
    if a.what == 'body':
        parts, total = body_pages(a.pdf)
        lo, hi = BODY_RANGE
        print(f'основний текст (ВСТУП – ВИСНОВКИ): {total} с.'
              + ('' if lo <= total <= hi else f' — ПОЗА МЕЖАМИ {lo}–{hi}'))
        for n, first, k in parts:
            print(f'   {n:12s} з с. {first:3d}: {k} с.')
        return 0
    ua, en = referat_pages(a.pdf)
    print(f'реферат: українською {ua} с., іноземною {en} с. (межа — {REFERAT_MAX})')
    return 0 if max(ua, en) <= REFERAT_MAX else 1


if __name__ == '__main__':
    sys.exit(main())
