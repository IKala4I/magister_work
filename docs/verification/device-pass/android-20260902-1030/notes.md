# Hardware pass — Android — Pixel 7a — day 2 (2026-09-02), running notes

Device and build unchanged from day 1 (`../android-20260901-2030/notes.md`): Pixel 7a,
Android 17, release APK versionCode 1 installed 2026-09-01 20:21. Session-driven from 10:29
EEST; the owner had not opened the app since the day-1 attended slice. Phone state at start:
font scale 1.0, density 420, animation scales 1/1/1 (defaults restored), app killed,
POST_NOTIFICATIONS granted, standby bucket 40 (RARE), exactly one scheduled alarm = the 20:00
ritual (`RTC_WAKEUP`, `window=+1h`). All numbers here are from this physical device.

## Established today (chronological)

1. **First foreground of the day (UC-03 lazy trigger) — 10:35:17**, `am start` cold start. The
   inbox was empty (every day-1 task soft-deleted), so the trigger fired against an empty inbox
   (`empty_inbox`: no server row by design; `plan_requested` went to PostHog only). Standby
   bucket 40 → 10 (ACTIVE) on that launch.
2. **Inbox built — 14 tasks via quick-add** (Maestro, 9 m 33 s on hardware,
   `inbox-built-14-tasks.png`); all 14 on the server (07:37–07:46 UTC). Deadline parse on the
   device: "by thu" → "due Thu, Sep 3" ✓.
3. **429 — "Daily planning limit reached — you can plan again tomorrow."** at the first
   'Plan my day' (10:47). Cause (server rows + `plan-request/handler.ts`): the edge function
   counts `plans` rows in a rolling 24 h (`countPlansLast24h`, limit 30), and day 1 left
   exactly 30 zero-recommendation rows on the account (17:40–17:50 UTC): the 20× cold-start
   loop plus the evening opens — every cold start with no persisted plan re-fires
   `first_open`. Two design consequences recorded for the fix batch, not yet changed:
   (a) zero-block fallback rows count against the user's daily budget; (b) the once-per-day
   guard is keyed on a persisted plan, so an evening-empty or fallback state retries on every
   cold start. Unblock = delete the 30 rows (owner step; the rows are archived here as
   `plans-2026-09-01-empty-fallback-rows.json`) or wait until 20:40 local.
