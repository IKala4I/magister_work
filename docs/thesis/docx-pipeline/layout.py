#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Що вийшло на сторінках: читає готовий PDF і каже конвеєру те, чого з .docx не видно.

    python3 layout.py pages   hourwell.pdf            # обсяг роботи: номер останньої сторінки
    python3 layout.py referat referat.pdf             # сторінок у рефераті кожною мовою (≤ 3)
    python3 layout.py tables  hourwell.pdf hourwell.docx --plan tables.json --out tables.next.json
                                                      # які рядки кожної таблиці на якій сторінці
    python3 layout.py typography hourwell.pdf         # тире на початку рядка, шрифт дефісів
    python3 layout.py body    hourwell.pdf            # обсяг основного тексту за частинами

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
Мала таблиця (не вища за половину текстового блоку) не ділиться зовсім, а межа великої ставиться
із запасом 15 мм над нижнім полем — див. table_plan (власник, 2026-10-26).

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
    """Таблиці з лінійками на сторінках PDF по порядку: [(сторінка, рядків, стовпців, [низ кожного
    рядка, пт від верху сторінки], висота головки, пт)]. Перші `skip` сторінок (картка, титульний
    лист, завдання) таблиць даних не мають; рамки без стовпців (плейсхолдер рисунка) — не таблиці."""
    out = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            if i < skip: continue
            for t in sorted(page.find_tables(), key=lambda t: t.bbox[1]):
                cols = max(len(r.cells) for r in t.rows)
                if cols > 1:
                    bottoms = [r.bbox[3] for r in t.rows]
                    out.append((i + 1, len(t.rows), cols, bottoms, t.rows[0].bbox[3] - t.rows[0].bbox[1]))
    return out


PT_MM = 72 / 25.4
TEXT_BOTTOM = (297 - 20) * PT_MM          # низ текстового блоку, пт від верху аркуша (нижнє поле 20 мм)
SAFE_MM = 15                              # запас під частиною, що переходить сторінку: ≈ 3 рядки по 12 пт
SAFE_BOTTOM = TEXT_BOTTOM - SAFE_MM * PT_MM
KEEP_MM = (297 - 40) / 2                  # «мала» таблиця: не вища за половину текстового блоку (≈ 128 мм)


MIN_ROWS = 2                              # менше рядків тіла частина таблиці на сторінці не лишає


def table_plan(pdf, docx, prev):
    """Наступний план таблиць і те, чи він відрізняється від попереднього.
    План: {номер: {"keep": мала таблиця — ціла, разом із підписом, "before": таблиця з нової сторінки,
    "parts": [рядків тіла в частинах] або null, "final": рішення зафіксовано}}.

    Мала таблиця (не вища за половину текстового блоку) не ділиться ніколи: build.py ставить
    «не відривати від наступного» на всі її рядки, крім останнього, і вона переходить на нову
    сторінку цілою, з підписом, без «Продовження». Цей ланцюжок виконують і Word, і LibreOffice,
    тож рішення від верстки не залежить. Велика таблиця ділиться там, де її рядки опускаються нижче
    за SAFE_BOTTOM — за 15 мм до нижнього поля, а не там, де LibreOffice фізично переніс рядок: Word
    верстає рядки трохи інакше, і без запасу перша частина у Word переповзає на наступну сторінку,
    а жорсткий розрив перед «Продовження таблиці» лишає після неї майже порожню сторінку."""
    _, _, front = thesis_pages(pdf)
    parts, frags = docx_parts(docx), pdf_fragments(pdf, front)
    tables, height, k = {}, {}, 0                        # номер → [[фрагменти] на кожну частину .docx]
    for num, rows, cols in parts:
        left, pieces = rows - 1, []
        while left > 0:
            if k >= len(frags):
                raise SystemExit(f'таблиця {num}: у PDF скінчилися таблиці (фрагментів {len(frags)})')
            page, frows, fcols, bottoms, head = frags[k]; k += 1
            if fcols != cols or frows - 1 > left or frows < 2:
                raise SystemExit(f'таблиця {num}: фрагмент на с. {page} має {frows} рядків і {fcols} стовпців, '
                                 f'а очікувано ≤ {left + 1} рядків і {cols} стовпців — PDF і .docx не від одного проходу?')
            pieces.append((frows - 1, bottoms)); left -= frows - 1
            # висота таблиці: головка один раз, тіло кожного фрагмента
            h = height.get(num, head)
            height[num] = h + (bottoms[-1] - bottoms[0])
        tables.setdefault(num, []).append(pieces)
    if k != len(frags):
        raise SystemExit(f'у PDF {len(frags)} фрагментів таблиць, а таблицям .docx відповідає лише {k}')

    plan, changed, crossed, closed = {}, False, 0, set()
    for num, per_part in tables.items():
        unit = num.split('.')[0]                         # розділ або додаток: починається з нової сторінки
        old = prev.get(num) or {'keep': False, 'before': False, 'parts': None, 'final': False}
        whole = all(len(p) == 1 for p in per_part)
        crossed += not whole
        if old.get('keep') or height[num] <= KEEP_MM * PT_MM:
            cur = {'keep': True, 'before': False, 'parts': None, 'final': True}
            if not old.get('keep') and not whole: closed.add(unit)   # переїде цілою: нижче все зсунеться
            plan[num] = cur; changed |= cur != old
            continue
        cur = {'keep': False, 'before': bool(old['before']), 'parts': old['parts'], 'final': bool(old['final'])}
        if unit in closed:                               # вище в цьому розділі щойно з'явилася межа:
            plan[num] = {'keep': False, 'before': False, 'parts': None, 'final': False}   # ця таблиця чекає цілою
            changed |= plan[num] != old
            continue
        done, tail = per_part[:-1], per_part[-1]
        first_rows, bottoms = tail[0]
        safe = sum(1 for b in bottoms[1:] if b <= SAFE_BOTTOM)          # рядки тіла вище за запас
        if any(len(p) != 1 for p in done):
            # зафіксована частина перестала вміщатися: верстка вище змінилася — починаємо таблицю знову
            cur = {'keep': False, 'before': False, 'parts': None, 'final': False}
            closed.add(unit)
        elif len(tail) == 1 and safe >= first_rows:      # остання частина вміщається із запасом
            cur['final'] = True
        else:
            total = sum(n for n, _ in tail)
            first = min(safe, first_rows)
            if total - first < MIN_ROWS:
                first -= MIN_ROWS - (total - first)      # остання частина не лишається з одним рядком
            if first >= MIN_ROWS:
                cur['parts'] = [p[0][0] for p in done] + [first, total - first]
            elif not done and not cur['before']:
                cur['before'] = True                     # під головкою не вміщається двох рядків — з нової сторінки
            else:                                        # на свіжій сторінці менше двох рядків — не буває; лишаємо як є
                raise SystemExit(f'таблиця {num}: частина з нової сторінки вміщає лише {safe} рядків тіла')
            cur['final'] = False
            closed.add(unit)
        plan[num] = cur
        changed |= cur != old
    return plan, changed, crossed


