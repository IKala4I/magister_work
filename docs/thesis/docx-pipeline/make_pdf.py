#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PDF для читання: .docx → PDF закріпленим LibreOffice, зі зібраним змістом.

    python3 make_pdf.py $DOCS/build/hourwell.docx $DOCS/build/hourwell.pdf

LibreOffice — не з машини: LO_VERSION для macOS aarch64, перевірений за SHA-256, опублікованим
поруч із файлом на download.documentfoundation.org, розпаковується при першому запуску в
render/.tools (git-ignored, ≈ 800 МБ). Профіль — власний, render/.tools/lo-profile, а не ~/Library.

Чому макрос. ЗМІСТ у .docx — поле Word, яке звичайна конвертація (--convert-to pdf) не оновлює:
у PDF стояв би напис «натиснути F9». Макрос Basic у власному профілі відкриває документ приховано,
оновлює всі покажчики двічі (сам зміст зсуває сторінки, тож номери рахуються вдруге) і експортує
PDF. Python, що йде з LibreOffice, тут не годиться: на цій машині його процес убиває система
(exit 137), а сам soffice працює.

Шрифт. Сам LibreOffice системного Times New Roman не бачить і підставляє Liberation Serif (так
PDF набирався до 2026-11-12). Тому ensure_fonts кладе чотири файли Times New Roman із
/System/Library/Fonts/Supplemental у теку шрифтів власного профілю (лише локально, git-ignored)
і без них зупиняється. У Times New Roman немає гліфа нерозривного дефіса (U+2011, яким LibreOffice
читає <w:noBreakHyphen/>), і LibreOffice підставив би чужий шрифт (Linux Libertine). Тому PDF
складається з копії .docx (pdf_copy), де кожен такий дефіс — окремий прогін Liberation Serif:
метрики й форма ті самі, що в Times New Roman. Сам .docx не змінюється — у Word дефіс Times New Roman.

