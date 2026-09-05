# Android hardware pass — day 5 (2026-09-05, Pixel 7a, build 5 = 7c8f67c `d7fc4280bf56…`)

> Day-4 notes: `../android-20260904-0827/notes.md`. Server unchanged since day 3 (`plan-request` v12,
> `sync-resolve` v6, recsys `813cdbade0e9`). The app's own account is
> `334512a3-f28c-4ac0-96d8-17d9b1bae52c`; the pass ends today with FR-42 erasure (last).
> Queue for the day (owner, 09:4x): on-demand ritual re-check on build 5 → owner-attended items
> (off-grid move snap, TalkBack listening pass) → FR-42 erasure. Raw device logs, whole-shade
> screenshots and the owner's full-screen captures stay out of the repo (row crops only).

## Established today (chronological)

1. **State at 09:42 before any touch.** Process dead (killed 22:19:54 on the 4th, then the build-5
   install at 22:36:49), shade empty, `SCHEDULE_EXACT_ALARM` = allow, one Hourwell alarm:
   `ritual` **22:45 for the 5th** (`window=0`) — the 22:40:06 restore to 20:00 on the server had not
   been pulled (no foreground after it), so the phone still carried the 22:45 attempt from item 25 of
   day 4. Server: 1 plan for the 5th (the 0-block `evening_ritual` row from 22:13:28), budget 11/30,
   3 `notification_response` facts on record, 0 events today (`server-reads-before-ritual.json`).

