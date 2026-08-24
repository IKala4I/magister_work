# P2 manual verification — mobile shell

Run on the iOS simulator (`npx expo run:ios` in `apps/mobile`) or a dev build on device.
Items marked **[device]** are only meaningful on physical hardware.

## Shell & navigation

- [ ] App launches to the **Today** tab; splash shows the Hourwell icon on the correct
      background in both light and dark OS themes.
- [ ] Tab bar shows Today · Inbox · Focus · Insights with icons; active tab tints indigo
      (`#4F46E5` light / `#818CF8` dark).
- [ ] Each tab renders its empty state (calm copy, no error styling — skip/empty is never
      red).
- [ ] Gear button (top right, every tab) opens **Settings** as a modal; it is comfortably
      tappable (≥44 px).

## Appearance

- [ ] Settings → Appearance: System / Light / Dark rows with a check on the active one.
- [ ] Selecting Dark flips the whole shell immediately (surface `#0F1115`, text `#EDEEF2`).
- [ ] Kill and relaunch: the preference survives (MMKV flag).
- [ ] With System selected, toggling the OS appearance flips the app.

## NFR-A2 — font scaling & reduced motion

- [ ] Set OS text size to maximum (≈200%): all shell screens remain readable, nothing
      clipped or overlapping; tab labels may truncate but never overlap.
- [ ] Settings rows still fit and stay tappable at 200%.
- [ ] Enable "Reduce Motion" in OS accessibility: navigation transitions become instant/fade;
      nothing depends on an animation completing.

## NFR-P2 — cold start (≤2 s p90)

Protocol (physical device, release-mode dev build; simulator numbers are advisory only):

1. Build once: `npx expo run:ios --configuration Release` **[device]**.
2. Kill the app. Launch from the home screen; stop timing at the Today empty state fully
   rendered. Screen-record at 60 fps and read frames if hand timing is too coarse.
3. Repeat for **10 cold launches** (kill between launches; do not reboot).
4. p90 = 9th slowest of 10. PASS if ≤ 2.0 s.
5. Cross-check the JS half in the Metro/console log: `[startup] js-start → first-frame: N ms`
   (emitted in dev builds by `src/observability/startup.ts`).

Record results in this file's PR or the phase report. Once the Sentry EU org exists, native
app-start spans replace hand timing.

## Database

- [ ] First launch applies the local migration silently (no error screen); relaunch is
      equally silent (idempotent).
