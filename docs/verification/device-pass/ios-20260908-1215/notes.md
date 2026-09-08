# iPhone pass — day 2 (2026-09-08), iPhone 12 (A14, 2020), iOS 26.6, build 1

Continues `../ios-20260907-1130/notes.md` (items 1–49; numbering continues here). Same build,
same throwaway account (`7f088974-…`). The phone sat untouched overnight with the 8th's plan
already made by the ritual (item 48); this day reads the overnight from the phone's log archive
and the server, then takes the day boundary, the lazy lapse scan, the reminder ledger, FR-30 and
the Focus-mode delivery on the device.

## Tooling delta (verified today)

- **The USB link dropped at 17:33 yesterday** (the live syslog ended "Connection was terminated
  abruptly" 17:33:31; CoreDevice's last connection 17:35; this morning `usbmux list` was empty
  and the Mac's USB tree had no iPhone while the cable was in). A replug at 12:15 restored
  everything; the port forward from yesterday's session had survived uselessly. So the
  "read tonight from the live capture" plan of item 49 did not hold — the archive did.
- **`pymobiledevice3 syslog collect` works on the locked phone** (1.0 GB in ≈ 3 min, scratch
  only); `/usr/bin/log show --archive` answered the overnight questions with the app-filtered
  predicates in `overnight-logshow.sh` (extracts under `oslog-*.txt` here; the archive itself
  is never committed).
- **`dvt screenshot` of a dark screen is a black frame** (38 988 bytes, same as yesterday's
  `lockscreen-1430.png`); the lock screen has to be lit by a finger. A 40-frame screenshot loop
  (`lockshot-loop.sh`, keeps frames > 60 KB) around the owner's tap caught eleven lit
  lock-screen frames and the first-foreground frames after the unlock.
- **WebDriverAgent runner, first start of the day: `initializationForUITestingDidFailWithError`**
  60 s after `testRunnerReady` (12:22:38 → 12:23:39) although the phone was unlocked; the second
  start (12:28:21) was ready in 3 s. Cause not identified (the first start coincided with the
  owner's unlock-into-the-app; yesterday the same error came from a locked phone).
- **zsh word-splitting, again** (item 18c): `W="python3 hw-ios-wda.py"; $W session` is "no such
  file"; use an array `W=(python3 …)`. The first "activate" batch of the day ran nothing because
  of it — which is why the owner's own foreground (below) stood alone.
- **XCUITest `scroll-to` on Today stalled > 60 s** (the item-21 queue stall, no keyboard this
  time); a screenshot in the same batch succeeded, the following `find` and `window` timed out.
- **The block action buttons are not in today's XCUITest trees** (`wda-today-1229.xml`,
  `wda-today-after-activate-1231.xml`: no `Start …` / `I did it` / `Skip …` nodes, while the
  screenshot shows them). Yesterday's trees had them only between 12:09 and 12:50
  (`wda-today-3`, `wda-skip-1`, `wda-move-*`, `wda-dt-max-today`) and not at 11:50, 14:35 or
  16:47. The item-35 container (`accessible` with a label) is the reason the row is a leaf for
  VoiceOver; what makes XCUITest sometimes expose the children anyway is not established. Taps
  on the row today go by coordinates.

## Findings

50. **Overnight, from the archive (`oslog-hourwell-lifecycle-overnight.txt`,
    `oslog-keybag-unlock-stamps.txt`):** the app was **frozen, never killed** — `memorystatus:
freezing pid 751 [Hourwell] … froze 1641 pages` at 17:32:23, the same pid alive at 12:16 today
    (`devicectl … processes`). The phone's keybag **unlocked at 21:38:34 and 21:53:19** (the 7th)
    and **12:00:33–12:00:58** (the 8th, before the session started); the app was thawed at
    12:00:41–12:01:16 (the unlock's housekeeping) and at 12:15:38/12:15:46 (the USB replug), each
    time without running: no `Removing all pending notification requests` from the Hourwell
    process between 16:48:14 yesterday and 12:22 today, and no server event from the account
    between 16:47 yesterday and 12:22 today (`server-q-morning-1.json`). So "untouched" holds
    for the app; the phone itself was handled three times. Reported as read, not as the owner
    remembered it.
51. **DEFECT (FR-26, confirmed item 49): the ritual fired a second time on the same calendar
    day.** `oslog-fires-1730-1230.txt`: `Persistent timer fired at 2026-09-07 20:00:00.007`,
    request `FD1A-28FB` "requested at 16:48:14.856" — the request re-added by the schedule pass
    that followed the server-side restore of the evening time to 20:00 (item 49), after the
    16:42 ritual had fired AND been answered ("Plan tomorrow" at 16:46). The `ritual:<day>`
    ledger id was meant to exclude this. Nobody tapped it (no second `notification_response`
    row; `server-q-morning-1.json` responses = 1). Fix batch: the ritual planner must treat a
    ritual already delivered OR answered on the day as spent — read the day's
    `notification_response` / the delivered ledger before re-adding `ritual:<day>`; jest pins
    "fired at T1, evening time moved to T2 > T1 on the same day → no second request".
52. **FR-50, the day's nudges by the OS's record:** `08:50:00.010`, `09:35:00.004`,
    `10:20:00.004`, `11:05:00.004` — the four requests of the 16:48:14 pass (`06F6-F524`,
    `DEE1-37A5`, `EABD-BE53`, `368A-DF74`) for the ritual plan's 09:00 / 09:45 / 10:30 / 11:15
    blocks, ten minutes ahead each; nothing else between 17:30 yesterday and 12:22 today except
    the 20:00 ritual (item 51). The lock screen at 12:21:54 held them inside a collapsed
    "+12 із Gmail і Hourwell" stack (`shot-b1-lockscreen-1221-stack-row.png`, the stack row
    only; the frame's other rows are other apps' and stay in scratch). Delivery to a frozen app
    on a locked phone, four times, no sixth of the previous day.
53. **The server overnight, read before the phone was touched (`server-q-morning-*.json`):**
    the 23:55-local authority attributed the 7th at **00:00:03 local** (the `*/15` sweep's
    first tick past the boundary): five `outcome: lapsed` tuples, `source: daily`, one per
    still-open row of the day's last plan — the four blocks the daytime scans had already
    lapsed (15:12 / 16:03 / 16:36 foregrounds, items 31–33 territory) and the **17:00
    experiment block the frozen app never saw** (rec `f8918618-…`). The instant path never
    fires for lapses (by design — lapses are daily); no double tuple later (see item 55).
54. **The nightly training touched the account's plan rows at 03:30 local** (`server-q-morning-…`,
    `model_registry`: `als/1` promoted 03:30:21). Its propensity backfill (P11, MC through the
    service) updated **79 of 91 recommendation rows** — every non-slice row of both plan days,
    propensities 0.025–0.2 — in one statement (identical `updated_at` 03:30:23.238,
    `server_seq` 4915–4993), and left the **12 ε-slice rows untouched** with their exact
    p = 1/|A_m(x)| (0.25 / 0.333) — invariant 9 held on live rows. Consequence: those 79 rows
    sit above the device's pull cursor (4909) and are re-pulled by the first sync of the day.
    Not a defect by itself; it is the trigger of item 55.
55. **DEFECT, MAJOR (invariant 2 "facts beat plans", File 05 §1/§2, UC-04 A2) — a pull reverts a
    locally lapsed block to `shown`; the next scan lapses it again; the skip streak double-counts
    and the third-skip diagnostic fires on a phantom.** Sequence on the device today:
    - **12:22:20.311** (the day's first foreground — the owner's: the unlock swipe returned to
      Hourwell, which had been frontmost when the phone was locked last night; the driver's
      batch had not run, tooling delta above) — the lazy scan lapsed **five** blocks:
      the 7th's 17:00 experiment block **18.87 h** after its end and today's 09:00 / 09:45 /
      10:30 / 11:15 blocks (2.87 / 2.12 / 1.37 / 0.62 h), `skip_streak` 1 / 1 / 2 / 2 / 1;
      pushed at 12:22:22 (`server-q-first-fg.json`). Today rendered "Tuesday, 8 September",
      the ritual plan, the morning cards as "Not done — back in your Inbox" with "I did it"
      (`shot-b1-first-foreground-122221.png`, taken 2 s after the foreground by the screenshot
      loop). **No plan request** (`plans` for the 8th: still the ritual's one) — UC-03 with an
      accepted evening plan: the day is planned, `hasPlanForToday` decides (ADR-0014 §3).
    - **The same sync's pull** brought the 79 backfilled rows (item 54) and **overwrote the
      four local `lapsed` statuses with the server's `shown`** — the server keeps `shown` until
      the daily job. Device database pulled at 12:22:5x: the 8th's rows 11 × `shown`, the
      `lapse_observed` rows still 9 (the facts stayed).
    - **12:24:11.735**, the next `active` transition: the scan found the four blocks open again
      and **lapsed them a second time** — four more `lapse_observed` rows for the same
      recommendations, `skip_streak` now 2 / 3 / 3 / 2 (device database 12:26: 4 × `lapsed`,
      13 lapse rows, two tasks at streak 3; server: 13 rows, `server-q-first-fg.json`).
    - **User-visible:** Today at 12:27 shows **"This one keeps slipping. What is it?"** for
      "b6 task 07 learning" — the UC-04 A2 diagnostic that needs three consecutive misses;
      the task missed twice (yesterday once, today once) (`shot-b1-today-diagnostic-1227.png`).
      A guilt-adjacent prompt (invariant 14) triggered by a data defect; the streak is a bandit
      input too (the third-skip diagnostic routes a category/affinity update).
    - **Mechanism, from the code:** `src/sync/pull.ts` `applyRecommendation` upserts the
      server row **status included** unless an UNACKED `recommendation_status` op protects the
      id; the lapse path (`db/feedback.ts` `lapseScan` → `setRecStatus`) writes the local
      status without an op — the server accepts only `accepted | pinned | moved | rejected`
      from clients (`sync_apply_rec_status`), and `lapsed` / `completed` are the server's to
      derive from facts. A completion is confirmed by the instant attribution within seconds; a
      lapse only by the daily job — hours of window in which ANY server-side touch of the row
      (the nightly backfill here; a calendar write-back, a correction, a version bump elsewhere)
      re-sends `shown` and the client obeys. Android never met it because no overnight
      backfill preceded a first pull there (the ritual plans were left untaken).
    - **Fix batch (client, shared):** a status lattice on pull — mirror `mergeTask`'s
      "facts are monotone": a local fact-derived status (`lapsed`, `completed`, `skipped`,
      `moved`, `displaced`) is never lowered to `shown`/`accepted` by a pulled row; the server's
      terminal statuses still win over local provisional ones; plus scan idempotency — a rec
      with a local `lapse_observed` fact is never lapsed twice. Jest: "pull after scan keeps
      lapsed", "scan is idempotent", "streak counts each miss once". Server-side, decide in
      the batch whether the backfill should skip the `server_seq` bump (a `WHEN` clause on the
      trigger for propensity-only updates) — nice-to-have; the client rule is the fix.
56. **A clean foreground cycle after the rows were quiet (12:31:03 background → 12:31:05
    foreground, driver-made):** exactly **one** new `lapse_observed` — the 12:00–12:30 block,
    0.018 h after its end, streak 1 — no duplicate, no plan request (`server` events since
    12:30; device database 12:32: 5 × `lapsed` / 6 × `shown`, 14 lapse rows). The lazy scan
    itself behaves; item 55 is the interaction with the pull.
57. **The reminder ledger across the day boundary (FR-50):** the schedule pass of 12:31:06
    (`oslog-schedule-pass-1231.txt`) cancelled all and re-added **two** requests — today's
    ritual (`960A-ECAC`, 20:00) and tomorrow's (`C452-A069`, 2026-09-09 20:00) — **no nudge for
    the remaining 13:00 / 13:45 / 14:15+ blocks**: four delivered today + the ritual = five, the
    cap. Yesterday's four deliveries did not count (else nothing could have been scheduled) —
    the ledger reset at the boundary, observed. The pass ran twice within a second (settle,
    then after the pull), cheap. Design note, not a defect: the day's four nudges went to
    blocks that had already lapsed by the first open; the afternoon blocks the user could
    still do get none. Revisit: skip past-block nudges from the count? They were delivered;
    the OS did its job; the cap is per delivery by design (ADR-0014).
58. **MINOR (NFR-A1): a lapsed card's spoken summary carries no state.** The container label
    reads "b6 task 05 admin, 09:00 to 09:30, Confidence 52 percent" for a block whose visible
    state is "Not done — back in your Inbox" (`wda-today-1229.xml`); VoiceOver users hear a
    plan, not a fact. Fold into the item-35 fix (state in the summary, actions as custom
    actions).
59. **FR-50 / FR-26 under a Focus mode (iOS-only row) — delivered silently, surfaced after
    Focus ended.** Ritual moved server-side to 12:45 (seq 5004; the OS re-targeted request
    `960A-ECAC` at 12:33:19 — same identifier `ritual:2026-09-08`); the owner locked the phone
    and turned on Do Not Disturb from the lock screen (assertion inserted 12:38:07), off at
    12:47:44. `oslog-ritual-under-dnd-1245.txt`: `Persistent timer fired 12:45:00.029` →
    "Deliver local notification 960A-ECAC" → `donotdisturbd`: **"Breakthrough is NOT allowed
    for global settings … identifier: 'ritual:2026-09-08'"**, "Focus interruption suppression
    event: bundleIdentifier=com.hourwell.app suppression=2" → BulletinBoard published the
    bulletin, both gateways "DID NOT play lights and sirens". Lock screen at 12:49 (after
    Focus ended, `shot-b1-lockscreen-1249-ritual-after-dnd.png`): "Hourwell · 1 сповіщення ·
    4 хв тому" — the notification is there, the alert was withheld; the app was not opened
    from it (no `notification_response`). The morning's four had left the lock screen with
    the 12:22 unlock (Notification Center history). So: Focus does not lose a ritual, it
    defers its presentation; nothing for the app to do (the categories and the tap path are
    unchanged). The in-app **"Plan tomorrow? 6 tasks are waiting."** card appeared on Today
    once the (moved) ritual time had passed (`shot-scrolled-1.png` 12:50) — the in-app
    variant of FR-26 on iOS, not tapped.
60. **FR-30 on the iPhone — PASS (lock + kill).** "Start" on the 13:00 block by coordinates
    (12:54:09; the row is not in the tree, tooling delta) → Focus "Focusing / b6 task 02 deep"
    ; `focus_start` + the block's `accepted` status on the server at 12:54:23
    (`server-q-focus.json`); WDA `lock` 12:54:37 → the owner unlocked at ≈ 13:04 → Focus
    read **"10:35"** on the timer and "10 minutes focused of 30 planned"
    (`shot-b1-focus-after-10min-lock-1304.png`) — wall time across the locked minutes, the
    display re-derived from the persisted `lastResumedAt`; then `app terminate` (state 1) +
    `app launch` 13:05:19 → the app opened on Today (the default tab, expected) and the Focus
    tab showed the session **still running, "11 minutes focused of 30 planned"**, Pause /
    Finish (`wda-focus-after-kill-relaunch-1306.xml`, `shot-b1-focus-after-kill-relaunch-1306.png`);
    no `focus_end` on the server (`server-q-after-relaunch.json`). Same result as the Pixel
    (day-2 notes 19); a real suspension and a real kill, not the simulator's.
61. **The 12:24:11 second scan (item 55) had no scene transition** (`oslog-transitions-1220-1232.txt`:
    Hourwell Foreground 12:22:19 → Background 12:31:03, nothing between; the WDA runner's
    scene went Background at 12:22:39 and 12:28:22 without ever taking the foreground). The
    app's own passes at 12:24:11/12/14 show a `syncNow('foreground')` — an AppState `active`
    event without a scene change: a Notification Center pull-down or Control Center on the
    unlocked phone, or the XCUITest attach of the first (failed) runner. Either is an ordinary
    user path; the defect needs any later `active` after the reverting pull. Also from the
    archive: the day's first pass (12:22:20–21) read **"Got 5 delivered notifications"** (the
    four nudges + yesterday's 20:00 ritual, all still in Notification Center) and **removed
    one** (the stale `ritual:2026-09-07`, `dismiss.ts`), then scheduled today's + tomorrow's
    ritual and no nudge — the same decision as 12:31 (item 57).
62. **Item 51 refined — why the ritual came back yesterday and not today.** Today the ritual
    fired at 12:45 (item 59), was **not tapped**, and the server-side restore to 20:00
    (12:55, seq 5006) pulled at the 13:04 foreground re-added **only tomorrow's** request
    (`C452-A069`, 2026-09-09 20:00, at 13:04:40 and again after the relaunch at 13:05:19) —
    today's `ritual:2026-09-08` stayed spent. Yesterday the same restore re-added today's
    ritual after the owner had **tapped** "Plan tomorrow" (16:46). The ledger reads the OS's
    delivered list (`getDeliveredNotificationsAsync`, "Got N delivered"); a notification the
    user acted on leaves that list, so the planner sees no ritual delivered for the day and
    re-adds it when the evening time moves later. Fix (item 51): persist the day's ritual as
    spent when it is delivered OR answered (the `notification_response` write is the natural
    hook; MMKV `ritual-spent:<day>`), and consult that before re-adding — independent of the
    OS list.
63. **Erasure + the double-tap arming test — deferred to the end of the pass, on purpose.**
    Settings → "Delete account and data" → dialog 1 opened and was cancelled ("Keep my
    account"; Settings intact, `shot-settings-after-cancel.png` in scratch). Two reasons:
    the session's auto-mode blocks a destructive action on the hosted account (the double
    tap + erase batch was refused by the classifier — the hardware-pass rule: owner-run `!`
    scripts for hosted deletes), and this account carries the day's history that build 2 must
    re-check on (the reverted lapses, the streaks, the running session, the ritual ledger).
    A failed arming test would erase it early. Order for the end of the pass: build 2
    re-checks → the arming test (W3C double tap, `wda-doubletap.py`, two taps 120 ms apart on
    "Delete everything") → the erasure with the reference on screen → `deletion_audit` +1,
    tables at 0 → welcome after a cold relaunch.

64. **The fix batch, its adversarial pass, and one server finding it produced.** F1–F7
    implemented with jest per item (commits 1ed0be0, 33f8f81, 607d782, 415635a; records
    5308199); a fresh-context adversarial subagent on the diff returned **0 MAJOR / 5 MINOR /
    11 notes** — all addressed in the follow-up commit. The finding that matters is server-side
    and pre-existing: `persist_plan` expired every still-`shown` row of a superseded plan, the
    reward mapping skips `expired` forever, and lapses are attributed only at 23:55 — so a
    lapse followed by a manual re-plan the same day never became a tuple (an upward reward
    bias). Migration `20260908140000_persist_plan_facts_beat_supersede.sql` keeps ended slots
    and rows with facts (pgTAP 7/7 linked, rolled back; ⛔ owner push). Client follow-ups:
    the live-rows hook re-reads once after subscribing (a one-frame gap between the render read
    and the listener); the unused `useLastKnown` hook removed and the calendar reading
    account-scoped (a sign-out race could have seeded the next account); the reminders switch
    never asserts ON while unknown (a first-ever open is `undetermined` → OFF is honest); a
    pulled `moved` over a local `lapsed` keeps the local slot; VoiceOver hears the callback
    outcome; `spent` reaches `notifications_planned`. Four checklist rows added for what only
    hardware can settle (custom actions by ear, a late replacement under Reduce Motion, the
    re-mount's resets, the spent ritual with budget left).

65. **Build 2 on the phone (17:40), and a reward defect it surfaced at once.** Build 2 = the
    batch + the adversarial follow-ups (tree `36b297c`), `SENTRY_DISABLE_AUTO_UPLOAD=1 npx expo
run:ios --device … --configuration Release --no-bundler`, gate clean (`build-gate-2.txt`:
    host hits 1, entitlements without `aps-environment`, bundle sha `30242ba2…` ≠ build 1's
    `a07ce9ac…`). Xcode's device destination refused the build until the phone was unlocked
    ("may need to be unlocked to recover from previously reported preparation errors") and
    CoreDevice's RSD allocation was wedged (0xE8000003) — resolved as on day 1 by a phone
    reboot (`pymobiledevice3 diagnostics restart`) + the owner's first unlock; Auto-Lock set
    to Never for the rest of the pass (owner restores). The install's own launch was the
    first foreground on build 2 (17:39:26): five `lapse_observed`, exactly once each, for the
    blocks that had ended (13:00 → 16:30) — and a **`focus_end` with `outcome: abandoned` for
    the 12:54 session, closed by the client's 2 h stale rule with 285 wall-clock "focused"
    minutes, which the instant attribution rewarded as a completion (r = 1, `reason:
completed`, `server-q-focusend.json`)** while the device's own scan had lapsed the block;
    the pull then landed `completed` over the local `lapsed` (a terminal server status wins —
    correctly, given the server's reading). A guessed reward on an ambiguous session
    (invariant 3): FR-30 makes a session's elapsed time wall time on purpose (the display
    survives a lock), so `focused_ms` is no evidence when the app's own rule ended the session.
    Fix in this branch: the fact says why it ended (`focus_end.reason = 'stale'`; a user's
    "Stop for now" carries none) and the reward mapping gives a stale session no credit —
    no instant outcome, the 23:55 authority lapses the row (ADR-0010 addendum; Deno
    `rewards_test.ts` + `feedbackDao.test.ts`). The Android day-2 session (164.5 wall-clock
    minutes) had the same shape and its tuple was never checked. Build 2 still carries the
    old client (the reason lands in build 3 / main); the old r = 1 tuple stays in this
    throwaway's data.
66. **F3 re-checked on build 2 — PASS.** The 16:30 block (`4449216e`, lapsed on the device at
    17:39) was touched server-side at 17:42:11 (a propensity write, `server_seq` 5040 — the
    backfill's shape); the 60 s poll pulled the row: the device kept **`lapsed`** with the new
    `server_seq` 5040 (`hourwell-b2-2.db`), and the next foreground cycle (WDA home →
    activate 17:45) added **no** lapse for it — the only new fact was the 17:15 experiment
    block, which had genuinely ended at 17:45 (`server-q-recheck-3.json`: 20 lapse rows =
    19 + 1; the task's streak unchanged at 2). On build 1 the same pull reverted four rows
    (item 55).
67. **F1 re-checked on build 2 — PASS.** Under the accessibility daemon's `REDUCE_MOTION` hold
    (read back True): Settings → Delete account and data → Continue → **dialog 2 present at
    +1.5 s and +5.5 s** ("Delete everything" visible, `shot-b2-rm-dialog2.png`) → Cancel →
    Settings intact. Build 1 lost the dialog on the same path (items 24, 36). The real system
    switch and a late replacement (> 120 ms) stay in the checklist's hardware rows.
68. **F2 (state), F5 (re-layout) on build 2; F4, F6 not device-checkable today.** `hw-ios-ax.py
items` on Today (`ax-b2-today.json`): every card's spoken summary now ends with its state
    ("…, Confidence 52 percent, Not done — back in your Inbox"; "…, Completed") — the
    item-58 half; the custom actions are not exposed by the daemon's listing nor by XCUITest,
    so their presence is the owner's rotor listen (checklist row). F5 through the daemon's
    `DYNAMIC_TYPE = 1.0` hold while the app ran: the Inbox re-measured (titles wrap, rows
    grow, nothing clipped — `shot-b2-dt-live-inbox.png`, `wda-b2-dt-live-inbox.xml`), the
    Settings sheet too (`shot-b2-dt-live-settings-sheet.png`; build 1 clipped both, item 22)
    — **but the navigator did not re-mount**: the Inbox tab and an open task form survived
    the change, so under the inspector override `fontScale` did not change and the correct
    layout came from somewhere else in build 2 (not established). The user-facing path — the
    Larger Text slider in the Settings app, which clipped build 1 live (item 36) — was not
    re-verified: driving the Settings app blind landed on the brightness slider of the page
    the owner had left open (Display & Brightness; brightness raised — owner restores), so
    the Settings-app check is the owner's 1-minute step. F4 (the spent ritual) cannot be
    re-checked today: the day's ledger is at the cap (4 nudges + the 12:45 ritual), so no
    ritual could be re-added by count either — the jest evidence stands, the device row waits
    for a day with budget left. F6 (the first read) is not observable frame-by-frame with these
    tools; jest pins it (Settings, Inbox, Focus, the task sheet). Daemon settings reset to
    the device defaults afterwards (`settings show`: all False, DYNAMIC_TYPE 0.2727).

69. **Owner steps 2–3 on build 2 (18:0x): the rotor listen — PASS; the Settings-app Larger Text
    path — PASS.** VoiceOver (the owner's ear): the rotor lists a card's actions (Start / Done /
    Skip / Move…; "I did it" on a lapsed card), a double-tap runs them, and the card's summary
    ends with its state — F2 closed on iOS by ear (TalkBack on the Pixel still owed). Larger
    Text driven by the session through the real Settings app with guards (Settings killed
    and relaunched at its root; `com.apple.settings.accessibility` → `DISPLAY_AND_TEXT` →
    `LARGER_TEXT` each found by identifier before the tap; the page held exactly one slider,
    read back 50 % before and **83 %** after the write — the earlier blind write had landed on
    the brightness slider of the page the owner had open, item 68): back in Hourwell (on the
    Inbox tab, put there first) the rows **re-measured live** — title StaticText 24 → 31 pt,
    the Add button 67 → 74 pt, nothing clipped (`shot-b2-realsettings-larger-text-inbox.png`,
    `wda-b2-realsettings-larger-text-inbox.xml` vs `wda-b2-inbox-1x.xml`); the Settings sheet
    renders "Up to date" and "Connect Google Calendar" as full strings (WDA found them by
    exact name; `…-sheet.png`) where build 1 showed "Svnc no" / "Connect Gooale Ca" (item 36).
    The tab stayed on Inbox, so the navigator did not re-mount here either; the correct layout
    on build 2 comes from something other than the `fontScale` key — not established, and
    not needed for the row: the user-facing outcome holds. Slider restored to 50 % (read
    back), Hourwell back at 1× (title 24, Add 67). The accessibility sizes beyond the slider
    (the switch that did not take on day 1) remain unexercised; 83 % ≈ the largest
    non-accessibility size.

## Fix batch (consolidated from days 1–2; build 2 re-checks each on the phone)

| #   | Severity | Finding                                                                                                   | Fix                                                                                                                                                                                                | Re-check                                                                 |
| --- | -------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| F1  | MAJOR    | Reduce Motion: the second erasure dialog never appears (items 24, 36)                                     | keep the Modal mounted across an immediate replacement; jest "resolve → request in the same tick under reduced motion"                                                                             | ✅ build 2 (item 67)                                                     |
| F2  | MAJOR    | Block action row unreachable by a screen reader; lapsed state not spoken (items 35, 41, 58)               | custom actions Start / Done / Skip / Move… on the card + state in the summary; jest pins the actions                                                                                               | state ✅ build 2 (item 68); actions: owner's rotor listen ⬜             |
| F3  | MAJOR    | Pull reverts a local `lapsed` to `shown` → duplicate lapse facts, double streaks, phantom diagnostic (55) | status lattice in `applyRecommendation` (fact-derived local statuses never lowered by a pulled row) + `lapseScan` idempotency (a rec with a local `lapse_observed` is never lapsed twice); jest ×3 | ✅ build 2 (item 66)                                                     |
| F4  | MAJOR    | A ritual delivered and answered is re-added when the evening time moves later (items 49, 51, 62)          | persist `ritual-spent:<day>` on delivery/answer (MMKV, written with the `notification_response`), consulted before re-adding; jest "fired + answered, time moved later → no second request"        | ⬜ needs a day with budget left (item 68); jest ✅                       |
| F5  | major    | Live text-size change re-renders without re-layout (items 22, 23, 36)                                     | re-mount the root on `fontScale` change                                                                                                                                                            | daemon hold ✅ layout, re-mount not observed; Settings-app path ⬜ owner |
| F6  | systemic | Default/empty state before the first read: Settings calendar/permission, Inbox, Focus, task sheet (44)    | synchronous first read in `useLiveRows` (+ `ready`), `useLastKnown` for the tri-states; jest "first render carries rows", "null never renders the negative branch"                                 | Settings open → no "Connect Google Calendar" flash (Pixel); Inbox/Focus  |
| F7  | MINOR    | Android calendar callback screen never leaves on its own (43)                                             | distinct `ok` copy + `router.replace('/settings')` after confirm                                                                                                                                   | Pixel consent                                                            |
| F8  | note     | The nightly propensity backfill bumps `server_seq` on every touched row (54)                              | optional: trigger `WHEN` skips propensity-only updates — decide in the batch; F3 is the fix                                                                                                        | —                                                                        |
