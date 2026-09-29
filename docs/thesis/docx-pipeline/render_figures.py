#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Рендер рисунків роботи з вихідного коду в репозиторії — крок run_all.sh перед складанням.

    python3 render_figures.py --src ../text/full.md --out out/figures [--measure]

Що робить. Для кожного рисунка з figures.json:
  * діаграма Mermaid (.mmd) — mmdc із render/ (mermaid-cli, версії закріплені package-lock.json,
    власний chrome-headless-shell у render/.cache);
  * діаграма PlantUML (.puml) — закріплений plantuml.jar із render/.tools (перевірка SHA-256),
    розкладка smetana, тож Graphviz не потрібен;
  * знімки (тека) — файли зображень у порядку назв, як є.
Результат — out/figures/<номер>/аркуш-<k>.png і out/figures/manifest.json, який читає build.py.

Аркуші. Діаграма, що не вміщується на сторінку з підписами не менше MIN_PT, ділиться в самому
вихідному файлі рядком-маркером `%% аркуш` на природній межі сценарію. Кожен аркуш — окремий
рендер: заголовок діаграми (учасники) повторюється, нумерація повідомлень продовжується.

Гарантія розміру. Для кожного аркуша обчислюється кегль найдрібнішого підпису на папері — з
розміру шрифту в конфігурації рендера і масштабу, з яким аркуш стане в свою область сторінки
(книжкова 170 × 230 мм, альбомна 257 × 150 мм). Менше MIN_PT — складання падає: нечитабельний
рисунок гірший за відсутній (власник, 2026-09-29).

