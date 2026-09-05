# Android hardware pass — build-6 re-check (Pixel 7a, 2026-09-05, from 17:25 EEST)

Post-pass fix batch (`post-p12/fix-batch-build6`, on top of `main` 6c8332b): ADR-0019 (function +
client + ritual), the `GlassPanel` clip (blank cards), `role="button"` on the header gear / Inbox
"+", the exact-alarm prompt (local Expo module). Same device, same rules as days 1–5 (no
wall-clock polling; raw logs stay out of the repo; the phone is the session's while a step runs).

**Build 6:** `expo prebuild --clean` + `assembleRelease` at 17:18 (debug-keystore signing, Sentry
upload disabled), 121 304 774 B, sha256 `389452bc34c31b00…`; gate (`hw-build-gate.sh`): bundle
host ✓, permissions `SCHEDULE_EXACT_ALARM` / `RECEIVE_BOOT_COMPLETED` / `POST_NOTIFICATIONS` ✓;
local module `exact-alarm (0.1.0)` autolinked. Carries the Expo SDK 57 patch drift (3) (PR #48) —
the first APK on those patches. Installed over build 5 with `adb install -r` (no account on the
device: the day-5 account was erased at 16:37).

**Calendar fact for today's checks (derived, not assumed):** 2026-09-05 is a Saturday; the
onboarding defaults are Mon–Fri 09:00–18:00 — so a fresh account's first open lands on a day
WITHOUT a working window (the ADR-0019 case), and tonight's daily ritual would plan a Sunday.

## Established (chronological)

1. **Fresh onboarding on build 6 (17:22:21–17:26:55, maestro `p4-onboarding-flow.yaml`, 4 m 20 s).**
   Welcome → rMEQ → hours (defaults Mon–Fri) → categories → seed quick-add → shell → Inbox row →
   Settings "Trial account on this device" all passed; the flow FAILED only at its relaunch
   assertion `No plan yet` — because build 6 shows the ADR-0019 copy on a Saturday (`uiautomator`:
   "No working hours today" / "Hourwell plans your working days." + the "Plan my day" button;
   `today-first-open-day-off.png`). The flow now accepts either copy (commit 3d3a6f9; the first
   landing assertion had already been widened before the run, the relaunch one had not). New
   account `a4c86ab5-…` created 14:22:40Z, onboarding completed 14:25:50Z, timezone
   `Europe/Kiev`, hours `mon–fri [540, 1080]`.
2. **ADR-0019 §1–§2 on a real Saturday — PASS (server + client).** After the first open, the
   relaunch and one more foreground (17:31, `am start -W` warm 39 ms): `plans` 0, `recommendations`
   0, `events` 1 (`task_created` — the seed task), `tasks` 1 (`hw-account-reads.mjs`). No
   `plan_requested` reached the function at all — the client answered the day locally and the
   dedup key held across the relaunch and the foreground (the day-1 disease, 30 zero-block rows,
   cannot recur on a day off). The 30/24 h budget is untouched.
3. **ADR-0019 §4 — the daily ritual is NOT scheduled on the eve of a day off; the Sunday review
   is — PASS.** `POST_NOTIFICATIONS` granted over adb (`pm grant`; a fresh account has no blocks,
   so the in-app card never asked), one foreground → `dumpsys alarm` lists exactly ONE Hourwell
   alarm: `origWhen=2026-09-06 20:00:00` (Sunday — the weekly-review variant, `ritual:2026-09-06`);
   no `ritual:2026-09-05` (Saturday's daily ritual would plan Sunday, which has no window).
   `alarm-after-first-foreground.txt`. The alarm carries `window=+1h0m0s0ms`: the exact-alarm
   app-op was reset to `default` before onboarding (`appops set … SCHEDULE_EXACT_ALARM default`)
   and Android 17 (SDK 37) denies it to a fresh install — the precondition for the exact-alarm
   prompt check below (item 6).
4. **NFR-A1 — the header gear and the Inbox "+" are buttons to assistive tech — PASS (dump; the
   TalkBack listen is the owner's optional 10 s).** `uiautomator dump` on build 6: `Open settings`
   → `class="android.widget.Button"` (bounds [965,144][1080,260]); Inbox `New task` →
   `android.widget.Button` ([0,144][116,260]). The same nodes in the build-3 dumps of day 3
   (`android-20260903-1020/a11y-maxscale-build3/today-top.xml`, `inbox.xml`) were
   `android.view.View` — the class TalkBack read out as "link" on day 5 (role="link" injected by
   `Link asChild`). Both tabs still navigate (the tap that produced the Inbox dump, and the tap
   back to Today).
5. **UC-01 / FR-21 — blank Today cards on build 6: 0 BLANK across two sweeps — PASS for what it
   covers.** Recipe: Saturday given a window `[540, 1440]` + sleep `[60, 300]` on the server
   (`hw-set-working-hours.mjs --user`, one SQL for the sleep window), 24 inbox tasks seeded
   server-side (`hw-seed-tasks.mjs`, 12 × 30/45/60 min + 12 × 30 min), one foreground pulled them
   (Today flipped from the day-off copy to "No plan yet" with no request), "Plan my day" tapped
   17:39:03 → plan `manual` learned 17:39:04.48, **7 blocks 5:45–11:45 PM** (an earlier tap at
   17:37:27, before the longer window, had planned 0 blocks — the window had 15 minutes left:
   "an empty plan is a plan", ADR-0019). Sweeps with `hw-blank-cards-sweep.sh` (six cycles of
   three drags to the bottom → detector → three drags back): **default density 24 card scans, 0
   BLANK** (pixel std-dev 30–37 inside every card; `blank-card-sweep-default.log`,
   `today-sweep-bottom-b6.png`); **font scale 1.3 (taller cards, more recycling) 12 card scans, 0
   BLANK** (`blank-card-sweep-fontscale-1.3.log`, `today-sweep-bottom-fontscale-1.3.png`); scale
   restored to 1.0. Caveats, stated plainly: the list had 7 blocks, not the 10 of the day-5 repro
   (the late-afternoon window is the reason; the recycling pressure is lower), and a first sweep
   at default density had scanned the bottom state six times without re-scrolling because the
   return drags started on the header — corrected in the script (drags start inside the list) and
   re-run; that first run's 18 scans were painted too. Gotcha for the recipe: `input swipe`
   starting above y≈490 (the header / a banner) never moves the list — start every drag inside it.
6. **FR-50 — exact-alarm prompt round trip on build 6 — PASS.** Precondition: app-op `default` →
   Android 17 denies; after the 7-block plan the Today card "Reminders may arrive late" with
   Allow / Not now was on screen above the timeline (`today-sweep-bottom-b6.png` shows the list;
   the card is in `ui-plan7-top` dump). One adb tap on **Allow** → the system screen
   `com.android.settings` "Alarms & reminders — Allow setting alarms and reminders" for Hourwell
   0.1.0 (`exact-alarm-os-screen.png`); tap on the switch → `checked=true`
   (`exact-alarm-os-toggled.png`), `appops get` → `Uid mode: SCHEDULE_EXACT_ALARM: allow`; BACK →
   Hourwell in front, the card gone on the foreground re-read (`today-after-exact-allowed.png`),
   and every Hourwell alarm now `window=0 exactAllowReason=permission`: block reminders 18:20,
   19:05, 19:50, 20:35, 21:50 (five = the day's cap, because the skipped Saturday ritual freed its
   slot — ADR-0019 implementation note) and the Sunday review 2026-09-06 20:00
   (`alarm-after-exact-allowed.txt`). Before the toggle the same alarms carried `window=+1h`
   (item 3). Nothing here waited on the clock: the alarm list is read, not the delivery.
7. **FR-26 in-app "Plan tomorrow?" card obeys ADR-0019 §4 (the review's MAJOR) — PASS both ways,
   no clock waited on.** The ritual time was moved on the server to two minutes ago
   (`hw-set-ritual-time.mjs 17:47 --user …`, now null-safe for a fresh profile) so `ritualDue`
   is true on the next pull: with Sunday WITHOUT a window the foreground showed Today with the
   timeline and NO "Plan tomorrow?" card (dump valid: Re-plan + 5 cards present;
   `today-ritual-due-sunday-off.png`); then `sun: [540, 1080]` added on the server → one
   foreground → the card appeared: "Plan tomorrow? — 18 tasks are waiting." with "Plan tomorrow"
   (`today-ritual-due-sunday-window.png`). Not tapped (a Sunday plan is not part of this batch).
8. **Restore and final state (17:5x).** Server profile back to the defaults it was onboarded with
   (Mon–Fri 09:00–18:00, sleep 23:00–07:00, ritual 20:00; `sat`/`sun` removed); one foreground
   pulled it: no tomorrow card, the 7-block Saturday plan still shown (a legacy plan on a day that
   is a day off again — timeline, "Re-plan", no deferred line), alarms unchanged (five exact block
   reminders 18:20–21:50 + the Sunday review 20:00, all `window=0`). Account `a4c86ab5-…` stays
   as a test account: plans 2 (both `manual`, 17:37 zero blocks / 17:39 seven blocks),
   recommendations 7, tasks 25, events 8 (types: task_created, recommendation_shown, recommendation_shown, recommendation_shown, recommendation_shown, recommendation_shown, recommendation_shown, recommendation_shown). Nobody taps the reminders tonight; if the
   owner wants the project clean, FR-42 erasure from Settings is the one-minute route. Build 6 is
   on the phone (`lastUpdateTime 17:37:00`, the post-review APK `7e5e2fd8cef659b0…`).

9. **UC-01 / FR-21 — blank cards on a 13-block list, both densities: 0 BLANK in 36 scans — the
   item-5 caveat is closed (20:58–21:05).** The limiter had been the horizon, not the task count:
   the minimum block is 30 min (`D_MIN_TICKS` = 2) and the 00–06 rule stops the grid at midnight,
   so a Kyiv evening caps at 6 blocks whatever the inbox holds. Recipe (no clock waited on): device
   zone → `America/Los_Angeles` (`settings put global auto_time_zone 0; cmd alarm set-timezone …`
   → 10:58 PDT, same calendar date), the profile `timezone` → the same zone on the server (the grid
   runs in the profile zone; the client sends the device-local date), `sat: [540, 1260]` on the
   server; HOME → `am kill` → `am start -W` (970 ms) so Hermes picked the zone up; the legacy
   7-block plan rendered 7:45 AM… in PDT with "Not done — back in your Inbox" on the lapsed blocks;
   "Re-plan" tapped → plan `3aa1342a` 20:59:15 EEST, manual, learned FEASIBLE, **13 blocks
   11:00 AM–8:45 PM PDT** (the 13th an Experiment block; "No room today for 12 tasks" = 25 − 13;
   `today-13blocks-top-pdt.png`). Sweeps (`hw-blank-cards-sweep.sh`, which now takes a `swipes`
   argument): **default density, 6 cycles × 5 drags, 24 card scans, 0 BLANK** (std-dev 25.0–38.5;
   `blank-card-sweep-13blocks-default.log`, `today-sweep-bottom-13blocks.png`); **font scale 1.3,
   6 cycles × 7 drags, 12 card scans, 0 BLANK** (28.1–36.2; `blank-card-sweep-13blocks-fontscale-1.3.log`,
   `today-sweep-bottom-13blocks-fontscale-1.3.png`). The bottom was reached in every cycle at both
   densities — the 8:15 PM card sits in the tree of every bottom dump. With item 5 the build-6
   evidence is **72 card scans over 7- and 13-block lists at two densities, 0 BLANK**; the day-5
   trigger was a 10-block list, so the ≥ 10 case is covered and the checklist row flips without the
   caveat. Assumption, stated: the zone shift changes only the horizon; the rendering path (FlashList
   recycling + the Android panel) is the same in any zone. Two seeded titles repeat in the list
   ("b6 task 01 admin" at 5:00 and 7:30 PM) — two tasks with the same title from the two seeding
   runs, not a duplicate block.
10. **Restore + one check of the deployed function (21:06–21:10).** Font scale 1.0; device zone back
    to `Europe/Kiev` with auto time zone on (`date` → 21:06 EEST); profile `timezone` back, `sat`
    removed; HOME → `am kill` → `am start -W` (615 ms) → the pull; Today shows the 13-block plan
    rendered 9:00 PM–… in EEST (a legacy plan on a day off again); `dumpsys alarm`: five exact block
    reminders (21:35, 00:35, 01:20, 02:05, 02:50 — the day's cap) + the Sunday review 20:00, all
    `window=0 exactAllowReason=permission` (`alarm-after-restore-13blocks.txt`). Nobody taps them;
    the `lapse_observed` facts tonight's foregrounds wrote on the legacy blocks are test artefacts.
    Then the optional check from the handoff: `plan-request` **v13** (deployed by the owner 20:47
    EEST; `supabase functions list` → version 13, ACTIVE) — one manual "Re-plan" tap on the
    windowless Saturday: `plans` 3 → 3 (no row persisted), no offline / error banner, the timeline
    unchanged. A manual request skips the local check and goes to the server, and on v12 the same
    tap persisted a zero-block row (the 17:37 row in item 5 is that shape, with a window), so the
    absence of a row is the v13 behaviour on the device. The literal `no_working_window` answer is
    not on the device — PostHog `plan_requested` (owner export) and the function log carry it.
    The TalkBack _listen_ is skipped by the owner's decision (2026-09-05 evening): the dump
    showing `android.widget.Button` is the evidence.

## Results by build

| Build              | Source                                                                                                               | Installed                  | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6 (pre-review cut) | `post-p12/fix-batch-build6` at 814f9ca, clean prebuild + `assembleRelease` 17:18, `389452bc34c31b00…`, 121 304 774 B | 17:22:06                   | gate ✓; fresh onboarding ✓ (flow failed only on its own "No plan yet" assertion); ADR-0019 §1–§2 first open on a Saturday ✓ (0 rows, dedup across relaunch + foreground); §4 ritual list ✓ (Sunday review only, `window=+1h` while the app-op was default); roles ✓ (dump)                                                                                                                                                                                                                                                                                                                                 |
| 6 (post-review)    | same branch at b5c7ad6 (review fixes), clean prebuild + `assembleRelease` 17:35, `7e5e2fd8cef659b0…`, 121 304 958 B  | 17:37:00 (`-r`, data kept) | gate ✓; day-off copy → "No plan yet" on the pull of a Saturday window with no request ✓; manual re-plan asks the server ✓ (0-block plan at 17:37 with 15 min left, 7 blocks at 17:39 after the longer window); **blank cards 0/36 scans** (24 default + 12 at 1.3×) ✓; exact-alarm prompt round trip ✓ (`window=0 exactAllowReason=permission` on all six alarms); FR-26 tomorrow card hidden / shown by tomorrow's window ✓; **blank cards 0/36 on a 13-block list** (24 default + 12 at 1.3×, Pacific-time horizon, item 9); manual re-plan on a windowless day → no row on `plan-request` v13 (item 10) |

## Not verified on this build (by choice or by construction)

- The TalkBack _spoken_ role of the gear — skipped by the owner's decision (the dump shows `android.widget.Button`; that is the evidence).
- ~~A 10-block list on the blank-card sweep~~ — closed by item 9 (13 blocks, both densities, 0/36).
- A ritual actually delivered on the eve of a day off (there is none to deliver — the check is the alarm list) and a stale ritual accept (ADR-0019 §5; unit-tested).
- `no_working_window` from the FUNCTION on the device: every device-side day-off answer was local (the client check runs first); the function path is Deno-tested and was exercised once indirectly — the 17:37 manual tap went to the server and got a plan, not a refusal, because Saturday had a window by then.

## Evidence files

`today-first-open-day-off.png` (item 1) · `alarm-after-first-foreground.txt` (3) · `today-saturday-planned-b6.png` / `today-saturday-replanned-b6.png` (5) · `blank-card-sweep-default.log`, `blank-card-sweep-fontscale-1.3.log`, `today-sweep-bottom-b6.png`, `today-sweep-bottom-fontscale-1.3.png` (5) · `exact-alarm-os-screen.png`, `exact-alarm-os-toggled.png`, `today-after-exact-allowed.png`, `alarm-after-exact-allowed.txt` (6) · `today-ritual-due-sunday-off.png`, `today-ritual-due-sunday-window.png` (7) · `today-13blocks-top-pdt.png`, `blank-card-sweep-13blocks-default.log`, `blank-card-sweep-13blocks-fontscale-1.3.log`, `today-sweep-bottom-13blocks.png`, `today-sweep-bottom-13blocks-fontscale-1.3.png` (9) · `alarm-after-restore-13blocks.txt` (10). Raw `uiautomator` dumps, native hierarchies and the full `dumpsys alarm` stay in the session scratchpad (owner rule: raw device logs stay private).