Формули LibreOffice верстає тісніше за Word; остаточне слово щодо формул — за Word (README).
"""
import argparse, copy, hashlib, os, re, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, 'render', '.tools')
LO_VERSION = '26.8.0'
LO_URL = ('https://download.documentfoundation.org/libreoffice/stable/'
          f'{LO_VERSION}/mac/aarch64/LibreOffice_{LO_VERSION}_MacOS_aarch64.dmg')
LO_SHA256 = '8858d8058da4f862f47559486814e65efc27294da67c5e4bb56b006b1ee59f89'   # опубліковано з DMG, 2026-09-29
LO_APP = os.path.join(TOOLS, f'LibreOffice-{LO_VERSION}.app')
SOFFICE = os.path.join(LO_APP, 'Contents', 'MacOS', 'soffice')
PROFILE = os.path.join(TOOLS, 'lo-profile')

MACRO = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Hourwell" script:language="StarBasic">
Sub ExportPdf(src As String, dst As String)
  On Error GoTo Fail
  Dim a(0) As New com.sun.star.beans.PropertyValue
  a(0).Name = &quot;Hidden&quot; : a(0).Value = True
  doc = StarDesktop.loadComponentFromURL(ConvertToURL(src), &quot;_blank&quot;, 0, a())
  idx = doc.getDocumentIndexes()
  For pass = 1 To 2
    For i = 0 To idx.getCount() - 1
      idx.getByIndex(i).update()
    Next i
    doc.refresh()
  Next pass
  Dim f(0) As New com.sun.star.beans.PropertyValue
  f(0).Name = &quot;FilterName&quot; : f(0).Value = &quot;writer_pdf_Export&quot;
  doc.storeToURL(ConvertToURL(dst), f())
  n = FreeFile
  Open dst &amp; &quot;.log&quot; For Output As #n
  Print #n, &quot;покажчиків &quot; &amp; idx.getCount()
  Close #n
  doc.close(True)
  StarDesktop.terminate()
  Exit Sub
Fail:
  n = FreeFile
  Open dst &amp; &quot;.log&quot; For Output As #n
  Print #n, &quot;ПОМИЛКА &quot; &amp; Err &amp; &quot;: &quot; &amp; Error$ &amp; &quot; (рядок &quot; &amp; Erl &amp; &quot;)&quot;
  Close #n
  StarDesktop.terminate()
End Sub
</script:module>
'''

LIBRARY = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">
 <library:element library:name="Module1"/>
 <library:element library:name="Hourwell"/>
</library:library>
'''


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def ensure_libreoffice():
    if os.path.exists(SOFFICE):
        return
    if sys.platform != 'darwin':
        raise SystemExit('make_pdf.py розпаковує LibreOffice лише на macOS (hdiutil); деінде — soffice з PATH')
    os.makedirs(TOOLS, exist_ok=True)
    dmg = os.path.join(TOOLS, 'LibreOffice.dmg.part')
    print(f'   завантаження LibreOffice {LO_VERSION} (≈ 300 МБ)…')
    subprocess.run(['curl', '-fsSL', '-o', dmg, LO_URL], check=True)
    got = sha256(dmg)
    if got != LO_SHA256:
        os.remove(dmg)
        raise SystemExit(f'LibreOffice: SHA-256 {got} ≠ закріпленого {LO_SHA256}')
    mnt = tempfile.mkdtemp()
    try:
        subprocess.run(['hdiutil', 'attach', '-nobrowse', '-readonly', '-quiet', '-mountpoint', mnt, dmg], check=True)
        subprocess.run(['ditto', os.path.join(mnt, 'LibreOffice.app'), LO_APP], check=True)
    finally:
        subprocess.run(['hdiutil', 'detach', '-quiet', mnt])
        os.remove(dmg)


SYSTEM_TNR = '/System/Library/Fonts/Supplemental'
TNR_FILES = tuple(f'{face}{style}.ttf' for face in ('Times New Roman', 'Courier New')   # Courier New — код
                  for style in ('', ' Bold', ' Italic', ' Bold Italic'))


def ensure_fonts():
    """Times New Roman і Courier New у теці шрифтів профілю LibreOffice (user/fonts): без них PDF
    набрався б Liberation Serif і Liberation Mono."""
    dst = os.path.join(PROFILE, 'user', 'fonts')
    os.makedirs(dst, exist_ok=True)
    for f in TNR_FILES:
        src = os.path.join(SYSTEM_TNR, f)
        if not os.path.exists(src):
            raise SystemExit(f'немає {src}: без нього PDF набрався б іншим шрифтом')
        out = os.path.join(dst, f)
        if not os.path.exists(out) or os.path.getsize(out) != os.path.getsize(src):
            shutil.copyfile(src, out)


W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
HYPHEN_FONT = 'Liberation Serif'


def pdf_copy(src, dst):
    """Копія .docx для LibreOffice: кожен <w:noBreakHyphen/> — у власному прогоні шрифтом
    Liberation Serif (див. docstring модуля). У заголовках — звичайний дефіс того самого гліфа:
    рядок змісту LibreOffice складає із заголовка стилем змісту, без шрифту прогону, і нерозривний
    дефіс там знову взяв би чужий шрифт. Повертає кількість нерозривних дефісів."""
    from lxml import etree
    n = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml':
                root = etree.fromstring(data)
                for h in root.iter(W + 'pStyle'):
                    if h.get(W + 'val', '').startswith('Heading'):
                        for nb in list(h.getparent().getparent().iter(W + 'noBreakHyphen')):
                            t = etree.Element(W + 't'); t.text = '-'; nb.getparent().replace(nb, t)
                for r in list(root.iter(W + 'r')):
                    kids = [k for k in r if k.tag != W + 'rPr']
                    if not any(k.tag == W + 'noBreakHyphen' for k in kids): continue
                    rpr = r.find(W + 'rPr')
                    groups, cur = [], []
                    for k in kids:
                        if k.tag == W + 'noBreakHyphen':
                            if cur: groups.append((False, cur)); cur = []
                            groups.append((True, [k])); n += 1
                        else: cur.append(k)
                    if cur: groups.append((False, cur))
                    parent, at = r.getparent(), r.getparent().index(r)
                    for gi, (hyph, items) in enumerate(groups):
                        nr = etree.Element(W + 'r')
                        p2 = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
                        if hyph:
                            fonts = p2.find(W + 'rFonts')
                            if fonts is None: fonts = etree.Element(W + 'rFonts'); p2.insert(0, fonts)
                            for a in ('ascii', 'hAnsi', 'cs', 'eastAsia'): fonts.set(W + a, HYPHEN_FONT)
                        if len(p2) or hyph: nr.append(p2)
                        for k in items: nr.append(k)
                        parent.insert(at + gi, nr)
                    parent.remove(r)
                data = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
            zout.writestr(item, data)
    return n


def soffice(*args):
    return subprocess.run([SOFFICE, '--headless', '--invisible', '--norestore',
                           f'-env:UserInstallation=file://{PROFILE}', *args],
                          capture_output=True, text=True, timeout=300)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('docx'); ap.add_argument('pdf')
    ap.add_argument('--no-index', action='store_true',
                    help='документ без змісту (реферат): відсутність покажчика — не помилка')
    a = ap.parse_args()
    ensure_libreoffice()
    ensure_fonts()
    std = os.path.join(PROFILE, 'user', 'basic', 'Standard')
    if not os.path.isdir(std):                                   # перший запуск — профіль створює сам soffice
        soffice('--terminate_after_init')
    open(os.path.join(std, 'Hourwell.xba'), 'w', encoding='utf-8').write(MACRO)
    open(os.path.join(std, 'script.xlb'), 'w', encoding='utf-8').write(LIBRARY)
    dst = os.path.abspath(a.pdf)
    for p in (dst, dst + '.log'):
        if os.path.exists(p): os.remove(p)
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, os.path.basename(a.docx))
    hyphens = pdf_copy(os.path.abspath(a.docx), src)
    try:
        soffice(f'macro:///Standard.Hourwell.ExportPdf("{src}","{dst}")')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not os.path.exists(dst + '.log'):
        raise SystemExit('PDF не зібрано: макрос LibreOffice не відпрацював')
    stats = open(dst + '.log', encoding='utf-8').read().strip(); os.remove(dst + '.log')
    pages = len(re.findall(rb'/Type\s*/Page(?![s\w])', open(dst, 'rb').read()))   # об'єкти сторінок PDF
    print(f'   {a.pdf}: LibreOffice {LO_VERSION}, {stats}, сторінок {pages}, {os.path.getsize(dst) // 1024} КБ, '
          f'нерозривних дефісів {hyphens} (Liberation Serif)')
    if stats.startswith('ПОМИЛКА'):
        raise SystemExit(f'макрос LibreOffice: {stats}')
    if stats.startswith('покажчиків 0') and not a.no_index:
        raise SystemExit('У PDF немає змісту: LibreOffice не знайшов у .docx жодного покажчика')
    return 0


if __name__ == '__main__':
    sys.exit(main())
