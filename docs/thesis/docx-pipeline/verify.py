#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Звірка зібраного .docx із джерелом.

    python3 verify.py --src ../text/full.md --docx out/hourwell.docx --brief ../formatter-brief.md

Що гарантує і чого НЕ гарантує. Перевірка на дослівність доводить, що дорогою від
full.md до .docx нічого не переписано. Вона нічого не каже про те, чи правильний
сам full.md: якщо розмітка зіпсувала джерело, обидві сторони міститимуть однакову
помилку й ідеально збігатимуться. Від цього захищають інші перевірки —
check_legend_symbols.py, audit_markdown.py і структурні перевірки таблиць у build.py.

Перевірки:
  1. кожен непорожній рядок джерела (після погоджених правок і нормалізації) є в тексті
     документа; код порівнюється без зняття розмітки;
  2. кожна комірка кожної таблиці є в тексті документа;
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True); ap.add_argument('--docx', required=True)
    ap.add_argument('--brief'); ap.add_argument('--registry', default=os.path.join(HERE, 'registry.json'))
    a = ap.parse_args()

    build.load(a.src, a.brief)
    if a.registry: build.bind_registry(a.registry)
    LINES = build.LINES
    body, nmath = docx_text(a.docx)
    failed = False

    # 1–3
    missing, cells_missing, formulas, lost_words = [], [], [], []
    for n in range(1, len(LINES) + 1):
        s = build.L(n)
        if not s.strip(): continue
        fm = build.RE_FORMULA.match(s)
        if fm and fm.group(2) in FORMULA_TEX:
            num = fm.group(2); formulas.append(num)
            for word in re.findall(r'[А-ЯІЇЄҐа-яіїєґ]{3,}', fm.group(1)):
                if word not in FORMULA_TEX[num]: lost_words.append((n, num, word))
            continue
        if s.startswith('|') and not build._is_code_line(n):
            for c in ref_cells(s):
                t = strip_md(c)
                if len(t) >= 2 and not set(t) <= set('-: ') and t not in body:
                    cells_missing.append((n, t[:70]))
            continue
        if build._is_code_line(n):
            t = ws(re.sub(r'^\s*```[a-z]*\s*|\s*```\s*$', '', s))
        else:
            t = strip_md(s)
        if len(t) >= 3 and t not in body:
            missing.append((n, t[:90]))

    extra = sum(len(FORMULA_SPLIT[k]) - 1 for k in FORMULA_SPLIT if k in formulas)
    ok_f = nmath == len(formulas) + extra
    print(f'рядків джерела перевірено: {len(LINES)}')
    print(f'рядків тексту, не знайдених у .docx: {len(missing)}')
    for n, t in missing[:20]: print(f'   ряд {n}: {t}')
    print(f'комірок таблиць, не знайдених у .docx: {len(cells_missing)}')
    for n, t in cells_missing[:20]: print(f'   ряд {n}: {t}')
    print(f'формул у джерелі: {len(formulas)}; обʼєктів OMML: {nmath}'
          + (f' (з них {extra} — другі рядки розбитих)' if extra else '') + ('  ✔' if ok_f else '  ✘'))
    for n, num, w in lost_words: print(f'   СЛОВО ЗАГУБЛЕНО У ФОРМУЛІ ({num}), ряд {n}: «{w}»')
    failed |= bool(missing or cells_missing or lost_words or not ok_f)

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
    ins_bad = [t for lst in build.INSERT_AFTER.values() for t in lst if strip_md(t) not in body]
    print(f'вставок із реєстру застосовано: {sum(len(v) for v in build.INSERT_AFTER.values())}; '
          f'не знайдено в .docx: {len(ins_bad)}')
    failed |= bool(ins_bad)

    print('РЕЗУЛЬТАТ:', 'ПОМИЛКИ' if failed else 'OK')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
