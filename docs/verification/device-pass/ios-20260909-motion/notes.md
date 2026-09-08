# iOS — the plan-surface transitions (2026-09-09, ADR-0022, post-p12/motion)

Session-driven on the owner's iPhone 12 (`00008101-0015081602F1003A`, A14, iOS 26.6, personal
team), the owner present; taps through WebDriverAgent (`hw-ios-wda.py`), readings through the
accessibility daemon (`hw-ios-ax.py`) and `pymobiledevice3` screenshots, frame evidence from
`xctrace` (Animation Hitches). Same rules as the Android half (`android-20260908-motion/notes.md`):
no wall-clock polling, raw traces/recordings stay in the session scratch, the phone is the
session's while a step runs. Protocol: ADR-0022 "Verification protocol" step 3 — baseline build
of main → the 13-block list → hitches across a scroll → build 3 (motion) → the same → the five
interactions → reduce motion held by the daemon → the same five.

## State before

- Phone: build 2 (`36b297c`, 2026-09-08) at the welcome screen, no account; unlocked on the
  cable at 00:03, WDA runner and live syslog not running (checked with `pgrep`).
- Server: the Pixel's motion-pass account (`edc05c5d…`) restored to Kyiv/default hours.

## Log

1. **Builds (00:05–00:08).** `expo prebuild --clean --platform ios` (00:05), then the baseline =
   main `fdff809` (its `apps/mobile/app` + `src` checked out into the branch's tree — the native
   side is identical): `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --device … --configuration
Release --no-bundler`, Build Succeeded, installed from DerivedData and launched to the welcome
   screen at 00:08; gate (`hw-build-gate-ios.sh` on the DerivedData `.app`): bundle host ✓, no
   `aps-environment`, personal team, 66 924 KB, `main.jsbundle` `64450f16b505ea6c…`. The first
   attempt of the build chain died silently before xcodebuild (a `grep -c` with zero matches in
   an `&&` chain) — the second run logged every step.
2. **Fresh account (00:08–00:10).** WDA runner + `usbmux forward 8100` up at 00:09 (WDA 16.12.4,
   iOS 26.6); onboarding walked over WDA taps (the day-1 recipe: five rMEQ answers, default
   hours, "Deep work", one quick-add task typed through the keyboard, "Finish setup") →
   Today "No plan yet" at 00:10:33. The account is **`6c2e88b5…`** — the anonymous user the
   build-2 "Start over" created at the end of the iPhone pass (15:18 UTC the day before), not a
   new row: `hw-account-reads.mjs --latest` therefore pointed at the Pixel's account, and my first
   seeding (25 tasks, `wed` hours) landed there — reverted the hours (the tasks are inert on a
   throwaway account). Lesson for the helper: `--latest` must mean "newest onboarding", not
   "newest auth row".
3. **The list (00:11–00:12).** No zone flip needed: it is 00:12 on Wednesday in Kyiv, the whole
   working day lies ahead (the 00–06 rule and the 07:00 sleep end start the grid at 07:00).
   "Plan my day" 00:11:27 → plan 1 (`manual`, learned): 1 block (the one task, 14:00–15:30,
   before the seed had been pulled). 25 seeded 30-min tasks (seq 5241–5265) + `wed: [540, 1380]`
   (5266); "Re-plan" 00:12:36 → **plan 2: 16 blocks 09:30–…, "No room today for 10 tasks"**
   (26 − 16). Two requests on this account. `hw-ios-paint.py` (new: the XCUITest tree's card
   rects against a WDA screenshot): 6 cards in the tree, 0 BLANK. The block action row is not in
   the XCUITest tree (the card is an accessibility leaf — day-2 finding), so Done / Skip / Move…
   are tapped by coordinates inside the card rect.
4. **Tooling (00:14–00:28).** (a) XCUITest waits for the app to become "idle" before every
   gesture, and Hourwell's Today never counts as idle for it: a 0.25 s WDA drag blocked for
   **22 s**, so the first 30-drag series took eleven minutes and the 30 s trace beside it caught
   one drag (discarded, 77 MB). With `waitForIdleTimeout 0` + `animationCoolOffTimeout 0` on the
   session the same drag returns in 1.9 s — now set by `hw-ios-wda.py session` itself. (b)
   `xctrace export` of an **empty** `hitches` table segfaults (exit 139) when the xpath carries
   `run[@number="1"]`; without it the export works — `hw-ios-hitches.sh` (new) exports
   `hitches`, `hitches-frame-lifetimes`, `hitches-gpu` and prints one summary line. (c) The Mac's
   disk hit 275 MB free mid-trace ("No space left on device" on a heredoc): 5 GB freed by deleting
   the session's APK copies and the regenerable Android build output; the rest (another
   project's DerivedData 8.6 GB, Xcode caches 13 GB, iOS DeviceSupport 14 GB, simulators 11 GB)
   is the owner's — flagged in the report, nothing of it touched.
