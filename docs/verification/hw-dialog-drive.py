#!/usr/bin/env python3
"""Hardware-pass driver (ADR-0021, 2026-09-06): walk the in-app dialogs on a connected Android
device over adb and record each state (uiautomator dump + screenshot + window stack). One state
per invocation, e.g.:
  python3 docs/verification/hw-dialog-drive.py <outdir> <tag> delete signout
  python3 docs/verification/hw-dialog-drive.py <outdir> <tag> signin
Dialogs are always CANCELLED here; the real erasure is a separate, explicit step. Prints one line
per capture with the nodes a screen reader would meet (class, focusable, text/desc, bounds)."""
import re, subprocess, sys, time, os

OUT, TAG = sys.argv[1], sys.argv[2]
STEPS = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)
PKG = 'com.hourwell.app'

def sh(*a, check=False):
    return subprocess.run(['adb', *a], capture_output=True, text=True, check=check).stdout

def dump(name):
    sh('shell', 'rm', '-f', '/sdcard/ui.xml')
    sh('shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
    sh('pull', '/sdcard/ui.xml', f'{OUT}/ui-{name}.xml')
    png = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True).stdout
    open(f'{OUT}/shot-{name}.png', 'wb').write(png)
    win = sh('shell', 'dumpsys', 'window', 'windows')
    keep = [l for l in win.splitlines() if re.search(r'Window #|package=' + PKG + r'|isVisible|mHasSurface', l)]
    open(f'{OUT}/windows-{name}.txt', 'w').write('\n'.join(keep))
    return open(f'{OUT}/ui-{name}.xml', encoding='utf-8', errors='ignore').read()

def nodes(xml):
    out = []
    for m in re.finditer(r'<node [^>]*/?>', xml):
        n = m.group(0)
        if f'package="{PKG}"' not in n: continue
        def a(k):
            mm = re.search(k + r'="([^"]*)"', n); return mm.group(1) if mm else ''
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        bb = tuple(map(int, b.groups())) if b else None
        out.append(dict(cls=a('class').split('.')[-1], text=a('text'), desc=a('content-desc'),
                        focusable=a('focusable') == 'true', imp=a('important'), bounds=bb, raw=n))
    return out

def show(name, xml, only_dialog=False):
    print(f'== {name}')
    for n in nodes(xml):
        if not (n['text'] or n['desc']) or not n['bounds']: continue
        if n['text'].startswith('\\u') or n['text'].startswith(''): continue
        print(f"   {n['cls']:<10} f={'y' if n['focusable'] else 'n'} {str(n['bounds']):<28} text={n['text'][:70]!r} desc={n['desc'][:70]!r}")

def find(xml, needle, field='any'):
    for n in nodes(xml):
        if n['bounds'] is None: continue
        if field in ('any', 'text') and n['text'] == needle: return n
        if field in ('any', 'desc') and n['desc'] == needle: return n
    return None