2. **On-demand ritual — scheduling (09:46).** `hw-set-ritual-time.mjs 10:00` (server_seq 4437,
   06:46:08Z) → `am start -W` COLD 732 ms at 09:46:09 → within 30 s `dumpsys alarm` showed the
   ritual at **2026-09-05 10:00:00 `window=0 exactAllowReason=permission`** (and 10:00 on the 6th) —
   one foreground pulls the profile and the scheduler pass re-plans; the fresh calendar day has a
   fresh ≤ 5/day budget (no block reminders: today's plan has 0 blocks). HOME → `am kill` at
   09:47:00 (`pidof` empty; both alarms intact; shade empty). Persistent logcat writer running on the
   Mac from 09:45:18 (scratchpad, never committed; the Hourwell-only extract is
   `logcat-hourwell-day5.txt`).

3. **The 2 Sep contested point is settled by the owner's own screenshots (pulled over adb, cropped
   to the Hourwell rows).** `owner-ritual-2014.png` (20:14:43, the owner's own crop) and
   `owner-ritual-expanded-2022.png` (20:22:34) show the 2 Sep ritual **expanded — chevron up — with
   title + body and no action row**; `owner-today-after-tap-2022.png` (20:22:41) shows the
   "Plan tomorrow / Adjust tasks" pair on the **Today card** after the body tap. So the button the
   owner remembers was the in-app card; the build-3 notification never carried actions, and the
   day-4 item-6 root cause (empty block category registered first → the ritual category never
   stored) is established, not merely probable (day-4 item 14 updated). Bonus for FR-50 on build 3:
   `owner-blocks-1418.png` / `-1428.png` date the 2 Sep block reminders — 14:05 alarm posted
   14:06:21–14:07:00 (+1–2 min), 13:20 alarm 13:22:21–13:23:21 (+2–3 min), 12:35 alarm before 13:18
   (inside the +1 h inexact window; day-2 item 24 updated). The three owed `owner-*` files are in
   `android-20260902-1030/` (the full shots show other apps' private rows and stay on the phone).

4. **4 Sep PostHog exports (owner, 06:40Z / 06:41Z on the 5th) — complete, no re-export needed.**
   `plan_requested`: 12 rows 05:41:02Z–19:13:30Z = the 12 `plans` rows of 4 Sep, **12/12 paired**
   (`hw-posthog-pair.mjs`, now a shared helper: `nfr-p1-2026-09-04-pairing.txt`,
   `nfr-p1-2026-09-04-client-decomposition.json`). `sync_completed`: 59 rows 05:34:22Z–19:39:22Z
   (first = the facts of the 08:31 offline start landing at 08:34, last = the 22:39 foreground of the
   ritual-time experiment). `$app_build` is `1` on every row (versionCode never changed), so the
   build split is by time: rows from 06:11Z = build 4, all rows post-L1 (`sync-resolve` v6, 3 Sep
   10:16Z).

   | series (4 Sep, warm, Wi-Fi)                | n   | client p50 / p95 / max ms | function p50 / p95 | client − function p50 / p95 | fallbacks |
   | ------------------------------------------ | --- | ------------------------- | ------------------ | --------------------------- | --------- |
   | `new_day` 05:41Z (build 3, post-L1)        | 1   | 3040                      | 1009               | 2031                        | 0/1       |
   | build-4 manual series 07:51Z (post-L1)     | 10  | 2627 / **4127** / 4732    | 1056 / 1282        | 1618 / 3070                 | 0/10      |
   | `evening_ritual` accept 19:13Z (killed)    | 1   | 3089                      | 762                | 2327                        | 0/1       |
   | pooled post-ADR-0018 (3 Sep after + 4 Sep) | 20  | 2887 / **3963** / 4732    | 1062 / 1343        | 1777 / 2635                 | 0/20      |

   The build-4 series is faster at the median than the 3 Sep after-series (2627 vs 3043 ms) but its
   p95 is higher (4127 vs 3683) because of one 4732 ms request whose pre-plan sync took 3024 ms
   (pushed 13, pulled 25 — the first sync after the morning's facts); without that row the series is
   p50 2543 / p95 3202. **Pre-plan sync, post-L1:** 9 of the 12 requests carried one (the other
   three fell inside the 30 s freshness window), **p50 936 / p95 2367 / max 3024 ms** (pre-L1 3 Sep:
   1158 / 1540, n 17) — the median dropped by ≈ 0.2 s, the tail is dominated by backlog size, not
   by the reward pass L1 removed. Other reasons: `poll` 946 / 1812 (n 38), `foreground` 1686 / 3512
   (n 9), `write` 809 / 883 (n 2), `reconnect` 1618 (n 1). **Consequence for the thesis text
   (corrections #51 amended):** the Pixel 7a reference is "3.7–4.1 s p95 over two series of 10
   (pooled 4.0 s)", not 3.7 s; the decided ≤ 6.0 s weak-phone bound and the ≤ 1.5 s server bound
   (function p95 1.28 s) are unaffected.

5. **CI: expo-doctor patch drift blocked PRs #45–#47.** Every open PR failed only the
   "TypeScript gates" job — `npx expo-doctor` "packages match versions required by installed Expo
   SDK" (expo ~57.0.20, expo-notifications ~57.0.17, expo-router ~57.0.19, expo-sharing ~57.0.18
   expected; jest 521/519 green). Fixed as **PR #48** (`npx expo install --fix`, versions.md row
   "patch drift (3)", gates green locally: typecheck / lint / format / jest 519 / expo-doctor 21/21,
   auto-merge armed); #45 and #47 (which contains #46) get `main` merged in once #48 lands so their
   jobs re-run. The phone's build 5 stays on the previous patches — nothing measured today runs the
   bumped code.

6. **Tooling made shared today** (owner rule: recurring tooling lives in the repo, not in a
   session scratchpad): `docs/verification/hw-shade-tap.py` (expand the shade, locate the Hourwell
   row by icon template `lib/hourwell-icon-template.png`, colour-guarded tap on "Plan tomorrow" /
   "Adjust tasks" / body; self-tested on the stored 2 Sep and build-4 rows: diff 1.1 / 0.0, guard
   0 / 997–1106 blue pixels) replaces day 4's scratch `find-ritual.py` + `tap-adjust.py`;
   `docs/verification/hw-posthog-pair.mjs` replaces the day-3 scratch pairing.

7. **On-demand ritual on build 5 — delivered exactly, to a dead process (10:00).** `ritual:2026-09-05`
   posted **10:00:00.471** (`when=1788591600471`; exact alarm + 471 ms — fourth exactness point),
   channel `ritual`, title "Plan tomorrow?", body "15 tasks are waiting — one tap plans your day.",
   `flags=AUTO_CANCEL`, **`actions=[0] "Plan tomorrow", [1] "Adjust tasks"`** (both start-activity
   pending intents; `ritual-record-1000.txt`). Android forked the process at 10:00:00.050 for the
   `NotificationsService` broadcast (pid 22450, 16 threads, **no `mqt_js`** — native-only, as on
   day 4). The row arrived collapsed in the shade (body truncated, chevron down); one tap on the
   chevron expanded it and showed both buttons (`ritual-build5-expanded-with-actions.png`; located
   by `hw-shade-tap.py`, icon diff 7.3 at (86, 948), guard 1108 label pixels at the "Adjust tasks"
   target). The natively revived process was `am kill`ed before the tap (`pidof` empty).

8. **FR-26 "Adjust tasks" as the FIRST response from a killed app — PASS; both build-5 fixes
   verified (10:01:38 tap).** `NotificationForwarderActivity` 10:01:39.659 → process 22680 →
   MainActivity **displayed +945 ms**, JS "Running main" 10:01:40.308 → **Inbox** on screen
   (`after-adjust-tap-8s.png`) → exactly one `notification_response` (**`action: adjust`**,
   `variant: daily`, `latency_ms` 100 598 from the 10:00 `scheduled_for`; client_ts 10:01:40.598,
   server_ts 10:01:42.010) → **no plan request** (still 1 plan for the 5th, budget 11/30) → **the
   notification was gone from the shade** within 8 s (0 Hourwell records; day 4's defect 1: after
   the accept action the ritual stayed posted). So fix 7c8f67c holds on hardware for the dismiss
   (the same handler path serves the accept action) and the adjust-as-first-response route; the
   dedup-by-action fix stays unit-tested (a second action on the same notification cannot occur
   once the first one dismisses it). Ritual time restored to 20:00 on the server at 10:02:37
   (server_seq 4438; the next foreground pulls it). Still untested by choice: the Sunday plain
   tap → Insights (needs a Sunday ritual; the pass ends today) and the backgrounded accept
   (`server-reads-after-adjust.json`).

9. **MAJOR DEFECT — Today cards that exist but do not paint, whose buttons still fire (owner
   report 10:09; classified by the owner as a data-integrity defect, not a paint bug).** What the
   owner saw on build 5: the last card (5:15 PM) rendered as an empty white panel; a tap on it made
   the list jump; after scrolling back the 4:30 PM card was the empty one and 5:15 PM showed its
   content (`today-empty-card-owner-report.png`, 10:12:06). What the device says: the blank card's
   title, time, rationale and status caption are all present in the accessibility tree with correct
   bounds (`blank-card-a11y-excerpt.txt`), so the content is mounted natively and reachable by touch
   and by TalkBack — only the paint is missing. Reproduced over adb **5/5**: every scroll to the
   bottom of the list showed "Offline note" blank (pixel std-dev 0.0 inside the card against 31–38
   for painted cards; `hw-blank-cards.py`, scans 1/3/5/A/B2 10:13–10:22), it survived HOME → `am
start` (probe A, `today-blank-card-after-foreground.png`) and a forced re-layout via
   `font_scale` 1.05 → 1.0 (probe B). With Android's layout-bounds overlay on, the blank card shows
   its own box and **no child boxes inside** (`today-blank-card-layout-bounds.png`) — the overlay is
   drawn inside the panel's `dispatchDraw`, after React Native's `overflow: hidden` clip
   (`ReactViewGroup.dispatchDraw` → `BackgroundStyleApplicator.clipToPaddingBox`, a path built from
   the composite background drawable's bounds and radii), so an empty clip removes children and
   overlay alike while the panel background, drawn before the clip, stays. `GlassPanel` is a plain
   `View` with `overflow: 'hidden'` + `borderRadius` on Android (no blur — the iOS branch has the
   `BlurView`); the exact trigger of the empty clip is unresolved (RN 0.86.3, FlashList 2.0.2 with
   no `getItemType`; the Inbox list — no GlassPanel — painted every row on two scrolls,
   `inbox-bottom` check). Which card blanks moved once (gym at 10:12, "Offline note" from 10:13 on)
   and both were the short status-caption variant at the time.
   **Why it corrupts data, not just the view (the owner's two taps are the evidence, not noise):**
   the first tap on the blank 5:15 card hit its invisible **Done** — fact **567 `task_completed`
   10:09:53.242** (task "Offline note", recommendation `8609a931`, `completion_latency_minutes −425`,
   `source: block`); the second hit gym's invisible **Start** — fact **568 `focus_start`
   10:10:06.544** (recommendation `8d694fc6` → `accepted` v2, session `7d9b8018`). On the server
   both are ordinary behavioural facts: "facts beat plans" (invariant 2) makes them ground truth,
   the 23:55 attribution turns 567 into a completion reward for the (Admin, weekend evening) cell
   and 568 into an accept/abandon tuple (no `feedback_rewards` row yet at 10:35 — the instant path
   was not triggered), and nothing server-side can tell that the control was never seen. Exposure:
   every control inside a block card — Start, Done, Skip, Move…, "I did it" on a lapsed card —
   i.e. `focus_start`, `task_completed`, the negative skip signal and the move/displacement pair,
   feeding the Beta cells, the LinUCB state and the PAR metric. This is the thesis example of a
   client defect that corrupts the training signal silently (corrections #53).
   **Fix (post-pass batch, build 6):** (1) drop `overflow: 'hidden'` from the Android branch of
   `GlassPanel` — there is nothing to clip without the blur — one line; (2) if the blank still
   reproduces, FlashList 2.3.1 + `getItemType` for the row kinds; (3) verification on hardware
   only: a fresh plan, six scrolls, `hw-blank-cards.py` must report 0 BLANK; (4) data hygiene:
   this account is erased at the end of the pass, so the two facts die with it — in a study there
   is no after-the-fact repair for facts from unseen controls, which is why the paint fix is
   release-blocking. Not done today: the "does a fresh plan blank again" probe (a Re-plan would
   have changed the list the owner's move check needs).

10. **Saturday window for the owner-attended checks (10:03–10:05).** The profile has no weekend
    hours and Settings has no hours editor (ADR-0019 context), so `hw-set-working-hours.mjs` added
    `sat: [540, 1080]` on the server (server_seq 4439, 10:03:57) → one foreground pulled it → Today
    still read "No plan yet" over "No room today for 15 tasks" with a "Plan my day" button
    (`today-saturday-no-plan-yet.png` — the ADR-0019 copy) → tap → **plan `36736e30` 10:05:15, 10
    blocks 10:15–17:45, learned FEASIBLE, function 1661 ms, budget 12/30**
    (`today-saturday-planned-8s.png`, `server-reads-after-sat-plan.json`). Restore afterwards:
    `hw-set-working-hours.mjs --remove sat`.

11. **The owner left with the phone at 10:3x (unplugged; the app untouched from then on; tonight's
    20:00 ritual untouched).** Pending, owner-attended, resumed when the phone is back: the UC-07
    off-grid move (target "email replies" 3:45 PM → type 5:37 PM → expect 5:30/5:45; a refusal
    over the completed 5:15 slot also counts), the TalkBack listening pass (the owner can enable
    TalkBack from Android Settings → Accessibility; no adb needed), FR-42 erasure LAST. **Nothing in
    the queue was a timed check that fails by waiting** — no Monitor, no deadline. Tonight's ritual
    on an unplugged phone is the FR-50 "unplugged / Doze" delivery case the checklist still lacks:
    the owner only notes when it appears (no tap); the record (`when=`) is read from `dumpsys
notification` when the phone returns, unless dismissed. State when the phone left: Today in the
    foreground (scrolled), gym focus session running since 10:10 (the 2-h abandon rule closes it at
    the next foreground), "Offline note" completed by the accidental tap, working hours include
    Saturday, ritual time 20:00 on the server, 3 + 1 `notification_response` facts, budget 12/30
    (`server-reads-owner-away.json`). The persistent logcat writer ran 09:45:18–10:35 (Hourwell
    extract `logcat-hourwell-day5.txt`; raw file discarded).

## Results by build

| Build | Source / APK                                                                                         | Checks attributed to it                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4     | 24808ad, `e6c9ea1ef9f0…` (day 4)                                                                     | the 4 Sep client-side figures (item 4): manual series client p50 2627 / p95 4127 ms, function p50 1056 / p95 1282, pre-plan sync post-L1 p50 936 / p95 2367                                                                                                                                                                                                                                                        |
| 5     | 7c8f67c, `d7fc4280bf56…`, installed 2026-09-04 22:36:49 (older Expo patches than PR #48; see item 5) | ritual actions ✓ (+471 ms exact), "Adjust tasks" first response from a killed app ✓ (Inbox, one `adjust` fact, no plan), dismiss-after-action ✓ (day-4 defect 1 fixed), **blank Today cards with live buttons ✗ (MAJOR, item 9 — first observed today; the code path is unchanged since P6, so earlier builds most likely carry it)**; pending on the owner's return: UC-07 off-grid move, TalkBack, FR-42 erasure |

## Evidence files

`server-reads-*.json` (before-ritual / after-adjust / after-sat-replan / after-sat-plan /
empty-card-report / owner-away), `ritual-record-1000.txt`, `ritual-build5-expanded-with-actions.png`,
`after-adjust-tap-8s.png`, `today-saturday-no-plan-yet.png`, `today-saturday-planned-8s.png`,
`today-empty-card-owner-report.png`, `today-blank-card-after-foreground.png`,
`today-blank-card-layout-bounds.png`, `blank-card-a11y-excerpt.txt`, `nfr-p1-2026-09-04-pairing.txt`,
`nfr-p1-2026-09-04-client-decomposition.json`, `posthog-plan_requested-2026-09-04.csv`,
`posthog-sync_completed-2026-09-04.csv`, `logcat-hourwell-day5.txt`; the 2 Sep owner crops live in
`../android-20260902-1030/owner-*.png`. Helpers added to `docs/verification/`: `hw-shade-tap.py`,
`hw-posthog-pair.mjs`, `hw-set-working-hours.mjs`, `hw-blank-cards.py`.
