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
- **Build 7** = `c36de47` (the announce fix), clean prebuild + `assembleRelease` 20:29–20:32,
  `7a72cd8d1c5f0a78…`, 121 313 766 B; gate ✓ (bundle host hit 1; `SCHEDULE_EXACT_ALARM`,
  `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS`); `adb install -r` 20:32:38.
- **Fresh account** via `maestro test e2e/p4-onboarding-flow.yaml` (`clearState` = `pm clear`;
  1/1 passed in 4 m 19 s): `d2aade77-b0fa-4edd-a290-192de065282c`, anonymous, `Europe/Kiev`,
  onboarding completed 17:36:01 UTC, 1 task ("thesis intro 90m"). Sunday given a window
  09:00–23:00 (`hw-set-working-hours.mjs`, server_seq 4606/4608) and one 45-min task seeded
  (`hw-seed-tasks.mjs`, seq 4607) → 2 tasks after the pull. "Plan my day" (adb tap 20:38) →
  plan `learned`, 1 block "thesis intro" 8:45–10:15 PM (confidence 27 %), server `plans` 1 /
  `recommendations` 1; 2 Hourwell alarms pending. The 45-min task stayed in the Inbox (window end).
- **Dialog sweep on build 7 (session, adb; `hw-dialog-drive.py`, evidence `ui-*.xml`,
  `shot-*.png`, `windows-*.txt`)** — every dialog renders as its own window: the uiautomator
  dump contains ONLY the dialog's nodes (19 nodes, none of the Settings screen beneath — the
  structural half of "nothing under the scrim reachable"); title wrapper focusable with the
  header role, actions as `android.widget.Button` with the exact labels; the scrim is not an
  accessibility node.
  | state                                                                                       | delete 1 | delete 2 → Cancel | back on delete 1       | scrim tap | sign-out → Keep | sign-in replace → Cancel                                                        |
  | ------------------------------------------------------------------------------------------- | -------- | ----------------- | ---------------------- | --------- | --------------- | ------------------------------------------------------------------------------- |
  | dark 1.0×                                                                                   | ✓        | ✓ gone            | ✓ gone, Settings stays | ✓ gone    | ✓               | ✓ (deep link `hourwell://auth/sign-in`, email typed, "Email me a sign-in link") |
  | light 1.0×                                                                                  | ✓        | ✓                 | –                      | –         | ✓               | ✓                                                                               |
  | light 2.0× + display 540 dpi                                                                | ✓        | ✓                 | –                      | –         | ✓ (long body)   | ✓                                                                               |
  | dark 2.0× + 540 dpi                                                                         | ✓        | ✓                 | –                      | –         | ✓               | –                                                                               |
  | landscape light 2.0×                                                                        | ✓        | ✓                 | –                      | –         | ✓               | –                                                                               |
  | Screenshot read (dark 1.0×, `shot-dark10-delete2.png`): card on the dark elevated surface,  |
  | "Delete everything" in `#F87171`, "Cancel" in indigo, hairline between them, scrim over the |
  | status bar (edge-to-edge). Nothing here says anything about spoken output.                  |
- **Adversarial pass on the branch (fresh subagent, 2 MAJOR / 7 MINOR / 7 NOTE)** landed after
  this sweep; the fixes (one host per presentation context, 400 ms arming of destructive
  confirms, focus-only, escape action, `onDismiss`, no blink) are **build 8** — the sweep is
  repeated there before the erasure (below).
- **Build 8** = `9593903` (the adversarial-pass fixes), incremental `assembleRelease` 20:57:25–57,
  `e553e637ec061fac…`, 121 316 074 B; gate ✓; `adb install -r` 20:58:31 (account kept).
- **Sweep repeated on build 8** — light 1.0×: delete 1 ✓, delete 2 → Cancel ✓ gone, BACK on
  delete 1 ✓ gone + Settings stays, scrim tap ✓ gone, sign-out → Keep ✓, sign-in replace →
  Cancel ✓; dark 2.0× + 540 dpi: delete 1/2 ✓, sign-out ✓ (`ui-b8-*.xml`, `shot-b8-*.png`).
