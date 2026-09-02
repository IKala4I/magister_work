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
14. **Maestro visibility asserts fail under `wm density` overrides** even for on-screen text
    (both the p10 sweep runs at max scale); tree dumps and adb screenshots are the evidence.
15. **Settings list ignores `input swipe` scrolling** (the modal's gesture handling); use
    Maestro `scroll` for the lower Settings sections.
