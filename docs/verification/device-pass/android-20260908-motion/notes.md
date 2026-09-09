# Android — the plan-surface transitions (2026-09-08, ADR-0022, post-p12/motion)

Session-driven over adb on the Pixel 7a (`39131JEHN07217`, Android 17, 1080×2400 @ 420 dpi),
the owner present. Same rules as the earlier passes: no wall-clock polling (every time-triggered
fact is read back afterwards); raw recordings and logs stay in the session scratch, only
app-filtered extracts and numbers land here; the phone is the session's while a step runs.
Protocol: ADR-0022 "Verification protocol" steps 1–2 — baseline build of main → the same
13-block list on the motion build → transitions → paint + order checks → interrupt test.

## State before

- Phone: build 8 (`9593903`, 2026-09-06) at the welcome screen, no account; font scale 1.0,
  animator duration scale 1, auto time zone on (`Europe/Kiev`), TalkBack off.
- Server: newest auth user `6c2e88b5…` (created 15:18 UTC, never onboarded — not this phone).

## Log

1. **Builds (23:15–23:25).** Baseline = main `fdff809` (the mobile sources checked out into the
   branch's tree, so the native side is identical): `expo prebuild --clean` + `assembleRelease`,
   3 m 13 s, `8a114c0e8b222a60…`, 121 338 822 B; gate ✓ (bundle host hit 1; `SCHEDULE_EXACT_ALARM`,
   `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS`). Motion build = this branch `f5fdbe2`, same
   recipe (below). New shared tools for this pass: `hw-motion-frames.py` (mp4/mov → change runs
   in a crop), `hw-motion-drive.py` (record + drive one interaction + paint/order checks),
   `hw-scroll-frames.sh` (the gfxinfo series as a script, so both builds get the same input),
   `hw-set-profile-timezone.mjs` (the day-5 ad-hoc profile-zone update, now a helper).
   Motion build: `f5fdbe2`, `expo prebuild --clean` + `assembleRelease`, 2 m 42 s,
   `e959818313458b19…`, 121 343 238 B; gate ✓ (same three permissions).
2. **Fresh account (23:13–23:17).** `maestro test e2e/p4-onboarding-flow.yaml` on build 8 (4 min):
   `edc05c5d-…`, anonymous, `Europe/Kiev`, onboarding completed 20:17:01 UTC, one task; the
   first-open UC-03 request fired at once (20:17:03, `learned`, **0 blocks** — a Kyiv evening has
   no window left; `first_open` = request 1 of the 30/24 h budget). Baseline APK installed over
   build 8 at 23:18:12 (`adb install -r`, account kept).
3. **The 13-block recipe (23:18–23:22).** Server: 25 seeded 30-min tasks (`hw-seed-tasks.mjs`,
   seq 5045–5069), `tue: [540, 1380]` (5070), profile `timezone` → `America/Los_Angeles`
   (`hw-set-profile-timezone.mjs`, 5071); device: `auto_time_zone 0` + `cmd alarm set-timezone
America/Los_Angeles` (13:18 PDT); `am force-stop` → `am start -W` 794 ms. "Plan my day" 23:19:21
   → plan 2 (`manual`, learned): **12 blocks 1:30–10:30 PM PDT**, "No room today for 14 tasks".
   `tue` → `[540, 1440]` (5097) + Re-plan 23:20:13 → plan 3: 12 again — the limiter was the
   onboarding's **sleep window `[1380, 420]` (23:00–07:00)**, not the hours; → `[1425, 420]`
   (5133) → Re-plan 23:22:17 → **plan 4: 13 blocks 1:30–11:30 PM PDT, 13 unplaced (26 − 13)**.
   Four plan requests in all; the same plan 4 is the list under both builds (`plans` 4,
   `recommendations` 37 before and after the motion install).
4. **Incident (23:21:27) — a blind tap landed in a chat app.** The owner had brought a messaging
   app to the front; a Re-plan tap sent by coordinates without a foreground check went into that
   app (one tap, into a message list; nothing was typed or sent, nothing of the chat was kept —
   the dump was deleted from the session scratch). Rule enforced in the tools, not remembered:
   `hw-motion-drive.py` and `hw-scroll-frames.sh` now refuse any input unless
   `mCurrentFocus` is Hourwell (`require_foreground`).
5. **NFR-P2 baseline — main `fdff809`, the 13-block list (23:22:51).** `hw-scroll-frames.sh`:
   gfxinfo reset, 15 long drags down + 15 up (540,1900→700 / 540,900→1900, 300 ms, 0.25 s pauses,
   all starting inside the list), framestats: **1825 frames, 1 janky (0.05 %), legacy 8 (0.44 %),
   p50 5 / p90 7 / p95 8 / p99 10 ms**, missed vsync 0, slow UI thread 1, high input latency 759
   (the injected drags) — `gfxinfo-13blocks-main.txt`.
6. **NFR-P2 on the motion build, the same list (23:24:31).** Installed 23:23:38 (`adb install -r`,
   plan kept; warm relaunch 1042 ms); the same script: **1824 frames, 1 janky (0.05 %), legacy 6
   (0.33 %), p50 5 / p90 7 / p95 8 / p99 10 ms**, missed vsync 0, slow UI thread 0, slow draw
   commands 1, high input latency 520 — `gfxinfo-13blocks-motion.txt`. **Pass:** janky count and
   every percentile equal; an `Animated.View` per cell costs nothing measurable on this list.
7. **S1 — Done (23:25:11).** `hw-motion-drive.py` (screenrecord 60 fps, `hw-motion-frames.py` on
   the list crop 0,490–1080,2050, threshold 0.6): the tap at 4.40 s → **one run of 11 frames =
   183 ms** (the `springs.standard` 200 ms travel of the rows into the gap), nothing else changed
   for 2.5 s. After: 0 BLANK in 4 card scans (std-dev 37.6–38.5), order intact, the block reads
   "Completed". The layout spring **does** fire on Fabric with FlashList's absolute-positioned
   cells — the first "device eye" of ADR-0022.
8. **S1 — Skip (23:26:10).** Tap at 4.39 s → **10 frames = 167 ms**, plus one frame at +183 ms (the
   two-line caption "Skipped — back in your Inbox" laying out). 0 BLANK, order intact.
9. **S2 — Move to an on-screen slot (23:29:00; 4:00 → 5:00 PM, two rows down).** The picker: tap
   "Move…" (panel), the time button (the stock radial `TimePickerDialog`), hour "5" and minute
   "0" on the clock face (touch helpers, class `RadialPickerTouchHelper`), OK, "Move here" at
   20.71 s → **one run of 12 frames = 200 ms** — the cell travelled and the rows made room.
   The dialog's own open/close (12 and 9 frames) are the system's animations, not ours. 0 BLANK,
   order after: …, 20 physical 4:30 (Moved), 08 physical 4:45, 24 physical 5:00 (Moved).
10. **S2 — Move to an off-screen slot (23:32:17; 4:45 → 10:00 PM, below the fold).** "Move here" at
    22.05 s → **one run of 19 frames = 317 ms** — the list scrolling to the block (`viewPosition`
    0.3) with the arrival settle inside it; a second analysis cropped to the arrived card's own
    rect gives the same single 19-frame run (the scroll and the settle overlap; the tool cannot
    split them — the reduced-motion control below is what separates "no scroll animation + rest
    assigned" from "scroll + settle"). After: the moved block on screen at ≈ 30 % of the
    viewport with "Moved", 0 BLANK in 6 scans, document order 7:45 (clipped above), 8:30, 9:15,
    **10:00 (moved)**, 10:00, 11:00 — correct.
11. **Reduced motion — the wrong switch first (23:35–23:37).** With `animator_duration_scale 0`
    only, Done and Skip still ran 9 and 10 frames: **React Native reads
    `Settings.Global.TRANSITION_ANIMATION_SCALE`** for `isReduceMotionEnabled` and registers a
    content observer on that URI (`AccessibilityInfoModule.kt` lines 101–106, 236–250 in RN
    0.86.3) — the animator scale is never consulted. The dialog pass's reduced-motion row
    (android-20260906-dialog item 71: "`animator_duration_scale 0`, RN reports reduce-motion")
    therefore never exercised the app's reduce-motion path; its "one frame" reading came from
    something else (revisit.md; checklist wording corrected).
12. **Reduced motion — the right switch (`transition_animation_scale 0`, with the window and
    animator scales also 0 so nothing of the OS animates either; 23:40–23:51).** The observer
    delivered the change live (no relaunch). Done → **1 frame** (17 ms); Skip → **1 frame**;
    Move to an on-screen slot (11:00 → 9:30 PM, two rows up) → **two single frames a tick apart**
    (21.683 s the panel closing, 21.717 s the reorder on the SQLite change event — no travel);
    Move to an off-screen slot (9:30 → 2:00 PM, far above) → **two single frames** (the panel,
    then the instant jump with the arrived card at rest). Every duration collapsed through
    `resolveMotion` — no transition registered, no spring — the same code path as the dialog.
13. **A move to the same slot (23:48:01, scale 1; the adversarial case).** OK without changing the
    time, "Move here" → 1 + 3 frames (the "Moved" caption and the rows below it settling by its
    height); no travel, no scroll, the block stays; the fact logged (`block_moved`). Driver
    caveat, not an app defect: under the scale-0 settings a "Move here" tap 0.8 s after the
    dialog's OK twice landed on the panel's time button instead (the picker re-opened, no fact);
    2 s after OK it was reliable, and a hand-driven tap at scale 1 confirmed at once. Recorded
    so the next pass waits 2 s after a native dialog closes.
14. **Interrupted transitions (23:53–23:54).** (a) Done + a fling 90 ms later (inside the 350 ms
    window): one continuous run of 47 frames (783 ms — the settle merged with the scroll and its
    deceleration); after: 6 cards, vertical order intact, no overlapping bounds, one x-extent
    (221–1028) for every card, 0 BLANK. (b) Two Dones 200 ms apart on adjacent blocks (the
    second by pre-computed coordinates, mid-settle): one run of 14 frames = 233 ms, **both facts
    logged** (the second tap hit the button it was aimed at while its row was still settling),
    order intact, no overlaps, 0 BLANK. No cell was left off its slot in either.
15. **I did it (23:56:26).** Device clock +2 h (`auto_time 0`, `cmd alarm set-time` → 15:55 PDT,
    restored to auto afterwards); the warm-foreground lapse scan marked the 2:00–2:30 PM block
    "Not done — back in your Inbox" (the card was at the top of the list — the first dump missed
    it below the fold, not the scan). The tap at 4.00 s → change from 4.05 to 4.28 s = **14
    frames = 233 ms** in four short runs (a one-button row replaced by a caption is a small
    height change, so the per-frame difference dips under the threshold mid-spring); `lapse_corrected`
    on the server; 0 BLANK; order intact.
16. **The dialog under the right switch (23:57–23:58; Settings → "Sign out", cancelled with "Keep
    my data").** Whole-screen crop: scales 0 → the dialog appears within a 4-frame window (67 ms —
    the Modal window compositing, no spring); scale 1 → 6 + 1 frames. The whole-screen crop is
    too coarse for a small fading card, so the dialog's device reading stays "inconclusive with
    this tool"; the code path (duration 0 → assignment) is pinned in jest. Nothing in this phase
    depends on it; recorded for the dialog row.
17. **Restore (23:59).** Device: `auto_time 1`, `auto_time_zone 1` (23:59:28 EEST, `Europe/Kiev`),
    all three animation scales 1, font 1.0, Today on screen. Server: profile `timezone`
    `Europe/Kiev` (5206), `tue` `[540, 1080]` (5207), `sleep_window` `[1380, 420]` (5208). Final
    account: 4 plans, 37 recommendations, 56 events — 6 completed, 3 skipped, 7 moved, 1
    corrected; every fact intended, none stray (item 4's tap reached no Hourwell control).
18. **Re-verification after the adversarial pass (2026-09-09 07:24–07:31, build `ac99dea`,
    APK `82a852023d00a86d…`, gate ✓, installed over the motion build with the account kept).**
    The reviewer showed that the arrival settle could not play on the first build: the effect
    that issued `scrollToIndex` cancelled its promise in the cleanup, and the 350 ms settle
    window closing re-rendered the timeline before FlashList's stepped scroll resolved — so
    item 10's single 19-frame run was the scroll alone. Today's plan came from the `new_day`
    trigger on launch (04:24 UTC, 12 blocks 9:00 AM–5:45 PM Kyiv, request 5 on this account).
    A first run (07:25) was a same-slot move by my own tooling fault (the shell expanded `$#`
    inside a heredoc again — the hour/minute steps never ran; the block read "Moved" at 9:00 AM,
    caption only, 8 frames of rows settling; `block_moved` logged). **The off-screen move on the
    fixed build (07:27, 06 deep 9:45 AM → 4:30 PM, "Move here" at 24.53 s):** the list crop shows
    the scroll as **17 frames / 283 ms** (24.70–24.98 s) and then, starting 0.33 s after the
    scroll began, **a second run of 7 frames / 117 ms (25.03–25.15 s)** that the arrived card's
    own rect also shows (mean change 7.4, peak 14.1 — concentrated in that card): the arrival
    settle, playing once the scroll lands (the spring's 250 ms tail dips under the threshold
    after ≈ 7 frames, the pose being 8 px / 3 %). The first build's recording had no such
    second run. The card landed at 1016–1480 px (≈ 42–62 % of the viewport, before "07 learning"
    at the same 4:30 PM start), "Moved", 0 BLANK in 6 scans, order correct. **Done on the fixed
    build (07:30, 14 deep 3:00 PM):** 9 frames / 150 ms + 1 — S1 unchanged by the refactor; 0
    BLANK; order correct. Server after: 73 events, 6 completed, 9 moved.

## Tooling lessons (kept in the scripts)

- `uiautomator` reports **inverted bounds** for a card clipped at a viewport edge; sorting cards by
  `y` misplaces them (the off-screen move looked mis-ordered) — read document order; a button with
  inverted bounds is not tappable and is skipped.
- A regex like `^10$` matches the time dialog's **header hour text** before the clock face —
  scope to the class (`#RadialPickerTouchHelper`); the panel's time button vs the gutter clock
  the same way (`#Button`).
- `input tap` errors go to stderr and were invisible; the driver prints them now.
- Every locate dump costs ≈ 2 s; recordings must be sized for the step count (a 14 s recording
  ended before "Move here" on the first attempt).
- Steps must reach the driver as argv, never through a double-quoted shell string (`$` and `#`
  were mangled once, turning a scoped Done into "the first Done on screen").
