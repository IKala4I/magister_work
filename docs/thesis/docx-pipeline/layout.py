#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Що вийшло на сторінках: читає готовий PDF і каже конвеєру те, чого з .docx не видно.

    python3 layout.py pages   hourwell.pdf            # обсяг роботи: номер останньої сторінки
    python3 layout.py referat referat.pdf             # сторінок у рефераті кожною мовою (≤ 3)

Номер сторінки в .docx — поле, а кількість сторінок залежить від верстки, тож число «сторінок – N»
у вступі й рефераті не можна ані набрати руками, ані порахувати з .docx. run_all.sh складає
документ, рендерить PDF, питає тут обсяг і складає вдруге вже з числом (`build.py --pages`), доки
число не перестане змінюватися.

Обсяг — номер останньої сторінки за нумерацією роботи (методичка, с. 10): титульний лист — 1,
завдання — 2, зміст — 3. Картка, якщо вона стоїть у файлі першою, у відлік не входить.
"""
import argparse, re, sys

import pdfplumber

REFERAT_MAX = 3                           # методичка, с. 12: «Обсяг реферату до 3-х сторінок»


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=('pages', 'referat')); ap.add_argument('pdf')
    a = ap.parse_args()
    if a.what == 'pages':
        last, total, front = thesis_pages(a.pdf)
        print(last)
        print(f'обсяг {last} с.: у PDF {total} сторінок, перед змістом {front}', file=sys.stderr)
        return 0
    ua, en = referat_pages(a.pdf)
    print(f'реферат: українською {ua} с., іноземною {en} с. (межа — {REFERAT_MAX})')
    return 0 if max(ua, en) <= REFERAT_MAX else 1


if __name__ == '__main__':
    sys.exit(main())
