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

- ⬜ **NFR-P1 — plan end-to-end ≤ 2.5 s p95 warm, measured from the device** (added P6). On
  hardware with the HF Space warm: trigger ten manual re-plans on a 5–8-task inbox, read the
  `plan_requested.duration_ms` values (PostHog or a debug log) and report p50/p95 for BOTH the
  learned path and the fallback path. Why: the P6 numbers are Node-on-a-Mac → hosted edge
  function on the fallback path only (`docs/verification/p6-manual-verification.md`); TLS
  handshakes, radio wake-up and the JS bridge on a handset are not represented.
- ⬜ **NFR-P2 — 60 fps timeline scrolling** (added P6). Scroll a 12-block Today timeline with the
  Perf Monitor open on a mid-range Android and an iPhone. Why: FlashList recycling and blur
  (`expo-blur` on iOS) cost nothing on an M-series Mac.

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

- ⬜ **FR-22 / NFR-A2 — Today timeline at 200 % font scale and with reduced motion** (added P6).
  Set the OS text size to maximum and Reduce Motion on; open Today with ≥ 6 blocks incl. one
  "Experiment" block and a two-line rationale: no clipped text, no overlapping cards, the "Now"
  marker readable, the time gutter intact. Why: the row-list timeline was designed for this but
  only exercised at 1× in jest; the simulator's Dynamic Type differs from device rendering.
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

- ⬜ **UC-03 triggers on a real day boundary** (added P6). Leave the app in the background across
  05:59 → 06:00 local and across midnight; foreground it: a new plan must be requested exactly
  once per plan day (`plan_requested` with `trigger = new_day`), never while backgrounded. Why:
  the simulator's clock and AppState transitions do not reproduce iOS background suspension.
- ⬜ **NFR-R1 — Today offline** (added P6). Airplane mode after a plan exists: the plan still
  renders from SQLite; "Re-plan" shows the offline/error notice without clearing the plan. Why:
  simulator network loss is not real radio loss.

## Feedback loop (P7)

- ⬜ **FR-30 — a running focus session survives lock / app kill / relaunch** (added P7). Start a
  session, lock the phone for 10 min, relaunch from the app switcher and from a cold start: the
  Focus tab must show the session still running with the elapsed time including the locked
  minutes (the row lives in SQLite; the display re-derives from `lastResumedAt`). The simulator
  never suspends JS the way iOS does under lock/Low-Power mode.
- ⬜ **File 05 §1 — lazy lapse scan on foreground after a real background stint** (added P7).
  Leave a block to expire while the app is in the background for > 30 min, foreground: the block
  must read "Not done — back in your Inbox" and the Inbox must list the task; then confirm the
  `lapse_observed` row reached the server (Table Editor). The simulator's AppState transitions
  are instantaneous and never involve OS-level suspension.
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
- ⬜ **UC-03 A1 — kill the service, verify the fallback** (added P6; re-worded for the VM). Set
  `RECSYS_URL` to an unreachable host (or `docker compose stop recsys` on the box), request a
  plan: the response must be `engine = heuristic` with `telemetry.ef.reason =
fallback:timeout|network` within the 1.9 s budget; restore: the next request must come back
  `learned`. Why: P6 verified the fallback only with `fallback:not_configured` and local fakes.
  Needs `RECSYS_URL` in the Supabase secrets (HANDOFF ⛔ 5).
- ➖ **Cold start of the Space** (added P5, NFR-R2) — **not applicable since ADR-0009**: the VM
  is always on (no sleep, no wake probe); what remains is the warm p95 through the edge function
  (HANDOFF ⛔ 7, `p6-manual-verification.md` §3) and the DB pool's first connection, covered by
  the first-vs-second-run comparison there.
