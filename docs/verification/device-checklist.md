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
  **Android (Pixel 7a) ✅ 2026-09-01:** p90 1582 ms right after a reboot (1091–1754), 552 ms with warm OS caches — day-1 notes. **Build 3 ✅ 2026-09-03:** p90 1072 ms right after a reboot (705–1202, n = 20), 551 ms warm (day 2) — day-3 notes item 12. iOS pending.
  **iOS 2026-09-07 (iPhone 12, A14/2020, iOS 26.6, build 1):** xctrace App Launch — the probe right after a reboot and the first unlock put the initial frame at 0.95 s (process creation 413 ms + system frameworks 417 ms + runtime/UIKit/didFinishLaunching ≈ 115 ms); 20 back-to-back launches (n = 19 exported) initial-frame → foreground-active **p50 488 / p90 503 / max 611 ms**; the JavaScript side's first own event (the reminder scheduler's pass) at p50 277 ms after the process's first log line, ≈ 0.7 s from creation. The 2020 iPhone is faster than the 2022 Pixel 7a in both conditions (`device-pass/ios-20260907-1130/notes.md` items 38, 40, `hw-ios-coldstart.sh`).
- ⬜ **NFR-P2 — 60 fps timeline scroll** (obligation lands at P6 when the Today timeline
  exists). Profile frame pacing on both devices with a realistic day (10+ blocks, glass
  blocks, Skia ring visible). Simulator can't settle it: desktop GPU + no thermal or memory
  pressure makes simulator frame rates meaningless.
  **Android (Pixel 7a) ✅ 2026-09-02:** 8-block Today, 59 swipes in 20 s, 1733 frames, 0 janky (legacy 0.40 %), frame time p50 5 / p90 7 / p95 8 / p99 10 ms (`device-pass/android-20260902-1030/gfxinfo-today-scroll.txt`).
  **iOS 2026-09-07:** see the P6 row below — zero hitches on a real thumb scroll of a **7-block** Today.
  **Android 13-block list ✅ 2026-09-08 (ADR-0022 pass):** the same 13-block plan scrolled with 30 injected drags on the build of main and on the motion build — 1825 / 1824 frames, 1 janky each (0.05 %), p50 5 / p90 7 / p95 8 / p99 10 ms on both (`android-20260908-motion/notes.md` items 5–6). The ≥ 10-block condition is now met on Android; **iOS ✅ 2026-09-09:** a 16-block list under xctrace Animation Hitches, 20 WDA drags, on the build of main and on the motion build — 847 / 807 frames, 8 hitches each, lifetime max 84 / 67 ms (`ios-20260909-motion/notes.md` items 5, 7).
  **What has actually been measured (corrected 2026-09-08, before the pass above):** frame statistics exist for an **8-block** list on the Pixel 7a (`gfxinfo`) and a **7-block** list on the iPhone 12 (xctrace hitches) — nothing at 10+ blocks. The 13-block Pixel list of 2026-09-05 was the blank-card detector sweep (`hw-blank-cards-sweep.sh`), which records no frame times. The row is therefore ✅ at 7–8 blocks and ⬜ at the ≥ 10-block scale it names; `post-p12/motion` (ADR-0022) measures a 13-block list on both phones, the same list before and after the cell wrapper lands.

