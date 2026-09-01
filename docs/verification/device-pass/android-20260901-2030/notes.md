# Hardware pass — Android — Pixel 7a — running notes

Device: **Pixel 7a** ("lynx", mid-range 2023, Tensor G2), Android 17, security patch
2026-07-05, SIM present. Build: locally built release APK (`assembleRelease`, debug-keystore
sideload signing, Sentry upload disabled), installed 2026-09-01 via `adb install`.
Session: phase 1 (automated, session-driven) 2026-09-01 evening. All numbers in this
directory are from this physical device — never a simulator (CLAUDE.md "Simulator evidence").

## Phase 1 results (chronological)

- **UC-01 onboarding E2E — PASS on hardware** (`p4-onboarding.xml`, 3m36s): welcome → rMEQ
  (max-morningness) → hours → categories → seed quick-add → shell; anonymous bootstrap
  against the hosted project; relaunch lands in the shell (gate reads persisted profile).

## Device findings (flow tooling, not app bugs)

1. **maestro `scrollUntilVisible` + `centerElement: true` fails on real Android** when the
   target sits at the end of the scroll content (can never be centered → timeout →
   "not found"). Passed for months on the iOS simulator. Fixed: centering removed (2 spots,
   p4 flow).
2. **The soft keyboard covers buttons after `inputText`** on hardware (no on-screen keyboard
   exists on a simulator driven by a Mac keyboard). 'Finish setup' was under the Gboard.
   Fixed: `hideKeyboard` step (p4; also session inbox-build flow). UX note, not a defect:
   the button is reachable by dismissing the keyboard, which Android users do reflexively.
3. **Android tabs expose no ", tab" text** — iOS composes "Inbox, tab, 1 of 4" as the
   accessibility label; Android exposes plain "Inbox" (role via node class). All 11 tab
   selectors in the four e2e flows matched nothing on Android. Fixed: `'Name(, tab.*)?'`
   full-regex form, unambiguous because tabs are only ever tapped from a different screen.

## Phase 1 results (2026-09-01 evening, continued)

- **NFR-P2 cold start — PASS on the named device class.** Protocol: 20× `am force-stop` +
  `am start -W`, TotalTime (process start → first frame; JS hydration lands after — the
  metric device-pass.sh names). Two runs, both ≤ 2 s:
  - `cold-start-defaults.txt`: **p90 = 1582 ms** (1091–1754), default font/display,
    **immediately after a reboot** (cold OS caches) — the conservative headline number.
  - `cold-start.txt`: p90 = 552 ms (519–688) — earlier run, warm OS caches, but taken with
    max font + display scale still applied (sequencing slip, kept as a labeled data point).
  Steady-state UX likely sits between the two; both are Pixel 7a hardware numbers.
- **NFR-S1 session survives reboot — PASS.** `adb reboot`, relaunch: straight into the
  shell with the trial session intact (Keystore-backed storage; no PIN set on the device).
- **P3 quick-add on hardware — partial PASS.** NL preview ('report draft 2h by fri' →
  '120 min', 'by Fri…'), reactive row, full-sheet edit all verified via the p3 flow. The
  flow's tail (delete → undo-bar self-expiry ≤ 10 s) failed on device — the undo bar
  outlived the flow's wait. OPEN: human check in the attended block whether the 6 s
  auto-dismiss (File 02 §3) actually happens on hardware; then re-run the p3 tail.
- **Learned path — healthy; one transient fallback observed.** p6-live-smoke from the Mac:
  ALL PASS 15/15, `engine=learned model=recsys-p5.0`, OPTIMAL ×5 (~18:04 UTC). The phone's
  20:40 auto-plan (UC-03 trigger on foreground) hit `fallback` once (banner shown); VM and
  public healthz were healthy at probe time (200, 262 ms, container up 21 h). Later phone
  attempts were the **evening-empty case by design** (no feasible slot before day end → no
  plan row persisted → the ritual "Plan tomorrow?" card is the offered path); the fallback
  banner remained from the 20:40 attempt. WATCH: if fallbacks appear in the mid-day NFR-P1
  series, pull the plan-request EF logs.

## Device findings (continued)

4. **The a11y sweeps assumed a virgin 'No plan yet' Today** — on hardware the UC-03
   lazy trigger auto-plans on first foreground, and the evening empty state shows the
   ritual card instead. p2/p10 made state-tolerant (date-line assert; conditional
   'Plan my day' + wait for 'Re-plan'). The sweeps had never run on a device (P10 note).
5. **Undo-bar expiry timing differs on hardware** (see P3 above) — open, attended block.
6. **Stale fallback banner**: after a fallback attempt that yields no plan, the banner
   persists across later attempts that also yield no plan. Observation, arguably correct
   (it describes the shown state's provenance); noted for the owner's judgment, not filed
   as a defect.
