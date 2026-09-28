#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Звірка зібраного .docx із джерелом.

    python3 verify.py --src ../text/full.md --docx out/hourwell.docx --brief ../formatter-brief.md

Що гарантує і чого НЕ гарантує. Перевірка на дослівність доводить, що дорогою від
full.md до .docx нічого не переписано. Вона нічого не каже про те, чи правильний
сам full.md: якщо розмітка зіпсувала джерело, обидві сторони міститимуть однакову
помилку й ідеально збігатимуться. Від цього захищають інші перевірки —
check_legend_symbols.py, audit_markdown.py і структурні перевірки таблиць у build.py.

Звірка йде від СИРОГО джерела — після погоджених правок реєстру, але до нормалізації
складальника. Кожна відмінність документа від джерела має пояснитися дозволеною заміною,
і дозволеність verify.py оцінює сам, власними правилами (judge), а не правилом build.py:
перевірка, що звіряє після того самого правила, не бачить його помилок. Так конвеєр,
відновлений 2026-09-28, друкував номер підрозділу «3.7» як «3,7», а звірка казала OK.

Перевірки:
  1. кожен непорожній рядок прози є в тексті документа (дозволено лише ' → ’, і не у
     вставках коду); код порівнюється без зняття розмітки й без жодних замін;
  2. кожна таблиця джерела — комірка до комірки проти таблиці документа; комірка або
     збігається, або відрізняється лише дозволеною заміною (кома й мінус — тільки в
     комірці, що вся є числом, і ніколи в номері підрозділу цього документа);
  3. кількість формул у джерелі = кількість об'єктів OMML (з урахуванням розбитих)
     і жодне кириличне слово з рядка формули не загубилося в LaTeX;
  4. рядки keep-verbatim із брифа — є в джерелі й у документі (апостроф і тире
     згортаються, як велить §7 брифа; структура рівняння — окремим винятком);
  5. кожна вставка з реєстру, яку застосовано, є в документі.
Код виходу 1, якщо порушено будь-що з 1–5.
"""
import argparse, os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build                                          # noqa: E402
from formulas import FORMULA_TEX, FORMULA_SPLIT, DOCX_EXEMPT   # noqa: E402
from docx import Document                              # noqa: E402

ws = lambda s: re.sub(r'\s+', ' ', s).strip()
fold = lambda s: s.replace("'", '\u2019').replace('—', '–')


def ref_cells(line):
    """НЕЗАЛЕЖНИЙ від build.py розбір комірок: лише правило GFM (скісна екранує
    наступний символ) і нічого більше. Навмисно не імпортується зі складальника:
    перевірка, що ділить код із тим, що перевіряє, не бачить його помилок —
    саме так пробіл у «за змінного |A_m(x)|» зникав непоміченим."""
    inner = line.strip()
    if inner.startswith('|'): inner = inner[1:]
    if inner.endswith('|') and not inner.endswith('\\|'): inner = inner[:-1]
    cells, cur, i = [], '', 0
    while i < len(inner):
        if inner[i] == '\\' and i + 1 < len(inner):
            cur += inner[i:i+2]; i += 2; continue
        if inner[i] == '|': cells.append(cur); cur = ''
        else: cur += inner[i]
        i += 1
    cells.append(cur)
    return [c.strip().replace('\\|', '|') for c in cells]


def strip_md(s):
    s = re.sub(r'^\s*```[a-z]*\s*', '', s)
    s = re.sub(r'\s*```\s*$', '', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'(?<![\w\\])_([^_\n]+)_(?![\w])',
               lambda m: m.group(1) if build._is_prose_italic(m.group(1)) else m.group(0), s)
    s = s.replace('`', '')
    s = re.sub(r'^#{1,3}\s+', '', s)
    return ws(s)


def docx_text(path):
    doc = Document(path)
    out = [p.text for p in doc.paragraphs]

    def cells(tbl):
        for row in tbl.rows:
            for c in row.cells:
                out.extend(p.text for p in c.paragraphs)
                for t in c.tables: cells(t)
    for t in doc.tables: cells(t)
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml').decode('utf-8')
    return ws(' '.join(out)), len(re.findall(r'<m:oMath>', xml))


def docx_tables(path):
    """Таблиці даних документа по порядку, як [[текст комірки]]. Формули — теж таблиці,
    але без стилю «Table Grid», тож сюди не потрапляють."""
    return [[[ws(c.text) for c in row.cells] for row in t.rows]
            for t in Document(path).tables if t.style is not None and t.style.name == 'Table Grid']


def raw(n):
    """Рядок джерела з погодженими override-ами реєстру, але БЕЗ нормалізації складальника."""
    s = build.LINES[n - 1]
    o = build.OVERRIDE.get(n)
    if o and o['replace'] not in s: s = s.replace(o['find'], o['replace'], 1)
    return s


def code_lines(lines):
    """Власний облік рядків коду: огорожі ``` і все між ними, плюс діапазони коду з реєстру."""
    out, inside = set(), False
    for n, s in enumerate(lines, 1):
        if inside:
            out.add(n)
            if s.rstrip().endswith('```'): inside = False
        elif s.lstrip().startswith('```'):
            out.add(n); inside = s.count('```') < 2
    for a, b in build.CODE_RANGES: out.update(range(a, b + 1))
    return out


