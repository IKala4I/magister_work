# ADR-0021 — One in-app dialog replaces the OS alerts

- **Date:** 2026-09-06
- **Status:** accepted (owner request 2026-09-06: "replace the default OS alerts with one in-app
  dialog component, identical on Android and iOS"; two amendments the same day — animate per
  File 02 §3.4, and mark the calendar-disconnect site device-pending, not impossible)
- **Phase:** post-P12
- **Spec anchors:** File 02 §3.1 (calm precision; glass only for the recommendation layer),
  §3.2 (palette; `danger` = destructive actions), §3.4 (springs ≤ 250 ms, reduced motion),
  NFR-A1, NFR-A2; ADR-0014 §9 and ADR-0016 (erasure confirmed in-app, two confirmations);
  spec-conflicts L39 (accents as text), L41–L42 (this ADR).

## Context

Six confirmations went through `Alert.alert`: sign out of an anonymous account, disconnect
Google Calendar, the two erasure steps (FR-42 / UC-10), "replace this device's data?" before a
magic link, and "discard the other account's unsynced changes". The OS alert differs between
Android and iOS, ignores every File 02 §3 token, and is invisible to the a11y source audit —
the two places the hardware pass had already found defects in shipped UI (the Settings gear's
role; on-primary contrast in dark). The owner asked for one component, converting everything we
own so the app never mixes system and custom dialogs, and for the erasure flow to be re-verified
on hardware rather than left as the one exception.

Facts that shaped the design (all verified 2026-09-06):

1. **A JS overlay in the root layout renders behind the native modal screens.** Settings and the
   task sheets are `presentation: 'modal'` (native stack); RN `Modal` is its own window on
   Android and a presented view controller on iOS. **Corrected after the adversarial pass
   (2026-09-06):** on iOS the Modal presents from its NEAREST view controller — both renderers
   (`React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm:154`
   `[self reactViewController]`; Paper `RCTModalHostViewManager.m:69`), not from the topmost one
   as the first draft of this ADR claimed. A host beside the root `<Stack>` therefore asks the
   root view controller to present while it is already presenting the Settings sheet — which
   UIKit refuses. Hence one host **per presentation context** (the root layout, Settings, the two
   task sheets), the most recently mounted one rendering (`hosts` registry in the store).
2. **`danger` fails AA as body text.** `#EF4444` on the elevated white measures 3.76:1 and 3.60:1
   on the light surface (AA body = 4.5:1); white on a filled danger button 3.76:1. A derived text
   token is needed: `#B91C1C` (6.47:1) in light, the palette's own `#F87171` (6.10:1 on
   `#1A1D24`) in dark.
3. **RN Modal's built-in fade is not tunable** under the 250 ms cap and ignores reduced motion.
   Reanimated 4.5.1 has been a pinned dependency since P2 and was imported nowhere; duration-based
   `withSpring({ duration, dampingRatio })` consumes the motion tokens directly.
