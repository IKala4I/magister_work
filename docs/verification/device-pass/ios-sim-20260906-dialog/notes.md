# iOS simulator — the in-app dialog presents from inside the Settings sheet (2026-09-06)

**Smoke check, not device evidence** (CLAUDE.md "Simulator evidence"): iPhone 16 simulator on
an M-series Mac, Release configuration (`expo prebuild --clean --platform ios` +
`expo run:ios --configuration Release --device "iPhone 16" --no-bundler`, Sentry upload
disabled), tree `9593903`. What it settles is a UIKit rule, not a device-conditioned item: RN
Modal presents from its NEAREST view controller, so a dialog opened while the native Settings
sheet is up must present from a host inside that sheet — the adversarial pass's MAJOR 1.

- `maestro test e2e/dialog-settings.yaml` — **1/1 passed (49 s)**: fresh install → onboarding
  (P4 walk, quick-add skipped: Maestro cannot dismiss the simulator keyboard) → Settings →
  "Delete account and data" → **`Delete your account?` visible with Continue / Keep my account**
  (`dialog-delete-1-light.png`) → Continue → **`This cannot be undone`, Delete everything /
  Cancel** (`dialog-delete-2-light.png`) → Cancel → gone → "Sign out" → **`Sign out of the trial
account?`** (`dialog-sign-out-light.png`) → Keep my data → gone, Settings still up.
- A first attempt with the host only in the root layout was not run — the fix went in before
  the simulator proof; the failing case is documented by the RN source
  (`RCTModalHostViewComponentView.mm:154`) and ADR-0021.
- Not settled here (device rows stay open): VoiceOver order and the escape gesture, Dynamic Type,
  Reduce Motion/Transparency, the real erasure on an iPhone (the owner's hands, iPhone pass).
- **Dark + accessibility-XXXL (`simctl ui … appearance dark`, `content_size
accessibility-extra-extra-extra-large`), `e2e/dialog-settings-a11y.yaml` on the onboarded app:**
  both erasure dialogs render and are cancelled (`dialog-delete-1-dark-xxxl.png`,
  `dialog-delete-2-dark-xxxl.png`); the flow then failed its **sign-out** step (`Sign out of the
trial account?` not visible after `scrollUntilVisible: Sign out` at that size — a Maestro
  scroll/tap miss at XXXL on the simulator, not a dialog defect; the same step passed at medium).
  The P4 onboarding itself cannot be walked at XXXL by Maestro (`5:00–6:30` not found) — the
  a11y flow therefore runs on an app onboarded at medium first. Simulator state restored
  (light, medium).