def heading_numbers(lines):
    """Номери розділів і підрозділів цього документа («3.7», «6.6.2»), прочитані з самих
    заголовків. Знання, незалежне від складальника: число, що збігається з номером
    підрозділу, — посилання на підрозділ, а не десятковий дріб. Якщо колись справжній дріб
    збіжеться з номером підрозділу, звірка впаде — тоді дріб у джерелі пишуть із комою,
    як усі інші."""
    return {m.group(1) for s in lines for m in [re.match(r'^#{1,3}\s+(\d+(?:\.\d+)+)\.?\s', s)] if m}


ALLOWED = {('.', ','): 'кома', ('-', '−'): 'мінус', ("'", '’'): 'апостроф'}
PURE_NUMBER = re.compile(r'[+\-−]?(\d+(?:\.\d+)?)(?:\s*±\s*\d+(?:\.\d+)?)?')


def judge(raw_cell, src, doc, sections):
    """Чи пояснюється відмінність комірки документа від сирого джерела дозволеною заміною.
    Повертає (причина, []) якщо ні, або (None, [види замін]) якщо так. Правила записано тут
    заново, словами брифа: кома й мінус — лише в комірці, що вся є числом, і ніколи в номері
    підрозділу; апостроф — будь-де, крім вставок у зворотних лапках."""
    if src == doc: return None, []
    if len(src) != len(doc): return 'змінилася довжина', []
    kinds = set()
    for x, y in zip(src, doc):
        if x != y:
            if (x, y) not in ALLOWED: return f'заміна {x!r} → {y!r} не передбачена', []
            kinds.add(ALLOWED[(x, y)])
    if kinds & {'кома', 'мінус'}:
        m = PURE_NUMBER.fullmatch(src)
        if not m: return 'кома чи мінус у комірці, що не є числом', []
        if m.group(1) in sections: return f'номер підрозділу {m.group(1)} надруковано як дріб', []
    if 'апостроф' in kinds:
        for span in re.findall(r'`([^`]*)`', raw_cell):
            if "'" in span and span not in doc: return f'апостроф змінено у вставці коду `{span}`', []
    return None, sorted(kinds)