def tap(n):
    x0, y0, x1, y1 = n['bounds']; sh('shell', 'input', 'tap', str((x0 + x1) // 2), str((y0 + y1) // 2)); time.sleep(1.2)

def scroll_until(needle, name, max_swipes=8):
    # Settings may still be open and scrolled from an earlier step: start from the top
    for _ in range(3):
        sh('shell', 'input', 'swipe', '540', '700', '540', '1900', '300'); time.sleep(0.4)
    for i in range(max_swipes):
        xml = dump(f'{name}-scroll{i}') if i else dump(f'{name}-scroll0')
        n = find(xml, needle)
        if n and n['bounds'][1] > 300 and n['bounds'][3] < 2150: return n, xml
        sh('shell', 'input', 'swipe', '540', '1700', '540', '700', '400'); time.sleep(0.8)
    return None, xml

def open_settings():
    sh('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'hourwell://settings'); time.sleep(2.0)

def expect_dialog(name, title):
    xml = dump(name); show(name, xml)
    ok = find(xml, title) is not None
    print(f'   -> dialog "{title}" present: {ok}')
    return xml, ok

for step in STEPS:
    if step == 'delete':
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings')
        assert n, 'delete button not found'; tap(n)
        xml, ok = expect_dialog(f'{TAG}-delete1', 'Delete your account?')
        c = find(xml, 'Continue'); assert c, 'no Continue'; tap(c)
        xml, ok2 = expect_dialog(f'{TAG}-delete2', 'This cannot be undone')
        c = find(xml, 'Cancel'); assert c, 'no Cancel'; tap(c)
        xml = dump(f'{TAG}-delete2-cancelled'); print(f"   -> after Cancel, dialog gone: {find(xml, 'This cannot be undone') is None}")
    elif step == 'delete-back':
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings2'); assert n; tap(n)
        xml, ok = expect_dialog(f'{TAG}-delete1-back', 'Delete your account?')
        sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1.2)
        xml = dump(f'{TAG}-delete1-after-back')
        print(f"   -> after BACK: dialog gone: {find(xml, 'Delete your account?') is None}; Settings still open: {find(xml, 'Delete account and data') is not None}")
    elif step == 'signout':
        open_settings()
        n, xml = scroll_until('Sign out', f'{TAG}-settings-signout'); assert n, 'no Sign out'; tap(n)
        xml, ok = expect_dialog(f'{TAG}-signout', 'Sign out of the trial account?')
        c = find(xml, 'Keep my data'); assert c, 'no Keep my data'; tap(c)
        xml = dump(f'{TAG}-signout-cancelled'); print(f"   -> after Keep my data, dialog gone: {find(xml, 'Sign out of the trial account?') is None}")
    elif step == 'signin':
        sh('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'hourwell://auth/sign-in'); time.sleep(2.0)
        xml = dump(f'{TAG}-signin-screen'); show(f'{TAG}-signin-screen', xml)
        field = next((n for n in nodes(xml) if n['cls'] == 'EditText'), None); assert field, 'no email field'
        tap(field); sh('shell', 'input', 'text', 'throwaway@example.com'); time.sleep(0.6)
        sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(0.6)  # keyboard down
        xml = dump(f'{TAG}-signin-filled')
        b = find(xml, 'Send magic link') or find(xml, 'Send me a link') or next((n for n in nodes(xml) if n['cls']=='Button' and 'link' in (n['desc']+n['text']).lower()), None)
        assert b, 'no send button'; tap(b)
        xml, ok = expect_dialog(f'{TAG}-signin-replace', 'Replace this device’s data?')
        c = find(xml, 'Cancel'); assert c; tap(c)
        xml = dump(f'{TAG}-signin-cancelled'); print(f"   -> after Cancel, dialog gone: {find(xml, 'Replace this device’s data?') is None}")
        sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1.0)
    elif step == 'scrim':
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings3'); assert n; tap(n)
        xml, ok = expect_dialog(f'{TAG}-delete1-scrim', 'Delete your account?')
        sh('shell', 'input', 'tap', '540', '150'); time.sleep(1.2)  # the scrim, above the card
        xml = dump(f'{TAG}-delete1-after-scrim'); print(f"   -> after scrim tap: dialog gone: {find(xml, 'Delete your account?') is None}")
    elif step == 'record':
        # one open (spring in) and one cancel (spring out) under the CURRENT OS motion setting;
        # per-frame mean brightness of the screen = the scrim's fade; settle = within 2 % of the end
        import subprocess as sp
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings-rec'); assert n
        rec = sp.Popen(['adb', 'shell', 'screenrecord', '--time-limit', '5', '--bit-rate', '6000000', '/sdcard/rec.mp4'])
        time.sleep(1.0); tap(n); time.sleep(1.5)
        xml = dump(f'{TAG}-rec-open'); c = find(xml, 'Keep my account'); assert c; tap(c)
        rec.wait(); sh('pull', '/sdcard/rec.mp4', f'{OUT}/rec-{TAG}.mp4'); sh('shell', 'rm', '/sdcard/rec.mp4')
        frames = f'{OUT}/frames-{TAG}'; os.makedirs(frames, exist_ok=True)
        sp.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{OUT}/rec-{TAG}.mp4', '-vf', 'fps=60,scale=108:240', f'{frames}/%04d.png'], check=True)
        from PIL import Image; import numpy as np
        vals = []
        for f in sorted(os.listdir(frames)):
            vals.append(float(np.asarray(Image.open(f'{frames}/{f}').convert('L')).mean()))
        # transitions: a drop (scrim in) and a rise (scrim out); report each transition's length
        def transitions(v):
            out = []; i = 1
            while i < len(v):
                if abs(v[i] - v[i-1]) > 0.8:
                    j = i; start = v[i-1]
                    while j + 1 < len(v) and abs(v[j+1] - v[j]) > 0.15: j += 1
                    end = v[j]; out.append((i, j, start, end)); i = j + 1
                else: i += 1
            return out
        tr = transitions(vals)
        print(f'== {TAG} record: {len(vals)} frames @60fps; transitions (frame_from, frame_to, brightness_from, brightness_to, ms):')
        for a, b, x, y in tr: print(f'   frames {a}-{b}: {x:.1f} -> {y:.1f}  ({(b - a + 1) * 1000 / 60:.0f} ms)')
        open(f'{OUT}/rec-{TAG}-brightness.txt', 'w').write('\n'.join(f'{i} {v:.2f}' for i, v in enumerate(vals)))
        import shutil; shutil.rmtree(frames)
    elif step == 'talkback':
        svc = 'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService'
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings-tb'); assert n
        sh('logcat', '-c')
        sh('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', svc)
        sh('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'); time.sleep(3.0)
        # explore-by-touch is on: one tap focuses the button, a double tap activates it
        x0, y0, x1, y1 = n['bounds']; cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        sh('shell', 'input', 'tap', str(cx), str(cy)); time.sleep(1.0)
        sh('shell', 'input', 'tap', str(cx), str(cy)); time.sleep(0.08); sh('shell', 'input', 'tap', str(cx), str(cy)); time.sleep(2.5)
        xml = dump(f'{TAG}-talkback-delete1'); show(f'{TAG}-talkback-delete1', xml)
        print(f"   -> dialog present with TalkBack on: {find(xml, 'Delete your account?') is not None}")
        log = sh('logcat', '-d', '-v', 'time')
        lines = [l for l in log.splitlines() if re.search(r'TalkBack|SpeechController|Utterance|speak', l, re.I)]
        open(f'{OUT}/talkback-logcat-{TAG}.txt', 'w').write('\n'.join(lines))
        print(f'   -> TalkBack logcat lines: {len(lines)} (utterances are logged only with its developer log level; see the file)')
        for l in lines[:6]: print('      ' + l[:160])
        # leave the dialog with the hardware back key (works regardless of explore-by-touch)
        sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1.0)
        sh('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', '')
        sh('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '0'); time.sleep(1.5)
        xml = dump(f'{TAG}-talkback-off'); print(f"   -> after BACK + TalkBack off: dialog gone: {find(xml, 'Delete your account?') is None}")
    elif step == 'arming':
        # the review's MAJOR 2: two taps ~100 ms apart on "Continue" — the second lands where
        # step 2's "Delete everything" sits; the account must survive
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings-arm'); assert n; tap(n)
        xml, ok = expect_dialog(f'{TAG}-arm-1', 'Delete your account?')
        c = find(xml, 'Continue'); assert c
        x0, y0, x1, y1 = c['bounds']; x, y = (x0 + x1) // 2, y0 + 45  # inside Continue AND inside step 2's confirm
        t = time.time(); sh('shell', f'input tap {x} {y}; input tap {x} {y}'); dt = time.time() - t
        time.sleep(1.5)
        xml = dump(f'{TAG}-arm-after-double-tap')
        up2 = find(xml, 'This cannot be undone') is not None
        deleted = find(xml, 'Your account is deleted') is not None
        print(f'   -> double tap at ({x},{y}), two adb taps issued within {dt*1000:.0f} ms of shell time; step 2 still up: {up2}; account-deleted screen: {deleted}')
        if up2:
            k = find(xml, 'Cancel'); assert k; tap(k)
            xml = dump(f'{TAG}-arm-cancelled'); print(f"   -> Cancel: dialog gone: {find(xml, 'This cannot be undone') is None}")
    elif step == 'erase':
        # THE real erasure (FR-42) — only on the throwaway account
        open_settings()
        n, xml = scroll_until('Delete account and data', f'{TAG}-settings-erase'); assert n; tap(n)
        xml, ok = expect_dialog(f'{TAG}-erase-1', 'Delete your account?')
        c = find(xml, 'Continue'); assert c; tap(c)
        xml, ok2 = expect_dialog(f'{TAG}-erase-2', 'This cannot be undone')
        d = find(xml, 'Delete everything'); assert d
        # inside the arming window a press must do nothing
        tap(d)  # tap() sleeps 1.2 s AFTER the tap; the tap itself lands < 400 ms after step 2 appeared? not guaranteed — record what happened
        xml = dump(f'{TAG}-erase-2-after-first-tap')
        print(f"   -> after the first tap on Delete everything: dialog still up: {find(xml, 'This cannot be undone') is not None}")
        if find(xml, 'This cannot be undone') is not None:
            tap(d)
        t0 = time.time(); time.sleep(4.0)
        xml = dump(f'{TAG}-account-deleted'); show(f'{TAG}-account-deleted', xml)
    else:
        raise SystemExit(f'unknown step {step}')
