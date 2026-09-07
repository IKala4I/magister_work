# iPhone pass — day 1 (2026-09-07), iPhone 12 (A14, 2020), iOS 26.6 (23G71)

**Device evidence, not simulator.** Free-provisioned Release build (`npx expo run:ios --device
<udid> --configuration Release --no-bundler`, Sentry upload disabled as in P2), personal team,
signature valid to 2026-09-14. The iPhone 12 is a 2020 device — older than the Pixel 7a (2022)
and than the 2022 device class NFR-P2 names; every number below is reported against that model.

## Setup (session, 11:00–11:35)

- **Toolchain.** Xcode 26.6 (17F113, iOS SDK 26.5) on macOS 26.6; Expo SDK 57 requires Xcode ≥ 26.4
  (`@expo/sdk-compatibility`, verified with ctx7 2026-09-07); the phone is paired, Developer Mode
  on, DDI services available (`xcrun devicectl device info details`). No compatibility problem.
- **Free-provisioning finding (fixed before build 1).** The generated entitlements carried
  `aps-environment = development` — written by the expo-notifications config plugin whenever the
  key is absent — and a personal team cannot sign the Push Notifications capability. Hourwell has
  no push (ADR-0011/0014), so a local config plugin (`apps/mobile/plugins/withoutApsEnvironment.js`,
  listed ahead of expo-notifications: mods run last-listed-first) deletes the key. Introspection
  `{"aps-environment":"development"}` → `{}`; the clean prebuild wrote `<dict/>`.