def source_tables(lines, code):
    """Таблиці джерела по порядку: списки номерів рядків, без рядка-роздільника."""
    tables, cur = [], []
    for n, s in enumerate(lines + [''], 1):
        if s.startswith('|') and n not in code:
            cur.append(n)
        elif cur:
            tables.append([k for k in cur
                           if not all(re.fullmatch(r':?-+:?', c) for c in ref_cells(lines[k - 1]))])
            cur = []
    return tables


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True); ap.add_argument('--docx', required=True)
    ap.add_argument('--brief'); ap.add_argument('--registry', default=os.path.join(HERE, 'registry.json'))
    a = ap.parse_args()

    build.load(a.src, a.brief)
    if a.registry: build.bind_registry(a.registry)
    LINES = build.LINES
    body, nmath = docx_text(a.docx)
    code, sections = code_lines(LINES), heading_numbers(LINES)
    failed = False

    # 1, 3
    missing, formulas, lost_words, apostrophes = [], [], [], 0
    for n in range(1, len(LINES) + 1):
        s = raw(n)
        if not s.strip(): continue
        fm = build.RE_FORMULA.match(s)
        if fm and fm.group(2) in FORMULA_TEX:
            num = fm.group(2); formulas.append(num)
            for word in re.findall(r'[А-ЯІЇЄҐа-яіїєґ]{3,}', fm.group(1)):
                if word not in FORMULA_TEX[num]: lost_words.append((n, num, word))
            continue
        if s.startswith('|') and n not in code: continue            # таблиці — перевірка 2
        if n in code:
            t = ws(re.sub(r'^\s*```[a-z]*\s*|\s*```\s*$', '', s))
            if len(t) >= 3 and t not in body: missing.append((n, t[:90]))
            continue
        t = strip_md(s)
        if len(t) < 3 or t in body: continue
        spans_kept = all(sp in body for sp in re.findall(r'`([^`]*)`', s) if "'" in sp)
        if t.replace("'", '’') in body and spans_kept: apostrophes += 1
        else: missing.append((n, t[:90]))

    # 2
    src_tabs, doc_tabs = source_tables(LINES, code), docx_tables(a.docx)
    cells_bad, normalized = [], []
    if len(src_tabs) != len(doc_tabs):
        cells_bad.append((0, f'таблиць у джерелі {len(src_tabs)}, у .docx {len(doc_tabs)}'))
    for rows, drows in zip(src_tabs, doc_tabs):
        if len(rows) != len(drows):
            cells_bad.append((rows[0], f'рядків {len(rows)} ↔ {len(drows)}')); continue
        for n, dcells in zip(rows, drows):
            scells = ref_cells(raw(n))
            if len(scells) != len(dcells):
                cells_bad.append((n, f'комірок {len(scells)} ↔ {len(dcells)}')); continue
            for j, (sc, dc) in enumerate(zip(scells, dcells), 1):
                why, kinds = judge(sc, strip_md(sc), dc, sections)
                if why: cells_bad.append((n, f'комірка {j}: {why}: «{strip_md(sc)[:40]}» → «{dc[:40]}»'))
                elif kinds: normalized.append((n, j, strip_md(sc), dc, kinds))

    extra = sum(len(FORMULA_SPLIT[k]) - 1 for k in FORMULA_SPLIT if k in formulas)
    ok_f = nmath == len(formulas) + extra
    print(f'рядків джерела перевірено: {len(LINES)}')
    print(f'рядків тексту, не знайдених у .docx: {len(missing)}'
          + (f' (рядків, де апостроф став ’: {apostrophes})' if apostrophes else ''))
    for n, t in missing[:20]: print(f'   ряд {n}: {t}')
    print(f'таблиць: джерело {len(src_tabs)}, .docx {len(doc_tabs)}; комірок, що не збіглися: {len(cells_bad)}; '
          f'нормалізованих комірок: {len(normalized)}')
    for n, t in cells_bad[:20]: print(f'   ряд {n}: {t}')
    for n, j, x, y, k in normalized[:20]: print(f'   (нормалізовано) ряд {n}, комірка {j}: «{x}» → «{y}» ({", ".join(k)})')
    print(f'формул у джерелі: {len(formulas)}; обʼєктів OMML: {nmath}'
          + (f' (з них {extra} — другі рядки розбитих)' if extra else '') + ('  ✔' if ok_f else '  ✘'))
    for n, num, w in lost_words: print(f'   СЛОВО ЗАГУБЛЕНО У ФОРМУЛІ ({num}), ряд {n}: «{w}»')
    failed |= bool(missing or cells_bad or lost_words or not ok_f)

    # 4
    if a.brief:
        src_txt = fold(ws(strip_md('\n'.join(LINES))))
        kv = build.KEEP_VERBATIM
        absent_src = [k for k in kv if fold(strip_md(k)) not in src_txt]
        not_in_docx = [k for k in kv if k not in absent_src and fold(strip_md(k)) not in fold(body)]
        exempt = [k for k in not_in_docx if k in DOCX_EXEMPT]
        bad = [k for k in not_in_docx if k not in DOCX_EXEMPT]
        print(f'keep-verbatim: {len(kv)} рядків; у джерелі немає {len(absent_src)}; '
              f'у .docx втрачено {len(bad)}; виняток «структура рівняння» {len(exempt)}')
        for k in absent_src: print(f'   НЕМАЄ В ДЖЕРЕЛІ: {k}')
        for k in bad: print(f'   ВТРАЧЕНО В .docx: {k}')
        for k in exempt: print(f'   (виняток) {k}')
        failed |= bool(absent_src or bad)

    # 5
    ins_bad = [t for lst in build.INSERT_AFTER.values() for t in lst
               if strip_md(t) not in body and strip_md(t).replace("'", '’') not in body]
    print(f'вставок із реєстру застосовано: {sum(len(v) for v in build.INSERT_AFTER.values())}; '
          f'не знайдено в .docx: {len(ins_bad)}')
    failed |= bool(ins_bad)

    print('РЕЗУЛЬТАТ:', 'ПОМИЛКИ' if failed else 'OK')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
