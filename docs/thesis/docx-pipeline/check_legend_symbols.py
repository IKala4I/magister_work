#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_legend_symbols — перевірка узгодженості легенди з таблицею.

Призначення: вставити у verify-brief.py як ще одне твердження.

Що робить. Знаходить рядки-легенди виду «X — пояснення», де X — одинарний
непунктуаційний символ поза базовою латиницею й кирилицею (◐, ●, ✓, ▲ тощо),
і вимагає, щоб цей самий символ трапився щонайменше один раз у клітинці
markdown-таблиці в межах вікна пошуку (за замовчуванням — 40 рядків над легендою
й 10 під нею).

Навіщо. Перевірка на наявність рядка не бачить, коли символ зник із таблиці,
а легенда лишилася: файл проходить, а таблиця вже стверджує інше. Саме так
у табл. 1.2 D7 опинився «+» замість «◐» при цілій легенді.

Використання:
    from check_legend_symbols import check_legend_symbols
    errors = check_legend_symbols(open('text/full.md', encoding='utf-8').read())
    assert not errors, '\n'.join(errors)

Або самостійно:  python3 check_legend_symbols.py text/full.md
"""
import re
import sys
import unicodedata

LEGEND = re.compile(r'^\s*(?:\*\*)?(\S)(?:\*\*)?\s+—\s+\S')

def _is_marker(ch):
    """Символ-маркер: не літера, не цифра, не звичайна пунктуація тексту."""
    if ch.isalnum():
        return False
    if ch in '—–-«»"\'()[]{}.,;:!?*_`/\\|+&%$#@~^=<>':
        return False
    return unicodedata.category(ch).startswith('S') or unicodedata.category(ch) == 'Po'

def check_legend_symbols(text, before=40, after=10):
    lines = text.split('\n')
    errors = []
    for i, line in enumerate(lines):
        m = LEGEND.match(line)
        if not m:
            continue
        sym = m.group(1)
        if not _is_marker(sym):
            continue
        lo, hi = max(0, i - before), min(len(lines), i + after)
        found = any(
            row.lstrip().startswith('|') and sym in row
            for row in lines[lo:hi]
        )
        if not found:
            errors.append(
                f'ряд {i + 1}: легенда описує «{sym}» (U+{ord(sym):04X}), '
                f'але жодна клітинка таблиці в рядках {lo + 1}–{hi} його не містить. '
                f'Легенда пережила символ, який вона пояснює.'
            )
    return errors

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'docs/thesis/text/full.md'
    errs = check_legend_symbols(open(path, encoding='utf-8').read())
    for e in errs:
        print('ПОМИЛКА:', e)
    print(f'легенд-символів перевірено; помилок: {len(errs)}')
    sys.exit(1 if errs else 0)
