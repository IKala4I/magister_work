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
