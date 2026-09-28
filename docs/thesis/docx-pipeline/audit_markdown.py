#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Суцільний аудит full.md на сліди того, що розмітка могла зʼїсти, подвоїти або перерізати.

    python3 audit_markdown.py ../text/full.md --out out/audit.md

Принцип: не шукати за ознаками вже відомих поломок. Перебираються всі символи, які
в markdown мають службове значення, і для кожного перевіряється, чи не поводиться він
у тексті так, ніби його вже прочитали як розмітку. Кожна знахідка — кандидат, а не
вирок: хибна тривога коштує рядка у звіті, пропущена поломка — таблиці з правдоподібними
числами не на своїх місцях.

Чого аудит НЕ бачить: поломки, яка не лишила сліду. Якщо розмітка з'їла слово чи рядок
цілком, у джерелі немає ні дужки, ні риски, ні зайвого пробілу. Таке ловиться лише
звіркою зі старішою версією файла або читанням.

Код виходу 0 завжди: це звіт для людини, а не бар'єр.
"""
import argparse, re, sys
from collections import defaultdict


def code_lines(lines):
    """Рядки коду: усередині огорож ``` і JSON-блок Додатка Ж від «{» до «}»."""
    out, inside = set(), False
    for n, s in enumerate(lines, 1):
        if s.lstrip().startswith('```'):
            out.add(n)
            if not (s.count('```') >= 2): inside = not inside
            continue
        if inside: out.add(n)
    for h, s in enumerate(lines, 1):
        if s.startswith('## Додаток Ж'):
            z0 = next((i for i in range(h + 1, h + 6) if lines[i-1].strip() == '{'), None)
            nxt = next((i for i in range(h + 1, len(lines) + 1) if lines[i-1].startswith('## ')), len(lines))
            z1 = next((i for i in range(nxt - 1, h, -1) if lines[i-1].strip() == '}'), None)
            if z0 and z1: out.update(range(z0, z1 + 1))
    return out


def gfm_cells(line):
    """Комірки за правилами GFM: зворотна скісна екранує наступний символ, тож \\|
    лишає риску в комірці, а \\\\| — це екранована скісна і РОЗДІЛЬНИК після неї."""
    inner = line.strip()
    if inner.startswith('|'): inner = inner[1:]
    if inner.endswith('|') and not inner.endswith('\\|'): inner = inner[:-1]
    cells, cur, i = [], '', 0
    while i < len(inner):
        ch = inner[i]
        if ch == '\\' and i + 1 < len(inner):
            cur += inner[i:i+2]; i += 2; continue
        if ch == '|': cells.append(cur); cur = ''
        else: cur += ch
        i += 1
    cells.append(cur)
    return [c.strip() for c in cells]


def table_spans(lines):
    spans, i = [], 0
    while i < len(lines):
        if lines[i].startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|\s*$', lines[i+1]):
            j = i + 2
            while j < len(lines) and lines[j].startswith('|'): j += 1
            spans.append((i + 1, j)); i = j
        else: i += 1
    return spans