4. **DEFECT (thesis-critical, fixed the same day — PR #37): the learned engine was
   unreachable from the device.** All 30 day-1 rows are `engine=heuristic`,
   `reason=fallback:http`, `service_status=422` — the day-1 reading "one transient fallback"
   was wrong; it was every request. The service's only 422 paths are an ε/m mismatch and
   Pydantic validation; the validator calls `ZoneInfo(timezone)`, and the device profile
   carries `Europe/Kiev` (Android's id for Ukraine via `expo-localization getCalendars()`),
   while the Mac smoke sends `Europe/Kyiv`. `python:3.12-slim` ships backward links only in
   `tzdata-legacy`; the PyPI `tzdata` wheel was locked under win32/emscripten markers only.
   **Reproduced live** (`docs/verification/hw-tz-repro.mjs`, two throwaway users, self-erased):
   `Europe/Kiev` → `fallback:http` / 422 (ef 985 ms); `Europe/Kyiv` → `learned` / 200
   (service 496 ms, ef 1198 ms). Fix = the tzdata wheel unconditional in both Python projects
   - a build-time assertion in both Dockerfiles + TZPATH-empty tests (the training image's
     `iso_week` shared the exposure). Re-verify after the rollout with the same script, then
     from the device (the first learned plan on hardware is still pending).
     **Merged + rolled out 11:30 local** (PR #37 → main 4ee55cd; both image workflows green incl. the
     new build-time assertion; VM healthz `build=4ee55cd8e7d3`). Re-run of the reproduction after the
     rollout: `Europe/Kiev` → `engine=learned` (service 592 ms, ef 1292 ms); `Europe/Kyiv` →
     learned (490 / 1080 ms). The device's own first learned plan still needs the 429 cleared.
5. **Undo-bar self-expiry (day-1 open item 5) — PASS.** `input tap` on "Delete call
   landlord", uiautomator polling: bar visible from 0.10 s through the 4.92 s dump, absent by
   7.23 s → the 6 s window (`UNDO_WINDOW_MS`) holds on hardware. The day-1 flow failure was
   Maestro's slow hierarchy dumps, not the app. ("call landlord" is gone; 13 tasks + the
   offline one remain.)
6. **FR-11 Ukrainian NL (day-1 item 9) — verified: no chips.** Typed "документ до 12 годин в
   п'ятницю" via Maestro; the preview line shows the raw string only, no duration or deadline
   chip (`fr11-uk-nl-preview-no-chips.png` + tree dump). The documented limitation stands
   (chrono-node is English-only); the row was removed afterwards.
7. **NFR-R1 offline → reconnect, server half — PASS.** Airplane mode on 10:56:15 → quick-add
   "offline note 30m" → airplane mode off 10:58:04: the task reached the server exactly once
   (`created_at` 07:57:29 UTC, i.e. while offline; one `task_created` event; no duplicate).
   The Settings status transitions were not captured (flow mechanics, findings 7/10) — redo
   when the phone is free.

## Device findings (day 2)

7. **The on-device IME capitalized a quick-add title** ("offline note" → "Offline note")
   while the 14 inbox-build titles stayed lowercase. Not an app defect (Gboard autocap on a
   sentence-case field); e2e selectors on hardware must be case-insensitive (`(?i)…`). Fix
   batch: p3/p4/p10 selectors.
8. **Android tab labels carry the icon glyph**: the tab's accessibility label is
   ", Today" (the icon-font code point precedes the name; iOS composes "Today, tab, 1
   of 4"). Minor NFR-A1 item for the fix batch (hide the glyph Text from accessibility).
9. **FR-50 alarm semantics observed:** the ritual DATE trigger is an inexact `RTC_WAKEUP`
   with `window=+1h`; the app sat in standby bucket RARE (40) after day 1's adb-driven use and
   moved to ACTIVE on today's launch. Delivery drift at 20:00 is to be read from
   `dumpsys notification` (ADR-0014 Consequences).
10. **Maestro `launchApp` without `stopApp` re-created the activity on Today** (state kept,
    Settings modal gone). Flows that continue on a screen must not start with `launchApp`.
11. **The owner used the phone (Telegram in front, ~11:05) while a flow ran**; two flows
    tapped into the wrong app (a chat list, nothing sent). Rule for the pass: the phone is the
    session's while a step runs — say so before each block.

## Still open today (need the phone and the 429 unblock)

- NFR-R1 UI half: Settings "Offline — changes are queued" / "N changes waiting" → "Up to
  date" without a foreground change (reconnect trigger).
- NFR-P1 series (10 manual re-plans; client `duration_ms` lives in PostHog — owner read or a
  personal API key), NFR-P2 `gfxinfo` scroll (≥ 10 blocks), NFR-A2 sweeps at max font/display
  size with reduced motion (settable over adb), TalkBack tree dumps, FR-30 focus session
  across lock/kill, lazy lapse scan after > 30 min in the background, FR-50 reminder delivery
  - the 20:00 ritual drift, UC-07 Move picker, FR-42 export sheet, glass-block screenshot.
- Overnight: leave the app backgrounded across midnight → tomorrow's first foreground must
  produce exactly one `trigger=new_day` plan row (UC-03 day boundary).

## Established today — midday block (after the lockout was cleared 11:3x)

8. **First learned plan on hardware — 11:37:34 UTC+3.** `engine=learned model=recsys-p5.0`,
   FEASIBLE, 8 blocks from 14 tasks (6 unplaced), one experiment row (propensity 0.25 = 1/4),
   service 1499 ms, edge function 1806 ms. `today-blocks-learned.png` (dark, opaque cards, dashed
   experiment outline, rationale, action row, "No room today for 7 tasks" footer).
9. **NFR-P1 series (server side) — 10 manual re-plans in 81 s** (`nfr-p1-series-server.json`):
   edge-function total p50 1662 / p95 1908 ms; service p50 1475 / p95 1735 ms; 9 learned + **1
   `fallback:timeout`** (1908 ms vs the 1900 ms `PLAN_FALLBACK_BUDGET_MS`). OPTIMAL runs take
   529–799 ms; FEASIBLE runs sit at the 1.5 s `SOLVER_TIME_CAP_S`, leaving 0.4 s for the
   function + network — on a tight 14-task day the learned path runs at the budget's edge and
   ≈ 10 % of requests fall back. Client `duration_ms` → PostHog (⛔ 5b). Recorded for
   revisit.md (cap vs budget) and the thesis (fallback rate on a full inbox).
10. **FR-50 scheduling after each plan:** exactly 4 block alarms + the 20:00 ritual (+ tomorrow's
    ritual) — the cap holds; all inexact `RTC_WAKEUP` with Android's 75 % windows (+7 m 27 s for
    a 10-min lead, +41 m at 55 min ahead, +1 h beyond). Delivery drift read later.
11. **NFR-P2 scroll — PASS on the 8-block Today:** 59 swipes / 20 s, 1733 frames, 0 janky
    (legacy 0.40 %), p50 5 / p90 7 / p95 8 / p99 10 ms (`gfxinfo-today-scroll.txt`). A ≥ 10-block
    morning re-run is still owed (the checklist wording).
12. **NFR-A1 structural trees (uiautomator):** Today block = ONE focusable element with the
    composed label, inner texts not focusable, actions "Start/Done/Skip/Move… <title>"; Settings
    "Block reminders" = Switch checkable+checked, mute chips = CheckBox "Mute reminders for
    <Category>"; Insights heatmap = ONE ImageView with the daypart summary, category chips with
    `selected`; Focus "Nothing running". TalkBack listening = owner.
13. **NFR-R1 real offline — PASS** (finding 12 first): Wi-Fi + data off → "Active default
    network: none" → quick-add "real offline 30m" → Settings "Offline — changes are queued" /
    "2 changes waiting" / "Last synced 1 min ago" → radios on 11:46:50 → "Up to date" within
    10 s, no foreground change (reconnect trigger). Server: `client_ts` 08:46:02 UTC (offline),
    `server_ts` 08:46:53 (3 s after reconnect), one `task_created`, no duplicate.
14. **NFR-A2 at max scale** (font 2.0, density 540, animations 0 via adb; `a11y-maxscale/`):
    header/date/Re-plan/Now wrap cleanly; Inbox rows, Settings, Insights cards wrap cleanly.
    **Defects:** (a) Today time gutter breaks "12:00 PM" → "12:0 / 0 PM" (fixed 64 px gutter);
    (b) heatmap weekday header wraps mid-word ("M/on", "Tu/e", "W/ed"). **Usability, not a
    break:** the timeline list keeps ~ 1/3 of the screen under the two-line date header and the
    static deferred footer — one card visible at a time, scrolls inside the list (verified by an
    in-list swipe: the second block and the action row appear). Tab label "Insight…" truncates.
15. **DEFECT (thesis-critical, client, fix batch): every cold start re-plans.** Server rows
    08:49:04, 08:49:43, 08:50:36, 08:54:14 UTC — one `first_open` plan per cold start while
    today's plan was persisted (each replaced the day's blocks). Root cause read in code:
    `useLiveRows` starts as `[]`, the Today screen passes `latestAnyRows[0]?.planDate ?? null`
    to `usePlanTrigger`, whose mount effect decides before the first read → `first_open`; the
    dedup (`lastRequestedDay`) is ephemeral Zustand. Day 1's 30 rows had the same cause. Fix:
    a loading state on the live read (no decision until resolved) + a durable dedup key
    (MMKV) per plan day. Consequence for today: no cold start before the lock/lapse checks.