--measure: для кожного аркуша друкує кегль в обох орієнтаціях, нічого не вимагаючи.
"""
import argparse, hashlib, json, os, re, shutil, struct, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, 'render')
MMDC = os.path.join(RENDER, 'node_modules', '.bin', 'mmdc')
MERMAID_CONFIG = os.path.join(RENDER, 'mermaid.json')
PLANTUML_VERSION = '1.2026.8'
PLANTUML_URL = ('https://github.com/plantuml/plantuml/releases/download/'
                f'v{PLANTUML_VERSION}/plantuml-{PLANTUML_VERSION}.jar')
PLANTUML_SHA256 = '5e1ecfa8ecd32c90b03bbf3b1eb6f020943f98ab0fcf4032be31a0002ee2c462'   # GitHub release digest, 2026-09-29
PLANTUML_JAR = os.path.join(RENDER, '.tools', f'plantuml-{PLANTUML_VERSION}.jar')

MIN_PT = 8.0
SCALE = 3                       # PNG утричі щільніший за CSS-піксель: ≈ 300 dpi на папері
AREA_MM = {'portrait': (170, 240), 'landscape': (257, 150)}
PT_MM = 0.3528
IMAGE_EXT = ('.png', '.jpg', '.jpeg')
SHEET = re.compile(r'^\s*%%\s*аркуш\b')
MESSAGE = re.compile(r'^\s*[\w]+\s*(?:-->>|->>|-->|->|--x|-x|--\)|-\))\s*[\w]+\s*:')


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit(f'НЕ PNG: {path}')
    return struct.unpack('>II', head[16:24])


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def split_sheets(text):
    """Аркуші діаграми послідовності: заголовок (усе до першого змістового рядка) повторюється
    на кожному аркуші; нумерація повідомлень продовжується через `autonumber N`."""
    lines = text.split('\n')
    if not any(SHEET.match(ln) for ln in lines):
        return [text]
    head_end = next(i for i, ln in enumerate(lines)
                    if ln.strip() and not ln.strip().startswith('%%')
                    and not re.match(r'\s*(sequenceDiagram|autonumber|participant|actor)\b', ln))
    head, body = lines[:head_end], lines[head_end:]
    parts, cur = [], []
    for ln in body:
        if SHEET.match(ln):
            parts.append(cur); cur = []
        else:
            cur.append(ln)
    parts.append(cur)
    sheets, done = [], 0
    for part in parts:
        h = [re.sub(r'^(\s*)autonumber\b.*$', rf'\1autonumber {done + 1}', ln) for ln in head]
        sheets.append('\n'.join(h + part))
        done += sum(1 for ln in part if MESSAGE.match(ln))
    return sheets


LABEL = re.compile(r'^(\s*[\w]+\s*(?:-->>|->>|-->|->|--x|-x|--\)|-\))\s*[\w]+\s*:\s*|'
                   r'\s*Note\s+(?:over|left of|right of)\s+[^:]+:\s*)(.+)$')


def break_labels(text, width):
    """Переносить підписи повідомлень і приміток явними <br/> по межах слів, не довше за width
    знаків у рядку. Власне перенесення Mermaid (wrap) рахує висоту підпису замало: останній рядок
    лягає на стрілку й під номер кроку. Явні рядки Mermaid міряє правильно. Слова не змінюються —
    лише місця переносу; вихідний файл не зачіпається."""
    out = []
    for ln in text.split('\n'):
        m = LABEL.match(ln)
        if not m or '<br' in m.group(2):
            out.append(ln); continue
        rows, cur = [], ''
        for word in m.group(2).split():
            if cur and len(cur) + 1 + len(word) > width:
                rows.append(cur); cur = word
            else:
                cur = f'{cur} {word}' if cur else word
        rows.append(cur)
        out.append(m.group(1) + '<br/>'.join(rows))
    return '\n'.join(out)


def min_font_px(kind):
    """Кегль найдрібнішого підпису в пікселях рендера — з тієї самої конфігурації, якою рендеримо."""
    if kind == 'puml':
        return 14.0             # skinparam defaultFontSize 14 у кожному .puml (перевіряється нижче)
    cfg = json.load(open(MERMAID_CONFIG, encoding='utf-8'))
    sizes = [cfg.get('themeVariables', {}).get('fontSize', '16px')]
    sizes += [v for sec in cfg.values() if isinstance(sec, dict)
              for k, v in sec.items() if k.endswith('FontSize')]    # усі розділи: sequence, quadrantChart…
    return min(float(str(s).rstrip('px')) for s in sizes)


def fit_pt(w_px, h_px, font_px, orientation):
    """Кегль на папері, коли аркуш w × h CSS-пікселів вписано в область сторінки."""
    W, H = AREA_MM[orientation]
    k = min(W / w_px, H / h_px, 1 / 3.78)            # не більше натурального розміру (96 dpi)
    return font_px * k / PT_MM


def ensure_plantuml():
    if os.path.exists(PLANTUML_JAR):
        return PLANTUML_JAR
    os.makedirs(os.path.dirname(PLANTUML_JAR), exist_ok=True)
    tmp = PLANTUML_JAR + '.part'
    subprocess.run(['curl', '-fsSL', '-o', tmp, PLANTUML_URL], check=True)
    got = sha256(tmp)
    if PLANTUML_SHA256 and got != PLANTUML_SHA256:
        os.remove(tmp)
        raise SystemExit(f'plantuml.jar: SHA-256 {got} ≠ закріпленого {PLANTUML_SHA256}')
    os.replace(tmp, PLANTUML_JAR)
    return PLANTUML_JAR


def render_mermaid(text, out_png):
    if not os.path.exists(MMDC):
        raise SystemExit(f'немає mmdc: виконати `npm ci` у {RENDER}')
    with tempfile.NamedTemporaryFile('w', suffix='.mmd', delete=False, encoding='utf-8') as f:
        f.write(text); src = f.name
    try:                                   # cwd=render/: puppeteer шукає .puppeteerrc.cjs у робочій теці
        subprocess.run([MMDC, '-q', '-i', src, '-o', os.path.abspath(out_png), '-c', MERMAID_CONFIG,
                        '-s', str(SCALE), '-b', 'white'], check=True, cwd=RENDER)
    finally:
        os.remove(src)


def render_plantuml(text, out_png):
    if 'defaultFontSize 14' not in text:
        raise SystemExit('.puml має задавати `skinparam defaultFontSize 14` — від нього рахується кегль')
    jar = ensure_plantuml()
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, 'figure.puml')
        open(src, 'w', encoding='utf-8').write(text.replace('@startuml', f'@startuml\nscale {SCALE}', 1))
        # PLANTUML_LIMIT_SIZE: без нього PlantUML мовчки обрізає зображення ширше за 4096 px
        subprocess.run(['java', '-Djava.awt.headless=true', '-DPLANTUML_LIMIT_SIZE=16384', '-jar', jar,
                        '-charset', 'UTF-8', '-tpng', src], check=True)
        shutil.move(os.path.join(d, 'figure.png'), out_png)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, help='full.md: шляхи у figures.json — від його теки')
    ap.add_argument('--out', required=True, help='тека для аркушів і manifest.json')
    ap.add_argument('--figures', default=os.path.join(HERE, 'figures.json'))
    ap.add_argument('--measure', action='store_true', help='кегль в обох орієнтаціях, без вимог')
    a = ap.parse_args()

    base = os.path.dirname(os.path.abspath(a.src))
    spec = json.load(open(a.figures, encoding='utf-8'))['figures']
    os.makedirs(a.out, exist_ok=True)
    manifest, failed = {}, []
    for num, fig in spec.items():
        d = os.path.join(a.out, num); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        if 'images' in fig:                                  # знімки: беруться як є
            folder = os.path.join(base, fig['images'])
            files = sorted(f for f in (os.listdir(folder) if os.path.isdir(folder) else [])
                           if f.lower().endswith(IMAGE_EXT))
            if not files:
                print(f'   {num}: знімків немає в {os.path.relpath(folder)} — лишається плейсхолдер')
                continue
            sheets = []
            for f in files:
                dst = os.path.join(d, f); shutil.copyfile(os.path.join(folder, f), dst)
                sheets.append({'file': os.path.relpath(dst, a.out), 'sha256': sha256(dst)})
            manifest[num] = {'kind': 'images', 'orientation': 'portrait', 'grid': True, 'sheets': sheets}
            print(f'   {num}: знімків {len(files)}')
            continue

        src = os.path.join(base, fig['source'])
        kind = 'puml' if src.endswith('.puml') else 'mmd'
        text = open(src, encoding='utf-8').read()
        texts = split_sheets(text) if kind == 'mmd' else [text]
        if 'label_chars' in fig:
            texts = [break_labels(t, fig['label_chars']) for t in texts]
        orientation = fig.get('orientation', 'portrait')
        font = min_font_px(kind)
        sheets = []
        for k, t in enumerate(texts, 1):
            png = os.path.join(d, f'аркуш-{k}.png')
            (render_plantuml if kind == 'puml' else render_mermaid)(t, png)
            w, h = (v / SCALE for v in png_size(png))
            pts = {o: fit_pt(w, h, font, o) for o in AREA_MM}
            sheets.append({'file': os.path.relpath(png, a.out), 'sha256': sha256(png),
                           'css_px': [round(w), round(h)], 'min_pt': round(pts[orientation], 2)})
            line = (f'   {num} аркуш {k}/{len(texts)}: {w:.0f}×{h:.0f} px, найдрібніший підпис '
                    + ', '.join(f'{o} {p:.1f} пт' for o, p in pts.items()))
            print(line)
            if not a.measure and pts[orientation] < MIN_PT:
                failed.append(f'{num} аркуш {k}: {pts[orientation]:.1f} пт < {MIN_PT} у орієнтації {orientation}')
        manifest[num] = {'kind': kind, 'source': os.path.relpath(src, base), 'orientation': orientation,
                         'sheets': sheets}
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    for f in failed: print('ПОМИЛКА: підписи дрібніші за', MIN_PT, 'пт —', f)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
