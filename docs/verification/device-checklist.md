# Device verification checklist — real hardware, before P12

> Standing rule: CLAUDE.md "Simulator evidence" (owner directive 2026-08-26). Simulator runs
> are smoke checks; every entry here stays open until it passes on **one physical iPhone and
> one physical Android** in the owner-run hardware pass before P12. Add entries **during the
> phase that creates the obligation**, never retroactively. Each entry: the requirement, what
> to do on hardware, and why the simulator can't settle it.
>
> Status: ⬜ open · ✅ passed on hardware (date + device in the entry). Android has never run
> on hardware at all, so as of 2026-08-26 every entry is open on Android by definition.

## Performance

- ⬜ **NFR-P2 — cold start ≤2 s p90 on a mid-range 2022-class device** (added P2).
  Re-run the protocol in `p2-manual-verification.md` (`measure-cold-start.py`, Release build,
  ≥20 launches) on both devices. Simulator can't settle it: the existing p90 = 1075 ms was
  measured on an iPhone 17 Pro simulator on an M-series Mac, which is materially faster than
  the device class the requirement names (thesis-corrections item 11) — threshold met,
  condition not.
  **Android (Pixel 7a) ✅ 2026-09-01:** p90 1582 ms right after a reboot (1091–1754), 552 ms with warm OS caches — day-1 notes. iOS pending.
- ⬜ **NFR-P2 — 60 fps timeline scroll** (obligation lands at P6 when the Today timeline
  exists). Profile frame pacing on both devices with a realistic day (10+ blocks, glass
  blocks, Skia ring visible). Simulator can't settle it: desktop GPU + no thermal or memory
  pressure makes simulator frame rates meaningless.
  **Android (Pixel 7a) ✅ 2026-09-02:** 8-block Today, 59 swipes in 20 s, 1733 frames, 0 janky (legacy 0.40 %), frame time p50 5 / p90 7 / p95 8 / p99 10 ms (`device-pass/android-20260902-1030/gfxinfo-today-scroll.txt`); a ≥ 10-block morning re-run is still owed. iOS pending.

- ⬜ **NFR-P1 — plan end-to-end ≤ 2.5 s p95 warm, measured from the device** (added P6). On
  hardware with the HF Space warm: trigger ten manual re-plans on a 5–8-task inbox, read the
  `plan_requested.duration_ms` values (PostHog or a debug log) and report p50/p95 for BOTH the
  learned path and the fallback path. Why: the P6 numbers are Node-on-a-Mac → hosted edge
  function on the fallback path only (`docs/verification/p6-manual-verification.md`); TLS
  handshakes, radio wake-up and the JS bridge on a handset are not represented.
  **Android 2026-09-02, server side of the device series:** 10 manual re-plans on a 14-task day — edge-function total p50 1662 / p95 1908 ms, service p50 1475 / p95 1735 ms, 9 learned + 1 `fallback:timeout` (1908 ms against the 1900 ms budget: the 1.5 s CP-SAT cap leaves 0.4 s of headroom on a FEASIBLE day). The client-measured `duration_ms` lives in PostHog (HANDOFF ⛔ 5b) — not yet a device number.
- ⬜ **NFR-P2 — 60 fps timeline scrolling** (added P6). Scroll a 12-block Today timeline with the
  Perf Monitor open on a mid-range Android and an iPhone. Why: FlashList recycling and blur
  (`expo-blur` on iOS) cost nothing on an M-series Mac.

## Accessibility

- ⬜ **NFR-A2 — 200% font scale + reduced-motion sweep on both platforms** (added P2, extended
  P3). Re-run the 27-item sweep from `p2-manual-verification.md` plus the P3 screens (inbox,
  quick-add chips, task sheet, undo bar) with real OS settings. Simulator can't settle it: the
  sweep ran on the iOS simulator only; Android font scaling (up to 200% + display size) and
  its reduced-motion setting behave differently and have never been exercised.
  **Android 2026-09-02** (font 2.0, density 540, animation scales 0 over adb; screenshots in `device-pass/android-20260902-1030/a11y-maxscale/`): every screen usable; two defects — the Today time gutter wraps "12:00 PM" mid-token (fixed 64 px) and the heatmap weekday header wraps mid-word; the timeline viewport shrinks to about a third of the screen (scrolls, actions reachable). The p10 flow itself never passed its date assertion on any device (a YAML-quoting bug in the regex, fixed in the batch — day-2 finding 14), so the evidence is adb screenshots + tree dumps. iOS pending.
