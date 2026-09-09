# ADR-0022 — Transitions on the plan surface (closing spec-conflicts L42)

- **Date:** 2026-09-08 (draft, written before the implementation; accepted with the phase PR)
- **Status:** accepted 2026-09-09 — built, pinned in jest, verified on the Pixel 7a
  (2026-09-08) and the iPhone 12 (2026-09-09); the plan was agreed with the owner on 2026-09-08
  evening (`docs/HANDOFF.md`)
- **Phase:** post-P12, branch `post-p12/motion`
- **Spec anchors:** File 02 §3.4 ("physics, not flourish: spring-based transitions ≤ 250 ms;
  reduced-motion honored"), NFR-A2, NFR-P2, UC-07 (move), FR-23 (skip/lapse never an error
  state), invariant 2 (facts beat plans), invariant 14; ADR-0021 (the dialog's motion path);
  spec-conflicts L42; revisit.md 2026-09-06; thesis-corrections #61.

## Context

The shipped app has one spring transition (the in-app dialog, ADR-0021). Every other state
change is a jump cut. File 02 §3.4 promises springs everywhere a state changes; the absence is
recorded as a divergence (L42), never as a decision. The owner asked for **few, well-chosen
transitions** — "a planner selling calm precision should feel settled, not busy" — chosen by
one test applied to every interaction: **does the motion tell the user what changed and where
it went?** Motion that only says "something happened" is decoration and stays out.

Constraints from the hardware passes: the `springs.*` tokens (≤ 250 ms) and reduced motion
collapsing every duration to 0 **through the same code path** (`resolveMotion(useReducedMotion())`,
as `DialogHost` does); Reanimated 4 on the UI thread only; drag-to-teach stays out (M10,
ADR-0008 §7); the 60 fps rows must not regress; and the blank-card defect (a paint assumption
that held on the simulator and failed on the Pixel — `e7bb05e`, corrections #53) applies to every
new transition on a surface with live controls.

### The inventory (2026-09-08)

| Interaction (what the screen does today)                                                                                    | Does motion tell what changed / where?                                                                                                                                                                                                | Verdict              |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Move…** confirmed: the block vanishes from one slot and appears at another (same row id); off-screen → it just disappears | **Yes — identity.** "The block you moved is this one, there." The eye needs continuity or a scroll to the destination.                                                                                                                | **Ship — S2**        |
| **Done / Skip / I did it**: action row gone, caption in, the card shrinks, every row below jumps ~50 px under the thumb     | **Yes — consequence.** The jump hides what moved; a settle shows the gap closing. The next block's buttons no longer teleport under the thumb (any tap there is a fact — invariant 2; a plausible mis-tap path, not an observed one). | **Ship — S1**        |
| **Plan applied / Re-plan**: banner, then the whole list replaced at once                                                    | **No.** A uniform settle of every card says only "something changed", which the banner already says — not what, not where.                                                                                                            | Dropped (decoration) |
| Task returns to the Inbox (skip/lapse → `tasks.status = inbox`)                                                             | No. The user is on Today; the card already says "back in your Inbox" in words. The Inbox insertion is unseen or decorative.                                                                                                           | Leave                |
| Inbox delete → undo bar; undo → row returns                                                                                 | Marginal; a convention, the words carry the affordance. Next candidate after this phase, not now.                                                                                                                                     | Leave                |
| Move picker / trade-off sheet / diagnostic card appearing                                                                   | No; prompts, instant is fine (S1's window incidentally settles the list under them after a tap).                                                                                                                                      | Leave                |
| Planning banner, notices, fallback line, Now marker                                                                         | No; status text.                                                                                                                                                                                                                      | Leave                |
| Tab switches, sheets, onboarding                                                                                            | Native navigator motion; not ours.                                                                                                                                                                                                    | Leave                |
| Insights toggles, Focus timer                                                                                               | Decoration.                                                                                                                                                                                                                           | Leave                |
| Drag-to-teach physics                                                                                                       | Out by decision (M10).                                                                                                                                                                                                                | Leave                |

## Decision

**Two transitions, both on the Today timeline, nothing else.**

- **S2 — Move: the block travels to its slot, or the list scrolls to it.** A move keeps the row
  identity (`setRecStatus(tx, rec.id, 'moved', …)`, `src/db/feedback.ts`), and FlashList v2
  keeps a cell's render key for an unchanged stable id across a reorder (`RenderStackManager.sync`,
  first pass `hasOptimizedKey(stableId)`). So a `layout` spring on the **cell container**
  animates the real travel (`springs.standard`, 200 ms) together with the rows that make room.
  Destination not rendered → `scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.3 })`
  once the rows update, and the freshly mounted card plays an **arrival settle**
  (`springs.emphasized`, 250 ms, dampingRatio 0.85 — the token's own stated purpose, "block
  placement"). The settle plays only when the card is (re)bound to the moved id inside the
  trigger window — i.e. never when the cell travelled (no double motion).
- **S1 — Done / Skip / I did it: the list settles instead of jumping.** The same cell `layout`
  spring, registered only for a short window opened by the tap. Caption and action row still
  switch instantly — words carry the state; screen readers get it from the label.
- **Dropped: the plan-applied entrance.** Fails the test (above). Recorded so it is not re-proposed.

### Mechanism

- `src/ui/motion.ts` (new; `tokens/motion.ts` stays pure data):
  - `layoutTransitionFor(spring)` → `undefined` when `spring.duration <= 0`, else
    `LinearTransition.springify().duration(d).dampingRatio(r)` (duration-based spring; Reanimated
    docs: duration wins over physics props). The reduced-motion collapse arrives through
    `resolveMotion` exactly as in the dialog — "no transition registered" is the duration-0
    outcome of one helper, not a second branch per site.
  - `useSettle({ key, playedAt, spring })` → `{ transform: [{ translateY }, { scale }] }`. On a
    `key` change (FlashList rebinding a recycled cell to another block) the shared value is
    **reset to rest synchronously**; when `playedAt` is newer than the last play for this key
    and within `SETTLE_TRIGGER_WINDOW_MS` (400) the value starts at 0 and springs to 1;
    duration 0 → assigned 1. Nothing waits on completion.
  - `LAYOUT_SETTLE_MS = 350`: the tap opens the cell-layout window (covers write → SQLite change
    event → re-render, plus the 200 ms spring).
- `Timeline.tsx`: `CellRendererComponent` is **one module-scope component** rendering
  `<Animated.View {...props} layout={useContext(CellLayoutContext)} />`; Timeline provides
  `layoutSettling ? layoutTransitionFor(motion.springs.standard) : undefined`. (A component
  created per render would remount every cell — the kind of bug the simulator flatters.)
  Outside the window the prop is `undefined`, so a recycle during scroll registers no transition
  — this protects the 60 fps rows. Timeline owns the FlashList ref and the `scrollToIndex`
  effect keyed on `[rows, movedId, movedAt]`; busy rows and the Now row get no settle.
- `RecommendationCard.tsx`: the `ConfidenceBlock` wrapped in an `Animated.View` styled by
  `useSettle`; the accessibility tree is unchanged (the `accessible` leaf stays the block's View).
- `app/(tabs)/index.tsx`: `resolveMotion(useReducedMotion())` once per screen (one listener,
  not one per card); `settleUntil` opened by `onAction` for `done | skip | did_it | move`, closed
  by a timer; `movedId/movedAt` set in the move confirm; `prepareForLayoutAnimationRender()`
  (FlashList's documented one-shot, reset after the next render) before the move write.

### Implementation notes (2026-09-08, the session that built it — technical, not re-opened)

Four details differ from the mechanism as drafted above; each is a consequence of something
read in the installed packages, not a change of decision.

1. **The one-shot is armed by Timeline on the reordering render, not by the screen before the
   write.** FlashList clears `animationOptimizationsEnabled` in the commit effect of _every_
   list render (`RecyclerView.js`: `commitLayout` → `ViewHolderCollection` `onCommitEffect`),
   and the screen re-renders once (the picker closing) before the SQLite change event lands —
   armed before the write, the flag would be spent on a render that reorders nothing. Timeline
   calls `prepareForLayoutAnimationRender()` during the render whose rows first carry the
   moved slot, so it is consumed by exactly the commit that moves the cells.
2. **The move opens the layout window at the confirm, not at the "Move…" tap.** The tap opens a
   prompt; the write is the confirm, and a picker held open for longer than 350 ms would
   otherwise close the window before the rows change. Done / Skip / I did it open it on the tap
   (the tap is the write).
3. **The arrival settle is triggered by the scroll landing, not by the tap.** The card bound to
   the moved id may mount while the scroll runs; a tap-stamped trigger would then be stale and
   the settle silently skipped. Timeline stamps `arrival = { id, at: Date.now() }` when
   `scrollToIndex` resolves and hands it to the card as `settleAt`; `SETTLE_TRIGGER_WINDOW_MS`
   still guards a later rebind (the same block scrolled back into a cell a minute later sits at
   rest). A travelled cell never receives a stamp (on screen → no scroll → no arrival).
4. **The screen hands the timeline the slot the write produced** (`moveBlockAction` returns the
   row; the DAO snaps a past start to the next quarter hour), and the timeline recognises the
   move by id **and** slot. A stale row — a sync pull carrying the old slot inside the window —
   is never mistaken for the move (pinned in `timeline.test.tsx`).

5. **Adversarial pass (2026-09-09, fresh-context subagent) — four fixes (`ac99dea`).** (a) MAJOR:
   the effect that issued `scrollToIndex` cancelled its pending promise in the cleanup, and the
   settle window closing at 350 ms (or any pull / clock tick) re-rendered the timeline before
   FlashList's stepped scroll resolved (≈ 300–450 ms) — the arrival settle never played; the
   Pixel's first off-screen recording (item 10 of the Android notes, one 19-frame run) is the
   scroll alone. The promise is now cancelled only by unmount or a newer move (refs). (b)
   `useSettle` wrote the shared value during render (Reanimated strict mode); the rebind reset
   moved into the layout effect — still before the next presented frame, which is the honest
   wording of the rule. (c) A block rebound to another cell inside the trigger window replayed
   its arrival; a module-level registry of settled stamps per key plays each arrival once. (d)
   `moved` never cleared; it is dropped after `MOVE_PENDING_MS` (3 s) and on a new plan.
   Recorded observation, no fix: `computeVisibleIndices` uses estimated layouts for unmeasured
   rows, so a destination near the fold can be judged on screen and travel to a partly hidden
   slot, and `scrollToIndex` lands near rather than at `viewPosition` (the iPhone landed at
   ≈ 54 % for a 0.3 ask).

Constants as shipped: `LAYOUT_SETTLE_MS` 350, `SETTLE_TRIGGER_WINDOW_MS` 400, `MOVE_PENDING_MS`
3000, arrival pose 8 px below / scale 0.97, `MOVED_VIEW_POSITION` 0.3.

### The rule (goes into the card's header comment too)

**A transition on a control-bearing surface never passes through an invisible or
non-interactive state.** The blank-card defect was a card mounted but not painted whose
Start/Done became facts. Therefore: transforms only — **never opacity**; rest values assigned
synchronously on rebind; no `entering` / `exiting` (they hold the view at progress 0 and
misfire under recycling); nothing a dropped completion callback could leave half-way invisible.

### Facts verified 2026-09-08

- FlashList 2.0.2 (installed package + ctx7 `/shopify/flash-list`): cells are
  `position:absolute; top` via `CellRendererComponent` (the fixture wraps it in `Animated.View`
  with `layout=`); `prepareForLayoutAnimationRender()` sets a one-shot flag
  (`useRecyclerViewController.js:459`, reset in `RecyclerView.js:343`); a cell leaving the
  engaged range is recycled — a permanent `layout` prop would animate those jumps.
- Reanimated 4.5.1 (ctx7 `/websites/swmansion_react-native-reanimated`):
  `LinearTransition.springify().duration().dampingRatio()`; the `layout` prop may be set to
  `undefined` dynamically ("disable it by setting it to undefined"). Jest: worklets mock +
  `setUpTests()` already wired (`src/test/setup.ts`, `setupAfterEnv.ts`); `getAnimatedStyle`
  with 17 ms fake-timer frames is the assertion pattern (`dialog.test.tsx` "motion" block).

### Baseline correction (NFR-P2)

The recorded 60 fps evidence is an **8-block** Today on the Pixel 7a (`gfxinfo`, 2026-09-02:
1733 frames, 0 janky, p99 10 ms) and a **7-block** Today on the iPhone 12 (xctrace Animation
Hitches, 2026-09-07: 0 hitches). The **13-block** Pixel list of 2026-09-05 was the blank-card
detector sweep, with no frame statistics. "60 fps held with 13 blocks on both devices" was an
overstatement; the checklist rows now say what was measured on which list. This phase measures
a 13-block list on both phones **before and after** on the same list, and the rows carry those
numbers.

## Verification protocol (both phones attached; the owner present)

Order: Pixel baseline → Pixel motion build → iPhone baseline → iPhone motion build (the Pixel
builds are adb-driven end to end; the iPhone needs the cable, the unlock and the trust).

1. **Pixel, build of main (baseline):** onboarding + 25 quick-add tasks over adb; the day-5
   13-block recipe (`device-pass/android-20260905-1725-build6/notes.md` item 9: device zone →
   `America/Los_Angeles` via `settings put global auto_time_zone 0` + `cmd alarm set-timezone`,
   the profile `timezone` → the same zone on the server, a working window on the server for the
   day, `am kill` → `am start -W`); Re-plan → 13 blocks; `dumpsys gfxinfo com.hourwell.app reset`
   → the day-2 swipe series starting inside the list (y > 490) → `dumpsys gfxinfo … framestats`
   → `gfxinfo-13blocks-main.txt`. Plan requests count toward the 30/24 h limit — three or four,
   not a loop.
2. **Pixel, motion build:** `expo prebuild --clean` + `assembleRelease`, `hw-build-gate.sh`,
   `adb install -r` (plan kept) → the same swipes on the same list → `gfxinfo-13blocks-motion.txt`.
   Pass = janky count and p99 no worse than step 1 on the same list. Then the transitions:
   `screenrecord` while driving Move (to an off-screen slot and to an on-screen one), Done, Skip,
   I did it; `hw-motion-frames.py` (new shared tool: per-frame change in the list region →
   transition length in frames) → each ≤ 15 frames at 60 fps; `animator_duration_scale 0`
   (RN reports reduce-motion) → each one frame. After every transition `hw-blank-cards.py`
   (0 BLANK) and a uiautomator dump with every block at its expected order. Interrupt test: a
   swipe inside the 350 ms window → no cell stuck off its slot, 0 BLANK.
3. **iPhone, build of main then build 3** (the day-2 command: `SENTRY_DISABLE_AUTO_UPLOAD=true
npx expo run:ios --device 00008101-0015081602F1003A --configuration Release --no-bundler`
   with the WDA runner and the live syslog stopped, phone unlocked): WDA onboarding + tasks
   (`hw-ios-wda.py type`); for 13 blocks try the **profile-zone-only** variant first (the server
   grid runs in the profile zone; the client sends the device-local date) — if the plan comes
   back under 10 blocks, the device zone flip in Settings is an owner step; `xctrace --template
'Animation Hitches'` attached across a 20 s thumb scroll on each build → the `hitches` table;
   then the same five interactions on build 3 with the trace attached (hitch-free is the frame
   evidence; iOS has no `screenrecord` — timing only from an owner-started QuickTime USB
   recording, analysed with the same tool); `hw-ios-ax.py items` + `dvt screenshot` after each
   → every card in the tree painted (crop each card rect, std-dev > 3); `hw-ios-ax.py hold
REDUCE_MOTION` → the same five, instant.

**Device eyes (what no simulator settles):** whether the cell `layout` spring fires at all on
Fabric with FlashList's absolute-positioned recycled cells; whether a recycle inside the window
flies; the arrival settle on a freshly mounted cell after `scrollToIndex` (mount-vs-rebind
order); paint after a transformed card returns to rest on the Pixel's renderer (the blank-card
class); the 60 fps rows with an `Animated.View` per cell; iOS `AccessibilityInfo` reduce-motion
reaching the helper (the daemon hold is the tool); and the owner's eyes on whether the move
reads as _that block going there_. **Fallback if the cell transition does not fire on hardware:**
a custom layout worklet gated by a shared value (Reanimated "custom layout transitions"), same
tokens, same collapse — decided on the phone, not in advance.

## Hardware results (2026-09-08 Pixel 7a · 2026-09-09 iPhone 12)

Evidence: `docs/verification/device-pass/android-20260908-motion/notes.md` (17 items) and
`ios-20260909-motion/notes.md` (12 items); the checklist rows carry the numbers.

- **NFR-P2, the same list on the build of main and the motion build.** Pixel, 13 blocks, 30
  injected drags: 1825 / 1824 frames, 1 janky each, p50 5 · p90 7 · p95 8 · p99 10 ms on both.
  iPhone, 16 blocks, 20 WDA drags under Animation Hitches: 847 / 807 frames, 8 hitches each,
  lifetime max 83.8 / 67.0 ms (p90 33.6 → 48.5 ms: one vsync of latency, no missed deadline).
  An `Animated.View` per cell costs nothing measurable.
- **The transitions fire on Fabric with FlashList's absolute cells** (the first device eye):
  Pixel — Done 11 frames (183 ms), Skip 10 (167), I did it 14 (233), on-screen move 12 (200),
  off-screen move: the scroll 17–19 frames, then — on the fixed build `ac99dea`, after the adversarial pass — the arrival settle as its own 7-frame run on the arrived card (the first build never played it; see the implementation notes), same-slot move caption only; iPhone (build 3, which carried the pre-fix arrival code) — 15 frames at one vsync after Done and Skip, 43 across the off-screen scroll, no hitch within 1.5 s of any tap; the arrival settle on iOS is pinned in jest, not observed on the device (the five hitches of that trace sit at the
  WDA scans between interactions). No fallback worklet was needed.
- **Reduced motion.** Pixel: one frame for Done and Skip, and for each move two single frames a tick apart (the panel closing, then the reorder on the SQLite change event) — under `transition_animation_scale 0`,
  the switch React Native reads (the animator scale the dialog pass used is never consulted;
  revisit.md). iPhone: held by the accessibility daemon, verified by a second client — captions,
  order and paint correct on Done / Skip / both moves; iOS has no frame counter.
- **No invisible state.** 0 BLANK in every after-scan on both phones (Android 15 recorded interactions, iOS 9 with evidence); the block order as expected every time; two interrupt tests on the
  Pixel (a fling 90 ms after Done; two Dones 200 ms apart) left no cell off its slot and logged
  every intended fact.
- **The owner's eyes (2026-09-09).** The judgement no tool makes — does the move read as _that
  block going there_ — was made by the owner on both phones after the fix (Pixel 7a on
  `ac99dea`, iPhone 12 on build 3): Move / Done / Skip reported good on each. The design test
  that chose these two transitions ("does the motion tell the user what changed and where it
  went") is therefore answered by a person, not only by frame counts.
- **Not established here:** per-transition frame counts on iOS (no `screenrecord`; the
  optional QuickTime recording was not made); "I did it" on iOS (no lapsed block without clock
  control — the same S1 window as Done).
- **Findings beside the claim:** the Experiment card's action row wraps on the iPhone 12
  (revisit.md 2026-09-09); the dialog pass's reduced-motion evidence was on the wrong Android
  switch (revisit.md, the checklist row reworded).

## Consequences (records, same commits as the code)

- File 02 §3.4 amendment line (evidence + record): the plan surface conforms on two
  interactions; drag physics still out. spec-conflicts L42 → closure paragraph. revisit.md
  2026-09-06 row → DONE. thesis-corrections #61 → amended (the principle realised on the dialog
  and two plan interactions; still no drag physics) + rollup line.
- device-checklist: rows for the two transitions (timing, reduced motion one frame, no card
  unpainted after any transition, no cell off its slot after an interrupted one), the NFR-P2
  rows restated with list sizes and the before/after numbers.
- traceability rows (NFR-A2 / File 02 §3.4 / UC-07 → file:line → test → PASS), CHANGELOG
  "Post-P12 — motion", versions.md (FlashList `CellRendererComponent` +
  `prepareForLayoutAnimationRender`, Reanimated layout springs — verified 2026-09-08), the
  Ukrainian explainer section, HANDOFF.
- Tests: `layoutTransitionFor` (undefined at 0; token duration/ratio otherwise); `useSettle`
  through a probe (plays on a fresh trigger and settles under 250 ms; **a key change resets to rest before the next presented frame**; a stale trigger never plays; at rest on the first frame under
  reduced motion; no `opacity` key); Timeline (context undefined outside the window, a
  transition inside; the moved index found; `animated: false` under reduced motion); Today
  (the window opens on done/skip/did_it/move and closes after `LAYOUT_SETTLE_MS`; move sets
  `movedId`); `a11yAudit` unchanged.
- Adversarial pass (fresh-context subagent): recycling, reduced motion toggled mid-transition,
  a sync pull inside the window, 200 % font, a move to the same slot, a plan with 0 blocks, a
  cold start with a persisted plan, the Now row crossing a moved block.
