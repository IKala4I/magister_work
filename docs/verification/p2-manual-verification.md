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

---

## Results — 2026-08-24 (P2 carry-over, executed at the start of P3)

Environment: iOS simulator (iPhone 17 Pro, iOS 26.5, Xcode 26.6, M-series host), **Release**
configuration built with `SENTRY_DISABLE_AUTO_UPLOAD=true` and the startup-marker env var.
Physical-device re-check remains part of P10's formal pass (owner accepted simulator numbers
for this gate). Automation: `measure-cold-start.py` (this folder) for NFR-P2;
`apps/mobile/e2e/p2-a11y-sweep.yaml` (Maestro 2.8.0) for the NFR-A2 walk.

### NFR-P2 — cold start (target ≤ 2000 ms p90) — ✅ PASS

10 measured cold launches (after a warm-up launch that applied the migration; app killed
between launches): 1064, 1063, 1066, 1078, 1063, 1079, 1031, 1082, 1069, 1064 ms.
**p90 = 1079 ms, median = 1065 ms.** JS half (js-start → first frame) ≈ 50 ms per launch.
Timing = `simctl launch` invocation → first root frame (marker ping), which _overstates_
user-perceived time by the simctl spawn overhead — conservative pass.

### NFR-A2 — 200% font scale, reduced motion, reduce transparency — ✅ PASS (after one fix)

Settings during the sweep: `content_size accessibility-extra-extra-extra-large` (beyond
200%; ThemedText caps rendering at exactly 200%), ReduceMotionEnabled=1,
ReduceTransparencyEnabled=1, light + dark.

- **Finding (fixed in this commit):** the tab-shell header title scaled unbounded and
  clipped at accessibility sizes — the JS header bar has a fixed height. Fix: header titles
  render via `ThemedText` pinned at 1×, matching UIKit's own non-scaling nav-title
  convention; screen content keeps scaling to the 200% cap.
- After the fix, all four tabs + Settings modal: readable, nothing clipped or overlapping;
  tab labels intact; empty-state copy wraps correctly (screenshots in the Maestro artifacts).
- Appearance control exercised at max scale via Maestro taps (Dark → shell flips
  immediately, System → restored): rows remained tappable — functional ≥44 px proof.
- Reduced motion on for the whole sweep; every navigation completed without depending on an
  animation. No glass surfaces exist in the shell yet, so reduce-transparency had nothing to
  degrade (GlassPanel's opaque fallback is unit-tested; visual check re-runs in P6).

### Shell & database checklist

Today/Inbox/Focus/Insights + Settings walked by the Maestro flow (assertions on each
screen's copy); splash/launch fine across 20+ launches during measurement; migration applied
on first launch and silent on every relaunch (all cold starts reached the Today empty state).

---

## Re-run — 2026-08-24, first build with real Sentry + PostHog keys present

Repeated from a clean start after the observability keys landed in `.env`, on a fresh
install (`simctl uninstall` + `install`, so first-launch migration ran again). Same
environment and protocol as above.

### NFR-P2 — cold start — ✅ PASS (p90 = **1075 ms**, target ≤ 2000 ms)

Three 10-launch runs, all well inside budget:

| build                                     | times (ms)                                        | median | **p90**  |
| ----------------------------------------- | ------------------------------------------------- | ------ | -------- |
| before the observability keys existed     | 1064 1063 1066 1078 1063 1079 1031 1082 1069 1064 | 1065   | 1079     |
| with Sentry + PostHog keys live           | 1056 1059 1072 1070 1075 1066 1062 1073 1069 1068 | 1069   | 1073     |
| **committed HEAD (06c8c79)** — the number | 1066 1061 1071 1074 1069 1076 1072 1070 1075 1061 | 1071   | **1075** |

JS half ≈ 47–49 ms throughout. The three runs sit within 6 ms of each other, so initializing
both SDKs costs nothing measurable at startup — each is constructed synchronously at module
scope with no network on the launch path. Quote **1075 ms**: it is the only one attributable
to a commit that exists in git.

### NFR-A2 — 200% font + reduced motion + reduce transparency — ✅ PASS (27/27 steps)

Full sweep green with no code changes needed this time (the header-title fix from the first
run holds). Screenshots re-checked by eye in light and dark: nothing clipped or overlapping,
tab labels intact, the P3 quick-add bar scales with the input and Add button both still
tappable (placeholder truncates with an ellipsis, which is allowed — it is a hint, not
content).

### Note on the SDKs (they did not hang anything)

The shell never hung with keys present. Evidence: all five `EXPO_PUBLIC_*` vars reach the
bundler (`env: export …` in the build log), the Sentry RN SDK logs `Session replay disabled
via configuration` on every launch, and 20 cold starts averaged ~1.07 s. The one failure
ever seen was **build-time, not runtime**: `sentry-cli` aborts the Xcode source-map upload
phase with "An organization ID or slug is required". Local Release builds therefore need:

```bash
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release
```

Supplying org/project/auth-token instead of disabling upload is a P12/EAS concern
(⛔ ACTION REQUIRED there, not now — source maps only matter for shipped builds).