- ⬜ **NFR-A1 — VoiceOver (iOS) and TalkBack (Android) pass on all shipped screens** (added
  P2/P3; grows each UI phase). Navigate every screen by screen reader alone: task rows (single
  a11y element incl. ", due <date>"), ambiguity chips, undo within its 6 s window. Simulator
  can't settle it: simulator VoiceOver diverges from device behaviour (focus order, gesture
  handling) and TalkBack has no simulator equivalent that counts.
  **Android 2026-09-02, structural half (uiautomator tree):** task rows are one element with the composed label; block cards one focusable element ("title, start to end, Experiment, Confidence N percent", inner texts not focusable); Settings switch checkable + checked, mute chips CheckBox with full labels; heatmap one ImageView carrying the daypart summary. Finding: tab labels carry the icon glyph before the name. The TalkBack listening pass is the owner's.

- ⬜ **FR-22 / NFR-A2 — Today timeline at 200 % font scale and with reduced motion** (added P6).
  Set the OS text size to maximum and Reduce Motion on; open Today with ≥ 6 blocks incl. one
  "Experiment" block and a two-line rationale: no clipped text, no overlapping cards, the "Now"
  marker readable, the time gutter intact. Why: the row-list timeline was designed for this but
  only exercised at 1× in jest; the simulator's Dynamic Type differs from device rendering.
  **Android 2026-09-02:** no overlap, Now marker readable, experiment block + two-line rationale wrap; the time gutter breaks the clock mid-token (defect, fix batch); the list viewport is small under the two-line date header.
- ⬜ **NFR-A1 — VoiceOver / TalkBack reading order on Today** (added P6). Swipe through: header
  → Plan/Re-plan button → planning banner (progressbar) → fallback notice (if any) → each block
  as ONE element announcing "title, start to end, Experiment, Confidence N percent" (no percent
  on heuristic rows) → deferred summary. Why: composed labels and `accessible` grouping are not
  verifiable without a real screen reader.

## Behaviour the simulator under-tests

- ⬜ **FR-11 — quick-add with real keyboards/IMEs** (added P3). Type NL inputs with the on-screen
  keyboard, autocorrect on, on both platforms (incl. a Ukrainian keyboard once i18n lands).
  Simulator can't settle it: development happens with the Mac hardware keyboard, which bypasses
  autocorrect, suggestion bars, and IME composition.
  **Android ✅ 2026-09-01/02:** real Gboard with autocorrect; Ukrainian input keeps the whole string as the title and shows no chips (documented limitation); the autocorrect-acceptance chip refresh (day-1 #8) is still attended; placeholder clip defect (day-1 #7) in the fix batch.
- ⬜ **Glass/blur recommendation blocks — Android fallback path** (obligation lands at P6,
  File 02 §3). Verify the blur (or its documented fallback) renders correctly and doesn't tank
  frame rate on the Android device. Simulator can't settle it: blur cost and fallback selection
  are GPU/driver-dependent, and Android has never run on hardware.
  **Android ✅ 2026-09-02:** opaque dark cards render (no blur), dashed experiment outline, 60 fps held (row above).
- ⬜ **FR-25/UC-07 — drag-to-teach gestures + haptics** (obligation lands at P7). Drag blocks
  with a finger: activation distance, long-press timing, haptic feedback on grab/snap/commit.
  Simulator can't settle it: mouse input is not touch (no finger occlusion, different velocity
  profiles) and the simulator has no haptics engine at all.
- ⬜ **Invariant 7 — lazy lapse scan under real iOS background restrictions** (obligation lands
  at P7). Background the app for hours/overnight, re-foreground, verify the scan-and-attribute
  path with the app genuinely suspended/jetsammed. Simulator can't settle it: the simulator
  does not enforce real iOS suspension, background-refresh throttling, or memory eviction.

