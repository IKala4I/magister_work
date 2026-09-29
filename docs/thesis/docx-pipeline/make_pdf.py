#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PDF для читання: .docx → PDF закріпленим LibreOffice, зі зібраним змістом.

    python3 make_pdf.py out/hourwell.docx out/hourwell.pdf

LibreOffice — не з машини: LO_VERSION для macOS aarch64, перевірений за SHA-256, опублікованим
поруч із файлом на download.documentfoundation.org, розпаковується при першому запуску в
render/.tools (git-ignored, ≈ 800 МБ). Профіль — власний, render/.tools/lo-profile, а не ~/Library.

Чому макрос. ЗМІСТ у .docx — поле Word, яке звичайна конвертація (--convert-to pdf) не оновлює:
у PDF стояв би напис «натиснути F9». Макрос Basic у власному профілі відкриває документ приховано,
оновлює всі покажчики двічі (сам зміст зсуває сторінки, тож номери рахуються вдруге) і експортує
PDF. Python, що йде з LibreOffice, тут не годиться: на цій машині його процес убиває система
(exit 137), а сам soffice працює.

Формули LibreOffice верстає тісніше за Word; остаточне слово щодо формул — за Word (README).
"""
import argparse, hashlib, os, re, subprocess, sys, tempfile

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


def soffice(*args):
    return subprocess.run([SOFFICE, '--headless', '--invisible', '--norestore',
                           f'-env:UserInstallation=file://{PROFILE}', *args],
                          capture_output=True, text=True, timeout=300)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('docx'); ap.add_argument('pdf')
    a = ap.parse_args()
    ensure_libreoffice()
    std = os.path.join(PROFILE, 'user', 'basic', 'Standard')
    if not os.path.isdir(std):                                   # перший запуск — профіль створює сам soffice
        soffice('--terminate_after_init')
    open(os.path.join(std, 'Hourwell.xba'), 'w', encoding='utf-8').write(MACRO)
    open(os.path.join(std, 'script.xlb'), 'w', encoding='utf-8').write(LIBRARY)
    src, dst = os.path.abspath(a.docx), os.path.abspath(a.pdf)
    for p in (dst, dst + '.log'):
        if os.path.exists(p): os.remove(p)
    soffice(f'macro:///Standard.Hourwell.ExportPdf("{src}","{dst}")')
    if not os.path.exists(dst + '.log'):
        raise SystemExit('PDF не зібрано: макрос LibreOffice не відпрацював')
    stats = open(dst + '.log', encoding='utf-8').read().strip(); os.remove(dst + '.log')
    pages = len(re.findall(rb'/Type\s*/Page(?![s\w])', open(dst, 'rb').read()))   # об'єкти сторінок PDF
    print(f'   {a.pdf}: LibreOffice {LO_VERSION}, {stats}, сторінок {pages}, {os.path.getsize(dst) // 1024} КБ')
    if stats.startswith('ПОМИЛКА'):
        raise SystemExit(f'макрос LibreOffice: {stats}')
    if stats.startswith('покажчиків 0'):
        raise SystemExit('У PDF немає змісту: LibreOffice не знайшов у .docx жодного покажчика')
    return 0


if __name__ == '__main__':
    sys.exit(main())
