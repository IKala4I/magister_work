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