- ⬜ **UC-03 triggers on a real day boundary** (added P6). Leave the app in the background across
  05:59 → 06:00 local and across midnight; foreground it: a new plan must be requested exactly
  once per plan day (`plan_requested` with `trigger = new_day`), never while backgrounded. Why:
  the simulator's clock and AppState transitions do not reproduce iOS background suspension.
  **Android 2026-09-02 — DEFECT:** every cold start re-requests with `first_open` although today's plan is persisted (`useLiveRows` starts empty, so the trigger decides before the first read; the session dedup is ephemeral) — 4 extra plans in 5 minutes, the day-1 30 rows had the same cause. The overnight `new_day` check is still owed; fix batch.
- ⬜ **NFR-R1 — Today offline** (added P6). Airplane mode after a plan exists: the plan still
  renders from SQLite; "Re-plan" shows the offline/error notice without clearing the plan. Why:
  simulator network loss is not real radio loss.

## Feedback loop (P7)

- ⬜ **FR-30 — a running focus session survives lock / app kill / relaunch** (added P7). Start a
  session, lock the phone for 10 min, relaunch from the app switcher and from a cold start: the
  Focus tab must show the session still running with the elapsed time including the locked
  minutes (the row lives in SQLite; the display re-derives from `lastResumedAt`). The simulator
  never suspends JS the way iOS does under lock/Low-Power mode.
  **Android ✅ 2026-09-02 (Pixel 7a):** the 11:58 session outlived a 2 h lock and a cold start (164.5 focused minutes = wall time, then the designed 2 h abandon rule closed it); a second session survived `am force-stop` + relaunch within the cap (Focus still running). Day-2 notes 19.
- ⬜ **File 05 §1 — lazy lapse scan on foreground after a real background stint** (added P7).
  Leave a block to expire while the app is in the background for > 30 min, foreground: the block
  must read "Not done — back in your Inbox" and the Inbox must list the task; then confirm the
  `lapse_observed` row reached the server (Table Editor). The simulator's AppState transitions
  are instantaneous and never involve OS-level suspension.
  **Android ✅ 2026-09-02 (server half):** after a 103-min stint the first foreground logged `lapse_observed` for both ended blocks (0.71 h / 1.46 h after their ends); the "Not done" row was not observable because the same foreground re-planned (client defect, fix batch F1). Re-check the UI text on the rebuilt APK.
- ⬜ **NFR-A1 — VoiceOver/TalkBack on the block action row and the rating chips** (added P7).
  Each action must announce "Skip write report" style labels; the rating chips must be
  reachable in order and announce "Rate your energy: High"; the progress bar must announce its
  value. Screen readers are not exercised on the simulator.
- ⬜ **NFR-A2 — 200 % font scale on the Today card with actions and on the Focus tab**
  (added P7). Four action buttons and the status caption must wrap, never clip or overlap the
  next block; the timer digits (JetBrains Mono) must not overflow the panel. The P2 sweep ran on
  the simulator only.
- ⬜ **NFR-R1 — facts logged offline reach the server later** (added P7). Airplane mode: start,
  pause, finish a session, skip another block, rate; go online, foreground: the `events` rows
  must appear once (no duplicates — `UNIQUE(user_id, op_id)`), and `attribute-rewards` must
  return the derived statuses (Table Editor → `recommendations.status`). Simulator network loss
  is not genuine network loss.
- ⬜ **DST — the device clock crossing a transition** (added P7). Set the device date to the
  Europe/Kyiv fall-back night (2026-10-25 03:59 → 03:00) with a block spanning it: the lazy scan
  must not lapse it early and the 23:55 attribution must fire once for that local day (pgTAP
  covers the SQL; the device's own wall clock is what the client's `local_day` uses).
- ⬜ **UC-07 Move picker on Android** (added P7). The native time picker must return a value
  snapped to the 15-min grid and the moved block must re-render in slot order; the Android
  picker was never rendered on hardware (iOS-first development).
  **Android ✅ 2026-09-02 (partial):** Move sheet → Android TimePicker (radial + keyboard mode) → "Move here" → the block re-renders in slot order and the server row is `moved` (17:30–18:00). The snap from an off-grid minute is still attended (type 5:37 by hand; expect :30/:45).

## Auth & identity

