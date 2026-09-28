#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_legend_symbols — перевірка узгодженості легенди з таблицею.

Призначення: вставити у verify-brief.py як ще одне твердження.

Що робить. Знаходить рядки-легенди виду «X – пояснення» (тире коротке, як у всьому
тексті з 2026-09-13, або довге), де X — одинарний
непунктуаційний символ поза базовою латиницею й кирилицею (◐, ●, ✓, ▲ тощо),
і вимагає, щоб цей самий символ трапився щонайменше один раз у клітинці
markdown-таблиці в межах вікна пошуку (за замовчуванням — 40 рядків над легендою
й 10 під нею).

Навіщо. Перевірка на наявність рядка не бачить, коли символ зник із таблиці,
а легенда лишилася: файл проходить, а таблиця вже стверджує інше. Саме так
у табл. 1.2 D7 опинився «+» замість «◐» при цілій легенді.

Негативний контроль. Перевірка, яка ніколи не падала, нічого не довела: до 2026-09-28
шаблон вимагав довге тире «—», у тексті лишилося тільки коротке, і легенду «◐ – …» не
знаходило взагалі — «помилок: 0» було порожнім. Тому кожен запуск з командного рядка
(1) падає, якщо не знайдено жодної легенди, і (2) для кожної легенди прибирає її символ
із рядків таблиць, лишаючи саму легенду, — і вимагає, щоб перевірка на цьому впала.

Використання:
    from check_legend_symbols import check_legend_symbols
    errors = check_legend_symbols(open('text/full.md', encoding='utf-8').read())
    assert not errors, '\n'.join(errors)

Або самостійно (з негативним контролем):  python3 check_legend_symbols.py text/full.md
"""
import re
import sys
import unicodedata

LEGEND = re.compile(r'^\s*(?:\*\*)?(\S)(?:\*\*)?\s+[–—]\s+\S')

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

def legends(text):
    """Усі легенди тексту: [(номер рядка, символ)]."""
    return [(i + 1, m.group(1)) for i, ln in enumerate(text.split('\n'))
            for m in [LEGEND.match(ln)] if m and _is_marker(m.group(1))]

def negative_control(text, before=40, after=10):
    """Для кожної легенди: прибрати її символ з усіх рядків таблиць (легенда лишається)
    і переконатися, що перевірка на цьому падає. Повертає рядки легенд, на яких не впала."""
    silent = []
    for n, sym in legends(text):
        mutated = '\n'.join(ln.replace(sym, '') if ln.lstrip().startswith('|') else ln
                            for ln in text.split('\n'))
        if not any(e.startswith(f'ряд {n}:') for e in check_legend_symbols(mutated, before, after)):
            silent.append(n)
    return silent

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'docs/thesis/text/full.md'
    text = open(path, encoding='utf-8').read()
    errs, found, silent = check_legend_symbols(text), legends(text), negative_control(text)
    for e in errs:
        print('ПОМИЛКА:', e)
    if not found:
        print('ПОМИЛКА: жодної легенди не знайдено — або їх у тексті немає, або шаблон їх не бачить '
              '(так було з довгим тире до 2026-09-28). Перевірка нічого не довела.')
    for n in silent:
        print(f'ПОМИЛКА НЕГАТИВНОГО КОНТРОЛЮ: ряд {n}: символ прибрано з таблиць, а перевірка не впала')
    print(f'легенд знайдено: {len(found)} ({", ".join(f"ряд {n} «{s}»" for n, s in found)}); помилок: {len(errs)}; '
          f'негативний контроль: {len(found) - len(silent)} з {len(found)} падають без символу в таблиці')
    sys.exit(1 if errs or silent or not found else 0)