4. **The app had no transitions at all** before this dialog (device-checklist called it "by
   design"). File 02 §3.4 promises spring transitions; that absence is a divergence — recorded as
   spec-conflicts L42 — not a precedent (owner, 2026-09-06).

## Decision

- **One component, one active host, two tones.** `src/ui/dialog/`: a Zustand single-slot queue
  (ephemeral UI state — File 03 §2.1) with a promise API (`confirmDialog(...) → boolean`;
  `requestDialog` for 1–3 stacked actions) and `DialogHost`, mounted in the root layout AND in
  each native modal screen (`app/settings.tsx`, `app/task/new.tsx`, `app/task/[id].tsx`); the
  host registered last renders, the others render nothing. RN `Modal` (`transparent`,
  `animationType="none"`, `statusBarTranslucent`, `navigationBarTranslucent` — redundant under
  SDK 57 edge-to-edge, which makes the Modal window full-bleed anyway). No "choice" or "error"
  variant: nothing needs one, and errors stay inline captions (the export/delete status line is a
  live region verified on hardware; the calendar and sign-in captions are plain text —
  pre-existing).
- **Look:** elevated card at full opacity (never `GlassPanel`), `radii.card`, h2 title as a
  `header`, body, actions stacked full-width — confirm first, cancel last — all text-style (a
  filled "Continue" would emphasise the path toward deletion). Destructive labels in the new
  `dangerText` token via `Button kind="destructive"`; neutral confirm and cancel in `primary`.
- **Every way out but the confirm is a cancel:** the cancel button, the scrim, the Android
  back button (`onRequestClose`; RN suppresses `BackHandler` while the Modal is open, so the router
  never pops the screen underneath), the VoiceOver escape gesture (two-finger Z, via the card's
  `escape` accessibility action — RN emits `onRequestClose` on iOS only for sheet drags), and a
  native dismissal underneath an unanswered request (`onDismiss`: a notification tap dismissing
  the Settings sheet takes the dialog with it; the request resolves `cancelled` so the single slot
  can never jam). Resolution is idempotent per request id.
- **A destructive confirm is armed 400 ms after its request appears** (`DIALOG_ARM_DELAY_MS`,
  a fixed timer independent of motion): step 2 replaces step 1 in the same mounted Modal with its
  confirm at the same spot, so a double tap on "Continue" would otherwise erase the account. The
  neutral gate needs no arming; the two confirmations stay distinct in fact, not only in position.
- **Motion:** scrim opacity and card opacity + scale (0.96 → 1) on `springs.standard` (200 ms) in
  and `springs.fast` (120 ms) out, through `resolveMotion(useReducedMotion())` — under reduced
  motion every duration is 0 and the values are assigned outright (Reanimated derives spring
  stiffness from 1/duration², so zero is instant by assignment). A replacement (step 2, a request
  mid-exit) springs on from the current value — no reset to 0, no blink. The promise resolves on
  the press, before the exit; a stale exit callback never clears a newer request; the motion
  config is read from a ref, so toggling the OS setting never re-shows an open dialog.
- **NFR-A1:** the card is `accessibilityViewIsModal` (iOS ignores the sibling scrim; Android's
  Modal is its own window); the scrim is not an accessibility element; for every request the
  title (`header`) receives accessibility focus — on the Modal's first presentation via `onShow`,
  after 100 ms when the content is replaced while the Modal stays up — and readers speak it, the
  body next in swipe order. No separate `announceForAccessibility`: it would compete with the
  focus event (adversarial pass). `a11yAudit.test.ts` now fails on any `Alert.alert(` anywhere in
  `app/`, `src/` or `modules/`, asserts the elevated-card pairings, and treats `danger` like the
  other accents (fills/icons only).
- **NFR-A2:** `ThemedText` (200 % cap) throughout; title + body scroll inside a card bounded at
  80 % of the window; actions wrap on their own rows.
- **Not converted (OS-owned):** the notification permission prompt, `Linking.openSettings`
  hand-offs, `WebBrowser.openAuthSessionAsync` OAuth sessions, the native date/time pickers, the
  share sheet, install-time prompts.
- **Erasure keeps two distinct confirmations** (ADR-0014 §9, ADR-0016): a neutral gate, then the
  destructive one; the back button on either step keeps the account.

## Consequences

- File 02 §3.2 gains the derived `danger-text` token (spec-conflicts L41); §3.4 carries the
  divergence note (L42); the other surfaces' transitions are `revisit.md` items — Reanimated is now
  wired (babel via `babel-preset-expo`; jest via the worklets mock + `setUpTests()`), so each can
  adopt `springs.*` on its own.
- FR-42 is re-verified on hardware through the new dialogs: Android on a fresh throwaway account
  over adb (this branch); iOS during the iPhone pass (owner's hands: VoiceOver, Dynamic Type,
  Reduce Motion). The calendar-disconnect dialog is device-pending until the owner connects a
  calendar by hand on the iPhone — untested by circumstance, not by limitation.
- Tests: `dialog.test.tsx` (16), the four `Alert` spies in `settings.test.tsx` / `today.test.tsx`
  replaced by presses on the rendered dialog (+ a back-button test on both erasure steps; the
  arming window on the destructive confirms).
- Adversarial pass (fresh-context subagent, 2026-09-06): 2 MAJOR (the iOS presentation
  mechanism; the double tap onto "Delete everything") / 7 MINOR / 7 NOTE — all addressed above
  except the optional cancel weight (order and colour carry the distinction, as decided). A
  confirmed delete after Settings was unmounted underneath (notification-driven navigation) still
  completes and routes; only its failure caption has nowhere to render — expected.