- ⬜ **FR-01 — magic-link deep linking from real mail clients** (added P4). Request a link on
  the device, open it from Mail (iOS) and Gmail (Android); verify the hourwell://auth-callback
  handoff, the one-shot-code guard (tapping the link twice), and a cold-start arrival (app
  killed before tapping). Simulator can't settle it: there is no real mail client on the
  simulator, and link-preview fetchers, in-app browsers, and Android App Links/verified-domain
  behavior only exist in real mail apps on hardware.
- ⬜ **FR-01 — anonymous→email conversion end-to-end** (added P4). Convert the trial account
  from Settings, open the confirmation link, verify the uid is unchanged and local data
  survives. Same mail-client dependency as above; also requires a real mailbox (owner action
  in `p4-manual-verification.md`).
- ⬜ **NFR-S1 — session survives reboot/lock via keychain/keystore** (added P4). Sign in,
  reboot the device, relaunch: session restored without re-auth; on Android verify the
  Keystore-backed value survives an OS-forced app kill. Simulator can't settle it: simulator
  keychain is a file-backed shim without Secure Enclave/Keystore semantics or device
  lock-state interactions.
  **Android ✅ 2026-09-01:** `adb reboot` → straight into the shell with the trial session (no PIN set).

## Sync & notifications

- ⬜ **NFR-R1 — offline→reconnect with real radios** (local half P3; **full obligation from
  P8** — the engine exists now). Airplane mode mid-write, radio-dead zones, flaky LTE→wifi
  handoff; then reconnect and verify: the `expo-network` reconnect trigger fires
  (`sync_completed` with reason `reconnect`), outbox replay acks everything, a replayed batch
  is `duplicate`, a stale `base_version` merges and replays (Settings shows "Up to date", 0
  changes waiting). Simulator can't settle it: simulated network loss is a clean socket cut on a
  stable host — no radio renegotiation, captive portals, or partial connectivity; `isConnected`
  semantics differ per platform (Android needs a validated network).
  **Android ✅ 2026-09-02** (Wi-Fi + mobile data off, `Active default network: none`): quick-add offline → Settings "Offline — changes are queued", "2 changes waiting" → radios on → "Up to date" within 10 s with no foreground change; server `server_ts` 51 s after `client_ts`, exactly one `task_created`. Caveat: airplane mode alone is NOT offline on this Pixel (Wi-Fi stays on).
- ⬜ **File 05 §2 on two real devices (P8).** Same account on the iPhone and the Android: edit
  one task on both while one is offline → on reconnect the field-level merge (newest edit per
  user-owned field, `done` never regresses) and no duplicate rows; complete a block on one while
  the other shows it displaced → both converge to `completed` with the "meeting kept" notice.
  Simulator can't settle it: one simulator is one install; the P8 tests fake the second device.
- ⬜ **Background → foreground sync timing (P8, invariant 7).** Put the app in the background
  for > 10 min, change a task on the other device, foreground → the pull lands before the Today
  list re-renders (no stale block actions); iOS may have suspended the JS timer — the foreground
  trigger, not the 60 s poll, must carry it. Simulator can't settle it: iOS background
  suspension and Android Doze exist only on hardware.
- ⬜ **Google Calendar consent round trip on device (P8, FR-03).** Settings → Connect → system
  browser → consent → `hourwell://gcal-callback?status=ok` opens the app (cold and warm start)
  → Settings shows "Connected"; then a meeting created in Google over a planned block shows as
  a busy row and displaces the block within one foreground (server-side ≤ 5 min, UC-09). Needs
  the owner's Google Cloud gate first, and a build with the `hourwell` scheme (Expo Go's
  `exp://` scheme never receives the redirect; the function always redirects to
  `hourwell://gcal-callback`). Simulator can't settle it: the custom-scheme redirect from
  Safari/Chrome and the ASWebAuthenticationSession / Custom Tabs behaviour differ from the
  simulator's browser. **Server side done 2026-08-29** from a headless user
  (`p8-manual-verification.md` §2.3) — what remains is exactly the device part: the redirect
  opening the app (a desktop browser silently stalls on the `hourwell://` 302), the confirm
  firing from the app, the busy row + "meeting" caption at the next foreground; plus the
  week-long items on a real account: push-channel renewal at day 7 and, while the consent
  screen is in Testing, the refresh-token expiry at day 7.