- ⬜ **NFR-P1 — plan end-to-end ≤ 2.5 s p95 warm, measured from the device** (added P6). On
  hardware with the HF Space warm: trigger ten manual re-plans on a 5–8-task inbox, read the
  `plan_requested.duration_ms` values (PostHog or a debug log) and report p50/p95 for BOTH the
  learned path and the fallback path. Why: the P6 numbers are Node-on-a-Mac → hosted edge
  function on the fallback path only (`docs/verification/p6-manual-verification.md`); TLS
  handshakes, radio wake-up and the JS bridge on a handset are not represented.
  **Android 2026-09-02, server side of the device series:** 10 manual re-plans on a 14-task day — edge-function total p50 1662 / p95 1908 ms, service p50 1475 / p95 1735 ms, 9 learned + 1 `fallback:timeout` (1908 ms against the 1900 ms budget: the 1.5 s CP-SAT cap leaves 0.4 s of headroom on a FEASIBLE day). The client-measured `duration_ms` lives in PostHog (HANDOFF ⛔ 5b) — not yet a device number. **Client side read 2026-09-03 (owner's PostHog export):** manual series `duration_ms` p50 3271 / p95 3836 ms (all triggers p95 4857) = function 1662/1908 + a 1.0–1.5 s pre-plan sync push whenever ops are pending + ≈ 0.5 s transport/mirror — **not met as the spec phrased it**; decomposition in the day-3 notes item 1. The proof stall behind the 1.0 s solver slice is reproduced and fixed (ADR-0018, PR #39): **after the rollout** the same inbox gives 0/10 fallbacks, function p50 1091 / p95 1342 ms, solve p50 400 / max 665 ms (day-3 notes item 8); the client-side after numbers come from tomorrow's PostHog export, and NFR-P1 is restated as a measured requirement — **owner decision 2026-09-03: ≤ 4.5 s p95 device end-to-end (warm), ≤ 1.5 s p95 server-side, 1.9 s fallback bound; measured figures reported alongside** (thesis-corrections #51). **Client side of the 3 Sep series (read 2026-09-04 from the owner's export, 21/21 paired):** before ADR-0018 p50 3534 / p95 4581 / max 4844 ms (function 1679 / 1839; 1/10 fallback); after ADR-0018 p50 3043 / p95 3683 / max 3922 ms (function 1100 / 1302; 0/10); client − function p50 1.9–2.0 s, of which the pre-plan sync 1158 / 1540 ms (17 of 21 requests carried one). Against the decided figure — **before: not met (4.58 s p95); after: met (3.68 s device, 1.30 s server)**. Post-L1 client figure: the build-4 series ran 10:51–10:53 (server side function p50 1057 / p95 1282, 10/10 learned) — client side from the 4 Sep export. **Weak-phone figure derived 2026-09-04 (day-4 notes, "NFR-P1 — deriving a figure"):** server 2.6 + network 1.4–1.9 + device 0.5–1.2 s p95 → 4.5 s (mid-range 2022 on weak LTE) to 5.7 s (low-end 2022 on a 3G-grade link); **DECIDED (owner, 2026-09-04): NFR-P1 = ≤ 6.0 s p95 tap → plan received, warm, on a 2022 low-end Android over a weak link; the Pixel 7a reference 3.7 s p95 reported alongside; server ≤ 1.5 s; two caveats (SQLite mirror after the timer; backlog-carrying pre-plan sync). Two-thirds of the reference p95 is server-side and independent of the user's phone and network.** **Shape measured 2026-09-02 evening** (45-request sweep, day-2 notes): reliable below ≈ 0.6 s of solver time (any inbox on ≤ 4.5 h; ≤ 12 tasks on 9 h), a coin flip once the first rung runs to its 1.0 s slice (14–16+ tasks on 9 h; the device's deadline-bearing 14-task instances 12/15).
  **iOS 2026-09-07, server side of the device series (`hw-plan-rows.mjs`):** ten manual re-plans on a 12-task inbox, all learned — edge-function total **p50 710 / p95 783 / max 783 ms**, service p50 503 / p95 567 ms. The client-side `plan_requested.duration_ms` is the owner's PostHog export (pending). Notes item 8.
- ⬜ **NFR-P2 — 60 fps timeline scrolling** (added P6). Scroll a 12-block Today timeline with the
  Perf Monitor open on a mid-range Android and an iPhone. Why: FlashList recycling and blur
  (`expo-blur` on iOS) cost nothing on an M-series Mac.
  **iOS 2026-09-07 (iPhone 12, 7-block Today, the owner's thumb, 20 s, xctrace Animation Hitches attached):** **`hitches` table empty — 0 hitches**; 841 frames committed, frame lifetime p50 33.5 / p90 50.2 / max 52.8 ms (2–3 vsyncs of pipeline latency, none late); GPU 2.92 ms p50 / 4.17 max per frame; 32–58 committed frames per active second (the finger's reversals, not late frames). Notes item 39.
  **Scale note (2026-09-08):** this is a 7-block list, not the 12-block one the row asks for; Android's figure is an 8-block list. See the NFR-P2 row in Performance for the corrected statement and the 13-block plan (ADR-0022).

## Accessibility

- ✅ **UC-01 / FR-21 — every Today card paints on Android (FlashList v2 + the overflow-hidden glass panel)** (added 2026-09-05). Scroll a ≥ 10-block Today to the bottom six times after a fresh plan; every card must show its content, and no control may respond from a card that shows none (`hw-blank-cards.py` reports 0 BLANK). Why: the panel clip and cell recycling are native Android paths the simulator never runs; iOS uses a different panel (BlurView).
  **Android 2026-09-05 (build 5) — MAJOR DEFECT, data integrity:** the last card rendered as an empty panel with its content mounted (accessibility tree complete, touch live); reproduced 5/5 over adb, survives foreground cycles and a font-scale re-layout; the layout-bounds overlay shows no child boxes inside the card → React Native's `overflow: hidden` clip on the Android `GlassPanel` evaluates empty while the background still draws. The owner's two taps on blank cards became real facts (`task_completed` 567, `focus_start` 568) that the 23:55 attribution turns into rewards — facts from unseen controls are indistinguishable from behaviour on the server. Fix batch / build 6: drop the clip on Android, then FlashList 2.3.1 + `getItemType` if needed; verify with the recipe above (day-5 notes item 9; corrections #53).
  **Android ✅ 2026-09-05 (build 6, `7e5e2fd8…`):** the plain-View `GlassPanel` carries no clip (e7bb05e). Fresh account, Saturday given a window on the server, 7-block plan 5:45–11:45 PM; `hw-blank-cards-sweep.sh` six cycles of three drags to the bottom → detector → back: **0 BLANK in 24 card scans at default density and 0 in 12 at font scale 1.3** (std-dev 30–37 inside every card; build-6 notes item 5). **Caveat closed the same evening (build-6 notes item 9): a 13-block list (device + profile timezone shifted west for a full-day horizon — the minimum block is 30 min, so a Kyiv evening caps at 6) — 0 BLANK in 24 scans at default density and 0 in 12 at 1.3×, bottom reached every cycle; 72 scans over 7- and 13-block lists in total, the ≥ 10 case of the day-5 trigger covered.** Recipe gotcha: an `input swipe` that starts on the header/banner (y ≲ 490) never moves the list — start drags inside it (the script does now). FlashList stays 2.0.2.
- ⬜ **NFR-A1 — the in-app dialog under TalkBack / VoiceOver** (added 2026-09-06, ADR-0021).
  Open each dialog — sign out of the trial account, delete ×2, "replace this device's data?",
  "discard unsynced changes"; disconnect calendar once a calendar is connected (device-pending
  by circumstance: the owner connects one by hand during the iPhone pass; the OAuth client is
  configured) — and check: focus lands on the title and it is read as a header (no separate
  announcement — it would compete with the focus event), swipe order title → body → confirm →
  cancel, nothing under the scrim reachable, back cancels (Android button; iOS two-finger Z via
  the card's escape action), and on iOS a dialog opened from Settings actually appears (the
  Modal presents from its nearest view controller — one host per native modal screen). Why: RN
  Modal's window/presentation semantics and the focus event are native behaviour the jest render
  only asserts as props.
  **Android 2026-09-06 (build 7 + 8, session, structural half ✅):** every dialog is its own
  window — the uiautomator dump holds only the dialog's nodes (title wrapper focusable with the
  header role, `android.widget.Button` ×2 with the exact labels, no scrim node, nothing of the
  screen beneath); back / scrim / Cancel all dismiss with Settings intact; the double tap on
  "Continue" (two taps within 129 ms) leaves step 2 up. Injected taps are consumed by TalkBack's
  explore-by-touch and TalkBack logs no utterances at its default level — **the spoken order and
  the focus landing on the title stay with the owner's listening pass** (optional as before).
  **iOS 2026-09-06 (simulator smoke, not device):** a Settings-launched dialog presents from
  inside the sheet (`ios-sim-20260906-dialog/`, Maestro 1/1); VoiceOver, escape = iPhone pass.
  **iOS 2026-09-07 (iPhone 12):** the accessibility daemon's traversal (`hw-ios-ax.py items`, the strings VoiceOver speaks) on all three dialogs = title as Header → body → confirm → cancel, **nothing beneath reachable**; the replacement dialog opened with the focus on its title; on-device audit 0 issues; the owner's VoiceOver listen: titles announced on open, the two-finger Z cancels, the replacement's title announced. **Reduce Motion defect:** with the system switch on, the second erasure dialog never appears after Continue (notes items 24, 36 — MAJOR, fix batch).
  **iOS 2026-09-08 build 2 ✅ (Reduce Motion, daemon hold):** Continue → the second erasure dialog present at +1.5 s and +5.5 s, Cancel leaves Settings intact (`ios-20260908-1215/shot-b2-rm-dialog2.png`, notes item 67). The system switch and a late replacement (> 120 ms) stay in the fix-batch hardware rows.
- ⬜ **NFR-A2 — every dialog at 200 % + largest display, both schemes, landscape; the spring
  in/out and the OS reduce-motion toggle** (added 2026-09-06). The long body (sign-out) scrolls
  inside the card with the actions visible; labels wrap on their own rows; the entrance settles
  within 250 ms (`screenrecord` frame count) and is instant under reduced motion (Android:
  `transition_animation_scale 0` over adb is what React Native reads back as reduced motion —
  the 2026-09-06 dialog run used `animator_duration_scale 0`, which RN never consults, so that
  row's device reading is void; re-checked 2026-09-08 under the right switch with a whole-screen
  crop: a 4-frame appearance vs 6–7 at full motion, too coarse to settle a small fading card —
  the dialog's reduced motion stays "code path pinned in jest; device reading inconclusive"
  (android-20260908-motion item 16); iOS: Settings toggle, owner).
  Why: font scale and display size compound on Android; Reanimated's jest path simulates the UI
  thread, it is not the UI thread.
  **Android ✅ 2026-09-06 (build 7 + 8, session):** delete ×2, sign-out (long body) and sign-in
  replace at light/dark × 1.0×/2.0× + 540 dpi + landscape — every dialog present, labels on
  their own rows, Cancel dismisses (`android-20260906-dialog/`); entrance measured from
  `screenrecord` **150 ms** (9 frames at 60 fps), reduced motion **one frame**. Exit not
  captured (unit-pinned at 120 ms). iOS: simulator dark + accessibility-XXXL renders both erasure
  dialogs (`dialog-delete-*-dark-xxxl.png`); device pending.
  **iOS 2026-09-07:** at the held maximum text size both erasure dialogs keep title + body wrapped and both actions on screen (`shot-b1-dt-max-delete2.png`); dark scheme only (the phone's); no landscape; the entrance under Reduce Motion could not be timed (no screen recording) and under Reduce Motion the second dialog is missing (MAJOR, notes item 24).
  **iOS 2026-09-08 build 2 ✅ (erasure) / arming not device-testable:** owner-run `hw-ios-erase-check.sh` — dialogs 1 and 2, the erasure with `deletion_audit` 58 → 59, reference `87494f9c-…` (151 ms), nine tables at 0, the account-deleted screen with the reference, the welcome screen after a cold relaunch (day-2 notes item 70). The double tap could not be delivered inside the 400 ms window by XCUITest (2.5 s action latency): no iOS evidence for the arming either way; Android's 129 ms pair and jest stand.
- ⬜ **Android — the dialog scrim covers the status and navigation bars** (added 2026-09-06).
  Under SDK 57 edge-to-edge the Modal window is full-bleed regardless of the
  `statusBarTranslucent` / `navigationBarTranslucent` props (RN forces both); check light and
  dark with gesture and 3-button navigation. Why: no simulator equivalent of the edge-to-edge
  window insets on a real OEM build.
  **Android 2026-09-06 (build 7, gesture navigation only):** the scrim covers the status bar in
  light and dark (`shot-*-delete2.png`); 3-button navigation not exercised.
- ⬜ **NFR-A2 — 200% font scale + reduced-motion sweep on both platforms** (added P2, extended
  P3). Re-run the 27-item sweep from `p2-manual-verification.md` plus the P3 screens (inbox,
  quick-add chips, task sheet, undo bar) with real OS settings. Simulator can't settle it: the
  sweep ran on the iOS simulator only; Android font scaling (up to 200% + display size) and
  its reduced-motion setting behave differently and have never been exercised.
  **Android 2026-09-02** (font 2.0, density 540, animation scales 0 over adb; screenshots in `device-pass/android-20260902-1030/a11y-maxscale/`): every screen usable; two defects — the Today time gutter wraps "12:00 PM" mid-token (fixed 64 px) and the heatmap weekday header wraps mid-word; the timeline viewport shrinks to about a third of the screen (scrolls, actions reachable). The p10 flow itself never passed its date assertion on any device (a YAML-quoting bug in the regex, fixed in the batch — day-2 finding 14), so the evidence is adb screenshots + tree dumps. **Build 3, 2026-09-03 (`android-20260903-1020/a11y-maxscale-build3/`):** both defects fixed (gutter on one line, header no mid-word wrap), placeholder visible; residuals at 2.0 — "Insight…" tab label truncates (a11y name is the full word), the block time range breaks inside "PM", "Mo"/"We" ellipsize in the heatmap header, the legend row sits under the tab bar — cosmetic, listed for the next batch (day-3 notes item 10). iOS pending.
  **iOS 2026-09-07 (iPhone 12):** Dynamic Type held at the maximum (the app caps at 200 %) and set through the real Settings app: **a text-size change while the app runs re-renders text without re-laying out** — clipped headers, overlapping card text, Inbox rows stuck at their 1× height (74 px vs 116 px at a fresh launch); **a fresh launch at 2× lays out correctly** on every tab (notes items 22, 23, 36; fix batch: re-mount on font-scale change). Reduce Motion + Reduce Transparency + Increase Contrast, relaunched: every screen renders as at the defaults (item 25). The Maestro flow does not run on physical iPhones; the sweep was WDA + DVT screenshots.
  **iOS 2026-09-08 build 2 (daemon hold) ✅ layout / ⬜ Settings path:** a live change to the maximum through the accessibility daemon re-measured the Inbox, the Settings sheet and an open task form without a relaunch — but the navigator did not re-mount (the tab and the form survived), so the inspector override does not change `fontScale`; the user-facing Larger Text slider (which clipped build 1 live) is the owner's 1-minute check (notes item 68).
- ⬜ **NFR-A1 — VoiceOver (iOS) and TalkBack (Android) pass on all shipped screens** (added
  P2/P3; grows each UI phase). Navigate every screen by screen reader alone: task rows (single
  a11y element incl. ", due <date>"), ambiguity chips, undo within its 6 s window. Simulator
  can't settle it: simulator VoiceOver diverges from device behaviour (focus order, gesture
  handling) and TalkBack has no simulator equivalent that counts.
  **Android 2026-09-02, structural half (uiautomator tree):** task rows are one element with the composed label; block cards one focusable element ("title, start to end, Experiment, Confidence N percent", inner texts not focusable); Settings switch checkable + checked, mute chips CheckBox with full labels; heatmap one ImageView carrying the daypart summary. Finding: tab labels carry the icon glyph before the name. The TalkBack listening pass is the owner's.
  **Android 2026-09-05 (build 6):** the gear (`Open settings`) and the Inbox `New task` button dump as `android.widget.Button` (build-3 dumps: `android.view.View`, the class TalkBack read as "link") — `role="button"` on both (57aa541). The spoken word: listen skipped by the owner (2026-09-05 evening, the dump suffices); the heatmap label rough edges stay in revisit.

  **Android 2026-09-05 (build 5), owner listening pass:** tabs, Today cards + action row, Inbox rows + quick-add, the heatmap summary and Settings all announce as designed; one role defect — the Settings gear says "link" (expo-router `Link asChild` injects `role`, overriding `accessibilityRole`; fix: `role="button"`), two rough edges on the heatmap label (day-5 notes item 16). Rating chips not exercised (no completed block).
  **iOS 2026-09-07:** structural pass on Today, Insights, Settings and the dialogs from the accessibility daemon (`ax-*.json`: spoken strings, roles, states, in order) plus the owner's 3-minute VoiceOver listen (announcements, gestures, the Ukrainian voice on English strings — understandable). One MAJOR: the block action row is unreachable (the row below). Notes items 34, 35, 41.

- ⬜ **FR-22 / NFR-A2 — Today timeline at 200 % font scale and with reduced motion** (added P6).
  Set the OS text size to maximum and Reduce Motion on; open Today with ≥ 6 blocks incl. one
  "Experiment" block and a two-line rationale: no clipped text, no overlapping cards, the "Now"
  marker readable, the time gutter intact. Why: the row-list timeline was designed for this but
  only exercised at 1× in jest; the simulator's Dynamic Type differs from device rendering.
  **Android 2026-09-02:** no overlap, Now marker readable, experiment block + two-line rationale wrap; the time gutter breaks the clock mid-token (defect, fix batch); the list viewport is small under the two-line date header.
  **iOS 2026-09-07:** at a fresh launch at 2× the date header wraps, "Re-plan" drops below it, the cards stack title / time / rationale / status, the Experiment block and the footer wrap, nothing clipped (`shot-b1-dt-max-relaunch-wda.png`; the viewport shows one card under the two-line header, as on Android); **after a live size change the same screen clips and overlaps** (notes item 22 — the systemic re-layout defect). Reduce Motion: Today renders as at the defaults.
- ⬜ **NFR-A1 — VoiceOver / TalkBack reading order on Today** (added P6). Swipe through: header
  → Plan/Re-plan button → planning banner (progressbar) → fallback notice (if any) → each block
  as ONE element announcing "title, start to end, Experiment, Confidence N percent" (no percent
  on heuristic rows) → deferred summary. Why: composed labels and `accessible` grouping are not
  verifiable without a real screen reader.
  **iOS 2026-09-07 ✅ (order):** "Today" → "Open settings, Button" → "Re-plan, Button" → the date → each card as one element ("b6 task 06 deep, 12:15 to 12:45, Confidence 44 percent"; the ε-slice block "…, Experiment, Confidence 41 percent") → its gutter time → the footer → the tab bar with "Selected" (`ax-today.json`); confirmed by ear. The action row inside the card is NOT reached (next section).

## Plan-surface transitions (added 2026-09-08 with ADR-0022 — File 02 §3.4, NFR-A2, UC-07)

- ⬜ **S1 — Done / Skip / I did it: the rows below settle instead of jumping, ≤ 250 ms.**
  Record the screen (`screenrecord` / QuickTime USB) while tapping each of the three on a
  13-block Today; `hw-motion-frames.py` on the list crop → one run of changed frames after
  the tap, ≤ 15 frames at 60 fps (the 200 ms spring + one tick). Why: whether Reanimated's
  `layout` spring fires at all on FlashList's absolute-positioned recycled cells on Fabric is a
  native-renderer question; the simulator's frame pacing says nothing about it.
  **Android ✅ 2026-09-08 (Pixel 7a, motion build `f5fdbe2`, 13-block list):** Done 11 frames / 183 ms and Skip 10 / 167 — one run each; I did it 14 frames / 233 ms in four short runs (a small height change dips under the tool's threshold mid-spring); 0 BLANK after every one, order intact
  (`device-pass/android-20260908-motion/notes.md` items 7, 8, 15). **iOS ✅ 2026-09-09 (iPhone
  12, build 3, 16-block list):** Done and Skip under an Animation Hitches trace — 15 frames after
  each tap, all one vsync apart, no hitch within 1.5 s of a tap; "I did it" not exercisable on
  iOS (no lapsed block without clock control; same S1 path as Done) —
  `ios-20260909-motion/notes.md` items 8, 11b.
- ⬜ **S2 — Move: the block travels to an on-screen slot; an off-screen slot scrolls the list
  and the card settles on arrival, ≤ 250 ms each.** Move one block to a visible slot and one to
  a slot below the fold; the on-screen move shows one run (the travel + the rows making room);
  the off-screen move shows the scroll then one settle on the arrived card; no double motion.
  Then the owner's eyes: does the move read as _that block going there_ (the one judgement no
  tool makes). Why: the cell-key retention across a reorder and the mount-vs-rebind order after
  `scrollToIndex` are FlashList internals whose behaviour on device is the claim.
  **Android ✅ 2026-09-08:** on-screen move 12 frames / 200 ms (the cell travelled two rows);
  off-screen move: the scroll 17–19 frames, and on the fixed build `ac99dea` the arrival settle as a separate 7-frame run on the arrived card (item 18; the first build never played it — adversarial pass #1); a same-slot move: caption only, no travel; 0 BLANK, order correct (items 9, 10, 13, 18). The owner's-eyes judgement is still open on both phones.
  **iOS ✅ 2026-09-09:** on-screen move (11:00 → 12:15, one row down) and off-screen move (11:45
  → 18:00: the list scrolled, the card landed at ≈ 54 % of the viewport) under the trace — 43 frames at one vsync across the scroll, no hitch; a same-slot move: caption only (iOS items 8, 9). The arrival settle itself is not established on iOS: build 3 carried the pre-fix code and iOS has no frame tool (iOS item 13). Per-transition frame counts exist only for Android (no `screenrecord` on iOS).
- ⬜ **Reduced motion: every one of the five interactions changes the screen in ONE frame.**
  Android: `settings put global transition_animation_scale 0` — the switch React Native reads
  (`AccessibilityInfoModule.kt`: `TRANSITION_ANIMATION_SCALE`, with a content observer; the
  animator scale is never consulted — corrected 2026-09-08); iOS: `hw-ios-ax.py hold
REDUCE_MOTION`. Same recordings, same tool → each run is 1 frame.
  **Android ✅ 2026-09-08:** Done 1 frame, Skip 1 frame, on-screen move two single frames a
  tick apart (panel, then the reorder), off-screen move the same with an instant jump — no
  spring anywhere (item 12). **iOS ✅ 2026-09-09:** Reduce Motion held by the accessibility
  daemon (verified True by a second client and by WDA) — Done, Skip, an on-screen and an
  off-screen move all landed with the right caption and order, 0 BLANK (iOS item 10); iOS has no
  frame-count tool, so "one frame" is established on Android and the setting's reach on iOS. Why: the OS switch must reach `AccessibilityInfo` on each platform and the duration-0
  collapse must register _no_ transition (not a fast one) — a code path only the OS setting
  exercises.
- ⬜ **No card unpainted after any transition (the blank-card class).** After each of the five
  interactions and after the arrival settle: `hw-blank-cards.py` (Android) / a card-rect
  std-dev on `dvt screenshot` (iOS) → 0 BLANK; a uiautomator / accessibility dump with every
  block at its expected order. Why: the 2026-09-05 defect was a mounted-but-unpainted card with
  live controls; a transformed view returning to rest is a new paint path on the same renderer.
  **Android ✅ 2026-09-08:** 0 BLANK in every after-scan (4–7 cards each) across all fifteen
  recorded interactions, every card's std-dev 25–39; the block order in document order matched
  the expected order every time (items 7–15). **iOS ✅ 2026-09-09:** `hw-ios-paint.py` after
  all ten interactions — 0 BLANK in every scan (4–7 cards each, std-dev 27–36), the block order
  in the XCUITest tree as expected every time (iOS items 8–10).
- ⬜ **No cell off its slot after an interrupted transition.** A swipe inside the 350 ms window
  after Done; a second Done inside the window; a scroll during the arrival settle → no card
  stuck between slots, 0 BLANK, order intact. Why: a `layout` transition interrupted by a
  recycle is the "flying cells" failure the window exists to prevent, and only the device
  recycles.
  **Android ✅ 2026-09-08:** Done + a fling 90 ms later → one 783 ms window of change, then 6
  cards in order with contiguous, non-overlapping bounds; two Dones 200 ms apart → both facts,
  one 233 ms window, order intact (item 14). iOS: not run separately (WDA cannot inject a
  second input inside 350 ms; the Android result stands for the mechanism, which is shared).
- ⬜ **NFR-P2 with an `Animated.View` per cell — the 13-block list, before and after, both
  phones.** Android: `hw-scroll-frames.sh` (gfxinfo, the same 30-swipe series) on the baseline
  build of main and on the motion build over the same list; pass = janky count and p99 no
  worse. iOS: xctrace Animation Hitches across a 20 s thumb scroll on each build; pass = the
  `hitches` table stays empty. Why: the cell renderer is now an animated component on every
  row; the cost is native and per-frame.
  **Android ✅ 2026-09-08 (13-block list, the same plan under both builds, 30 injected drags):**
  main `fdff809` 1825 frames / 1 janky (0.05 %) / p50 5 · p90 7 · p95 8 · p99 10 ms; motion
  `f5fdbe2` 1824 frames / 1 janky (0.05 %) / p50 5 · p90 7 · p95 8 · p99 10 ms — equal (items
  5, 6; `gfxinfo-13blocks-{main,motion}.txt` in the session scratch, the summary blocks in the
  notes). **iOS ✅ 2026-09-09 (16-block list, 20 WDA drags, Animation Hitches):** main 847
  frames / 8 hitches / lifetime max 83.8 ms; motion 807 frames / 8 hitches / max 67.0 ms (p90
  48.5 vs 33.6 ms — one vsync of latency, no missed deadline) — hitch count equal (iOS items 5, 7).
- ⬜ **The Experiment card's action row wraps on the iPhone 12** (found 2026-09-09, iOS item 11a):
  the dashed border + tag narrow the card so "Move…" drops to a second line at default text size.
  Fix (a narrower gap or a two-row layout by design), then check the four targets stay ≥ 44 pt on
  both phones at 100 % and 200 % text. Why: a wrapped row is a layout the simulator would show
  too, but it was only noticed because a coordinate tap missed it on hardware.

## Behaviour the simulator under-tests

**Android ✅ 2026-09-05 (build 5, owner):** header → date → Re-plan → cards in slot order, each card one utterance ("references fix, 5:30 PM to 6:00 PM, confidence 44 percent") followed by its four actions.

- ⬜ **FR-11 — quick-add with real keyboards/IMEs** (added P3). Type NL inputs with the on-screen
  keyboard, autocorrect on, on both platforms (incl. a Ukrainian keyboard once i18n lands).
  Simulator can't settle it: development happens with the Mac hardware keyboard, which bypasses
  autocorrect, suggestion bars, and IME composition.
  **Android ✅ 2026-09-01/02:** real Gboard with autocorrect; Ukrainian input keeps the whole string as the title and shows no chips (documented limitation); the autocorrect-acceptance chip refresh (day-1 #8) is still attended; placeholder clip defect (day-1 #7) in the fix batch.
  **iOS 2026-09-07 ✅:** three tasks typed through the real iOS keyboard into the onboarding quick-add ("… 45 min", "… 30 min", "… 20 min" → durations parsed 45 / 30 / 20, category Admin); the Inbox quick-add renders its example hint (notes items 4, 15). At 200 % the Inbox hint and the Add button clip after a live size change (item 22).
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
  **iOS 2026-09-07 (partial):** a 44-minute lock/suspension (13:51 → 14:35) and a reboot (15:05) — the foreground scan ran with nothing to attribute (all remaining blocks were in the future). The overnight instance (blocks at 15:15–17:00 untouched, first open on the 8th) is the row's real test — tomorrow morning.
  **iOS 2026-09-08 ✅ (scan) / DEFECT (pull):** the app was frozen 17:32 → 12:22 (never killed, `memorystatus` in the archive), the phone locked all night; the day's first foreground (the owner's unlock swipe returned to the app) ran the scan at 12:22:20 — five `lapse_observed` facts, the 7th's 17:00 experiment block **18.9 h** after its end and today's four ended blocks (0.6–2.9 h), the cards "Not done — back in your Inbox", the daily authority's tuple for the 17:00 block not duplicated. **MAJOR:** the same sync's pull re-fetched the rows the nightly propensity backfill had bumped and reverted the four local `lapsed` to `shown`; the next foreground (12:24) lapsed them again — duplicate facts, streaks double-counted, the third-skip diagnostic on a task that missed twice (day-2 notes items 54–55; fix batch: a status lattice on pull + scan idempotency). A clean cycle afterwards lapsed exactly one block once (item 56).
  **iOS 2026-09-08 build 2 ✅ (pull):** a server-side row touch re-pulled as `shown` left the local `lapsed` in place (new `server_seq`, status kept) and the next foreground added no duplicate fact; the only new lapse was a block that had genuinely ended (day-2 notes item 66). The 2 h stale-session rule was found to earn a completion reward the same afternoon — fixed on the branch, device re-check with the next build (item 65).

- ⬜ **UC-03 triggers on a real day boundary** (added P6). Leave the app in the background across
  05:59 → 06:00 local and across midnight; foreground it: a new plan must be requested exactly
  once per plan day (`plan_requested` with `trigger = new_day`), never while backgrounded. Why:
  the simulator's clock and AppState transitions do not reproduce iOS background suspension.
  **Android 2026-09-02 — DEFECT:** every cold start re-requests with `first_open` although today's plan is persisted (`useLiveRows` starts empty, so the trigger decides before the first read; the session dedup is ephemeral) — 4 extra plans in 5 minutes, the day-1 30 rows had the same cause. The overnight `new_day` check is still owed; fix batch.
  **Android ✅ 2026-09-04 (build 3, `new_day`):** no plan for the 4th overnight (the 3 Sep ritual left untouched) → the day's first foreground that could read the session issued exactly one `plan_requested` with `trigger = new_day` (plans row 08:41:01 EEST, learned, 11 blocks); nothing while backgrounded, nothing from the killed-app ritual tap afterwards. Caveat → NFR-R1 below: the first foreground after the offline start fell inside auth-js's refresh-failure cache and planned nothing (fixed 68ca0eb; re-check on build 4). **Non-working days (ADR-0019, 2026-09-04):** the same trigger on a Saturday persists an empty plan and dedups the day; after the rule ships it must answer `no_working_window` without a row — unverified on hardware by choice.
  **Android ✅ 2026-09-05 (build 6, a real Saturday, fresh account with Mon–Fri defaults):** first open → Today "No working hours today — Hourwell plans your working days.", **0 `plans` rows** after the first open, a relaunch and a foreground (the client answered locally; no request reached the function; budget untouched); `dumpsys alarm` lists only the Sunday review (`ritual:2026-09-06`), no Saturday daily ritual; a Saturday window added on the server flipped the copy to "No plan yet" on the pull with no request, and "Plan my day" then asked the server (a 0-block plan with 15 min of window left, 7 blocks once the window was extended). The in-app "Plan tomorrow?" card stayed hidden with the ritual due and Sunday without a window, and appeared once Sunday got one (build-6 notes items 1–3, 5, 7). Not exercised on the device: the function's own `no_working_window` (Deno-tested) and a stale ritual accept (§5, jest).
  **iOS 2026-09-07:** set up — the phone stays untouched overnight with the 8th's plan already made by the ritual (`evening_ritual`, 11 blocks); the first foreground on the 8th is read tomorrow.
  **iOS 2026-09-08 ✅ (the accepted-ritual variant):** first foreground of the 8th at 12:22 (the owner's) → Today "Tuesday, 8 September" with the ritual's 11-block plan, **zero plan requests** all morning (`plans` for the 8th = the ritual's one; the driver's later cycles requested nothing either) — with an accepted evening plan `hasPlanForToday` decides and `new_day` must not fire (ADR-0014 §3); the four blocks that had ended were lapsed, not re-planned. The `new_day` request itself was observed on Android (2026-09-04); on iOS this pass exercised the other branch (day-2 notes item 55).
- ⬜ **NFR-R1 — Today offline** (added P6). Airplane mode after a plan exists: the plan still
  renders from SQLite; "Re-plan" shows the offline/error notice without clearing the plan. Why:
  simulator network loss is not real radio loss.
  **Android 2026-09-04 (build 3) — DEFECT, offline first open with an expired token:** radios off + cold start → 26 s of "Planning your day…", then **"Sign in to plan your day."** (auth-js retried the refresh for 30 s and cached the failure for 60 s; the app read `session: null` as signed-out), and the first foreground after the radios returned — inside that 60 s — still planned nothing; the second did. Fix 68ca0eb (`readSession()`: retryable refresh error → offline; the plan trigger re-checks on TOKEN_REFRESHED). **Build 4, 2026-09-04 10:47 — engine half ✅:** radios off + expired token → Settings "Offline — changes are queued" at +35 s (build 3: "Sign in to sync across devices"); radios on → "Up to date · Last synced just now" at +70 s with no new foreground. The plan half ("Offline — showing your last plan." on an unplanned day + the request once the refresh lands) is unit-tested; device check = the next unplanned morning.

## Feedback loop (P7)

- ⬜ **FR-30 — a running focus session survives lock / app kill / relaunch** (added P7). Start a
  session, lock the phone for 10 min, relaunch from the app switcher and from a cold start: the
  Focus tab must show the session still running with the elapsed time including the locked
  minutes (the row lives in SQLite; the display re-derives from `lastResumedAt`). The simulator
  never suspends JS the way iOS does under lock/Low-Power mode.
  **Android ✅ 2026-09-02 (Pixel 7a):** the 11:58 session outlived a 2 h lock and a cold start (164.5 focused minutes = wall time, then the designed 2 h abandon rule closed it); a second session survived `am force-stop` + relaunch within the cap (Focus still running). Day-2 notes 19.
  **iOS 2026-09-08 ✅ (iPhone 12):** the 13:00 block started at 12:54 (WDA), the phone locked 12:54:37 → unlocked ≈ 13:04: Focus read "10:35" / "10 minutes focused of 30 planned" — wall time across the locked minutes; then `app terminate` + `app launch`: the app opened on Today and the Focus tab showed the session still running, "11 minutes focused of 30 planned"; no `focus_end` on the server (day-2 notes item 60, `ios-20260908-1215/shot-b1-focus-after-*.png`).
- ⬜ **File 05 §1 — lazy lapse scan on foreground after a real background stint** (added P7).
  Leave a block to expire while the app is in the background for > 30 min, foreground: the block
  must read "Not done — back in your Inbox" and the Inbox must list the task; then confirm the
  `lapse_observed` row reached the server (Table Editor). The simulator's AppState transitions
  are instantaneous and never involve OS-level suspension.
  **Android ✅ 2026-09-02 (server half):** after a 103-min stint the first foreground logged `lapse_observed` for both ended blocks (0.71 h / 1.46 h after their ends); the "Not done" row was not observable because the same foreground re-planned (client defect, fix batch F1). Re-check the UI text on the rebuilt APK.
  **iOS 2026-09-07:** see Invariant 7 above — overnight.
  **iOS 2026-09-08:** see Invariant 7 above — the UI text "Not done — back in your Inbox" + "I did it" observed 2 s after the foreground (`ios-20260908-1215/shot-b1-first-foreground-122221.png`), the `lapse_observed` rows on the server with `hours_after_slot_end`; the pull-revert defect is the same row's MAJOR.
- ⬜ **NFR-A1 — VoiceOver/TalkBack on the block action row and the rating chips** (added P7).
  Each action must announce "Skip write report" style labels; the rating chips must be
  reachable in order and announce "Rate your energy: High"; the progress bar must announce its
  value. Screen readers are not exercised on the simulator.
  **Android 2026-09-05 (build 5, owner), action row ✅:** "Start references fix, button", "Done …", "Skip …", "Move… …"; rating chips untested (need a completed block).
  **iOS 2026-09-07 — DEFECT, MAJOR (both platforms by construction):** the card is one labelled `accessible` container (`ConfidenceBlock.tsx`) with no custom actions, so VoiceOver steps from the card summary to the next gutter time and **"Start / Done / Skip / Move…" are never reachable**; confirmed by the daemon's traversal and by the owner's ear. The rating chips read as "How was your energy?: Okay, Button" and are reachable. Never exercised by a screen reader on Android either (uiautomator lists the buttons; the TalkBack listen was skipped). Fix batch: custom actions on the card. Notes item 35.
  **iOS 2026-09-08 MINOR:** a lapsed card's spoken summary still reads "…, Confidence 52 percent" with no "Not done" state (`ios-20260908-1215/wda-today-1229.xml`); fold into the same fix (day-2 notes item 58).
  **iOS 2026-09-08 build 2 ✅ (state):** every card's spoken summary ends with its state ("…, Not done — back in your Inbox", "…, Completed"; `ios-20260908-1215/ax-b2-today.json`). The custom actions are not visible to the daemon or XCUITest — the owner's rotor listen (fix-batch rows).
- ⬜ **NFR-A2 — 200 % font scale on the Today card with actions and on the Focus tab**
  (added P7). Four action buttons and the status caption must wrap, never clip or overlap the
  next block; the timer digits (JetBrains Mono) must not overflow the panel. The P2 sweep ran on
  the simulator only.
  **iOS 2026-09-07:** fresh launch at 2× — the card stacks correctly (`shot-b1-dt-max-relaunch-wda.png`), Focus renders (`shot-b1-dt-max-relaunch-focus.png`); after a live size change the card's title wraps into the rationale (notes item 22).
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
  **2026-09-05: pending — the owner left with the phone before the move.** Saturday got a server-side working window for it (`hw-set-working-hours.mjs`, day-5 notes item 10); target when resumed: "email replies" 3:45 PM → 5:37 PM (a refusal over the completed 5:15 slot also counts). Only tap controls that are visible (the blank-card defect above).
  **Android ✅ 2026-09-05 (build 5, owner):** "references fix" 5:00 PM → keyboard entry 5:37 → the picker itself reset the minutes to :30 (typing :40 gave :45) before confirmation; "Move here" → the card reads 5:30 PM–6:00 PM, server row `moved` v2 at 17:30–18:00, fact `block_moved` (distance 30 min). Mechanism: `minuteInterval={15}` on the native dialog plus the app's own `snapToGrid` (unit-tested; unreachable through this picker). Observation for revisit: the snap is silent — no hint that times follow a 15-minute grid (day-5 notes item 15).

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
  **iOS 2026-09-07 ✅:** a task seeded server-side at 13:14 (the Mac as the other device), the app suspended 13:51 → 14:35 (44 min, locked); on foreground the tree read at +1.9 s showed Today intact with no stale row and the Inbox held the new task (7 rows; the pulled database: 13 tasks, seq 4877). The foreground trigger carried the pull with the 60 s poll suspended. Notes item 33.
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
  **iOS 2026-09-07 ✗ (consent):** the in-app SafariViewService consent (16:03) hit "Access blocked" — the OAuth client is in Testing and the phone's Google account is not a test user; a retry left the account's `oauth_state` unconsumed (never confirmed). The Pixel connected the same calendar the same afternoon (its fresh session `9327f910`, channel + one imported event). The iOS calendar-disconnect dialog therefore stays pending on a completed consent; the Android one was driven over adb: "Disconnect Google Calendar?" / "Disconnect" / "Keep connected", its own window, Settings intact (`android-gcal-disconnect/`). Notes items 42, 45, 46.
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

**iOS 2026-09-07:** see the P10 FR-50 row below.

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
  **Android ✅ 2026-09-05 (build 5, owner listening):** the grid is one element reading "Energy map for {category}. On weekdays your best time is early morning (78 percent) and your lowest is night (30 percent). On weekends … Switch to the text view for every hour." + the role word "image"; labels not focusable. Two rough edges (revisit): the role suffix lands after the switch hint, and the weekday/weekend lead-in is easy to miss at speech speed.
  **iOS 2026-09-07 ✅:** the heatmap is one spoken element — "Energy map for Deep work. On weekdays your best time is early morning (89 percent) and your lowest is night (30 percent). On weekends …" — with the category chips as "Show Deep work, Selected" tabs, the legend, and "Show as text, Button" swapping in the per-daypart text (`ax-insights.json`, `shot-b1-insights-text.png`); the weekday labels are hidden from VoiceOver by design.
- ⬜ **FR-41 — ✓/✗ toggles: 44 px targets, `selected` state announced, "pending" caption read**
  (added P9). Tap each toggle by screen reader; confirm the label state sentence and the
  "Saved — applies at the next sync" caption are read; confirm nothing renders red (invariant
  14). Why: touch-target hit-testing and state announcements are device behaviours.
  **iOS 2026-09-07 ✅ (structure):** each belief reads statement + evidence + state, its buttons as «Mark "…" as correct, Button, Selected» / «… as incorrect, Button», the pending caption "assumed, not yet observed" read; a ✓ produced a `belief_label` event and "You confirmed this." (notes items 19, 34). Target size not measured on iOS.
- ⬜ **FR-24 — trade-off sheet on a real over-committed day** (added P9). Pin two blocks on the
  same slot (Move… + pin) and re-plan; the sheet must appear inline (never modal-blocking),
  options in the server's order; choose one → the re-plan runs and the sheet does not return;
  "Keep it as is" is a quiet secondary button. Why: the flow crosses the real network (task op →
  re-plan) and a real keyboard/gesture path the jest render cannot exercise.
- ⬜ **NFR-A2 — reduced motion on Insights** (added P9). With Reduce Motion on: the refresh and
  the category switch must not animate (Insights ships no transitions — a divergence from File 02
  §3.4 recorded as spec-conflicts L42, not a design choice; confirm none are introduced by the
  platform ScrollView/Pressable defaults). Why: OS-level reduced-motion
  hooks are not represented on the simulator.

### Notifications, privacy, performance (added P10)

**iOS 2026-09-07 ✅:** relaunched under Reduce Motion (+ Reduce Transparency, Increase Contrast): Insights renders as at the defaults, nothing animates (`shot-b1-rm-rt-ic-insights.png`).

- ⬜ **FR-50 — reminder delivery and the ≤ 5/day cap on hardware** (P10). Plan a day with ≥ 6
  blocks, grant the permission from the Today card, lock the device: the first four reminders
  arrive 10 min before their blocks, the fifth slot is the 20:00 ritual; re-plan twice and change
  a mute during the day → never a sixth notification (iOS: also with Focus modes; Android: also
  under Doze / battery saver, note the OEM). Why: the ledger is proven in jest against a faked
  OS; real delivery, coalescing and OS-side dropping only exist on hardware.
  **Android 2026-09-02, scheduling half:** after every plan exactly 4 block alarms + the 20:00 ritual are pending (cap 5); delivery times being read from `dumpsys notification`; the phone is on USB power all day, so the Doze case needs an unplugged owner run.
  **Android 2026-09-05, delivery times of the 2 Sep reminders read from the owner's screenshots (build 3, inexact windows):** the 14:05 alarm posted 14:06:21–14:07:00 (+1–2 min), the 13:20 alarm 13:22:21–13:23:21 (+2–3 min), the 12:35 alarm before 13:18 (`android-20260902-1030/owner-blocks-1418.png`, `-1428.png`; day-5 notes item 3). Exact-alarm points on builds 4–5 are in the FR-50 exact-alarm entry below.
  **iOS 2026-09-07:** permission granted from the Today card (the iOS alert accepted through WDA); the OS's own schedule after the 13:51 pass: 14:20, 15:05, 15:20, 15:50, 20:00 (+ tomorrow's ritual) — **five today, no nudge for the 17:00 block** (SpringBoard `UserNotificationsCore`, notes item 32); fires by the OS record: **14:20 (captured on the lock screen, `shot-b1-lockscreen-1431-*.png`), 15:05, 15:50, 16:42 (the ritual, moved server-side)**; the 15:20 was dropped by the schedule pass after the reboot's first launch (two delivered + five queued → the planner kept 15:50, 16:50, the ritual); the day's fifth (16:50) and the absence of a sixth are read after 16:50 (notes items 32, 47). Focus modes not exercised (tomorrow).
  **iOS 2026-09-08 ✅ (cap + ledger reset):** from the OS's record, the 7th ended with five fires (14:20, 15:05, 15:50, 16:42, 20:00 — the last a defect of FR-26, below) and no sixth; the 8th's four nudges fired to the frozen app on the locked phone at 08:50 / 09:35 / 10:20 / 11:05 (lock-screen stack at 12:21, `ios-20260908-1215/shot-b1-lockscreen-1221-stack-row.png`); the first schedule pass of the day kept only the two rituals — four delivered + the ritual = five, no afternoon nudge — so yesterday's deliveries did not count against today (day-2 notes items 52, 57). Focus modes: the 12:45 ritual under Do Not Disturb, below.
  **iOS 2026-09-08 ✅ (Focus mode):** the ritual moved to 12:45 fired while Do Not Disturb was on (assertion 12:38:07 → 12:47:44): `donotdisturbd` "Breakthrough is NOT allowed … 'ritual:2026-09-08'", suppression level 2, both presentation gateways "DID NOT play lights and sirens"; after Focus ended the lock screen listed "Hourwell · 1 сповіщення · 4 хв тому" (`ios-20260908-1215/oslog-ritual-under-dnd-1245.txt`, `shot-b1-lockscreen-1249-ritual-after-dnd.png`). Deferred presentation, nothing lost, no sixth (day-2 notes item 59).
- ✅ **FR-50 — Android exact-alarm semantics of the DATE trigger** (P10). On API 31+ confirm a
  reminder lands within a minute of `slot_start − 10 min` without `SCHEDULE_EXACT_ALARM`; if the
  OEM defers it by more, record the drift for the thesis (ADR-0014 Consequences). Why: inexact
  alarm windows are device/OEM policy.
  **Android 2026-09-02:** the triggers are inexact `RTC_WAKEUP` alarms with Android's 75 % window — +7 m 27 s for a 10-min lead, +41 m at 55 min ahead, +1 h beyond; no `SCHEDULE_EXACT_ALARM` in the manifest. Measured drift to follow (ADR-0014 Consequences).
  **Android 2026-09-04 (build 3):** `appops get SCHEDULE_EXACT_ALARM` = default (not granted) and no permission declared → windows of +31 min to +1 h (the ritual posted 20:26:28 for 20:00; the 08:50 reminder for the 9:00 block was never delivered and the 08:53 foreground pass cancelled it as past). Build 4 declares `SCHEDULE_EXACT_ALARM` (24808ad); for the device test the grant is set over adb (`appops set com.hourwell.app SCHEDULE_EXACT_ALARM allow`); the in-app "Alarms & reminders" prompt is a revisit item. Re-check: `dumpsys alarm` shows `window=0` after the next foreground; a reminder lands within a minute of `slot_start − 10 min`. **Build 4 + grant, 2026-09-04:** all five alarms `window=0 exactAllowReason=permission`; the 09:35:00 reminder posted 09:35:00.345 (+345 ms); the 10:20:00 reminder 10:20:00.531 (+531 ms).
  **Android ✅ 2026-09-05 (build 6):** app-op reset to `default` (Android 17 denies a fresh install) → after the first plan with blocks the Today card "Reminders may arrive late" (Allow / Not now) → **Allow** opened the system "Alarms & reminders" screen for Hourwell (local Expo module), the switch flipped over adb → `Uid mode: SCHEDULE_EXACT_ALARM: allow`, BACK → the card gone on the foreground re-read and all six alarms `window=0 exactAllowReason=permission` (five block reminders 18:20–21:50 = the day's cap with the skipped ritual's slot, plus the Sunday review); before the flip the same alarms carried `window=+1h`. Build-6 notes items 3 and 6. Delivery timing itself: builds 4–5 (day 5, exact to +109…+377 ms).
- ⬜ **FR-26 — ritual actions from every app state** (P10). At the ritual time with the app
  KILLED: tap "Plan tomorrow" → the app cold-starts, plans tomorrow (one `plan_requested` with
  trigger `evening_ritual`, one `notification_response` fact), Today shows the tomorrow line;
  "Adjust tasks" opens the Inbox; a plain tap on a Sunday opens Insights. Repeat with the app
  backgrounded. Why: `useLastNotificationResponse` vs the listener and category action buttons
  behave differently per platform and cannot be exercised in jest.
  **Android 2026-09-02 (build 3):** ritual delivered (visible by 20:14:41, +1 h window); owner tap at 20:22 with the app backgrounded → one `evening_ritual` plan for the 3rd (10 blocks), one `notification_response` fact, Today shows the tomorrow line — PASS for the backgrounded variant; the fact says `action: open` (button vs body — settle with the adb-driven killed-app run tomorrow).
  **Android 2026-09-04 (build 3) — DEFECT + killed-app body tap PASS:** the expanded ritual shows NO action buttons (`dumpsys notification`: no `actions=` on the record) — `initNotifications` registered an empty block category first and Android rejects a category without actions, so the ritual's category was never set — **probable** root cause, fixed c2995be; the owner recalls seeing a button in the 2 Sep notification, which no mechanism found explains (day-4 notes item 14). The adb body tap on the untouched 3 Sep ritual with the app killed: cold start 843 ms → exactly one `notification_response` (`action: open`, `latency_ms` 46 414 974 from `scheduled_for`), no plan request, notification cleared, Today shown. **Checked against evidence 2026-09-04 (owner: regression or original?) — by the code history original, by the owner's eyewitness contested:** the empty block category precedes the ritual's at lines 48–49 of `setup.ts` in the P10 feature commit 5a4be6f (2026-08-30) and at the same place in dd48052, 56935e0 (build-3 source) and 3f1159d — every Android build of the pass ran it; no day-1/2 record or screenshot shows a notification button (day-2 note 29 records the Today-card button and lists the notification's as untested); iOS registers an empty category without complaint, so the simulator did show the buttons (day-4 notes item 14). **Build 4, 2026-09-04 20:00 — actions present, accept from a KILLED app ✅:** the record carries `actions=2` ("Plan tomorrow", "Adjust tasks"), posted 20:00:00.335; one adb tap on "Plan tomorrow" → cold start, one `accept` fact, one `evening_ritual` plan for the 5th (0 blocks — Saturday has no working hours; revisit), Today. Two defects found and fixed in 7c8f67c (PR #45): the notification stays posted after an action (no auto-cancel for actions), and a second action on the same notification was dropped by the dedup key ("Adjust tasks" opened Today with no fact). **Build 5 (`d7fc4280bf56…`, the two fixes) installed 22:36 — re-check scheduled for 5 Sep on demand** (owner reversal: a fix nobody checked on hardware is not done): a fresh ritual via `hw-set-ritual-time.mjs` (ping + 5 min, one foreground, kill, natural exact fire) → "Adjust tasks" as the FIRST response → Inbox, one `adjust` fact, notification dismissed. Not possible on the 4th: the ≤ 5/day ledger was full (day-4 notes item 25). The dedup-by-action fix stays unit-tested (one ritual per calendar day; a second action cannot occur once the first dismisses). The Sunday plain tap → Insights and the backgrounded-app accept remain unverified. The Saturday zero-block plan is a product defect with a decided rule (ADR-0019: no plan request, no persisted plan, no daily ritual on a day without a working window; truthful Today copy) — implementation in the post-pass fix batch, also unverified on hardware by choice.
  **Android 2026-09-05 — the 2 Sep question settled:** the owner's own 2 Sep screenshots show the build-3 ritual expanded with no action row; the buttons seen were the Today card (`android-20260902-1030/owner-ritual-2014.png`, `owner-ritual-expanded-2022.png`, `owner-today-after-tap-2022.png`) — root cause established (day-5 notes item 3).
  **Android 2026-09-05 (build 5, on-demand ritual at 10:00 via `hw-set-ritual-time.mjs`) — PASS:** posted +471 ms with both actions to a dead process; "Adjust tasks" as the FIRST response from a killed app → Inbox in 945 ms, one `adjust` fact, no plan, the notification gone from the shade (fix 7c8f67c: dismiss after action; the accept path shares it). Still untested by choice: the Sunday plain tap → Insights and the backgrounded accept (day-5 notes items 7–8).
  **Android 2026-09-05 (build 6) — ADR-0019 on the ritual paths:** no daily ritual alarm on the eve of a day off (the Sunday review kept), the in-app "Plan tomorrow?" card hidden until tomorrow has a window (the adversarial pass's MAJOR, fixed b5c7ad6) — build-6 notes items 3 and 7. A ritual tap on such a day (§5) remains unit-tested only.
  **iOS 2026-09-07 ✅ (killed variant):** ritual moved server-side to 16:42, app terminated and phone locked; fired at 16:42:00.010 to the locked phone; the long-press showed "Plan tomorrow? 11 tasks are waiting — one tap plans your day." with the category actions **"Plan tomorrow" / "Adjust tasks"** (`shot-b1-lockscreen-ritual-*.png` — the categories render on iOS); "Plan tomorrow" cold-started the app → one `evening_ritual` plan for the 8th (learned, 11 recommendations), one `notification_response` event (`accept`, `latency_ms` 253 172), Today "Tomorrow is planned: 11 blocks, first at 09:00." (notes item 48). Backgrounded variant and "Adjust tasks" not exercised on iOS.
  **iOS 2026-09-08 — DEFECT (second ritual on one day):** after the 16:42 ritual had fired and been answered, restoring the evening time to 20:00 re-added `ritual:2026-09-07` and it **fired again at 20:00:00.007** to the locked phone (archive: request FD1A-28FB, requested 16:48:14); nobody tapped it. Fix batch: a ritual delivered or answered on the day is spent (day-2 notes item 51).
- ⬜ **FR-42 — export on device** (P10). Settings → Export → the share sheet offers Files/AirDrop
  (iOS) or the share targets (Android); the saved JSON opens; it contains the tasks, events, the
  48 Beta cells and no calendar `title`. Why: `expo-sharing` + the cache-directory file are
  native paths; the share sheet itself has no simulator equivalent worth counting.
  **Android 2026-09-02 — BLOCKED by a MAJOR defect:** the Settings screen has no scroll container, so "Export my data" is unreachable on a phone (day-2 notes 23; fix batch F8). Re-run on the rebuilt APK.
  **Android ✅ 2026-09-02 (build 3, device half):** Settings → My data → Export → the Android share sheet offered Gmail / Quick Share / Telegram; status "Export ready — 14 tables shared." Opening the JSON on the device = owner. Erasure stays last.
  **iOS 2026-09-07 ✅:** Settings → Export → the share sheet with "hourwell-export-2026-09-07 · JSON · 256 КБ" and AirDrop / Messages / Mail / Notes / Copy / New Quick Note / Save to Files (`shot-b1-export-sheet-*.png`, cropped); saved to Files; the JSON pulled from the app's cache: `format: hourwell-export`, tasks 12 / plans 11 / recommendations 80 / events 89 / profile / feedback_rewards / belief_labels (notes item 26).
- ✅ **FR-42 — erasure on device** (P10). Settings → Delete (two confirmations) → the
  confirmation screen with a reference → relaunch → onboarding; notifications scheduled before
  the deletion never fire afterwards; the reference exists in `deletion_audit` (owner: an
  aggregate `count(*) where id = …` — no row browsing). Why: the local wipe + `signOut(local)`
  - cancelled notifications is a device lifecycle path.
    **Android 2026-09-02:** same blocker as export (Settings unscrollable); deliberately last in the pass anyway.
    **Android ✅ 2026-09-05 (build 5, owner):** two confirmations → "Your account is deleted" with the reference `e1d0b2eb-…`; server: all eight user tables at 0, `auth.users` row gone, `deletion_audit` +1 with that id (`user_request`, 180 ms); device: 0 pending Hourwell alarms (tonight's ritual cancelled), empty shade; "Start over" and a cold relaunch both land on the welcome screen (day-5 notes item 17).
    **Re-verification owed (2026-09-06, ADR-0021):** the two prompts are in-app dialogs now (the build-5 result stays as history of the OS-alert version). Repeat on a fresh throwaway account with two tasks and one plan: Android over adb (session, this branch), iPhone by the owner during the iPhone pass.
    **Android ✅ 2026-09-06 (build 8, session over adb, fresh throwaway `d2aade77-…` with two tasks, one plan, two alarms):** in-app dialog 1 → Continue → dialog 2 → Delete everything → "Your account is deleted" with `Reference: 3192fba6-…`; server: `auth.users` row gone, all eight user tables at 0, `deletion_audit` 56 → 57 with that id (`user_request`, **113 ms**); device: alarms 2 → 0, 0 posted notifications; "Start over" and a cold relaunch (562 ms) both land on the welcome screen; a second throwaway proved the 400 ms arming (two taps within 129 ms → step 2 still up) and was then erased the same way (`96719cfd-…`, 78 ms) — `android-20260906-dialog/notes.md`. iPhone pending.
    **iOS:** pending — the erasure on this throwaway (with the double-tap arming test) is tomorrow's last step.
- ⬜ **NFR-A1 — VoiceOver / TalkBack on the P10 surfaces** (P10). Settings: switches announce
  label + state; mute chips read "checkbox, Mute reminders for Admin, checked"; ritual time
  chips read as radios in a labelled group; the export/delete status line is announced
  (live region). Today: the reminders card and the tomorrow card are single summaries with
  two buttons each. Account-deleted: the reference is read as a whole. Why: composed labels
  and live regions are not verifiable without a real screen reader.
  **Android 2026-09-05 (build 5, owner):** "Delete account and data, button" ✅; the gear that opens Settings is announced as "Open settings, link" ✗ (minor; fix batch).
  **Android 2026-09-05 (build 6):** the gear dumps as `android.widget.Button` (`role="button"`, 57aa541); spoken confirmation: the owner skipped the listen (2026-09-05 evening) — the dump is the evidence.
  **iOS 2026-09-07 ✅:** the Settings sheet reads "Settings, Header", switches with their state (the daemon's raw "1"; VoiceOver says on/off per the owner's ear), mute chips as "checkbox, unchecked", evening times as "radio button, checked"; MINOR: each switch's visible label is also a separate static text, read twice (`ax-settings.json`, notes item 34).
- ⬜ **NFR-A2 — `p10-a11y-sweep.yaml` on both devices** (P10). Run via `scripts/device-pass.sh`
  at max text size (Android: + display size) with Reduce Motion (+ Reduce Transparency on iOS),
  light and dark; keep the screenshots for `p10-a11y-audit.md` §2. Why: the flow was written
  in P10 but not executed — it needs a development build with the notification categories.
  **Android 2026-09-02:** the flow fails on its date assertion regardless of scale (single-quoted YAML turned the regex into a literal backslash-w; fix batch F5) — evidence captured with adb screenshots instead (`a11y-maxscale/`); re-run on the rebuilt APK.
  **iOS 2026-09-07:** Maestro does not run on physical iPhones (its docs); the sweep was done with WebDriverAgent + DVT screenshots + the accessibility daemon's settings holds (`shot-b1-dt-max-*.png`, `shot-b1-rm-rt-ic-*.png`), dark scheme only. Findings under the NFR-A2 rows above.
- ⬜ **NFR-P2 — cold start and 60 fps on the P10 bundle** (P10). `device-pass.sh` steps 3–4
  (Xcode App Launch / `adb am start -W`, Instruments FPS / `gfxinfo`). Why: the bundle grew
  (notifications, sharing); the only number is the P2 simulator one.
  **Android ✅ 2026-09-01/02:** the two numbers above are on the P10+ bundle (release APK versionCode 1).
  **F7 on build 3 ✅ 2026-09-03:** a delivered block reminder (posted 12:20:34 for the 12:30 block) left the shade on the block's Start action (0 records 4 s later, 0 after background → foreground) — day-3 notes item 11.
  **iOS 2026-09-07 ✅:** the two NFR-P2 rows at the top (build 1 = the P12-era bundle with the dialog).
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
  **Android ✅ 2026-09-02 (build 3, Pixel 7a):** with today's plan persisted, the first open and 20 `am force-stop` + launch cycles added zero plan rows (18 → 18 → 18) on a build with a proven backend. Overnight `new_day` and the offline-first-open retry still owed. **2026-09-03 (build 3):** first open across the day boundary with the 3rd's plan persisted (the 2nd's ritual plan) added no request — warm foreground (770 ms) and cold start (549 ms), 24-h count unchanged; the no-plan `new_day` case and the offline-first-open retry are the 4th's first block (HANDOFF Day 4 item 1).
- ⬜ **NFR-P2 — cold start ×20 on the rebuilt APK** (the day-1 protocol; the p90 must be
  re-stated for the binary that ships the fixes and the Expo patch bump).
  **Android ✅ 2026-09-02/03 (build 3):** p90 551 ms (505–622) with warm OS caches (day 2); **post-reboot p90 1072 ms** (705–1202, n = 20, 2026-09-03 — day-3 notes item 12).
- ✅ **FR-22 / NFR-A2 — Today time gutter at 200 % + largest display** (F2): the clock stays
  on one line, the gutter grows, cards do not overlap. Take the same `a11y-maxscale/` screenshots.
  **Android ✅ 2026-09-03 (build 3):** "11:45 AM" on one line, cards intact (`android-20260903-1020/a11y-maxscale-build3/today-top.png`); residual: the card's time range breaks inside "PM" at 2.0 (cosmetic, day-3 notes item 10).
- ✅ **FR-40 / NFR-A2 — heatmap weekday header at 200 %** (F3): two-letter labels, one line,
  the summary label unchanged.
  **Android ✅ 2026-09-03 (build 3):** one line, no mid-word wrap; "Mo"/"We" ellipsize to "M.."/"W.." in the narrow columns (cosmetic residual); tree still carries the daypart summary (`insights-scrolled.png`/`.xml`).
- ⬜ **FR-11 — quick-add at default and 200 % scale** (F4): the short placeholder and the example
  caption fit, the border renders evenly, the caption swaps for the preview chips while typing.
  **Android 2026-09-03 (build 3), static half ✅:** placeholder "Add a task" fully visible, caption wraps cleanly, border even (`inbox.png`); the typing half (caption → preview chips at 2.0) not exercised today.
- ⬜ **NFR-A1 — TalkBack reads the tab as its name only** (F6): the tree label is "Today", not the
  icon glyph first; the owner's listening pass confirms the announcement.
  **Android 2026-09-03 (build 3), structural half ✅:** the tab nodes' `content-desc` are "Today" / "Inbox" / "Focus" / "Insights" with the glyph in a separate, unlabeled node; the visible "Insight…" truncates at 2.0 (visual only). Listening pass = owner.
  **Android ✅ 2026-09-05 (build 5, owner listening):** "selected, Today, tab, double tap to activate", "Inbox, tab", "Focus, tab", "Insights, tab" — names only.
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

## Fix-batch rows only hardware can settle (added 2026-09-08 with the batch)

- ✅ iOS **NFR-A1 — the block card's custom actions, by ear.** VoiceOver: swipe to a card, the rotor
  (or swipe up/down) lists "Start / Done / Skip / Move…" ("I did it" on a lapsed card), a
  double-tap runs the same handler as the button; the summary ends with the state ("Not done —
  back in your Inbox"). TalkBack: the actions menu (Pixel). Why hardware: XCUITest and the
  uiautomator dump list buttons regardless; only a screen reader exercises the container's
  actions. Structural half: `hw-ios-ax.py items` on build 2.
  **iOS 2026-09-08 build 2 ✅ (owner's ear):** the rotor lists Start / Done / Skip / Move… ("I did it" on a lapsed card), a double-tap runs them, the summary ends with the state (day-2 notes item 69). TalkBack on the Pixel ⬜.
- ⬜ **FR-42 / NFR-A2 — Reduce Motion with a LATE replacement.** The 120 ms grace covers the
  erasure's next-tick step 2; a failure dialog arriving after a network call (> 120 ms) still
  unmounts and mounts. Provoke it (airplane mode + a confirm that ends in a failure dialog) under
  Reduce Motion; expected: the failure dialog presents. If it does not, the grace must become
  "until the next request or a longer timeout".
- ✅ iOS (layout) **NFR-A2 — the font-scale re-mount and what it resets.** Change the text size while a task
  form is open / the Move picker is up / a skip diagnostic is on Today; expected: correct
  layout after the change, the form and picker gone (same as an app kill), the diagnostic not
  re-raised until the next miss (adversarial pass #14, accepted).
  **iOS 2026-09-08 build 2:** the layout re-measures live both under the daemon hold (Inbox, the Settings sheet, an open task form) and through the Settings app's Larger Text slider at 83 % (Inbox rows 24 → 31 pt, no clipping; the sheet's strings whole) — but **no re-mount was observed**: the tab and an open task form survived, so the `fontScale` key never changed on either path and the reset half of this row did not happen. Why build 2 re-lays out where build 1 clipped is not established (notes items 68–69). Revisit: drop the key or find the real cause; the outcome holds.
- ⬜ **FR-26 — the spent ritual across a real evening-time change with budget left.** A day with
  fewer than four deliveries: move the ritual earlier (server), let it fire, move it back to
  20:00 — the OS log must show no re-add of `ritual:<day>` (day 2 could not: the count was
  already at the cap, notes item 62).

## Pass status (2026-09-08 — iPhone day 2)

**Day 2 on the same build and account** — evidence under `device-pass/ios-20260908-1215/`
(notes items 50–63, continuing day 1's numbering). Read from the phone's log archive and the
server before the phone was touched: the app frozen all night, never killed; the ritual fired a
**second time at 20:00** (FR-26 defect, item 51); this morning's four nudges fired to the frozen
app; the daily authority attributed the 7th at 00:00:03; the nightly training backfilled
propensities on 79 rows and left the 12 exploration-slice rows exact. On the device: the day's
first foreground (the owner's unlock swipe, recorded as such) showed the ritual plan with zero
plan requests (UC-03, accepted-ritual branch) and lapsed five blocks (invariant 7, up to 18.9 h
late); **MAJOR** — the same sync's pull reverted the four local lapses to `shown` and the next
foreground lapsed them again (duplicate facts, double streaks, a phantom third-skip diagnostic;
item 55); a clean cycle afterwards lapsed one block once; the reminder ledger reset at the day
boundary (four delivered + the ritual = five, no afternoon nudge); FR-30 across a 10-minute lock
and a kill; a ritual under Do Not Disturb delivered silently and listed after Focus ended.
**Fix batch F1–F8 → build 2 (17:40), re-checked on this account:** F3 (pull) ✅, F1 (Reduce
Motion, daemon) ✅, F2 (state by the daemon, actions by the owner's ear) ✅, F5 layout ✅ on both
paths (the re-mount itself never observed — notes item 69), F4 ⬜ (needs a day with budget),
F6/F7 jest-only; a third reward defect found on the way (the 2 h
stale session rewarded as a completion) — fixed on the branch, re-check next build (notes
items 65–68). **The pass closed 2026-09-08 18:18** with the erasure of the throwaway (item 70; the arming
test not deliverable by XCUITest). Still open on iOS, by circumstance not limitation: the
calendar consent (test user) and its disconnect dialog, the client-side NFR-P1 export, the
two-device rows (⛔ 6), the spent-ritual row (a day with budget left), a late replacement under
Reduce Motion; on Android: the TalkBack listen for the card's actions. Brightness restored by
the owner; Auto-Lock (Never for the pass) still to restore.

## Pass status (2026-09-07 — iPhone day 1)

**The iPhone pass started 2026-09-07 on the owner's iPhone 12 (A14, 2020; iOS 26.6), build 1 =
main `4d67a78`, free-provisioned, signature to 2026-09-14** — evidence under
`device-pass/ios-20260907-1130/` (notes items 1–49). Session-driven on iOS: WebDriverAgent for
touches, pymobiledevice3 for screenshots / logs / the accessibility daemon (spoken order,
settings holds, audits), devicectl + xctrace for launches and traces, the phone's log archive for
after-the-fact reconstruction; the owner's hands for the developer-profile trust, unlocks, the
VoiceOver listen, the calendar consent and the ritual long-press. Rows above carry an
**iOS 2026-09-07** paragraph each. Day-1 findings for the fix batch: MAJOR — the second erasure
dialog never appears under Reduce Motion (system switch confirmed); MAJOR — the block action row
is unreachable by a screen reader (both platforms by construction); a live text-size change does
not re-lay out (200 % clips and overlaps; a fresh launch is correct); a systemic "default
renders before the first read" family (Settings calendar/permission, Inbox, Focus, the task
sheet) with a shared fix; the Android callback screen never leaves on its own; possibly a
second ritual on one day after the evening time is moved back (read tonight). Still open on
iOS: the overnight lapse scan + UC-03 day boundary (tomorrow morning), FR-30, the calendar
consent (test-user gate) and its disconnect dialog, the erasure on this throwaway with the
double-tap arming test, Focus modes, the client-side NFR-P1 (PostHog export), the two-device
rows (⛔ 6).

## Pass status (2026-09-05)

The **Android pass on the Pixel 7a is closed** (days 1–5, builds 1–5; day notes under
`device-pass/android-2026090*`). Rows still ⬜ fall into three groups: (1) iOS-only rows — out of
scope by the owner's store decision (no Apple developer account, no iOS participant channel;
`docs/store/metadata.md` §7); (2) rows that need the mailbox / Google client (⛔ 6 in HANDOFF);
(3) **Android rows re-verified on build 6 (2026-09-05, post-pass fix batch): blank cards ✅ (0/72 scans over 7- and 13-block lists at two densities), ADR-0019 days off ✅ (first open, ritual list, tomorrow card), the gear role ✅ by dump (spoken word = owner's optional listen), the exact-alarm prompt ✅ (round trip to `window=0`)** — `device-pass/android-20260905-1725-build6/notes.md`. Left open from the batch by design: the stale-ritual re-plan of today and the diagnostic-card persistence (revisit).