5. **NFR-P2 baseline — main `fdff809`, the 16-block list (00:28:54–00:29:44).** Animation
   Hitches attached to the running app for 50 s, 10 WDA drags down + 10 up inside the list
   (195,720→330 / 330→720 pt, 0.25 s each, ≈ 2 s apart) from 00:29:04 to 00:29:34:
   **847 frames committed, 8 hitches** (33 / 17 / 50 / 17 ms …; narratives "Potentially
   expensive app update(s)" and "Potentially expensive render, 11 offscreen passes" — the glass
   panels' blur), frame lifetime p50 33.5 / p90 33.6 / max 83.8 ms, GPU p50 2.36 / max 4.95 ms
   per frame (`hitches-main2.trace`, 317 MB, in the session scratch; the three tables as XML
   beside it). The day-1 thumb scroll of a 7-block list had 0 hitches; a synthetic drag that
   starts and stops in 0.25 s is a harsher input than a thumb, and the list is 16 blocks —
   the comparison that matters is the same series on the motion build (item 7).
6. **Build 3 = the motion build (00:31–00:33).** Branch `f5fdbe2`, the same `run:ios` command
   (incremental — only the JS bundle changed), Build Succeeded, installed and launched 00:33;
   gate: bundle host ✓, 66 928 KB, `main.jsbundle` `7a3063f9c1a638aa…` (≠ the baseline's
   `64450f16…`), no `aps-environment`. Same account, same 16-block plan (6 cards in the tree,
   0 BLANK on the first scan; the footer still "No room today for 10 tasks").
7. **NFR-P2 on the motion build, the same list and series (00:35:02–00:35:52; drags
   00:35:12–00:35:42).** **807 frames committed, 8 hitches** (33 / 17 / 17 ms; narrative
   "Potentially expensive app update(s)" only — the baseline's "11 offscreen passes" render
   narrative did not recur), frame lifetime p50 33.5 / p90 48.5 / max 67.0 ms, GPU p50 2.38 /
   max 8.69 ms (`hitches-motion.trace`, 310 MB, exported then deleted; the three tables kept as
   XML in the scratch). **Against the baseline (item 5):** hitch count equal (8 = 8), max
   lifetime lower (67 vs 84 ms), p90 one vsync higher (48.5 vs 33.6 ms — pipeline latency, not a
   missed deadline; the `hitches` table is what counts deadlines), GPU max 8.7 vs 5.0 ms (half a
   frame). Frames committed differ by 5 % (the drags' exact timing). Read as: **no hitch
   regression from an `Animated.View` per cell on a 16-block list**; the series is coarse
   (a synthetic 0.25 s drag is not a thumb), stated as such.
8. **The four interactions under a 110 s Animation Hitches trace (00:52:13–00:54:03;
   `hw-ios-motion-drive.py`, taps by coordinates inside the card rect, `hw-ios-paint.py` before
   and after).** Done on 18 deep 09:30 (00:52:21) → "Completed"; Skip on 10 deep (00:52:32) →
   "Skipped — back in your Inbox"; Move 06 deep 11:00 → 12:15 ("Move here" 00:52:47; lands one
   row down, on screen) → "Moved" between 22 deep 11:45 and 25 admin 12:30; Move 22 deep 11:45 →
   18:00 ("Move here" 00:53:04; the wheel landed on 18 for a typed 20 — item 10) → off screen:
   the list scrolled and the card sat at 452–629 pt (≈ 54 % of the viewport — `viewPosition`
   0.3 asks for 30 %; FlashList's estimated layout lands near, not exactly), "Moved". **0 BLANK
   after each** (6 / 7 / 7 / 6 cards scanned, std-dev 27–36). **Trace: 347 frames, 5 hitches,
   every one at a WDA scan between interactions** (16.6 s 17 ms; 28.3 s **267 ms** "expensive
   app update + render, 21 offscreen passes" — the XCUITest snapshot the screenshot and element
   queries trigger; 28.6 s; 44.5 s ×2) and **none within 1.5 s of any tap**: after Done 15
   frames all one vsync apart (max lifetime 37.9 ms), after Skip 15 (max 33.5), after the picker
   opening 17 (max 38.4), after the off-screen "Move here" 43 frames at 17.2 ms — ≈ 0.7 s of
   continuous frames (the scroll + the arrival settle), no missed deadline. iOS has no
   `screenrecord`: transition lengths in frames exist only for the Pixel (Android items 7–15);
   here the evidence is "frames at one vsync, no hitch" during each transition. The on-screen
   "Move here" window could not be isolated in the trace (the tap-stamp offset is ± 2 s).
9. **A move to the same slot (01:01:33, full motion).** 25 admin 12:30, the picker confirmed
   without touching the wheels → "Moved", the block stays, 0 BLANK (5 cards scanned).
10. **Reduce Motion — held by the accessibility daemon (`hw-ios-ax.py hold REDUCE_MOTION=true`),
    01:04–01:12.** The hold's own read-back prints the stale `False`; a second client
    (`settings show`) and WDA's `reduceMotion` setting both read **True** before and after the
    runs, `False` after the release. Done on 08 physical 16:00 (01:06:37) → "Completed"; Move
    17 admin 17:30 → 18:45 (01:07:55; two rows down, on screen) → "Moved" between thesis intro
    18:15 and 01 admin 20:00; Move 01 admin 20:00 → 14:30 (01:08:48; the wheel landed on 14 for a
    typed 10; the slot was above the visible band → the list jumped) → "Moved" after 20 physical
    14:15; Skip on 05 admin 20:45 (01:11:53) → "Skipped". **0 BLANK after each, order correct
    after each**, every fact on the server. An earlier attempt (01:01–01:03) under a hold given
    `=1` (parsed as 1.0, read back `False`, never verified) is not evidence; its facts stand (a
    Done, a Skip that missed — item 11a, two moves). **The wheel:** `set` on the hour wheel landed
    on a neighbouring value three times (20 → 18, 09 → 11, 10 → 14; 12, 16, 18 exact) — a WDA
    picker-wheel quirk against the 15-minute grid and `minimumDate`, not the app: every landing
    was a legal slot and the block moved to where the wheel showed.
11. **Findings.** (a) **The Experiment card's action row wraps on the iPhone 12 at default text
    size**: the dashed border and the "Experiment" tag narrow the card's inner width so the
    fourth button ("Move…") drops to a second line — `exp-card-crop.png` (scratch); two Skip taps
    aimed at the bottom row of that card hit empty space beside "Move…". Cosmetic and reachable,
    recorded in revisit.md (a `flexWrap` row with four 44-pt targets at a 350-pt card). (b) **"I
    did it" was not exercised on iOS**: no block lapses without clock control (`cmd alarm
set-time` has no iOS twin short of the owner's Settings); the path is the same S1 window as
    Done, exercised on Android (item 15). (c) The owner's-eyes judgement (⛔ 3) is still open on
    both phones. (d) No QuickTime recording was made (⛔ 4, optional), so no per-transition frame
    counts on iOS.
12. **Restore (01:12).** WDA runner and forward stopped; `wed` hours back to `[540, 1080]`
    (5314); the account keeps its Wednesday plan (two requests in all). Final: plans 2,
    recommendations 17, tasks 26, events 30 — 3 completed, 2 skipped, 7 moved.

## Tooling lessons (kept in the scripts)

- `hw-ios-wda.py session` turns XCUITest's idle waits off (a drag took 22 s with them).
- `hw-ios-hitches.sh`: the `hitches` xpath must not carry `run[@number="1"]` (a segfault on an
  empty table); `xctrace record` leaves multi-GB `instruments*.ktrace` files in
  `$TMPDIR` after saving — delete them after every trace (7.2 GB after three).
- `hw-ios-motion-drive.py`: buttons by coordinates (the card is an accessibility leaf), the
  row 38 pt above the card's bottom, x 127 / 189 / 251 / 319 pt — **except an Experiment card,
  whose row wraps** (item 11a); scroll the card into the 120–740 pt band and wait until its rect
  reads the same twice before tapping (a tap on a decelerating list lands on the wrong row).
- `hw-ios-paint.py`: the XCUITest tree lists cells FlashList keeps mounted beyond the viewport
  (14–16 "cards in tree" for 5–6 on screen); only the on-screen ones are scanned.
- `hw-account-reads.mjs --latest` means the newest auth row, not the newest onboarding — the
  iPhone's account predated the Pixel's (item 2).