16. **FR-30 started 11:58:05 UTC+3** on "references fix" (12:00–12:30, experiment):
    `focus_start` fact on the server 1 s later, block status `accepted`, Focus shows
    "Focusing · references fix · 00:34 · Pause / Finish / Stop for now"
    (`focus-running-1158.png`). Phone locked 11:59:59 (Dozing, on USB power → no deep Doze);
    wake-up scheduled 13:26 for the FR-30 + lapse + reminder-drift reads.

## Device findings (day 2, continued)

12. **Airplane mode is not offline on this Pixel** — Wi-Fi stays on under airplane mode (the
    active default network kept id 118), so the 10:56 "offline" task synced within 1 s
    (`server_ts` − `client_ts` = 1.3 s). Items 7 above are superseded by item 13; real offline
    = `svc wifi disable` + `svc data disable`.
13. **`uiautomator dump` fails on the Focus tab** ("could not get idle state" — the ticking
    timer never idles) and silently re-served a stale file until the helper was hardened;
    Maestro screenshots are the evidence there.
14. **CORRECTED (adversarial review of the fix batch): the p10/p2 date assertion could never
    match** — `'\\w+day, \\w+ \\d+'` sits in SINGLE-quoted YAML, which does no escape
    processing, so Maestro received a literal backslash-w regex; the assertion was added on day
    1 after the last p2 run and has never passed on any device. The two max-scale sweep
    failures were this, not the density override (the earlier attribution here was wrong).
    Fix batch F5 double-quotes the regex; to be confirmed on the device at default and max
    scale on the rebuilt APK.
