#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Регресійне порівняння двох .docx — еталонного й щойно зібраного.

    python3 regress.py GOLDEN.docx CANDIDATE.docx [--show 30]

Для чого. Будь-яка зміна складальника — нова поведінка, доки не доведено протилежне.
Процедура: зібрати тим самим джерелом, з якого зібрано еталон, і порівняти.

Рівні порівняння:
  1. байтовий — частини пакета (document.xml, styles.xml, колонтитули, налаштування);
  2. змістовний — якщо байти різняться: тіло документа розкладається на послідовність
     елементів (абзац / таблиця / формула), для кожного — властивості абзацу, текст,
     форматування runs (сусідні runs з однаковим форматуванням зливаються, порожні
     відкидаються), для таблиць — сітка ширин і вміст комірок, для формул — канонічний
     OMML. Порівнюються послідовності; виводяться перші розбіжності з контекстом.

Код виходу: 0 — ідентичні або змістовно рівні; 1 — є змістовні розбіжності.
"""
import argparse, difflib, re, sys, zipfile
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
q = lambda tag: '{%s}%s' % (W, tag)
PARTS = ['word/document.xml', 'word/styles.xml', 'word/settings.xml',
         'word/header1.xml', 'word/header2.xml', 'word/footer1.xml']


def canon(el):
    """Канонічний рядок XML-елемента: без просторів імен у префіксах, атрибути впорядковані."""
    def walk(e):
        tag = etree.QName(e).localname
        attrs = ' '.join(f'{etree.QName(k).localname}={v}' for k, v in sorted(e.attrib.items()))
        kids = ''.join(walk(c) for c in e)
        txt = (e.text or '').strip() if tag in ('t', 'instrText') else ''
        return f'<{tag}{" " + attrs if attrs else ""}>{txt}{kids}</{tag}>'
    return walk(el) if el is not None else ''


def runs_of(p):
    """Злиті runs абзацу: [(форматування, текст)]; службові елементи — окремими маркерами."""
    out = []
    for r in p.iter(q('r')):
        if r.getparent().tag == '{%s}r' % M: continue
        rpr = r.find(q('rPr'))
        fmt = canon(rpr)
        for ch in r:
            ln = etree.QName(ch).localname
            if ln == 't':
                txt = ch.text or ''
                if not txt: continue
                if out and out[-1][0] == fmt and not out[-1][1].startswith('⟨'):
                    out[-1] = (fmt, out[-1][1] + txt)
                else:
                    out.append((fmt, txt))
            elif ln in ('fldChar', 'instrText', 'br', 'tab'):
                val = ch.get(q('fldCharType')) or ch.get(q('type')) or (ch.text or '').strip()
                out.append(('', f'⟨{ln}:{val}⟩'))
    return out


def para_sig(p):
    ppr = p.find(q('pPr'))
    maths = [canon(m) for m in p.iter('{%s}oMath' % M)]
    runs = runs_of(p)
    return ('P', canon(ppr), tuple(runs), tuple(maths))


def table_sig(t):
    grid = tuple(g.get(q('w')) for g in t.find(q('tblGrid')).findall(q('gridCol')))
    tblpr = canon(t.find(q('tblPr')))
    rows = []
    for tr in t.findall(q('tr')):
        rows.append((canon(tr.find(q('trPr'))),
                     tuple((canon(tc.find(q('tcPr'))), tuple(para_sig(p) for p in tc.findall(q('p'))))
                           for tc in tr.findall(q('tc')))))
    return ('T', tblpr, grid, tuple(rows))


def body_seq(docx):
    root = etree.fromstring(zipfile.ZipFile(docx).read('word/document.xml'))
    body = root.find(q('body'))
    seq = []
    for el in body:
        ln = etree.QName(el).localname
        if ln == 'p': seq.append(para_sig(el))
        elif ln == 'tbl': seq.append(table_sig(el))
        elif ln == 'sectPr': seq.append(('S', canon(el)))
    return seq


def describe(sig):
    if sig[0] == 'P':
        txt = ''.join(t for _, t in sig[2])
        return f'абзац «{txt[:90]}»' + (f' + {len(sig[3])} формул(и)' if sig[3] else '')
    if sig[0] == 'T':
        first = ''.join(t for _, t in (sig[3][0][1][0][1][0][2] if sig[3] and sig[3][0][1] and sig[3][0][1][0][1] else []))
        return f'таблиця {len(sig[3])}×{len(sig[2])} «{first[:50]}»'
    return 'параметри розділу'


def explain(a, b):
    """Що саме різниться між двома елементами одного типу."""
    if a[0] != b[0]: return f'різний тип: {a[0]} ↔ {b[0]}'
    if a[0] == 'P':
        diffs = []
        if a[1] != b[1]: diffs.append(f'властивості абзацу: {a[1][:160]} ↔ {b[1][:160]}')
        ta, tb = ''.join(t for _, t in a[2]), ''.join(t for _, t in b[2])
        if ta != tb:
            sm = difflib.SequenceMatcher(None, ta, tb)
            for op, i1, i2, j1, j2 in sm.get_opcodes():
                if op != 'equal':
                    diffs.append(f'текст [{op}]: «{ta[max(0,i1-25):i2+25]}» ↔ «{tb[max(0,j1-25):j2+25]}»'); break
        elif a[2] != b[2]:
            for (fa, xa), (fb, xb) in zip(a[2], b[2]):
                if fa != fb or xa != xb:
                    diffs.append(f'форматування run «{xa[:30]}»: {fa[:120]} ↔ {fb[:120]}'); break
            else:
                diffs.append(f'кількість runs: {len(a[2])} ↔ {len(b[2])}')
        if a[3] != b[3]: diffs.append('формула (OMML) різниться')
        return '; '.join(diffs)
    if a[0] == 'T':
        diffs = []
        if a[1] != b[1]: diffs.append(f'властивості таблиці: {a[1][:140]} ↔ {b[1][:140]}')
        if a[2] != b[2]: diffs.append(f'сітка: {a[2]} ↔ {b[2]}')
        if a[3] != b[3]:
            for i, (ra, rb) in enumerate(zip(a[3], b[3])):
                if ra != rb:
                    for j, (ca, cb) in enumerate(zip(ra[1], rb[1])):
                        if ca != cb:
                            if ca[0] != cb[0]: diffs.append(f'комірка [{i},{j}] tcPr: {ca[0][:100]} ↔ {cb[0][:100]}')
                            for pa, pb in zip(ca[1], cb[1]):
                                if pa != pb: diffs.append(f'комірка [{i},{j}]: ' + explain(pa, pb)); break
                            break
                    else:
                        if ra[0] != rb[0]: diffs.append(f'рядок {i} trPr: {ra[0]} ↔ {rb[0]}')
                    break
            if len(a[3]) != len(b[3]): diffs.append(f'рядків: {len(a[3])} ↔ {len(b[3])}')
        return '; '.join(diffs)
    return 'параметри розділу різняться'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('golden'); ap.add_argument('candidate')
    ap.add_argument('--show', type=int, default=30)
    a = ap.parse_args()

    za, zb = zipfile.ZipFile(a.golden), zipfile.ZipFile(a.candidate)
    names = sorted(set(za.namelist()) | set(zb.namelist()))
    byte_diff = []
    for nm in names:
        if nm.endswith('/'): continue
        ba = za.read(nm) if nm in za.namelist() else None
        bb = zb.read(nm) if nm in zb.namelist() else None
        if ba != bb: byte_diff.append(nm)
    print('== Рівень 1: байтове порівняння частин пакета ==')
    if not byte_diff:
        print('   усі частини ідентичні байт у байт')
        print('РЕЗУЛЬТАТ: ІДЕНТИЧНІ'); return 0
    for nm in byte_diff: print(f'   різниться: {nm}')

    print('\n== Рівень 2: змістовне порівняння тіла документа ==')
    sa, sb = body_seq(a.golden), body_seq(a.candidate)
    print(f'   елементів: еталон {len(sa)}, кандидат {len(sb)}')
    sm = difflib.SequenceMatcher(None, sa, sb, autojunk=False)
    shown, total = 0, 0
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal': continue
        total += max(i2 - i1, j2 - j1)
        if shown >= a.show: continue
        if op == 'replace' and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1):
                if shown >= a.show: break
                print(f'   [{i1+k}] {describe(sa[i1+k])}\n        → {explain(sa[i1+k], sb[j1+k])}')
                shown += 1
        else:
            print(f'   {op}: еталон[{i1}:{i2}] ↔ кандидат[{j1}:{j2}]')
            for k in range(i1, min(i2, i1 + 3)): print(f'      − {describe(sa[k])}')
            for k in range(j1, min(j2, j1 + 3)): print(f'      + {describe(sb[k])}')
            shown += 1

    other = [nm for nm in byte_diff if nm != 'word/document.xml']
    for nm in other:
        ta = etree.fromstring(za.read(nm)) if nm in za.namelist() else None
        tb = etree.fromstring(zb.read(nm)) if nm in zb.namelist() else None
        same = canon(ta) == canon(tb)
        print(f'   {nm}: ' + ('байти різні, зміст однаковий' if same else 'ЗМІСТ РІЗНИТЬСЯ'))
        if not same: total += 1

    if total == 0:
        print('\nРЕЗУЛЬТАТ: ЗМІСТОВНО РІВНІ (байтові відмінності — лише в серіалізації)'); return 0
    print(f'\nРЕЗУЛЬТАТ: РОЗБІЖНОСТЕЙ {total}'); return 1


if __name__ == '__main__':
    sys.exit(main())
