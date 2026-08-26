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
- ⬜ **NFR-P2 — 60 fps timeline scroll** (obligation lands at P6 when the Today timeline
  exists). Profile frame pacing on both devices with a realistic day (10+ blocks, glass
  blocks, Skia ring visible). Simulator can't settle it: desktop GPU + no thermal or memory
  pressure makes simulator frame rates meaningless.

## Accessibility

- ⬜ **NFR-A2 — 200% font scale + reduced-motion sweep on both platforms** (added P2, extended
  P3). Re-run the 27-item sweep from `p2-manual-verification.md` plus the P3 screens (inbox,
  quick-add chips, task sheet, undo bar) with real OS settings. Simulator can't settle it: the
  sweep ran on the iOS simulator only; Android font scaling (up to 200% + display size) and
  its reduced-motion setting behave differently and have never been exercised.
- ⬜ **NFR-A1 — VoiceOver (iOS) and TalkBack (Android) pass on all shipped screens** (added
  P2/P3; grows each UI phase). Navigate every screen by screen reader alone: task rows (single
  a11y element incl. ", due <date>"), ambiguity chips, undo within its 6 s window. Simulator
  can't settle it: simulator VoiceOver diverges from device behaviour (focus order, gesture
  handling) and TalkBack has no simulator equivalent that counts.

## Behaviour the simulator under-tests

- ⬜ **FR-11 — quick-add with real keyboards/IMEs** (added P3). Type NL inputs with the on-screen
  keyboard, autocorrect on, on both platforms (incl. a Ukrainian keyboard once i18n lands).
  Simulator can't settle it: development happens with the Mac hardware keyboard, which bypasses
  autocorrect, suggestion bars, and IME composition.
- ⬜ **Glass/blur recommendation blocks — Android fallback path** (obligation lands at P6,
  File 02 §3). Verify the blur (or its documented fallback) renders correctly and doesn't tank
  frame rate on the Android device. Simulator can't settle it: blur cost and fallback selection
  are GPU/driver-dependent, and Android has never run on hardware.
- ⬜ **FR-25/UC-07 — drag-to-teach gestures + haptics** (obligation lands at P7). Drag blocks
  with a finger: activation distance, long-press timing, haptic feedback on grab/snap/commit.
  Simulator can't settle it: mouse input is not touch (no finger occlusion, different velocity
  profiles) and the simulator has no haptics engine at all.
- ⬜ **Invariant 7 — lazy lapse scan under real iOS background restrictions** (obligation lands
  at P7). Background the app for hours/overnight, re-foreground, verify the scan-and-attribute
  path with the app genuinely suspended/jetsammed. Simulator can't settle it: the simulator
  does not enforce real iOS suspension, background-refresh throttling, or memory eviction.

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

## Sync & notifications

- ⬜ **NFR-R1 — offline→reconnect with real radios** (local half added P3; full obligation at
  P8). Airplane mode mid-write, radio-dead zones, flaky LTE→wifi handoff; then reconnect and
  verify outbox replay (dup-op no-op, base_version behaviour). The P3 physical-device
  airplane-mode spot check was explicitly deferred to P8 (`p3-manual-verification.md`).
  Simulator can't settle it: simulated network loss is a clean socket cut on a stable host —
  no radio renegotiation, captive portals, or partial connectivity.
- ⬜ **FR-50 — notification delivery + hard ≤5/day cap** (obligation lands at P10). Real APNs
  and FCM delivery, lead times, per-category mute, and the cap under a storm, with the app in
  every lifecycle state; Android channel behaviour and OEM battery-optimization interference.
  Simulator can't settle it: iOS simulator push is a development shim, FCM needs a real
  device, and delivery timing under Doze/Low-Power mode only exists on hardware.