15. **Settings list ignores `input swipe` scrolling** (the modal's gesture handling); use
    Maestro `scroll` for the lower Settings sections.

## Established today — afternoon block (owner's phone from 12:31; session resumed 16:11)

17. **Lock stint and the 12:59 open.** Screen log: my adb lock at 12:00:01 held two seconds
    (screen back on 12:00:03); the owner locked at 12:31:02 with the app in the foreground;
    an accidental open at 12:59 was a warm foreground (no plan row, no fact) — harmless; the
    owner reopened at ~14:42 (cold start). Stint that counts for the lapse check: 12:59 → 14:42.
18. **Lazy lapse scan after a real background stint — PASS (server half).** At 14:42:36 the
    scan logged `lapse_observed` for "email replies" (1.46 h after its end) and "grant budget
    check" (0.71 h) and, at 16:13:47, for the next plan's "references fix" (0.98 h) and "email
    replies" (0.23 h). The UI text "Not done — back in your Inbox" was not observable: both
    foregrounds re-planned within a second (item 15) and the new plan replaced the lapsed rows.
19. **FR-30 — PASS both halves.** (a) Lock: the 11:58 session outlived the 12:31 lock and the
    14:42 cold start; the scan then closed it as `abandoned` with `focused_ms` = 164.5 min —
    exactly the wall time since start, so timekeeping survived lock + kill. That closure is the
    designed rule (ADR-0010: abandon after planned × 2 + 60 min = 2 h for a 30-min block;
    `STALE_SESSION_EXTRA_MS`). (b) Cold start within the cap: session on "dataset cleanup"
    started 16:15:12 → `am force-stop` + relaunch → Focus still running
    (`fr30-focus-after-cold-start.png`) → "Stop for now" → `focus_end` abandoned 16:16:46.
20. **Finding: a re-plan while a session runs drops the running block from Today.** The 16:16
    relaunch re-planned (item 15) and the new plan omitted "dataset cleanup" (its start 16:15 was
    already past); the old recommendation stayed `accepted` (not lapsed — ADR-0010 held) and the
    Focus tab kept the session, but Today no longer showed the block. Manual re-plans during a
    session hit the same path. Fix batch / revisit: carry a running block as a fixed assignment.
21. **Warm foreground also re-planned (16:13:48, `first_open`) with the process alive (pid 26392)** — the JS context was re-created without a process death, so the ephemeral dedup was
    gone. The fix batch's durable MMKV key covers this case too. Plan rows today: 18 of 30.
22. **UC-07 Move picker — PASS (sheet + native picker + move), snap unconfirmed.** "Move… gym"
    → sheet "Move to · gym" with the time button, "Move here", "Cancel"; the time button opens
    Android's TimePicker (radial + "Type in time" keyboard mode, `uc07-native-time-picker*.png`);
    OK → the sheet shows 5:30 PM → "Move here" → Today re-renders in slot order and the server
    row is `moved` 17:30–18:00 (also "Offline note" moved at 16:26). The typed off-grid minute
    (:37) never reached the field, so the 15-min snap from an off-grid value is still an
    attended check (type 5:37 by hand; expect :30 or :45).
23. **DEFECT (MAJOR, client — fix batch F8): Settings does not scroll.** `settings.tsx` renders
    its sections directly inside `Screen` (a plain flex View, no ScrollView); the uiautomator tree
    has no scrollable node and drags do nothing, so on the Pixel 7a everything below the mute
    chips — ritual time, **My data (Export / Delete account)**, Privacy, Appearance — is
    unreachable. FR-42 export could therefore not be exercised on the device; the p10 sweep never
    ran green anywhere, which is why P10 missed it.
24. **FR-50 delivery — partial.** Owner screenshots (14:18, 14:28): three block reminders
    posted for blocks that had already started ("real offline · Starts at 2:15 PM" still at
    14:28) → delivered reminders are never dismissed (code confirms: only sign-out clears the
    shade) → fix batch F7; the delivered-ledger is unaffected (it counts deliveries). Event log:
    the 15:20 alarm (block 15:30) was visible in the shade by 15:23:36 and dismissed by the
    owner 15:34:47 — within Android's +7.5 min window for a 10-min lead. Exact post times of the
    12:35/13:20/14:05 alarms are not in the log any more; the owner's screenshots may carry them.
    **Read on 2026-09-05 from the owner's screenshots** (`owner-blocks-1418.png`, `owner-blocks-1428.png`; Android's
    relative labels floor to the minute): "real offline" (14:05 alarm, 14:15 block) shows 11m at 14:18:21 and 21m at
    14:28:00 → posted 14:06:21–14:07:00, i.e. **+1–2 min**; "grant budget check" (13:20 alarm) 55m at 14:18:21 →
    13:22:21–13:23:21, **+2–3 min**; "email replies" (12:35 alarm) 1h → posted before 13:18, inside the +1 h inexact
    window (day-4 item 8). All three rows were still in the shade at 14:28 (the F7 finding above).