- ⬜ **Deferred-wipe banner (P8, ADR-0012 §11).** Sign in as account A, create a task offline,
  sign in as account B (magic link) → the banner offers Keep / Discard; Discard removes A's rows
  only; sign back in as A after Keep → A's task is still there and syncs. Simulator can't settle
  it: needs two real mailboxes for the magic links (P4 gate).
- ⬜ **FR-50 — notification delivery + hard ≤5/day cap** (obligation lands at P10). Real APNs
  and FCM delivery, lead times, per-category mute, and the cap under a storm, with the app in
  every lifecycle state; Android channel behaviour and OEM battery-optimization interference.
  Simulator can't settle it: iOS simulator push is a development shim, FCM needs a real
  device, and delivery timing under Doze/Low-Power mode only exists on hardware. **P10 note:** the
  shipped FR-50 is **local** scheduled notifications (ADR-0014) — no APNs/FCM is involved
  and no push entitlement is needed (free-provisioned builds qualify); the concrete
  protocol is the P10 section below.

### Trust surfaces (added P9)

- ⬜ **FR-40 / NFR-A2 — the energy heatmap at 200 % font scale on both platforms** (added P9).
  Open Insights with the largest accessibility font: the hour gutter (fixed 32 px) and the
  weekday header must not clip or overlap the cells; the legend, the category chips and the
  "Show as text" toggle must wrap, not truncate. Why the simulator can't settle it: Android's
  display-size + font-scale combination has never run on hardware, and iOS Dynamic Type
  rendering of the mono hour labels differs on device.
  **Android 2026-09-02:** hour gutter and cells intact, chips wrap to two rows; the weekday header wraps mid-word ("M/on", "Tu/e") — defect, fix batch.
- ⬜ **FR-40 / NFR-A1 — VoiceOver and TalkBack on the heatmap** (added P9). With the screen
  reader on: the grid must read as ONE element with the best/lowest daypart summary; the cells
  and hour labels must not be announced individually; "Show as text" must expose every daypart
  row. Why: `accessible` grouping and `importantForAccessibility` behave differently on real
  TalkBack (Android has never run on hardware).
  **Android 2026-09-02, structural:** the grid is one ImageView with the best/lowest daypart summary; hour and weekday labels are non-focusable texts. Listening pass = owner.
- ⬜ **FR-41 — ✓/✗ toggles: 44 px targets, `selected` state announced, "pending" caption read**
  (added P9). Tap each toggle by screen reader; confirm the label state sentence and the
  "Saved — applies at the next sync" caption are read; confirm nothing renders red (invariant
  14). Why: touch-target hit-testing and state announcements are device behaviours.
- ⬜ **FR-24 — trade-off sheet on a real over-committed day** (added P9). Pin two blocks on the
  same slot (Move… + pin) and re-plan; the sheet must appear inline (never modal-blocking),
  options in the server's order; choose one → the re-plan runs and the sheet does not return;
  "Keep it as is" is a quiet secondary button. Why: the flow crosses the real network (task op →
  re-plan) and a real keyboard/gesture path the jest render cannot exercise.
- ⬜ **NFR-A2 — reduced motion on Insights** (added P9). With Reduce Motion on: the refresh and
  the category switch must not animate (there are no animations by design — confirm none are
  introduced by the platform ScrollView/Pressable defaults). Why: OS-level reduced-motion
  hooks are not represented on the simulator.

### Notifications, privacy, performance (added P10)

- ⬜ **FR-50 — reminder delivery and the ≤ 5/day cap on hardware** (P10). Plan a day with ≥ 6
  blocks, grant the permission from the Today card, lock the device: the first four reminders
  arrive 10 min before their blocks, the fifth slot is the 20:00 ritual; re-plan twice and change
  a mute during the day → never a sixth notification (iOS: also with Focus modes; Android: also
  under Doze / battery saver, note the OEM). Why: the ledger is proven in jest against a faked
  OS; real delivery, coalescing and OS-side dropping only exist on hardware.
  **Android 2026-09-02, scheduling half:** after every plan exactly 4 block alarms + the 20:00 ritual are pending (cap 5); delivery times being read from `dumpsys notification`; the phone is on USB power all day, so the Doze case needs an unplugged owner run.