LEFT_EDGE = 30 * PT_MM + 5                # лівий край текстового блоку (поле 30 мм) із допуском, пт


def typography(path):
    """Що типографіка дала на сторінках: рядки, які починаються з тире, що стояло між словами
    (« – »), — тире, перенесене на початок рядка; і шрифти, якими намальовано дефіси. Тире на початку
    абзацу (маркер переліку) стоїть з абзацного відступу, а не біля лівого краю, і порушенням не є.
    Тире діапазону без пробілів («P. 272–279») LibreOffice теж переносить на новий рядок; Word перед
    таким тире рядка не розриває, а знака, який заборонив би розрив і мав гліф у Times New Roman,
    немає (U+2060 немає ні в Times New Roman, ні в Liberation Serif) — такі рядки лише рахуються."""
    spaced, ranges, fonts = [], [], {}
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            for ln in page.extract_text_lines():
                if ln['chars'][0]['x0'] < LEFT_EDGE and ln['text'].startswith('–'):
                    (spaced if re.match(r'^–\s', ln['text']) else ranges).append((i + 1, ln['text'][:50]))
            for c in page.chars:
                if c['text'] in '-\u2011':
                    key = c['fontname'].split('+')[-1]; fonts[key] = fonts.get(key, 0) + 1
    return spaced, ranges, fonts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=('pages', 'referat', 'tables', 'body', 'typography')); ap.add_argument('pdf')
    ap.add_argument('docx', nargs='?', help='tables: .docx, з якого зроблено цей PDF')
    ap.add_argument('--plan', help='tables: план поділу, з яким складено цей .docx (JSON; може не існувати)')
    ap.add_argument('--out', help='tables: куди записати наступний план (JSON)')
    a = ap.parse_args()
    if a.what == 'tables':
        prev = json.load(open(a.plan, encoding='utf-8')) if a.plan and os.path.exists(a.plan) else {}
        plan, changed, crossed = table_plan(a.pdf, a.docx, prev)
        if a.out: json.dump(plan, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        split = {k: v for k, v in plan.items() if v['parts'] or v['before']}
        keep = sum(1 for v in plan.values() if v.get('keep'))
        print(f'таблиць {len(plan)}; малих (цілих) {keep}; поділено або перенесено {len(split)}; частин, що '
              f'перейшли сторінку без напису: {crossed}; план {"змінився" if changed else "без змін"}')
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
    if a.what == 'typography':
        spaced, ranges, fonts = typography(a.pdf)
        odd = {f: n for f, n in fonts.items() if not re.match(r'(TimesNewRoman|LiberationSerif|LiberationMono|CourierNew)', f)}
        print(f'рядків, що починаються з тире між словами: {len(spaced)}; з тире діапазону (лише LibreOffice): '
              f'{len(ranges)}; дефіси за шрифтами: {fonts}')
        for pg, t in spaced[:10]: print(f'   с. {pg}: «{t}»')
        for pg, t in ranges[:10]: print(f'   (діапазон) с. {pg}: «{t}»')
        if odd: print(f'   ДЕФІСИ ЧУЖИМ ШРИФТОМ: {odd}')
        return 1 if spaced or odd else 0
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
