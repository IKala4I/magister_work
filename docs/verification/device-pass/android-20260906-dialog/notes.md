# Android — the in-app dialog re-verification (2026-09-06, ADR-0021, build 7)

Session-driven over adb on the Pixel 7a (Android 17). Owner decision: a **fresh throwaway
account only** — the build-6 test account (`a4c86ab5…`, observation finished) is abandoned
server-side by `pm clear`; nobody signs into it again (anonymous). Nothing in this pass waits
on a wall clock: every time-triggered fact is read back from `dumpsys` or the server rows.

## State before

- Phone: build 6 (`7e5e2fd8…`, installed 2026-09-05 17:37), night mode ON, font scale 1.0.
- Server: baseline counts read before `pm clear` (below).

## Protocol (docs plan §4, in order)

1. Build gate (`hw-build-gate.sh`) → `adb install -r` → `pm clear` → fresh anonymous account,
   onboarding over adb taps → two tasks → one plan (alarms > 0).
2. Dialog sweep at 1.0 and 2.0 font scale, largest display size, light/dark, animator scale 1 and
   0 — sites 3 (delete step 1), 4 (step 2, cancel), 5 (sign-in replace, cancel), 1 (sign-out
   anonymous, cancel); evidence per state: `ui-*.xml`, `shot-*.png`, `windows-*.txt`.
3. TalkBack structural half (dump with TalkBack on); listening pass = owner (optional).
4. FR-42, last: step 1 → Continue → step 2 → Delete everything → account-deleted screen →
   server counts → alarms → Start over → cold relaunch.
5. Restore OS state.

## Log

- **Server baseline (aggregate, before `pm clear`):** `auth.users` 70 (all anonymous),
  `deletion_audit` 56, `profiles` 43; newest user = the phone's build-6 account
  (`a4c86ab5-…`, created 2026-09-05 14:22 UTC). Device before: 2 Hourwell alarms pending
  (build-6 account), TalkBack installed (`com.google.android.marvin.talkback`), no
  accessibility service enabled, 1080×2400 @ 420 dpi.
