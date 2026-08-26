# P4 manual verification — onboarding, auth, cold-start instantiation

> Per CLAUDE.md "Simulator evidence": everything below that ran on the iOS simulator is a
> smoke check of behavior, NOT device evidence. What each run does and doesn't establish is
> stated per section. Android has not run on hardware (checklist item, pre-P12 pass).

## 1. Live smoke on the hosted EU project (NOT a simulator artifact)

`node docs/verification/p4-live-smoke.mjs` (from `apps/mobile`) exercises the real backend:
anonymous sign-in → completed-profile insert through RLS → trigger-instantiated priors.

**Result 2026-08-26: 9/9 PASS** — anonymous session (`is_anonymous`), profile insert, 48
beta_cells, exact File 04 §3 values (deep/MO/weekday α=5.92 β=2.08 @ prior_version 0;
deep/MO/weekend α=1.29 β=0.71), seed cluster (0, rmeq_seed), and both invariant-1 negatives
(RPC denied; model-state write blocked). This establishes the server-side cold-start path on
production infrastructure; it says nothing about the mobile UI.

## 2. UC-01 walk (Maestro, iPhone 17 Pro simulator, Release build, clean install)

`apps/mobile/e2e/p4-onboarding-flow.yaml` — **36/36 steps green** (2026-08-26): welcome →
all five rMEQ items answered to the max-morningness pattern (score 25 → DM) → hours defaults →
category pick → one seed task via quick-add ("thesis intro 90m") → finish → Today ("No plan
yet" — the first plan is P6) → Inbox shows the seeded row → Settings shows **"Trial account
on this device"** (the anonymous bootstrap signed in against the hosted project during the
walk) → relaunch lands straight in the shell (gate reads the persisted profile).

SQLite inspection of the app container after the walk:

- `profiles.user_id` is the anonymous **uuid**, not `local:` — the adopt contract rewrote
  ownership before any push; `rmeq_score=25, chronotype_class=DM, survey_skipped=0`,
  onboarding completed, `version=1, server_seq=3` — the **bridge push landed on the hosted
  project** (server assigned the sequence).
- `op_outbox`: `profile_update` **acked**; `task_upsert` + `event_append` unacked — correct:
  they wait for P8's sync engine.
- `events`: one `task_created` owned by the adopted uid.

Findings fixed during the walk (each was a real defect the simulator could catch):

1. Headerless screens collided with the status bar — `Screen` never applied the top safe-area
   inset (P2/P3 screens always sat under headers). Fixed with an opt-in `topInset`.
2. The seed-tasks "Finish setup" button hid behind the keyboard after an add (keyboard stays
   up for consecutive adds by design). Fixed with KeyboardAvoidingView around the step.
3. Flow expectation error, not a bug: quick-add's default category is Admin (P3: categories
   are form-edited, never NL-guessed).

What this walk does NOT establish: real-keyboard/IME entry, VoiceOver, magic-link deep links
from real mail clients, keychain persistence across reboot, Android anything — all on
`device-checklist.md`.

**200% font-scale smoke (simulator, `accessibility-extra-extra-extra-large`):** all four
onboarding steps walked green (17/17 steps) with screenshots per step; text scales and wraps,
nothing clips, steppers stay tappable, the seed-tasks CTA stays reachable. One cosmetic
finding fixed: day names wrapped mid-word ("Mond/ay") from a fixed 92-px width → minWidth +
flexShrink. Reduced motion: onboarding introduces no custom animation (system navigation
only), so the P2 reduced-motion machinery is untouched. The authoritative NFR-A2 sweep on
both platforms remains a device-checklist item.

## 3. Owner actions still open (⛔ — also in the phase report)

1. **Magic-link + conversion E2E needs a real mailbox**: on your machine/simulator, run the
   app, Sign in → enter your email → open the link (it must land on hourwell://auth-callback
   and sign you in); then Settings → "Add email to keep my data" from an anonymous session
   and confirm the link keeps the same uid. No code path is untested except the mailbox hop
   (`createSessionFromUrl` handles both ?code= and #token forms; jest + this walk cover the
   rest).
2. **Google OAuth consent screen + client credentials** — see the phase report's ⛔ block.
   The code path ships inert; the button surfaces "not available yet" until configured.

## 4. Gates at phase close (2026-08-26)

- jest: **30 suites, 238 tests, 0 failures** (includes the new rmeq/workingHours/profileDao/
  accountTransition/largeSecureStore/onboarding suites).
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check`: clean. `expo-doctor`: 21/21.
- pgTAP (`p4_cold_start_test.sql`, 240-cell fixture + boundary/instantiation/permission
  sections) runs in the CI db job — no local Docker; verified green on the PR before merge.
- Live smoke: 9/9 (section 1). Maestro walk: 36/36 (section 2).