## Device findings (day 2, afternoon)

16. `input keyevent KEYCODE_SLEEP` over adb held the screen off for 2 s only (12:00:01 → 12:00:03,
    cause unknown); the owner's lock is the one that counts. Verify `mWakefulness` after locking.
17. `dumpsys notification` keeps no post times once a notification is dismissed; the `events`
    logcat buffer keeps `notification_visibility`/`notification_canceled` only — capture the shade
    while it is posted, or enable Notification history on the phone before a delivery test.

## Fix batch → rebuild (evening)

25. **Fix batch merged (PR #38, main 3f1159d):** 16 commits from a fresh-context agent, two
    adversarial passes (2 MAJOR + 3 MINOR; 1 MAJOR + 4 MINOR), all applied; 513 jest. Covers
    UC-03 cold-start re-plan (F1), gutter (F2), heatmap header (F3), quick-add placeholder (F4),
    `(?i)` + YAML-quoting of the sweeps (F5), tab glyph (F6), stale-reminder dismissal incl.
    moved/deleted blocks (F7), Settings ScrollView (F8). Main merged into this branch (56935e0;
    the two sweep files taken from main).
26. **Build 2 (43bfade, built in the agent's worktree) — VOID.** Installed 16:46; its bundle
    carried no project URL (the `.env` copy in the worktree did not reach the bundle), so
    `isAuthAvailable()` was false: no backend, no Sync/Calendar/My data sections, no requests.
    Consequently the "0 new plan rows across 20 cold starts" observed on it proves nothing and
    is withdrawn; the cold-start p90 516 ms (warm caches) is a valid number for that binary but
    is not reported. Lesson (in `build3-checks.sh`): gate an APK on the project host string in
    the bundle, then prove the backend with a Settings write read back from the server, before
    any behavioural check. What build 2 did show validly: Settings scrolls to Privacy and
    Appearance (F8), and after four delivered reminders only the two ritual alarms remain
    scheduled (the ≤ 5/day cap on hardware).
27. **Build 3** = main checkout at 56935e0 (same app source as 3f1159d), `expo prebuild --clean`
    - `assembleRelease`, debug-keystore signing, Sentry upload disabled — results below.

28. **Build 3 — gate passed, backend proven, UC-03 dedup verified on hardware.** APK
    `ee920100ba66…` (121 298 594 B) from the main checkout at 56935e0 (app source = main 3f1159d
    after PR #38), `expo prebuild --clean` + `assembleRelease`; installed 17:00:04. Gate: project
    host and anon-key prefix present in the bundle. Backend proof: a "Mute reminders for
    Physical" toggle reached `profiles.settings.muted_categories` on the server at 17:00:28 and
    the un-toggle at 17:00:37. **UC-03:** plans today 18 → first open on build 3: 18 → 20 cold
    starts (`am force-stop` + launch): 18 — zero automatic requests with a persisted plan (fix
    batch F1, verified with a working backend). Cold start p90 (18th of 20) 551 ms, 505–622,
    warm OS caches (`cold-start-build3.txt`; the post-reboot number is still owed on this build).
    Lapse scan on the first build-3 foreground: two `lapse_observed` at 17:00:12 (the 16:30 and
    the earlier ended blocks). FR-42 export: the Maestro flow "passed" but its wait regex matched
    the word "share" in the My data hint, so the screenshot shows the section, not the sheet —
    redone below.
29. **FR-26 on build 3 — PASS (backgrounded variant), one open question.** The 20:00 ritual
    (`ritual:2026-09-02`, "Plan tomorrow? 14 tasks are waiting — one tap plans your day.") was
    visible in the shade by 20:14:41 (+1 h inexact window; the exact post time is on the owner's
    screenshot). Owner tap at 20:22 with the app alive in the background → server:
    `notification_response` 20:22:36 (`kind: evening_ritual`, `latency_ms` 1 356 753 = 22.6 min
    after `scheduled_for` 20:00, variant daily) → one `plans` row for **2026-09-03**, trigger
    `evening_ritual`, 20:22:42, **10 blocks**; today's count unchanged (18); Today shows
    "Tomorrow is planned: 10 blocks, first at 9:00 AM."; the notification left the shade. **Label
    confirmed by the owner:** the tap was on the notification body (`action: "open"`), then the
    "Plan tomorrow" button on the Today card — the fact is correct, no FR-32 defect. The
    notification's own action button is still untested; tomorrow's killed-app run taps it over adb
    (expand the shade, dump the tree, tap by bounds, read the fact back). **Engine:** the tomorrow plan is `heuristic`, `fallback:timeout`, edge
    function 1909 ms — the second full-inbox request today to miss the 1.9 s budget (the morning
    series: 1/10 on a half day; this full-day instance: 1/1). Revisit entry strengthened.
30. **FR-42 export on build 3 — PASS (device half).** Settings → My data → "Export my data" →
    the Android intent resolver opened with Gmail, Quick Share and Telegram targets (screenshot
    not kept: it showed contact names) → back → status line "Export ready — 14 tables shared."
    (`build3-fr42-export-after.png`). Opening the saved JSON on the device is the owner's; the
    document contents were verified service-side in P10.

## Results by build (which binary produced which number)

| Build | Source / APK                                                                                                                           | Numbers and checks attributed to it                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | day-1 local release build, 2026-09-01 10:00, from main 3495b3b (pre-fix), 121 293 079 B, versionCode 1; overwritten on disk by build 3 | day 1: UC-01 E2E, NFR-P2 cold start p90 **1582 ms post-reboot** / 552 ms warm, NFR-S1 reboot; day 2 items 1–24: first learned plan, NFR-P1 series (server p95 1908 ms, 1/10 timeout), scroll p95 8 ms / 0 janky, real offline round trip, undo 6 s, Ukrainian NL, FR-30 both halves, lapse scan, UC-07 move, a11y trees, max-scale screenshots and their two defects, cold-start re-plan defect, Settings unscrollable, stale reminders |
| **2** | fix branch 43bfade built in the agent worktree, `0c8d34eb04f4…`, 121 298 163 B — **no project URL in the bundle → VOID**               | nothing behavioural counts (no backend). Only UI-local facts kept: Settings scrolls to Privacy/Appearance (F8); after four delivered reminders only the two ritual alarms remained scheduled (cap)                                                                                                                                                                                                                                      |
| **3** | main checkout 56935e0 (= main 3f1159d + this branch's docs), clean prebuild, `ee920100ba66…`, 121 298 594 B, installed 17:00:04        | bundle gate ✓, backend proof ✓, **UC-03: 0 requests across first open + 20 cold starts with a persisted plan**, cold start p90 551 ms warm, lapse scan on foreground, FR-26 ritual delivered ≤ 20:14:41, export sheet (pending redo)                                                                                                                                                                                                    |

## Owner observations (2026-09-02) → where they landed

- **Stale reminders pile up in the shade** (14:18 / 14:28 screenshots) → item 24; fix batch **F7**
  (dismiss started / re-planned-away / moved / deleted-task reminders on every scheduler pass;
  ledger and cap untouched) — merged in PR #38, on the phone since build 3; a real delivery to
  exercise it is tomorrow's (today's block budget is spent).
- **Stale UI for about a second on foreground** (14:20) → the persisted plan rendered first, then
  the cold-start `first_open` re-plan replaced it — items 15 and 21; fix batch **F1** (`ready`
  gate + durable per-day key, written only after the server answers) — merged, verified on
  build 3 (item 28). The "empty first read" was the root cause of the re-plan, not a separate
  render bug.

## Plan-budget sweep — the shape of the fallback (20:31–20:34, `hw-plan-budget-sweep.mjs`)

Question (owner): at what inbox size and horizon does the learned path start missing the 1.9 s
edge-function budget, and is it the solver or the round trip? Method: one throwaway anonymous user
per inbox size; three independent instances per user on three plan dates whose working hours
give a 9 h, 4.5 h and 2 h window; `now` = real now (every tick workable); two repeats of the clean
instance (non-splittable, no deadlines) plus one device-like variant (splittable, two deadlines).
45 requests, every user self-erased; rows in `plan-budget-sweep*.json`.

| tasks | 9 h window: solve ms · status · function total                                | 4.5 h            | 2 h              |
| ----- | ----------------------------------------------------------------------------- | ---------------- | ---------------- |
| 4     | 15 · OPTIMAL · 0.87–1.41 s                                                    | 9 · OPT · ~1.0 s | 4 · OPT · ~1.1 s |
| 8     | 31 · OPTIMAL · 0.91–1.10 s                                                    | 16–17 · OPT      | 7 · OPT          |
| 12    | 61–62 · OPTIMAL · 1.19–1.30 s                                                 | 24–28 · OPT      | 8–10 · OPT       |
| 14    | 277–285 · OPTIMAL · 1.15–1.26 s (splittable + deadlines: 614 · OPT · 1.53 s)  | 48–53 · OPT      | 10–12 · OPT      |
| 16    | 367 · OPTIMAL · 1.57 s **or `fallback:timeout`** (1 of 2; call cut at 1.27 s) | 63–81 · OPT      | 10–11 · OPT      |
| 20    | 865–1002 · OPTIMAL/**FEASIBLE at the cap** · 1.77–1.98 s (client 2.0–2.2 s)   | 85–97 · OPT      | 13–17 · OPT      |

What the columns say:

- **Round-trip floor ≈ 0.43 s.** The function's call to the service (`ef.service_ms`) is 440–470 ms
  even when the service's own total is 7–40 ms — network + HTTP between the function region
  (eu-west-1) and the VM (Marseille).
- **Function overhead outside the call ≈ 0.45–0.9 s** (`ef.total − ef.service`: context reads,
  persisting the plan). So the service call is given only 1.9 s − that ≈ **1.0–1.45 s**.
- **Solver:** on windows ≤ 4.5 h every inbox up to 20 tasks is OPTIMAL in ≤ 110 ms. On a 9 h
  window the solve grows from 15 ms (4 tasks) through 0.3–0.6 s (14) to 0.9–1.0 s (20, FEASIBLE at
  the cap); the first miss appears at 16 tasks (1 of 2).
- **Effective solver cap = 1.0 s**, not 1.5: `SOLVER_TIME_CAP_S` 1.5 s minus the 0.5 s ladder
  reserve on the first rung (`planner.py` 522–524); no `relative_gap_limit`, so a solution that is
  found but not proven optimal burns the whole slice (`solves: 1`, degradation never used).
- **The device's instances were the stall case, not the big case.** Today's 14–15-task plans on a
  6.25 h window (two near deadlines, 6–8 previous assignments) have only ≈ 300 literals, yet 12
  of 15 learned calls ran to the 1.0 s cap as FEASIBLE while two same-size instances proved
  OPTIMAL in 7 ms and 325 ms — an optimality-proof stall, seed-dependent. A capped solve puts the
  call at ≈ 1.47–1.53 s against a remaining budget of 1.0–1.45 s, so the fallback is decided by
  how much the function spent before the call: ≈ 10 % of the half-day series, 1 of 1 full-day
  ritual plan, 1 of 2 clean 16-task full-day instances.

**Threshold, as measured on the deployed stack:** the learned path is reliable when the solver
finishes under ≈ 0.6 s — any inbox on a ≤ 4.5 h window, or ≤ 12 tasks on a full day. It becomes a
coin flip whenever the first rung runs to its 1.0 s slice, which happens from 14–16 tasks on a 9 h
window in clean instances and on today's deadline-bearing 14-task instances in 12 of 15
requests. The budget is structurally consumed — 0.43 s floor + 0.45–0.9 s function + up to 1.0 s
solver = 1.9–2.3 s — not "occasionally tight". Levers, cheapest first: (1) a CP-SAT
`relative_gap_limit` / early stop so proof stalls do not burn the slice; (2) parallel context reads
in the function; (3) `PLAN_FALLBACK_BUDGET_MS` toward NFR-P1's 2.5 s minus the measured client
overhead (client − function ≈ 150–250 ms from the Mac); (4) co-locating the VM with the function
region. All four touch Appendix A parameters or ADR-0009 — owner's call which becomes the thesis
result and which becomes a fix.