def audit(lines):
    F = defaultdict(list)
    note = lambda cat, n, msg, sev='?': F[cat].append((sev, n, msg))
    CODE = code_lines(lines)
    SPANS = table_spans(lines)
    IN_TABLE = set()
    for a, b in SPANS: IN_TABLE.update(range(a, b + 1))
    ctx = lambda s, i, w=40: s[max(0, i - w):i + w]

    # 1. вертикальні риски
    for a, b in SPANS:
        hdr = gfm_cells(lines[a-1])
        ncol = len(hdr)
        empty = [j for j, h in enumerate(hdr) if not h]
        if empty:
            note('риски', a, f'таблиця на {ncol} стовпців має порожні заголовки {empty} — '
                             f'майже певно риски всередині комірок розрізали рядок', '!!')
        for n in range(a, b + 1):
            cells = gfm_cells(lines[n-1])
            if len(cells) != ncol:
                note('риски', n, f'{len(cells)} комірок проти {ncol} у заголовку', '!!')
            for c in cells:
                if c.rstrip().endswith('\\'):
                    note('риски', n, f'комірка закінчується зворотною скісною: {c[:40]!r} — '
                                     f'\\\\| замість \\|: екранована скісна, а риска після неї стала роздільником', '!!')
    for n, s in enumerate(lines, 1):
        if n in IN_TABLE or n in CODE: continue
        if '|' in s: note('риски', n, f'риска в прозі: …{ctx(s, s.find("|"), 45)}…')

    # 2. тильди
    for n, s in enumerate(lines, 1):
        if '~~' in s: note('тильди', n, 'подвоєна тильда — markdown читає ~…~ як закреслення', '!!')
        elif '~' in s and n not in CODE: note('тильди', n, f'одинарна тильда: …{ctx(s, s.find("~"), 35)}…')

    # 3. підкреслення
    PAIR = re.compile(r'(?<![\w\\])_[^_\n]+_(?![\w])')
    for n, s in enumerate(lines, 1):
        if n in CODE or '_' not in s: continue
        pairs = PAIR.findall(s)
        for p in pairs:
            note('підкреслення', n, f'пара, яку рендерер зробить курсивом: {p[:60]!r}', '?' if ' ' in p else '!')
        if '\\_' in s: note('підкреслення', n, 'екрановане \\_ — хтось уже боровся з цим місцем', '!')
        cnt = s.count('_')
        if cnt % 2 == 1 and cnt > 1 and not pairs:
            note('підкреслення', n, f'непарна кількість підкреслень ({cnt}) — можливо, одне вже зʼїдено')

    # 4. зірочки
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        if s.count('**') % 2: note('зірочки', n, f'непарна кількість ** ({s.count("**")}) — жирне не закрито', '!!')
        single = re.sub(r'\*\*', '', s).count('*')
        if single: note('зірочки', n, f'одинарна зірочка поза парами: …{ctx(s, s.find("*"))}…', '!')
        if '\\*' in s: note('зірочки', n, 'екранована \\*', '!')

    # 5. кутові дужки
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        for m in re.finditer(r'<[^\s<>]{1,40}>', s):
            note('кутові', n, f'схоже на тег або автопосилання: {m.group(0)!r}', '!!')
        if '&lt;' in s or '&gt;' in s or '&amp;' in s:
            note('кутові', n, 'HTML-сутність у тексті — вміст уже проходив через екранування', '!!')

    # 6. квадратні дужки
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        for m in re.finditer(r'\]\(', s):
            note('квадратні', n, f'синтаксис посилання [текст](адреса): …{ctx(s, m.start())}…', '!!')
        for m in re.finditer(r'\]\[', s):
            note('квадратні', n, 'подвійна дужка ][ — синтаксис посилання за міткою', '!!')

    # 7. зворотні скісні — крім \| у рядку таблиці: це правильне екранування риски в GFM
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        rest = re.sub(r'(?<!\\)\\\|', '', s) if n in IN_TABLE else s
        if '\\' in rest: note('екранування', n, f'зворотна скісна: …{ctx(rest, rest.find(chr(92)), 45)}…', '!!')

    # 8. числа
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        if re.search(r'в\.п\.', s): note('числа', n, 'в.п. без пробілу (у роботі скрізь «в. п.»)', '!!')
        if re.search(r'(?<![\w₀-₉])N\s?80(?![\d])', s): note('числа', n, 'N80 замість N₈₀', '!!')
        if re.search(r'10\^\d', s): note('числа', n, '10^ замість надрядкового степеня', '!!')

    # 9. лапки
    for n, s in enumerate(lines, 1):
        if n in CODE: continue
        s_nc = re.sub(r'`[^`]*`', '', s)                  # у вставках коду апостроф — синтаксис
        if "'" in s_nc and n not in IN_TABLE:
            note('лапки', n, f"прямий апостроф ' замість ’: …{ctx(s, s.find(chr(39)), 35)}…", '!')
    return F


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('--out')
    a = ap.parse_args()
    lines = open(a.src, encoding='utf-8').read().split('\n')
    F = audit(lines)
    ORDER = ['риски', 'тильди', 'підкреслення', 'зірочки', 'кутові', 'квадратні', 'екранування', 'числа', 'лапки']
    SEV = {'!!': 'висока', '!': 'середня', '?': 'низька'}
    out = ['# Аудит джерела на сліди розмітки', '', f'Перевірено {len(lines)} рядків. Кожна знахідка — кандидат, не вирок.', '']
    total = hi = 0
    for cat in ORDER:
        items = F.get(cat, [])
        if not items: continue
        h = sum(1 for s, _, _ in items if s == '!!'); hi += h; total += len(items)
        out += [f'## {cat} — {len(items)} (висока певність: {h})', '']
        for sev, n, msg in sorted(items, key=lambda x: ({'!!': 0, '!': 1, '?': 2}[x[0]], x[1])):
            out.append(f'- **{SEV[sev]}** · ряд {n} — {msg}')
        out.append('')
    if a.out: open(a.out, 'w', encoding='utf-8').write('\n'.join(out))
    print(f'знахідок: {total}, із них високої певності: {hi}')
    for cat in ORDER:
        if F.get(cat):
            print(f'  {cat:14} {len(F[cat]):>4}  (висока: {sum(1 for s, _, _ in F[cat] if s == "!!")})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