- **Build 1** = tree `4d67a78` (main after PR #56), installed 11:31. `hw-build-gate-ios.sh`
  (`build-gate-1.txt`): host hits 1, entitlements = application-identifier, team-identifier,
  get-task-allow (no aps-environment), Authority "Apple Development", 69 352 KB. First launch was
  refused until the owner trusted the developer profile (Settings → General → VPN & Device
  Management) — the expected free-provisioning step; done 11:33.
- **Device account** (anonymous, created at launch by `bootstrapAnonymous`, not by the button):
  `7f088974-…`, 11:33:25 local. The iOS simulator was NOT booted during the pass (it shares the
  hosted project — HANDOFF gotcha), so `--latest` reads are unambiguous.
- **The phone runs in Ukrainian** (system language); the app ships English strings only, so
  VoiceOver reads English text with the Ukrainian voice. Expected, recorded, not a defect.

## What the session can drive on iOS (triage, verified on this phone)

| Need                                   | Android tool                | iOS tool used here                                                                                                                                                                                                                                                                                                    | Status                                   |
| -------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| install / launch / kill / process list | adb, am, pm                 | `xcrun devicectl` (install, process launch/terminate, info processes/apps/lockState)                                                                                                                                                                                                                                  | ✅                                       |
| screenshots                            | screencap                   | `pymobiledevice3 developer dvt screenshot` (Xcode CoreDevice tunnel, no sudo)                                                                                                                                                                                                                                         | ✅                                       |
| device log                             | logcat                      | `pymobiledevice3 syslog live -ei 'hourwell                                                                                                                                                                                                                                                                            | usernotification'` (running since 11:34) | ✅  |
| AX tree / spoken order                 | uiautomator dump            | `hw-ios-ax.py items` — every element with its VoiceOver spoken description, in traversal order                                                                                                                                                                                                                        | ✅                                       |
| OS a11y toggles                        | settings put                | `hw-ios-ax.py settings set REDUCE_MOTION/REDUCE_TRANSPARENCY/INCREASE_CONTRAST/DYNAMIC_TYPE …`                                                                                                                                                                                                                        | ✅ show/set verified                     |
| AX audits                              | —                           | `hw-ios-ax.py audit` (contrast, hit region, clipped text, dynamic text, description, trait)                                                                                                                                                                                                                           | available                                |
| taps                                   | input tap                   | AX "Activate" (`hw-ios-ax.py press`) — **does not fire RN Pressables** (they implement no `accessibilityActivate`; VoiceOver's double-tap falls back to a synthesized touch, the daemon does not) → WebDriverAgent (XCUITest touch synthesis) built with the personal team, driven by `pymobiledevice3 developer wda` | WDA: see below                           |
| cold start                             | am start + logcat Displayed | `xcrun xctrace record --template 'App Launch'`                                                                                                                                                                                                                                                                        | see below                                |
| network weak link                      | —                           | `pymobiledevice3 developer dvt condition set SlowNetwork…`                                                                                                                                                                                                                                                            | available                                |
| notification archive                   | dumpsys notification        | none live; `devicectl device sysdiagnose` (unified log) after the fact; server `notification_response` rows                                                                                                                                                                                                           | reconstruct                              |
| Maestro                                | on device                   | **not supported on physical iPhones** (Maestro docs, verified 2026-09-07)                                                                                                                                                                                                                                             | —                                        |

Owner's hands and ears (cannot be driven): the developer-profile trust, the notification
permission prompt (a SpringBoard alert — the AX daemon cannot activate system apps), VoiceOver
itself (on/off, listening, the two-finger Z escape), Focus modes, the calendar consent screen,
AirDrop (needs a second device), a real thumb scroll for the hitch recording.

## Findings

(filled as the day goes; each finding cites its evidence file)

### Slice 1 — onboarding → first plan (session over WebDriverAgent, 11:45–11:50)

1. **AX "Activate" does not fire RN Pressables** (`hw-ios-ax.py press '^Get started'` reported the
   press; the screen stayed on the welcome, `ax-b1-launch.json` = `ax-b1-onb1.json`). The daemon
   sends `AXAction-2010` (Activate) to the element; `RCTViewComponentView` answers
   `accessibilityActivate` only when JS passed `onAccessibilityTap`, and Pressable does not.
   VoiceOver's double-tap has a synthesized-touch fallback; the daemon has none. Consequence for
   the pass: **taps go through WebDriverAgent** (`hw-ios-wda.py`, real XCUITest touches); the AX
   daemon stays the reader (`items`, `audit`) and the settings switch.
2. **WebDriverAgent 16.12.4 built with the personal team** (`PRODUCT_BUNDLE_IDENTIFIER=com.hourwell.wda`,
   `build-for-testing` against `generic/platform=iOS` — a device destination timed out with
   "Device is busy" while a trace held the CoreDevice connection), installed over lockdown
   (`pymobiledevice3 apps install`), started with `dvt xcuitest com.hourwell.wda.xctrunner`,
   reached over `usbmux forward 8100`. First `wda tap` locator lesson: `name`, not `label`.
3. **CoreDevice RSD wedge.** After an `xctrace record --template 'App Launch'` that never returned
   (killed after 4 min), every `xcrun devicectl` call fails with "Failed to allocate RSD device
   (0xE8000003)" while lockdown services and pymobiledevice3's own native tunnel keep working.
   Recorded as a tooling gotcha; the cold-start series needs the connection back (replug).
4. **Onboarding walked end to end on the device** (`wda-onb2.xml`, `wda-onb4.xml`,
   `shot-b1-onb-rhythm.png`, `shot-b1-onb4-tasks.png`): rMEQ five answers (morning profile, as
   the Maestro flow), hours default Mon–Fri 9:00–18:00 + sleep 23:00–7:00, category "Deep work",
   **three tasks typed through the real iOS keyboard** into the quick-add ("… 45 min", "… 30 min",
   "… 20 min" → "3 added"), Finish setup. Nine more tasks seeded server-side
   (`hw-seed-tasks.mjs`, seq 4629–4637) before the first plan.
5. **First plan on the device** (`wda-today-1.xml`, `shot-b1-today-1.png`): Today, "Monday, 7
   September", the nudge card (Turn on / Not now), the Now line, blocks from 12:00 to 16:15 with
   rationale + Start/Done/Skip/Move…, "No room today for 4 tasks — they stay in your Inbox", four
   tabs. **Server** (`hw-account-reads.mjs`): onboarding_completed 08:49:52Z → plan generated
   08:49:54.3Z (`engine: learned`, `trigger: first_open`), 8 recommendations, 12 tasks, 3
   `task_created` events, timezone `Europe/Kiev`, working_hours mon–fri [540, 1080]. Dark mode is
   the phone's own setting.
6. **Once-a-minute `Hourwell{ExpoModulesCore} <ERROR>: <private>`** in the device syslog at
   hh:mm:35 from 11:34:36 on (`syslog-hourwell.log` extract) — the cadence of the 60 s sync poll
   (`sync/engine.ts` `POLL_INTERVAL_MS`); the adjacent lines are a CFNetwork StorageDB assertion
   and a "StartAccessing on a URL that is not security-scoped" (CoreServicesInternal). The
   message is redacted by the unified log; investigation continues below.
7. **Notification permission through WDA** (11:56): "Turn on" on the nudge card → the iOS
   permission alert (Ukrainian system copy: «Програма "Hourwell" хоче надсилати вам
   сповіщення», Заборонити / Дозволити; `shot-b1-notif-prompt.png`) → `alert accept` → the
   card is gone (`wda-today-2.xml`: 0 × "Turn on"). Session-driven; off the owner's list.
8. **NFR-P1, server side of the device series** (`hw-plan-rows.mjs`, 11:58:57–12:02:24 local,
   ten "Re-plan" taps 7 s apart, 12-task inbox, 7–8 blocks each): **all ten learned; edge-function
   total p50 710 / p95 783 / max 783 ms; service p50 503 / p95 567 ms**; budget 1900, status 200
   throughout. Against the Android day (14-task day: total p50 1662 / p95 1908, 1 fallback):
   a smaller inbox and a warm service — comparable to the Android build-6 half-day numbers, not to
   the full-day ones. The client-side `plan_requested.duration_ms` is a PostHog export (owner).
9. **The once-per-sync `ExpoModulesCore <ERROR>`** (item 6) is one line per `syncNow`: the ten
   re-plans produced one each (11:58:55, 11:59:19, 11:59:38, … 12:02:26 — the pre-plan syncs) on
   top of the poll ticks, and it continued after the notification permission was granted
   (11:56:55), so it is not the reminder scheduler being refused. The message is redacted
   (`<private>`); `dvt oslog` on the pid did not carry the line. Candidates in the sync path
   that cross an Expo module: `largeSecureStore` (expo-secure-store; its own catch maps
   corruption to null — a native error log would still be emitted), PostHog's persisted queue
   (expo-file-system; the CoreServicesInternal "StartAccessing on a URL that is not
   security-scoped" line follows the error every time). Experiment planned: the Settings →
   analytics toggle off for two poll ticks. Effect on the user: none visible so far (session
   persists, syncs succeed, plans arrive); effect on data: none identified.
10. **Day loop, Start** (12:04:42): "Start b6 task 06 deep" (the action buttons carry the task
    name in their accessibility label; the visible text is "Start") → Focus: "Focusing / b6 task
    06 deep / 00:15 / progress bar / Pause · Finish · Stop for now" (`wda-focus-1.xml`,
    `shot-b1-focus-running.png`). Block cards announce as "b6 task 06 deep, 12:15 to 12:45,
    Confidence 44 percent"; the ε-slice block reads "…, Experiment, Confidence 41 percent"
    (FR-22 label present in the AX tree).
11. **Finish → rating → Today** (12:08–12:10): "Finished · 4 min focused", chips "How was your
    energy?: Low / Okay / High", "Skip rating" (`wda-focus-finish.xml`, `shot-b1-focus-finished.png`);
    Okay → Today shows the block as "Completed" (`wda-today-3.xml`, `shot-b1-today-after-done.png`).
12. **Skip** (12:10): "Skip Reply to the supervisor" → the card reads "Skipped — back in your Inbox"
    in the secondary text colour, nothing red, the card stays in place (`shot-b1-skip-1.png`);
    the task reappears in the Inbox (`wda-inbox-1.xml`). No undo snackbar on a skip (it is not
    destructive; the 6 s undo is on the task delete — item 15).
13. **Move… → the iOS wheel picker** (12:11, never rendered on hardware before): "Move to · b6 task
    02 deep", hour + minute wheels at 15-minute steps, 13:45 preselected, "Move here" / "Cancel"
    (`shot-b1-move-picker.png`); wheels set to 15 / 30 through WDA
    (`shot-b1-move-picker-1530.png`) → "Move here" → the card reads "b6 task 02 deep, 15:30 to
    16:00" + "Moved" (`wda-move-after.xml`, `shot-b1-move-toast.png`).
14. **Facts on the server after the loop** (`events` by type): recommendation_shown 80,
    task_created 3, focus_start 1, focus_end 1, session_rated 1, block_skipped 1, block_moved 1 —
    and the device's own `events` table (pulled over lockdown: `pymobiledevice3 apps pull
com.hourwell.app /Documents/SQLite/hourwell.db`, 368 KB) holds 88 rows = the server's 88.
15. **Inbox delete → 6 s undo** (12:14:09): "Delete b6 task 09 admin" → snackbar "Task deleted" +
    "Undo" (`wda-inbox-undo.xml`, `shot-b1-inbox-undo.png`); Undo tapped at +2.3 s → the row is
    back, the snackbar gone (`wda-inbox-after-undo.xml`). The typed tasks were categorised
    "Admin" by the quick-add (durations parsed: 45 / 30 / 20 minutes).
16. **Notification Center cannot be opened by XCUITest drags** (three attempts: in-app top-edge
    drag, home-screen drag from y=2 and from y=0 over 1.2 s — the source stayed the home screen).
    Delivery evidence on iOS therefore comes from the **lock screen** (WDA `lock` before the
    moment, `dvt screenshot` after it — the lock screen keeps undismissed notifications), from the
    server's `notification_response` rows, and from the app's ledger. The 12:05 nudge for the
    12:15 block was not observable this way (the block was started at 12:04:42 and the scheduler
    recomputes — cancel-first — on every change, so no nudge is expected for a block in focus).
17. **Dialog sweep in the Settings sheet** (12:15–12:20, WDA taps + the AX daemon as the reader;
    `shot-b1-dialog-signout.png`, `shot-b1-dialog-delete1.png`, `shot-b1-dialog-delete2.png`,
    `ax-dialog-*.json`). Sign out: VoiceOver traversal = "Sign out of the trial account?, Header"
    → body → "Sign out anyway, Button" → "Keep my data, Button", **four elements and nothing
    beneath** (the Settings controls behind the scrim are not reachable — `accessibilityViewIsModal`
    holds on the device). Delete 1: "Delete your account?, Header" → body → "Continue, Button" →
    "Keep my account, Button". Delete 2 (the replacement dialog): the traversal started at the body
    and wrapped to "This cannot be undone, Header" last — the iterator begins after the element
    that currently holds the inspector focus, i.e. **the title had focus when the replacement
    opened** (the announce-and-focus path of c36de47). "Delete everything" renders in `dangerText`
    (red), "Cancel" in primary. On-device audit on dialog 2 (contrast, hit region, clipped text,
    dynamic text, description, trait): **0 issues** (`ax-audit-dialog-delete2.json`). Every cancel
    left the Settings sheet intact (`wda-settings-after-dialogs.xml`: 1 × "Delete account and
    data", 0 × dialog-card). The Today "Start over" dialog is the pending-wipe card (only after a
    sign-out with unsynced ops) and the sign-in "replace" dialog needs a magic link (⛔ 6): not
    exercised on iOS; the calendar-disconnect dialog waits for the owner's calendar.
18. **Tooling lessons from the sweep** (recorded so the next pass does not repeat them): (a) a
    WDA `name` lookup returns the FIRST match — a Switch and its label share the name, so "tap
    'Usage analytics'" hit the StaticText and the switch stayed `value="1"` (the first analytics
    experiment was void; redone with a predicate on `type == 'XCUIElementTypeSwitch'`); (b) the
    AX daemon's settings live only while a client is connected — `DYNAMIC_TYPE = 1.0` read back
    0.2727 after the CLI exited and the trees showed no scaling (text heights identical) —
    `hw-ios-ax.py hold` keeps the session open while WDA captures run; (c) zsh does not word-split
    an unquoted variable, so `$AX items …` was "no such file" and produced the empty listings.
19. **Insights on hardware** (12:37): the FR-40 heatmap renders (OKLCH cells, morning rows
    visibly higher, assumed cells faint, dark mode; `shot-b1-insights.png`); "Show as text" swaps
    in the text alternative ("evening: 48 percent / night: 43 percent …", legend, "Show as grid";
    `shot-b1-insights-text.png`, `shot-b1-state-1248.png`); belief ✓ on "deep work, early morning,
    weekdays" → "You confirmed this." and a `belief_label` row in the device's `events` (pulled DB
    #2: recommendation_shown 80, task_created 3, session_rated / focus_start / focus_end /
    block_skipped / block_moved / belief_label 1 each).
20. **The per-sync error, experiment status.** Both toggle experiments are unverified: the
    first two "Usage analytics" taps landed on the label (item 18a), the class-name tap at
    12:41:14 could not be read back (item 21). Errors continued through 12:43:13 at least. Still
    open; the owner-side option is Apple's private-data logging profile (shows the redacted
    message), and the code-side option is a catch-all `Sentry.captureException` around the
    module calls in the sync path on a debug build. Not a user-visible defect; recorded, not fixed.
21. **XCUITest snapshot stalls on the Settings sheet with the keyboard up.** Every `source`,
    predicate and scroll request on that state ran > 60 s and queued behind each other (WDA serves
    one request at a time; a client timeout does not cancel the request, and the late taps then
    landed — one opened the email field, whose keyboard made the next snapshot slower still). Two
    runner restarts cleared the queue; the tab screens snapshot in ≈ 1–2 s throughout. Rule for the
    rest of the pass: on the sheet use `find`/`tap` by exact name or coordinates and DVT
    screenshots; never `source` while a keyboard is up; `keyboard-dismiss` before anything else.
22. **DEFECT (NFR-A2 / FR-22, iOS-only) — 200 % text breaks the layout when the size changes
    while the app runs.** Held `DYNAMIC_TYPE = 1.0` (the AX daemon; the app caps at
    `MAX_FONT_SCALE = 2`, so this is the same 200 % Android passed on 2026-09-02) and captured
    every tab and the Settings sheet (`shot-b1-dt-max-*.png`, trees `wda-dt-max-*.xml`, 12:49–12:52):
    - **Today:** the date header is clipped to its top half and "Re-plan" to "Re", the "Now" label
      reads "Nc", the footer "No room today for 5 tasks" is cut; the block card's title wraps to
      two lines (`b6 task 06 deep` StaticText 24 → 96 px tall) but the rationale is laid out 56 px
      below the title's top (y 239 vs a title spanning 183–279) — i.e. the layout kept a
      one-line title — and the time range "12:15–12:45" overlaps the rationale; the card width
      shrank 286 → 222 as the gutter grew (`wda-today-3.xml` vs `wda-dt-max-today.xml`).
    - **Inbox:** every row keeps its 1× height (74 px in both trees) while the text renders at
      2×, so titles and the "Admin · 30 minutes" line show only their upper half; the "Add"
      button label is cut to "Ad".
    - **Settings sheet:** section headers ("My data", "Privacy") lose their glyph tops.
    - **The dialog holds:** title and body wrap, both actions stacked and on screen
      ("Delete everything" y 414 h 49, "Cancel" y 462 h 50, `visible=true`), danger red.
    - **Apple's own audit** (`testTypeTextClipped`, `testTypeDynamicText`, contrast, hit region)
      on the broken Today: **0 issues** (`ax-audit-dt-max-today.json`) — it inspects UIKit text
      and does not see RN's paragraph views; the screenshots and the trees are the evidence.
    - Tab-bar labels do not scale at all (`Today` StaticText 26 px in both trees).
      Reading: the text re-rendered at the new size but the Yoga layout did not re-measure — the
      Android build re-lays out on a font-scale change (its sweep at 2.0 showed only the gutter
      wrap). The relaunch-under-hold test that separates "live change" from "layout at 2×" was
      inconclusive on the first try: the relaunched app showed a **black window** for > 1 min
      (`shot-b1-dt-max-relaunch-*.png`, process alive, no crash in the log) — retested below.
      Fix batch: (a) re-layout on `UIContentSizeCategoryDidChange`, (b) then the true 2× layout.
23. **Item 22 resolved to a narrower defect + a tooling artefact** (12:58–13:00):
    - The **black window** came from the launch path, not the text size: the app relaunched
      with `pymobiledevice3 developer dvt launch` while the AX daemon held a connection stayed
      black for > 2 min with a live element tree (`wda-black-1258.xml`: 78 nodes, all
      `visible=false`; `AXRuntime <ERROR>: Unknown client: Hourwell` in its log; JS alive — the
      poll ran). The same relaunch through WDA (`app terminate` + `app launch`) rendered at once,
      at the default size (`shot-b1-relaunch-default.png`) and under a fresh hold at 2×
      (`shot-b1-dt-max-relaunch-wda.png`). Rule: relaunch through WDA; keep `dvt launch` for
      timing-free process control only.
    - **A fresh launch at 2× lays out correctly:** the date header wraps to two lines and
      "Re-plan" drops below it, the card stacks title (two lines) / time range / rationale /
      "Completed", the footer wraps, nothing clipped or overlapping; Inbox rows measure **116 px**
      (`wda-dt-max-relaunch-inbox.xml`) against **74 px** both at 1× and after the live change.
      The viewport under the two-line header shows one card — the Android note's "small
      viewport" holds on iOS too (not a defect; recorded).
    - So the defect is: **on iOS a text-size change while the app runs (or is suspended)
      re-renders text at the new size without re-measuring the layout** — fixed heights from 1×,
      overlaps and clipped glyphs until a relaunch. Android sidesteps it because a font-scale
      change recreates the activity. Fix batch: re-mount the root (a key bump) on a font-scale
      change (`Dimensions`/`useWindowDimensions().fontScale`), then re-verify with the hold.
24. **DEFECT, MAJOR (FR-42 / NFR-A2, iOS-only) — with Reduce Motion on, the second erasure
    dialog never appears.** Reproduced twice from a clean relaunch: under
    `REDUCE_MOTION + REDUCE_TRANSPARENCY + INCREASE_CONTRAST` (13:01, `shot-b1-rm-rt-ic-delete1.png`
    shows dialog 1, `…-delete2.png` shows the Settings sheet with no dialog 1.2 s after
    "Continue") and under **`REDUCE_MOTION` alone** (13:03: "Continue" found and tapped;
    "Delete everything" / "Cancel" / "Keep my account" all absent at +1.5 s and at +6.5 s,
    `shot-b1-rm-only-after-continue.png`). Later dialogs still work (the sign-out dialog opened
    and cancelled right after), so the lost request does not wedge the host. With the phone's
    default motion the same flow showed dialog 2 both times (12:18, 12:51). Android's
    reduced-motion run (animator scale 0, build 8) showed step 2.
    **Consequence:** a VoiceOver/Reduce Motion user on iOS cannot delete the account from the
    app — the FR-42 path is closed behind an accessibility setting.
    **Mechanism (hypothesis from `DialogHost.tsx`):** the hide branch (`animateTo(0, …, cb)`)
    unmounts the Modal in its callback; with animation the callback lands after ≈ 150 ms, by
    which time the replacement is `current`, `shownRef` points at it and the same Modal instance
    is reused ("springs on from where it is"). With reduced motion the durations are 0, the
    callback runs before the `await`-chained second request exists, `setShown(null)` unmounts
    the Modal, and the replacement mounts a NEW Modal while UIKit is still tearing the old
    presentation down — RN Modal presents from the nearest view controller, and a presentation
    requested during a dismissal is dropped (no error reaches JS; the unified log carried no
    UIKit line for it). Android's Dialog tolerates the sequence. Fix batch: keep the Modal
    mounted across an immediate replacement (defer the unmount by a frame, or check
    `useDialogStore.getState().current` before `setShown(null)`), plus a jest case for
    "resolve → request in the same tick under reduced motion".
25. **Reduce Motion + Reduce Transparency + Increase Contrast, relaunched under the hold**
    (`shot-b1-rm-rt-ic-today.png`, `-insights.png`, `-focus.png`, `-settings.png`): every screen
    renders as at the defaults — the cards are solid panels in dark mode, so Reduce
    Transparency changes nothing visible; Increase Contrast is not consumed by the app. The
    dialog entrance under reduced motion cannot be timed from screenshots; the Android
    screenrecord (one frame) stands, iOS is unmeasured (WDA's MJPEG stream is the option).
26. **FR-42 export on the iPhone** (13:06–13:08): Settings → "Export my data" → the iOS share
    sheet with the file "hourwell-export-2026-09-07 · JSON · 256 КБ" and AirDrop / Messages /
    Mail / Notes / Copy / New Quick Note / "Зберегти до Файлів" (`shot-b1-export-sheet-file.png`,
    `shot-b1-export-sheet-actions.png` — cropped: the full sheet showed the owner's contacts and a
    mail banner and was not kept). WDA does not see the sheet's targets by name (a remote
    process); "Save to Files" was tapped by coordinates, the Files picker's "Зберегти" by name,
    Settings came back with the sheet gone. The JSON pulled from the app's cache
    (`/Library/Caches/hourwell-export-2026-09-07.json`, 255 527 bytes): `format:
hourwell-export`, keys profile / tasks (12) / calendar_events / plans (11) /
    recommendations (80) / events (89) / feedback_rewards / belief_labels. Opening the saved
    copy in Files is the owner's glance.
27. **Scroll sample** (13:09:39–13:10:04, `pymobiledevice3 developer dvt graphics`, 1 Hz, while
    WDA dragged Today up and down twelve times): GPU "Device/Renderer Utilization" **5–8 %**
    during the drags (34 % once at the start, idle 0 %); `CoreAnimationFramesPerSecond` per
    second 27 / 59 / 60 / 31 / 0 / 4 / 0 / 53 / 38 / 48 / 43 / 59 / 46 / 42 / 46 / 39 / 46 / 40 /
    48 / 39. **Not hitch evidence:** the counter is frames per wall-clock second, system-wide,
    and the scripted drags (0.25 s each, ≈ 1 s of WDA overhead between them) leave idle gaps
    that read as low FPS. What it does establish: seven solid cards scroll at single-digit GPU
    load on the A14. The frame-time measurement stays `xctrace --template 'Animation Hitches'`
    during a real thumb scroll, after the CoreDevice connection is back (replug) — owner batch.
28. **The per-sync error is tied to the analytics client created at launch** (13:06–13:12):
    "Usage analytics" off through the Switch element at 13:06:23 (`--using 'class name' --nth 2`;
    the earlier name-based taps had hit the label) → one last error at 13:06:32 (the sync of the
    toggle itself), then **the 13:07, 13:08 and 13:09 polls ran without it** — the first
    error-free polls since 11:34. Back on at 13:10:26 → the 13:10 and 13:11 syncs still clean.
    So the error is emitted by the PostHog client that `initAnalytics()` builds at launch
    (posthog-react-native persists its queue through expo-file-system — the
    "StartAccessing on a URL that is not security-scoped" line that trails every occurrence is
    an expo-file-system access), and a client re-created by the toggle does not emit it.
    Relaunched at 13:12:16 to see whether a launch-time client brings it back (below).
    **Relaunch result (13:12:16):** the launch sync and the 13:13 poll ran clean too. So the
    emitter was the persistence state the very first launch (11:33, the anonymous sign-in
    moment) left for the analytics client; every relaunch until 13:06 re-read it, the opt-out
    rewrote it, and no client since has logged the line. No user-visible effect, no data
    effect (syncs, plans and facts were correct throughout); the message itself stays
    unknown. Watch item for the next fresh install (tomorrow's throwaway): does a first launch
    reproduce the once-per-sync line, and does `analytics.ts` need a guard around the client's
    first persistence read.
29. **Locked for the afternoon** (13:13:56, WDA `lock`; app state 2 = background): the 14:20
    nudge for the 14:30 block is due on the lock screen; one task seeded server-side at 13:14
    (seq 4877) as the "other device" for the > 10-min background → foreground pull; the lazy
    lapse scan gets its first real suspension. Nobody touches the phone until the owner pings
    at ≥ 14:25 and the lock screen is captured.
30. **Interruption (13:20):** the phone goes to another person for ≈ 2 h (unlocked, used for
    their own app; Hourwell not opened). Consequences: the 14:20 lock-screen capture is lost;
    the afternoon nudges (14:20 / 15:05 / 15:20 / 15:50) fire unobserved and are reconstructed
    afterwards from the device's persisted log (`pymobiledevice3 syslog collect` → `log show
--archive`); the "first foreground after a real absence" check is delayed, not spoiled,
    unless a Hourwell notification is tapped (that would consume it — re-seed and re-lock then);
    the app may be jetsammed meanwhile (the killed variant is in the row's scope; the suspended
    variant is redone with a 15-min lock later). Nothing else depends on the lock: no
    accessibility hold is active (read back: all defaults), analytics and reminders on, the
    seeded task waits server-side. The USB-bound helpers (WDA runner, port forward, syslog
    capture) were stopped for a clean unplug; the replug also resets the wedged CoreDevice
    connection. The ritual capture will be done the Android way: ritual time set server-side a
    few minutes out, sync, lock via WDA, capture, then the owner's long-press.
31. **Accidental foreground, read back from the phone's log archive** (`pymobiledevice3 syslog
collect`, 1.0 GB, scratch only; `/usr/bin/log show --archive`): locked by WDA 13:14:04;
    unlock 13:51:03.5 (keybag) → Hourwell, foreground-under-lock, "Scene lifecycle state did
    change: Foreground" 13:51:04.147 → left the foreground 13:51:06.528 (2.4 s) → locked again.
    The foreground sync started (49 CFNetwork lines in that minute) but the seeded task (seq 4877) is **not** in the device database afterwards (12 tasks; `journal_mode = delete`, so
    the pulled file is authoritative): the app was suspended before the pull was applied. So the
    "first foreground after > 10 min pulls the other device's change" check is not consumed —
    it moves to the next foreground; a 2-second foreground that does not finish a pull is not
    a defect of the row (the lease expires, nothing was pending in the outbox). The lapse scan
    ran with nothing lapsed (all remaining blocks were in the future); the overnight instance
    stands. The 14:20 nudge capture stands (locked since 13:51:07, before the fire time).
    Tooling: the WDA runner cannot initialise UI testing on a locked phone
    (`initializationForUITestingDidFailWithError`) — it must be started while unlocked; DVT
    screenshots and the log archive work regardless.
32. **FR-50 on the lock screen, and the OS's own view of the schedule** (14:20–14:33):
    - **Delivered locked:** the phone locked through WDA at 14:01:55 (state read back: locked,
      Hourwell background). At 14:31 `press home` lit the lock screen (WDA's build has no
      "lock" button; taps and swipes do not reach the lock screen — the unlock is a finger):
      "Hourwell · 1 сповіщення · 11 хв тому" under a system notification stack
      (`shot-b1-lockscreen-1431-clock.png`, `shot-b1-lockscreen-1431-hourwell-row.png`; the
      full frame stays in scratch — it carries an Apple-account notification). The nudge's
      text is hidden by the collapsed stack; its time is the OS's.
    - **SpringBoard `UserNotificationsCore` (live capture, 14:20:00.012):** "Persistent timer
      fired", "Load 6 pending notification dictionaries", requested 13:51:05 (the accidental
      foreground's schedule pass) with trigger dates **14:20:00.004 (fired), 15:05, 15:20,
      15:50, 20:00 today, 20:00 tomorrow** — four nudges + the ritual = **five today; no nudge
      for the 17:00 block**, i.e. the ≤ 5/day planner cap seen from the OS side before any
      delivery could prove it. The block at 14:30 → nudge 14:20 = the 10-minute lead.
    - **The scheduler's cancel-first order in the OS log** (archive, 13:51:05.092–.126):
      "Removing all pending notification requests" → "Save pending 0" → six "Adding notification
      request …" — the P10 adversarial-#4 ordering, observed on hardware. "Load last local
      notification fire date: 13:12:14 → 13:51:04" is SpringBoard's timer reference updated by
      each schedule pass, not a delivery ("Got 0 delivered notifications" at 13:51:05.114); so
      14:20 was the day's first delivery. The earlier passes were the 13:12 relaunch and the
      13:51 foreground; the 12:05 nudge had been cancelled by the 12:04:42 Start.
33. **First foreground after a real suspension → the pull lands** (invariant 7 / P8 row):
    suspended 13:51:06 → 14:35:57.6 (44 min, locked, one lock-screen delivery in between); WDA
    `app activate` → the tree read at **+1.9 s** (`wda-foreground-after-suspension-1.xml`) shows
    Today intact — seven blocks, "No room today for 5 tasks", no stale action row — and the read
    at +6.4 s the same; the Inbox then lists **7 rows** (was 6): the task seeded server-side at
    13:14 (seq 4877) is on the device (`wda-inbox-after-suspension.xml`; pulled DB #4: 13
    tasks, seq 4877 present). So the foreground trigger carried the pull, the 60 s poll
    having been suspended for 44 min. The Android-side "before the Today list re-renders" is a
    finer timing than a 1.9 s tree read can make; what is established is: no stale state was
    shown at any read. The lapse scan had nothing to attribute (the 14:30 block was in
    progress at 14:36); the overnight instance stands.
34. **VoiceOver reading order, structural half, from the accessibility daemon** (14:44–14:50,
    `ax-today.json`, `ax-insights.json`, `ax-settings.json` — the strings are what VoiceOver
    speaks, in traversal order):
    - **Today:** "Today" → "Open settings, Button" → "Re-plan, Button" → the date → each card
      as ONE element ("b6 task 06 deep, 12:15 to 12:45, Confidence 44 percent"; the ε-slice
      block "…, Experiment, Confidence 41 percent") followed by its gutter time → the Inbox
      footer → the tab bar ("Today, tab, 1 of 4, Button, Selected"). Good order and phrasing.
    - **Insights:** the category chips as "Show Deep work, Selected" (tabs), the heatmap as one
      sentence ("Energy map for Deep work. On weekdays your best time is early morning (89
      percent) and your lowest is night (30 percent). On weekends …"), the legend, "Show as
      text, Button"; each belief as statement + evidence + state ("You finish deep work most
      reliably in the early morning on weekdays. 4 finished blocks of evidence. You confirmed
      this.") and its buttons as «Mark "…" as correct, Button, Selected» / «… as incorrect,
      Button»; the pending caption "assumed, not yet observed" read. FR-41 structurally met.
    - **Settings sheet:** "Settings, Header"; switches as "Block reminders, 1, Button, Toggle"
      (the raw value "1" — VoiceOver itself renders a UISwitch's value as on/off; ear item);
      mute chips as "Mute reminders for Deep work, checkbox, unchecked"; evening times as
      "Evening time 20:00, radio button, checked". MINOR: each switch's visible label is also
      a separate static text, so VoiceOver reads "Block reminders" twice in a row.
35. **DEFECT, MAJOR (NFR-A1, both platforms by construction) — the block action row is not
    reachable by a screen reader.** The traversal steps from one card summary to the next
    gutter time; "Start / Done / Skip / Move…" never appear. Cause: `ConfidenceBlock.tsx` wraps
    the whole card, action row included, in `<View accessible accessibilityLabel={label}>`
    with no `accessibilityActions` and no `onPress` — a labelled accessible container is a
    leaf for VoiceOver (BeliefCard's own comment names the trap and avoids it). XCUITest still
    lists the buttons (it reads identifiers), which is why every WDA tap worked; the Android
    uiautomator dump listed them for the same reason, and the TalkBack listen was skipped —
    so this row was never actually exercised by a screen reader on either platform. A
    VoiceOver user can plan but cannot start, finish, skip or move a block from Today.
    Fix batch: custom actions on the card (Start / Done / Skip / Move…) with
    `onAccessibilityAction`, or restrict `accessible` to the header part and leave the row as
    siblings; jest pins it; re-verify with the daemon (iOS) and a TalkBack listen (Android).
36. **Both defects confirmed on the real Settings path, driven by WDA in the Settings app**
    (14:47–14:54; no daemon involved): Settings → Доступність (`com.apple.settings.accessibility`)
    → Дисплей і розмір тексту (`DISPLAY_AND_TEXT`) → Збільшення шрифту (`LARGER_TEXT`): slider
    to 100 % (the larger-accessibility-sizes switch did not take, so this is the largest
    non-accessibility size, ≈ 1.35×) → Hourwell foregrounded on its Settings sheet: **clipped
    live** ("Svnc no", "Connect Gooale Ca", chips "Deep wo / Adm / Phvsic / Learni",
    `shot-b1-realsettings-dt-live-today.png`); relaunched: **correct** (`…-dt-relaunch-today.png`;
    Inbox row 90 px vs 74 default, `wda-realsettings-dt-relaunch-inbox.xml`). Slider and switch
    restored (50 %, 0; daemon reads DYNAMIC_TYPE 0.2727). Then Рух (`MOTION_TITLE`) → the
    `REDUCE_MOTION` switch on → Hourwell → Settings → Delete account and data → Continue:
    **dialog 2 absent at +1.5 s and +5.5 s, no Cancel** (`shot-b1-realsettings-rm-after-continue.png`);
    switch back off (read back 0). Item 24 therefore holds for the user's own switch, not only
    the inspector flag. Tooling: iOS 26 Settings cells are identifier-named
    (`com.apple.settings.*`, `LARGER_TEXT`, `REDUCE_MOTION`); element clicks on their switches
    do nothing — a coordinate tap at the row's right edge (x ≈ 345) flips them; sliders take a
    `value` write.
37. **The device-connection wedge, resolved by a phone reboot** (15:05): `! sudo killall -9
remoted` has no terminal for the password in this session, so the sudo-free route was
    taken — `pymobiledevice3 diagnostics restart` (lockdown, no sudo). The phone was back on
    USB after ≈ 48 s; after the owner's first unlock since boot, `devicectl` reported
    `tunnelState: connected`, `ddiServicesAvailable: true`, and an xctrace App Launch
    recording completed in 47 s. The reboot also gives the cold-start row its "right after a
    reboot" condition (the Android series was taken the same way). Scheduled local
    notifications survive the reboot. Gotcha: `xctrace record --output <file.trace>` wrote
    `Launch_com.hourwell.app_<date>.trace` into the working directory instead (and the
    morning's hung attempt had left an empty stub there) — traces are moved to scratch and never
    committed.
38. **NFR-P2 cold start on the iPhone 12** (`hw-ios-coldstart.sh`, xctrace App Launch,
    15:15:51–15:20:31, traces in scratch): the launch phases of the probe right after the
    reboot and the first unlock (15:12) — process creation 413 ms, system frameworks 417 ms,
    static runtime 40 ms, UIKit init 32 ms, didFinishLaunching 41 ms, **Initial Frame
    Rendering complete at 0.95 s, Foreground-Active from 0.96 s**. Then 20 back-to-back
    launches (each terminates and relaunches the process; the binary is page-cached after
    the first): **n = 19 exported** (one trace's `xctrace export` segfaults twice),
    initial-frame → foreground-active **min 471 / p50 488 / p90 503 / max 611 ms** (the 611
    is launch 01). Same event as Android's `am start -W` first frame. Against the Pixel 7a
    (2026-09-01/03: p90 1582 → 1072 ms right after a reboot, ≈ 551 ms warm): the 2020
    A14 phone is faster than the 2022 mid-range Android in both conditions; the 2 s p90
    bound of the row holds here with 4× headroom. What this does NOT measure: the React
    Native side (Hermes bundle load, first React render of Today) — the initial frame is the
    launch screen; a JavaScript-ready figure (process launch → the app's first sync request)
    is being read from the live log separately.
39. **NFR-P2 timeline scroll on hardware** (16:02:21–16:02:41, xctrace "Animation Hitches"
    attached to the running app, the owner's thumb scrolling the 7-block Today up and down for
    ≈ 25 s; trace 255 MB in scratch): **`hitches` table: 0 rows** — no frame missed its
    display deadline in the app's commits; `hitches-frame-lifetimes`: 841 frames committed,
    lifetime (commit → on glass) p50 33.5 / p90 50.2 / max 52.8 ms = 2–3 vsyncs of pipeline
    latency at 60 Hz, none longer; `hitches-gpu`: GPU time per frame p50 2.92 / p90 3.43 /
    max 4.17 ms (≈ 20 % of a 16.7 ms frame); committed frames per second in the 15 active
    seconds 32–58 (mean 48) — the shortfall from 60 is the finger's reversals and pauses (a
    frame is committed only when the content moves), not late frames, which the hitch table
    would hold. `potential-hangs`: empty. First attempt (30 s) produced a 4.6 GB trace whose
    save my 150 s bound killed — the 20 s recording saved in 93 s; never bound an xctrace save.
    Against the Pixel 7a (0 janky of 1733 frames, frame time p99 10 ms): the A14 scrolls the
    same list without a hitch. The 60 fps row is a device-conditioned claim; this is one
    iPhone 12, one 7-block list, dark mode, default text size.
40. **Cold start, the React Native side, from the phone's log archive** (the 20 launches of
    item 38, `syslog collect` at 16:1x, `/usr/bin/log show --archive`, per-pid deltas from the
    process's first log line): UNUserNotificationCenter created at 2 ms; first network task
    resumed at **p50 172 / p90 179 ms** (framework-level, not the app's sync); the reminder
    scheduler's "Removing all pending notification requests" — a JavaScript call
    (`scheduler.ts`, after the store, the first sync and the plan are in hand) — at **p50 277 /
    p90 286 / max 346 ms**, and "Getting delivered notifications" at p50 289 ms; n = 20 for
    every marker. The process's first log line comes after dyld / pre-main (xctrace's
    "process creation" phase, ≈ 410 ms), so the app runs its own JavaScript logic at ≈ 0.7 s
    from process creation and shows its first (launch-screen) frame at ≈ 0.49 s. Not a
    "Today rendered" timestamp — the app emits no such line; the scheduler pass is the closest
    JS-side event the OS log carries. Earlier attempt at "SpringBoard: Process launched" lines
    found none in the archive's window; the per-process first line is the robust anchor.
41. **VoiceOver, the owner's ear (16:2x, ≈ 3 min):** the dialogs announce their title on open
    and read title → body → buttons with nothing beneath; the two-finger Z cancels; the
    replacement dialog's title is announced on its own; a card summary is followed by the next
    time label, never "Start" — item 35 confirmed by ear; a switch is read as on/off; the
    English strings in the Ukrainian voice are understandable, "a bit odd". No defect beyond
    item 35. NFR-A1's iOS rows are therefore covered by the daemon (order, strings, traits)
    plus this listen (announcements, gestures, voice).
42. **Google Calendar on the iPhone did not connect; the Pixel did.** Server (`gcal_sync_state`):
    the iPhone's account `7f088974` holds a row with a calendar id but `connected_at` /
    `confirmed_at` / `last_synced_at` NULL and no push channel — the consent (SafariViewService
    open 16:03–16:05, the "«Hourwell» wants to use google.com" system alert accepted) never
    returned a confirmation to the app: first attempt "Access blocked" (the OAuth client is in
    Testing and the phone's Google account is not a test user), the retry with the Pixel's
    account is not on the server either. The Pixel's fresh build-8 session (`9327f910`, created
    16:17:19) connected at 16:17:50 with a channel and one imported event (2026-09-18), last
    synced 16:25:02. So the two observations that follow are Android's, and the iOS
    calendar-disconnect dialog (site 2) stays pending on an iPhone consent that completes.
43. **Finding, MINOR (Android, callback screen):** `app/gcal-callback.tsx` shows "Google
    Calendar connected. Importing your meetings…" for both its `working` and `ok` states and
    never leaves on its own; "Back to settings" is the only exit. The owner waited ≈ 5 min while
    the import had finished ("Meetings synced 4 min ago" in Settings). Fix batch: distinct copy
    for `ok`, and `router.replace('/settings')` after the confirm resolves.
44. **Finding (both platforms, systemic) — a default or empty state renders before the first
    real read.** Reported by the owner on the Pixel: Settings shows "Connect Google Calendar"
    for a moment on every open, then flips to connected. Cause: `settings.tsx` holds
    `useState<GcalStatus | null>(null)` and fetches `gcalStatus()` in an effect; the render
    treats `null` as "not connected". The same shape, audited across the app (16:3x):
    - `useLiveRows` (src/db/useLiveRows.ts) reads in an effect by design, so every caller's
      FIRST render has `rows = []`: **Inbox** (`tasks.length === 0` → the empty-inbox state for a
      frame), **Focus** (`active[0] ?? null` → "Nothing running" for a frame even with a session
      running), **the task sheet** (`rows[0] === undefined` → the "not found" state for a frame
      on every open), **Insights** (belief rows → "assumed" before the label rows land; the
      document itself is seeded from a cache, so no flash there), **Today** (the plan rows use
      `useLiveRowsState.ready` since the 2026-09-02 fix; the recommendation / task / session /
      busy rows still start empty for the same frame).
    - Native and network tri-states held as `null`: Settings `permission` (`remindersOn =
block_reminders && permission === 'granted'` → the reminders switch renders OFF for the
      frame before the permission read), `exactness`, `gcal`; Today's `permission` /
      `exactness` (the nudge card's condition).
    - Safe by construction: the profile (`useCurrentProfile` reads synchronously in render and
      uses the rows hook only as a change subscription), hence the onboarding redirect; the
      Insights document (cache-seeded).
      **Shared fix, two mechanisms, not per-site patches:** (a) `useLiveRows` /
      `useLiveRowsState` take their FIRST read synchronously in the initial state (the sync
      expo-sqlite driver allows it — the profile hook already does) and re-read synchronously
      when the inputs change, keeping `ready` for the trigger; one file, covers Inbox, Focus, the
      task sheet, Insights and Today's secondary rows. (b) One `useLastKnown(key, fetcher)` for
      the tri-states: seed from the last value persisted in MMKV, refresh in the effect, and a
      render rule "unknown renders the neutral form, never the negative branch" — three sites
      (gcal, permission, exactness) plus Today's card. Both pinned by jest ("the first render
      carries rows", "null never renders the negative branch"). Fix batch.
      **Owner, 16:5x:** reopened the app on the Pixel — the calendar row shows "Connect Google
      Calendar" before flipping to connected there as well; the family is cross-platform by
      observation, not only by construction.
45. **Site 2, the calendar-disconnect dialog, on the Pixel 7a over adb** (16:40,
    `android-gcal-disconnect/`): Settings "Connected · Disconnect · Meetings synced 4 min ago" →
    Disconnect → its own window holds only the dialog's nodes — "Disconnect Google Calendar?"
    (title), "Imported meetings are removed from this device and Hourwell …" (body),
    "Disconnect" / "Keep connected" stacked → Keep connected → Settings intact, still
    connected, dialog gone. The iOS instance waits for a completed iPhone consent.
46. **Item 42 resolved by the session records** (16:41): `auth.sessions` — the connected account
    `9327f910` was created 16:17:19 from a session with user agent `okhttp/4.9.2` (Android: the
    Pixel 7a), the iPhone's `7f088974` from `Hourwell/1 CFNetwork/3860.700.1 Darwin/25.6.0`
    (iOS). The iPhone's `gcal_sync_state` row holds an unconsumed `oauth_state` started
    16:03:40 (expiry 16:13:40) and was never confirmed; the iPhone's pulled database holds only
    `7f088974` rows and no `calendar_events`; the iPhone's own Settings tree at 16:26:51 read
    "Connect Google Calendar". The "Connected · Meetings synced 4 min ago" screen the owner
    remembered is the Pixel's (the adb dump at 16:40 carries that exact wording). So the app
    does not show a connection the server lacks — that would have been a data-integrity
    defect (planning around meetings never imported) — and the account under observation was
    the right one throughout. The iPhone consent itself is the open item: a retry with the
    Pixel's Google account, watched by the session (WDA on the SafariViewService is possible),
    would show why the callback never returned.
47. **FR-50 today, from the OS's record** (archive to 16:1x + the live captures): "Persistent
    timer fired" for com.hourwell.app at **14:20:00, 15:05:00, 15:50:00, 16:42:00** — four
    deliveries; the 15:20 nudge (the block moved to 15:30) was in the 13:51 schedule but not
    in the one written after the reboot's first launch (15:12: two already delivered, five still
    queued → the planner kept 15:50, 16:50 and the ritual, dropping 15:20); 16:50 is pending as
    the day's fifth. The ritual was moved server-side to 16:42 (`hw-set-ritual-time.mjs`, seq
    4885; pulled by the device at 16:35, scheduler pass at 16:36; app terminated 16:37:2x; locked
    16:37:38) and **fired to a killed app on the locked phone at 16:42:00.010** ("current trigger
    date 16:42:00"; tomorrow's ritual inherited 16:42 and is restored to 20:00 after the owner's
    tap). The 14:20 one was captured on the lock screen (item 32); 15:05 and 15:50 arrived while
    the phone was in use (banners, unobserved); the ≤ 5 arithmetic holds so far — the 16:50
    fire and the absence of a sixth are read after 16:50.
48. **FR-26 on the iPhone, the killed-app variant — PASS** (16:42–16:47): the ritual fired at
    16:42:00.010 to the locked phone with the app not running (WDA `app terminate` 16:37:2x,
    state 1); the owner's long-press expanded it — "Plan tomorrow? 11 tasks are waiting — one
    tap plans your day." with the category actions **"Plan tomorrow" / "Adjust tasks"**
    (`shot-b1-lockscreen-ritual-card.png`, `shot-b1-lockscreen-ritual-actions.png`; the
    notification-category actions render on iOS — the empty-category bug of 2026-09-04 was
    Android-only); "Plan tomorrow" cold-started the app (SpringBoard Foreground 16:46:12.37) →
    the server holds **one plan for 2026-09-08 with trigger `evening_ritual`** (learned, service
    594 / total 790 ms, 11 recommendations, 16:46:14.90Z) and **one `notification_response`
    event** (`action: accept`, `kind: evening_ritual`, `variant: daily`, `scheduled_for`
    16:42:00, `latency_ms` 253 172 — the fire-to-tap delay) → Today shows **"Tomorrow is
    planned: 11 blocks, first at 09:00."** (`wda-today-after-ritual.xml`,
    `shot-b1-today-after-ritual.png`). Ritual time restored to 20:00 server-side (seq 4909) for
    tomorrow. The backgrounded variant and "Adjust tasks" → Inbox are not exercised on iOS
    (the Android day-2 run covered the backgrounded body tap).
49. **After the ritual: the schedule pass of 16:48:14** (the app pulled the 20:00 restore, seq
    4909, at 16:47): six pending — tomorrow's nudges **08:50 / 09:35 / 10:20 / 11:05** (the
    ritual plan's 09:00 / 09:45 / 10:30 / 11:15 blocks, the 10-minute lead), tomorrow's ritual
    **20:00**, and **today's ritual at 20:00 again** (request FD1A-28FB re-added). The 16:50 nudge
    was dropped (four delivered + the 20:00 ritual = five). So: (a) the cap held all day — the
    fifth slot went to the ritual, never a sixth; (b) **a possible defect on a rare path:** the
    ritual already fired and was answered at 16:42, yet moving the evening time back to 20:00
    re-created today's ritual — if it fires at 20:00 that is a second ritual on one calendar
    day, which the ledger's `ritual:<day>` id was meant to exclude (the Android day-4 note
    observed no second one after the same helper restored 20:00; the fire-then-restore order may
    be the difference). Read tonight from the log: a fire at 20:00 = defect; none = the ledger
    held. The owner leaves it untapped either way. Also observed: the scheduler runs its
    cancel-all → re-add pass on every 60 s poll (≈ 145 `UserNotificationsCore` lines per
    minute while foreground) — by design (settle → cancel → plan → schedule after every sync),
    cheap, cancel-first so a coincident fire is lost rather than doubled (P10 adversarial #4).