- ⬜ **FR-50 — Android exact-alarm semantics of the DATE trigger** (P10). On API 31+ confirm a
  reminder lands within a minute of `slot_start − 10 min` without `SCHEDULE_EXACT_ALARM`; if the
  OEM defers it by more, record the drift for the thesis (ADR-0014 Consequences). Why: inexact
  alarm windows are device/OEM policy.
  **Android 2026-09-02:** the triggers are inexact `RTC_WAKEUP` alarms with Android's 75 % window — +7 m 27 s for a 10-min lead, +41 m at 55 min ahead, +1 h beyond; no `SCHEDULE_EXACT_ALARM` in the manifest. Measured drift to follow (ADR-0014 Consequences).
- ⬜ **FR-26 — ritual actions from every app state** (P10). At the ritual time with the app
  KILLED: tap "Plan tomorrow" → the app cold-starts, plans tomorrow (one `plan_requested` with
  trigger `evening_ritual`, one `notification_response` fact), Today shows the tomorrow line;
  "Adjust tasks" opens the Inbox; a plain tap on a Sunday opens Insights. Repeat with the app
  backgrounded. Why: `useLastNotificationResponse` vs the listener and category action buttons
  behave differently per platform and cannot be exercised in jest.
  **Android 2026-09-02 (build 3):** the 20:00 ritual notification was delivered (visible by 20:14:41; +1 h inexact window); the backgrounded-app tap is the owner's tonight, the killed-app variant tomorrow evening.
