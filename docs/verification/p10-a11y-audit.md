# P10 — WCAG 2.2 AA audit (NFR-A1) and the 200 % / reduced-motion sweep (NFR-A2)

> Scoped as **"prepare for device verification"** (PLAN §3 P10; CLAUDE.md "Simulator evidence").
> Three kinds of evidence, kept apart: **(T)** a test on every commit, **(S)** a simulator /
> static check done in this phase, **(D)** device-conditioned — protocol ready, result pending
> the owner-run hardware pass (`scripts/device-pass.sh`, `device-checklist.md`).

## 1. Mechanical evidence (T) — `apps/mobile/src/ui/__tests__/a11yAudit.test.ts`

| WCAG 2.2 SC                  | Rule the code follows                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1.4.3 Contrast (minimum)     | Body text: `textPrimary` on `surface` / `primaryContainer`, `textSecondary` on `surface` ≥ 4.5:1 in both palettes                                                                                                                                                                                                                                                                                                                | contrast matrix (light 16.1 / 13.6 / 6.0; dark 16.3 / 9.9 / 7.2)                                              |
| 1.4.3                        | `textSecondary` on `primaryContainer` is **large-text only** (dark 4.36:1) — banner captions use the primary tone                                                                                                                                                                                                                                                                                                                | matrix rule ≥ 3:1 pinned; Today's P10 cards use `tone="primary"` captions                                     |
| 1.4.3                        | On-primary button text: white in light (6.3:1), the dark surface colour in dark (6.3:1) — **fixed in P10**, white on `#818CF8` was 2.98:1                                                                                                                                                                                                                                                                                        | `Button.tsx`; matrix rule ≥ 4.5:1                                                                             |
| 1.4.3 / 1.4.1 Use of colour  | Accent colours (`success`, `warning`, `energyHigh/Low`) are **never text** (light: 2.4 / 2.7 / 2.1 / 2.5:1 on the surface) — **three captions fixed in P10** (Done caption, Settings + sign-in warnings); state is in the words                                                                                                                                                                                                  | source rule: no `color: colors.<accent>` on text; heatmap = fills + full text alternative (P9)                |
| 1.4.11 Non-text contrast     | `primary` and `danger` as icon/text colours on the surface ≥ 3:1 (light 6.0 / 3.6; dark 6.3 / 6.8)                                                                                                                                                                                                                                                                                                                               | matrix rule                                                                                                   |
| 4.1.2 Name, role, value      | Every `Pressable`/`Touchable*` in `app/` and `src/ui` carries an `accessibilityRole`; every `Switch` an `accessibilityLabel`; chips expose `checkbox`/`radio` + state                                                                                                                                                                                                                                                            | source scan (all shipped screens)                                                                             |
| 1.4.4 Resize text            | All text goes through `ThemedText` (`maxFontSizeMultiplier = 2`, scaling never disabled); no raw `<Text>` outside the primitives                                                                                                                                                                                                                                                                                                 | source scan + `ThemedText` assertion                                                                          |
| 2.5.8 Target size (minimum)  | Buttons `minHeight 48`, rows `minHeight 48`, chips `minHeight 44`, header buttons 44 × 44                                                                                                                                                                                                                                                                                                                                        | styles (reviewed by hand: `Button.tsx`, `settings.tsx`, `(tabs)/_layout.tsx`); functional proof on device (D) |
| 1.3.1 Info and relationships | Grouped cards are single accessible elements with composed labels (P6/P9); P10 banners are `accessibilityRole="summary"` with a label; the ritual time chips sit in a labelled `radiogroup` and announce `checked` (radio semantics — fixed in the adversarial pass, also for the appearance radios); a stored ritual time that is not one of the four presets (set by another client) shows no checked chip until one is tapped | component tests (`today.test.tsx`, `settings.test.tsx`)                                                       |
| 4.1.3 Status messages        | Export/delete status lines use `accessibilityLiveRegion="polite"`                                                                                                                                                                                                                                                                                                                                                                | `settings.tsx` `DataSection`                                                                                  |

Ratios come from `src/ui/tokens/contrast.ts` (WCAG relative luminance); the full table for both
palettes is printed by `node -e` in the P10 session log and reproduced here:

| pair                             | light | dark  |
| -------------------------------- | ----- | ----- |
| textPrimary / surface            | 16.05 | 16.30 |
| textPrimary / primaryContainer   | 13.62 | 9.85  |
| textSecondary / surface          | 5.99  | 7.21  |
| textSecondary / primaryContainer | 5.08  | 4.36  |
| primary / surface                | 6.02  | 6.33  |
| danger / surface                 | 3.60  | 6.83  |
| success / surface (fill only)    | 2.43  | 9.83  |
| warning / surface (fill only)    | 2.68  | 8.35  |
| energyHigh / surface (fill only) | 2.06  | 11.32 |
| energyLow / surface (fill only)  | 2.45  | 2.49  |
| on-primary text / primary        | 6.29  | 6.33  |

## 2. Screen-by-screen checklist

Legend: ✅ T = pinned by a test · ✅ S = checked on the iOS simulator / by reading · ⬜ D = device pass.

| Screen                  | Roles & labels (4.1.2)                                                | Text scaling (1.4.4)           | Reduced motion (2.3.3)                  | Reading order (1.3.2)                               | Focus/target (2.5.8) |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------ | --------------------------------------- | --------------------------------------------------- | -------------------- |
| Onboarding (5 steps)    | ✅ T (P4 tests) · ⬜ D                                                | ✅ T ThemedText · ⬜ D         | no animation                            | ⬜ D                                                | ✅ S · ⬜ D          |
| Today (plan, cards)     | ✅ T composed block labels; P10 banners `summary` + label             | ✅ T · ⬜ D (200 % + 6 blocks) | ✅ T motion tokens collapse (P6) · ⬜ D | ⬜ D                                                | ✅ S · ⬜ D          |
| Inbox / task form       | ✅ T (P3)                                                             | ✅ T · ⬜ D                    | ✅ T undo bar (P3)                      | ⬜ D                                                | ✅ S · ⬜ D          |
| Focus                   | ✅ T (P7)                                                             | ✅ T · ⬜ D                    | ✅ T ring (P7)                          | ⬜ D                                                | ✅ S · ⬜ D          |
| Insights                | ✅ T grid summary + text view, toggles (P9)                           | ✅ T · ⬜ D                    | no animation                            | ⬜ D                                                | ✅ S · ⬜ D          |
| Settings (all sections) | ✅ T switches labelled, chips `checkbox`/`radio` + state, radiogroups | ✅ T · ⬜ D                    | no animation                            | ⬜ D (7 sections, 2 screens tall at 200 %)          | ✅ S · ⬜ D          |
| Account deleted         | ✅ T `summary` + mono reference with a label                          | ✅ T · ⬜ D                    | no animation                            | ⬜ D                                                | ✅ S · ⬜ D          |
| Local notifications     | copy through i18n; category actions labelled                          | OS-rendered                    | OS-rendered                             | ⬜ D (VoiceOver announces title + body + 2 actions) | ⬜ D                 |

## 3. The NFR-A2 sweep — protocol and status

- **Flow:** `apps/mobile/e2e/p10-a11y-sweep.yaml` (Maestro) walks every shipped screen at the
  maximum text size with Reduce Motion + Reduce Transparency on, asserts the key copy is present
  (nothing clipped away) and screenshots each state; light and dark. It extends the P2 27-step
  sweep (`p2-a11y-sweep.yaml`, ✅ PASS on the iOS simulator 2026-08-24) with the P3–P10 screens.
- **Status:** the flow is written and lint-checked for the hardware pass; it was **not executed
  in P10** — running it needs a booted simulator/device with a development build (Expo Go
  cannot register the notification categories/channels) and the `hourwell` scheme; the owner-run
  pass executes it on both devices through `scripts/device-pass.sh`, which also records the
  screenshots for this table. Until then every "⬜ D" above stays open, and the P2 simulator
  result is the only sweep evidence (27/27 at accessibility-XXXL, iOS simulator).
- **Known simulator-vs-device divergence to watch:** Android font scale + display size compound;
  Android `Switch` and `Pressable` hit boxes; iOS VoiceOver reading order of the Today block
  actions; notification action buttons under TalkBack.

## 4. What this audit does not claim

- No screen-reader session ran in P10 (VoiceOver/TalkBack on hardware — device checklist).
- Colour rules are pinned for the palette tokens; ad-hoc colours (`#FFFFFF` on primary) are
  covered by the same test, but a future inline colour would need a new rule.
- Target sizes are asserted by reading the styles, not by measuring rendered layout.