- **Motion, measured from `screenrecord` (60 fps, per-frame mean brightness of the screen =
  the scrim's fade; `rec-b8-anim.mp4`, `rec-b8-rm.mp4`, `*-brightness.txt`):** animated — the
  entrance ran over frames 52–60, **150 ms** (236 → 146), under the 250 ms cap (the spring's
  perceptual 200 ms; the last 50 ms sit inside the 2 % settle band); reduced motion
  (`animator_duration_scale 0`, RN reports reduce-motion) — **one frame** (frames 60–61, "33 ms"
  is the frame boundary): the dialog is fully there on the first frame. The exit was not
  captured (the cancel tap fell after the 5 s window); the unit test pins it at `springs.fast`.
- **TalkBack (structural half only):** with the service on, injected `input tap`s are consumed
  by explore-by-touch (a single tap focuses, my double-tap injection did not activate) — the
  dialog did not open under TalkBack from adb, and TalkBack logs no utterances at its default log
  level (799 logcat lines, all process/service noise — `talkback-logcat-b8-tb.txt`). The dialog's
  accessibility tree is the same with or without the service (the dumps above): title `header`
  focusable, `Button` nodes with the labels, no scrim node, nothing beneath. **Spoken order and
  the focus landing on the title = the owner's listening pass** (optional as before; on iPhone it
  is the VoiceOver row). Disabled again afterwards (`enabled_accessibility_services` cleared).
- **FR-42 erasure through the in-app dialogs (build 8, light 1.0×, 21:04 local):** "Delete
  account and data" → dialog 1 (`Delete your account?`, Continue / Keep my account) → Continue →
  dialog 2 (`This cannot be undone`, Delete everything / Cancel) → Delete everything (the tap fell
  > 1 s after the dialog appeared — outside the 400 ms arming window, see the double-tap check
  > below) → **"Your account is deleted"** with `Reference: 3192fba6-661e-4a2f-a894-4b0901604451`
  > (`shot-b8-erase-account-deleted.png`, `ui-b8-erase-account-deleted.xml`). Server (aggregate,
  > `after-erase.mjs`): `auth.users` row **0**; profiles / tasks / events / plans / recommendations /
  > feedback_rewards / beta_cells / bandit_state all **0** (before: 1 / 2 / 1 / 1 / 1 / – / – / –);
  > `deletion_audit` **56 → 57**, the row with the on-screen id exists, `reason = user_request`,
  > requested 18:04:43.839 → completed 18:04:43.952 UTC (**113 ms**); `auth.users` total 70 → 72
  > (the throwaway, then the fresh anonymous session "Start over" opens — the day-5 pattern).
  > Device: Hourwell alarms **2 → 0** (the block reminder and tomorrow's ritual cancelled), **0
  > posted Hourwell notifications** (`dumpsys notification` — the six package mentions are day-5
  > history rows). "Start over" (adb tap 540,715) → the welcome screen ("Hourwell — The planner
  > that learns your best hours — Get started"); `am force-stop` → cold relaunch (COLD, 562 ms) →
  > the same welcome screen (`ui-b8-start-over.xml`, `ui-b8-cold-relaunch.xml`).
- **The double tap (adversarial MAJOR 2), build 8, second throwaway (p4 flow #2, 1/1 passed
  18:08–18:12 UTC; profile + one task):** dialog 1 up → two `input tap`s at (540, 1290) — a
  point inside "Continue" AND inside step 2's "Delete everything" — issued from one adb shell
  **within 129 ms** → **step 2 still up, no account-deleted screen** (`ui-b8-arm-after-double-tap.xml`);
  Cancel → gone. The 400 ms arming holds on hardware.
- **Erasure #2 (build 8, 18:15:14 UTC):** dialog 1 → Continue → dialog 2 → Delete everything (tap
  > 1 s after it appeared) → "Your account is deleted", `Reference:
96719cfd-0a47-45dd-b078-742a5caa68e7`; `deletion_audit` 57 → 58, the row with that id,
  > `user_request`, requested 18:15:14.034 → completed 18:15:14.112 (**78 ms**); alarms 0. The
  > uuid was NOT captured before the erasure: my "newest auth user" read picked the iOS
  > simulator's concurrent account (the simulator hits the same hosted project — 9d7e6195, created
  > 18:12:43, still alive with a profile and 48 prior cells). Attribution by elimination instead:
  > the Android account after the p4 flow had a profile AND one task; of the seven auth users
  > created today after 17:00 UTC that still exist, none has both (five session-only rows from
  > "Start over"/relaunch/simulator attempts with neither; two fully onboarded simulator accounts
  > with a profile and 0 tasks) — the erased one is the device account. Lesson for the checklist:
  > read the device account's uuid from the device (or pause the simulator) before an erasure.
- **Anonymous rows left behind today:** 7 (`auth.users` 70 → 77 across the throwaways, the
  welcome-screen sessions and the simulator runs) — the anonymous-trial retention purge's
  material, as on day 5.
- **OS state restored** (font 1.0, density reset, night off, animator 1; TalkBack disabled;
  rotation auto). The phone holds a fresh anonymous welcome-screen session; no plan, no alarms.