- ⬜ **FR-42 — export on device** (P10). Settings → Export → the share sheet offers Files/AirDrop
  (iOS) or the share targets (Android); the saved JSON opens; it contains the tasks, events, the
  48 Beta cells and no calendar `title`. Why: `expo-sharing` + the cache-directory file are
  native paths; the share sheet itself has no simulator equivalent worth counting.
  **Android 2026-09-02 — BLOCKED by a MAJOR defect:** the Settings screen has no scroll container, so "Export my data" is unreachable on a phone (day-2 notes 23; fix batch F8). Re-run on the rebuilt APK.
  **Android 2026-09-02 (build 3):** Settings now scrolls to My data; the share-sheet screenshot is being redone (the first flow's wait matched the hint text). Erasure stays last.
- ⬜ **FR-42 — erasure on device** (P10). Settings → Delete (two confirmations) → the
  confirmation screen with a reference → relaunch → onboarding; notifications scheduled before
  the deletion never fire afterwards; the reference exists in `deletion_audit` (owner: an
  aggregate `count(*) where id = …` — no row browsing). Why: the local wipe + `signOut(local)`
  - cancelled notifications is a device lifecycle path.
    **Android 2026-09-02:** same blocker as export (Settings unscrollable); deliberately last in the pass anyway.
- ⬜ **NFR-A1 — VoiceOver / TalkBack on the P10 surfaces** (P10). Settings: switches announce
  label + state; mute chips read "checkbox, Mute reminders for Admin, checked"; ritual time
  chips read as radios in a labelled group; the export/delete status line is announced
  (live region). Today: the reminders card and the tomorrow card are single summaries with
  two buttons each. Account-deleted: the reference is read as a whole. Why: composed labels
  and live regions are not verifiable without a real screen reader.
- ⬜ **NFR-A2 — `p10-a11y-sweep.yaml` on both devices** (P10). Run via `scripts/device-pass.sh`
  at max text size (Android: + display size) with Reduce Motion (+ Reduce Transparency on iOS),
  light and dark; keep the screenshots for `p10-a11y-audit.md` §2. Why: the flow was written
  in P10 but not executed — it needs a development build with the notification categories.
  **Android 2026-09-02:** the flow fails on its date assertion regardless of scale (single-quoted YAML turned the regex into a literal backslash-w; fix batch F5) — evidence captured with adb screenshots instead (`a11y-maxscale/`); re-run on the rebuilt APK.
- ⬜ **NFR-P2 — cold start and 60 fps on the P10 bundle** (P10). `device-pass.sh` steps 3–4
  (Xcode App Launch / `adb am start -W`, Instruments FPS / `gfxinfo`). Why: the bundle grew
  (notifications, sharing); the only number is the P2 simulator one.
  **Android ✅ 2026-09-01/02:** the two numbers above are on the P10+ bundle (release APK versionCode 1).
- ⬜ **NFR-P3 from a handset** (P10). Re-run `p10-perf.mjs`'s REST read/write over LTE and Wi-Fi
  from the device network (a Node script cannot run on the handset — use the app's
  `sync_completed` durations from PostHog for `sync-resolve`, and time one `export-data` from
  Settings). Why: the Node numbers exclude radio wake-up and mobile TLS.

### Fix-batch re-verification (added post-P12 hardware pass, 2026-09-02 — after the APK rebuild)

- ⬜ **UC-03 — exactly one automatic plan request per plan day across cold starts** (fix batch
  F1: `ready` gate on the live reads + durable MMKV dedup). On the rebuilt APK with today's plan
  persisted: `am force-stop` + launch ×20 → the server shows NO new `first_open`/`new_day` row;
  then the overnight case: backgrounded across midnight → the first foreground after 06:00 adds
  exactly one `new_day` row. Why the simulator can't settle it: the defect only shows on a real
  cold start of the release process (the first render of the live read is empty).
  **Android ✅ 2026-09-02 (build 3, Pixel 7a):** with today's plan persisted, the first open and 20 `am force-stop` + launch cycles added zero plan rows (18 → 18 → 18) on a build with a proven backend. Overnight `new_day` and the offline-first-open retry still owed.
- ⬜ **NFR-P2 — cold start ×20 on the rebuilt APK** (the day-1 protocol; the p90 must be
  re-stated for the binary that ships the fixes and the Expo patch bump).
  **Android 2026-09-02 (build 3):** p90 551 ms (505–622) with warm OS caches; the post-reboot run on this build is still owed (build 1's post-reboot p90 was 1582 ms).
- ⬜ **FR-22 / NFR-A2 — Today time gutter at 200 % + largest display** (F2): the clock stays
  on one line, the gutter grows, cards do not overlap. Take the same `a11y-maxscale/` screenshots.
- ⬜ **FR-40 / NFR-A2 — heatmap weekday header at 200 %** (F3): two-letter labels, one line,
  the summary label unchanged.
- ⬜ **FR-11 — quick-add at default and 200 % scale** (F4): the short placeholder and the example
  caption fit, the border renders evenly, the caption swaps for the preview chips while typing.
- ⬜ **NFR-A1 — TalkBack reads the tab as its name only** (F6): the tree label is "Today", not the
  icon glyph first; the owner's listening pass confirms the announcement.
- ⬜ **Maestro p3/p4/p10 flows on hardware** (F5): the `(?i)` title selectors pass end to end on
  the rebuilt APK (p3 tail incl. the undo expiry; p10 at max scale needs adb screenshots — see
  day-2 finding 14).

## Service environment (Oracle A1 VM, container pinned to `cpus: 2` — ADR-0009) — same honesty rule, different box

Timing measured on the development Mac is a smoke check, not evidence for the container File 04
§1.5 names ("meeting NFR-P1 on 2 vCPU"). These flip only after a measurement on the deployed
container. **2026-08-27:** the host is the Oracle Always Free A1 VM (ADR-0009); `compose.yml`
pins the service to `cpus: 2` so `bench_solve.py` inside it measures the box File 04 §1.5 names.
Every item below stays ⬜ until the first deploy completes (HANDOFF ⛔ 1–7) — Mac numbers are
never substituted. Command: runbook `docs/runbooks/oracle-vm.md` §7.

- ✅ **NFR-P1 — /plan service budget on the real container** (added P5; **measured 2026-08-28**
  on `recsys-oracle`, container pinned to 2 cores — `p5-manual-verification.md` §2.1). Day
  instance: OPTIMAL 20/20, end-to-end p50 135 ms / p90 487 ms — met with margin. Week stress
  instance: UNKNOWN 19/20 under the Mac-fitted threshold, ≈ 2.0 s p50 — the threshold re-fit
  below. (The service-side number; the client-observed p95 through the edge function is the
  P6 smoke item, HANDOFF ⛔ 7.)
- ✅ **File 04 §1.5 practical literal threshold** (added P5). **Re-fitted 2026-08-28 on the
  deployment box:** 8·10³ (Mac) → **3·10³** (the 15-min week rung is presolve-bound at 3.6·10³
  literals on the A1); sweep in `p5-manual-verification.md` §2.2, shipped as PR #13 and
  re-measured with the rolled-out image in §2.3 (week FEASIBLE 13/20, 1.35 s p50; day unchanged).
  The residual ≈ 35–40 % UNKNOWN on 50-task week plans is a capacity limit of the box, recorded
  for the thesis (corrections #37) and for P9 (revisit.md).
- ✅ **UC-03 A1 — kill the service, verify the fallback** (added P6; **done 2026-08-28** on the
  VM, `p7-manual-verification.md` §2c): `docker compose stop recsys` → `engine = heuristic`,
  `reason = fallback:http` (Caddy 502), p95 1.73 s < 1.9 s budget; restart → `learned` within
  15 s. Not covered: a whole-VM outage (`fallback:timeout|network` — same path, longer wait up
  to the budget) — exercise once from the OCI Console (Stop instance) before enrollment.
- ➖ **Cold start of the Space** (added P5, NFR-R2) — **not applicable since ADR-0009**: the VM
  is always on (no sleep, no wake probe); what remains is the warm p95 through the edge function
  (HANDOFF ⛔ 7, `p6-manual-verification.md` §3) and the DB pool's first connection, covered by
  the first-vs-second-run comparison there.

## Service environment — training container (added P11, ADR-0015; VM-run, before enrollment)

- ✅ **Nightly training run live on the VM** (manual runs 3× 2026-08-31 —
  `p11-manual-verification.md` §2; **first timer-fired run 2026-09-01 00:33 UTC**, clean
  finish): `journalctl -u hourwell-train` shows the completed scheduled run;
  `reports/2026-09-01/report.json` in the `models` bucket (names-only query);
  `model_registry` gated rows proven on the 2026-08-31 manual runs (the 2026-09-01 run
  recorded nothing by design — no cell cleared the refit guards).
- ✅ **MC backfill on live rows** (2026-09-01, first scheduled run on the migrated
  project): 1 filled through the service's own scoring (under the P12 `recsys_service`
  role), 9 remaining nulls — **all 9 belong to users with no `bandit_state`** (privacy §7
  aggregate), i.e. the skipped-by-design day-0 class of `p11-manual-verification.md` §2
  run 3. The original "→ 0" expectation assumed a cohort without day-0 users; the real
  invariant — **zero eligible rows left unfilled** — holds.
- ✅ **Rollout picks up the training image** (2026-09-01): the installed
  `hourwell-rollout` runs `docker compose --profile training pull`;
  `ghcr.io/ikala4i/hourwell-training:latest` is present on the box via that path.

## Release builds — EAS (added P12)

- ⬜ **Standalone release build installs and runs on both devices — account-free scope**
  (added P12; re-scoped 2026-08-31 per the owner's store decision, metadata §7: no
  developer accounts). Android: locally built release APK (`npx expo prebuild -p android`,
  `./gradlew assembleRelease`), sideloaded. iOS: free-provisioned **Release-configuration**
  build on the owner's iPhone (`npx expo run:ios --device --configuration Release`; 7-day
  signature — re-sign for week-long observations). On each: one full day loop (plan →
  focus → skip → sync). Why the simulator can't settle it: no Release/standalone binary
  has ever run on hardware, and notification categories + deep links behave differently
  outside the dev client. **Blocked-by-decision residual (recorded, not open work):** an
  EAS-built, store-signed iOS binary (App Store signing, TestFlight-installed standalone
  behaviour) cannot exist without the $99 membership — if the decision is ever reversed
  (revisit.md), re-verify categories + deep links on that binary before any iOS
  participant.
  **Android 2026-09-01/02:** the locally built release APK runs the full loop (plan → focus → skip/lapse → sync) on the Pixel 7a; iOS not started.
- ⬜ **Store screenshots captured on hardware** (added P12; **optional** since 2026-08-31 —
  the pack stays prepared-but-unsubmitted, metadata §7). Capture only if wanted for a
  thesis appendix; nothing gates on it.
