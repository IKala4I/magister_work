# Hardware pass — Android day 4 (Pixel 7a, 2026-09-04, session-driven from 08:27 EEST)

Build 3 (`ee920100ba66…`, main 3f1159d source) until the build-4 install; server: `plan-request`
v12, `sync-resolve` v6, recsys `813cdbade0e9`. Every 4 Sep row is post-PR-#40 (post-L1). Phone
plugged in all day; the owner did not touch it. Times are EEST unless marked Z.

## Established today (chronological)

1. **Morning reads before any open (08:27).** Shade: `ritual:2026-09-03` ("Plan tomorrow? 8
   tasks are waiting — one tap plans your day."), `when=1788456388236` = **posted 20:26:28** for
   the 20:00 alarm (+1 h inexact window, item 8). No `notification_response` for it on the server
   (the only one on record is the 2 Sep body tap) — untouched, as directed. Alarms: one left
   (2026-09-04 20:00). **The "killed" app had a live process** (pid 24840, elapsed 12:01:51 →
   started 20:26:27 = the delivery): Android revives the process for the alarm receiver; the
   thread list shows the main thread, binders and ART daemons only — no `mqt_js` / Hermes
   thread, i.e. no JS ran. "Delivered to a dead process" means exactly that: native-only.
   Server: 21 plans in the trailing 24 h (9 free), **0 plans for 2026-09-04**, 0 events since 3 Sep
   13:00. (`server-reads-morning.json`, `ritual-record-0827.txt`.)

2. **Order decided (owner question):** the `new_day` read first, the action button second. The
   accept action plans the day after the ritual's OWN plan day (`nextPlanDayOf(scheduled_for)`) =
   the 4th, i.e. today — tapped first it would have created today's plan under `evening_ritual`
   and the foreground check would never have issued `new_day`; the foreground pass leaves rituals
   in the shade (`dismiss.ts`), so the button survives the open.

3. **F1 offline first open — DEFECT (build 3).** 08:31:48 `am kill` (pid gone, notification
   stays) → radios off (`svc wifi disable` + `svc data disable`; ping fails; "Active default
   network: none") → 08:31:52 `am start -W` COLD 733 ms. +9 s: "Planning your day…", the
   third-skip diagnostic card ("This one keeps slipping. What is it?" — _email replies_), "No plan
   yet". Logcat: JS up 08:31:55; 08:32:21 `AuthRetryableFetchError: Unable to resolve host
…supabase.co` (+ the auto-refresh tick's "lock acquisition timed out after 0ms"). **08:32:31:
   "Sign in to plan your day."** — the plan store went `no_session`, not `offline`. Server: 0
   plans, 0 events. (`f1-offline-first-open.png`, `-2.png`.)
   Mechanism (auth-js 2.112.4 source): the access token had expired (last refresh 3 Sep
   10:28:19Z); `getSession()` → `_callRefreshToken` retried with 200·2ⁿ ms backoff inside a 30 s
   window (`AUTO_REFRESH_TICK_DURATION_MS`), failed, and **cached the failure for 60 s**
   (`REFRESH_FAILURE_COOLDOWN_MS`); `planRequest.run()` and `engine.currentUid()` read
   `session: null` as "no session".

4. **First online foreground did not plan (build 3).** 08:33:14 radios on (shell ping OK in 2 s);
   08:33:17 HOME → `am start` (HOT 40 ms). 08:33:31 and 08:34:19: still "Sign in to plan your
   day.", no plan; server 08:33:35 / 08:39:10: 0 plans for the 4th. What did happen:
   `auth.refresh_tokens` gained a row at **05:33:50Z (08:33:50)** — the auto-refresh tick 30 s
   after the foreground, once the 60 s cache had lapsed; the 8 facts the offline cold start logged
   (`focus_end` + 7 × `lapse_observed`, client_ts 08:31:55) landed at 08:34:20. The 08:33:17 plan
   request fell inside the cache window → `no-session` again, and nothing re-ran it when the
   refresh landed. (`auth-rows-0836.json`, `server-reads-after-online-foreground.json`,
   `server-reads-recheck-0839.json`.)

5. **UC-03 `new_day` — PASS on the second foreground.** 08:40:59 HOME → `am start` (HOT 38 ms) →
   **plans row 08:41:01 for 2026-09-04, trigger `new_day`, engine learned, FEASIBLE, `ef.total_ms`
   1009, 11 recommendations** (exactly one row; budget 22/30). Today: blocks 9:00 / 9:45 / 10:30 …,
   "No room today for 4 tasks — they stay in your Inbox." The diagnostic card was gone after the
   08:53 cold start (item 7) — it lives only in the foreground whose lapse scan found it
   (revisit). (`new-day-second-foreground-6s.png`, `-14s.png`,
   `server-reads-after-second-foreground.json`.)

6. **FR-26 — the ritual has NO action buttons on Android (build 3) — DEFECT, probable root cause (see item 14 for the contested point).**
   The expanded ritual (08:46:50) shows title + body only; the posted record carries no
   `actions=` (Gmail's rows in the same dump show `actions=3`). Cause: `setup.ts` registered
   `setNotificationCategoryAsync(CATEGORY_BLOCK, [])` FIRST inside one try block;
   `ExpoNotificationCategoriesModule.setNotificationCategoryAsync` throws
   `InvalidArgumentException("… Must provide at least one action.")` for an empty list, the catch
   swallowed it, and the ritual's category (`plan_tomorrow`, accept + adjust) was never stored;
   `ExpoNotificationBuilder.addActionsToBuilder` reads the category from SharedPreferences at
   post time → nothing to add. iOS accepts an empty category, so the simulator never showed it.
   Day-2 note 29's "button vs body" is settled: there was no button. **Fix c2995be** (block
   reminders carry no category; the ritual category is registered alone; `setup.test.ts`).
   Verification needs build 4 + a posted ritual (tonight). **Certainty (owner correction, item 14): the mechanism is established in the code and the library, but that it explains the 2 Sep delivery is contested — treat the root cause as probable.** (`ritual-expanded-no-actions.png` —
   cropped to the Hourwell row; the full-shade shots were dropped, they show other apps' private
   content.)

7. **FR-26 — killed-app BODY tap — PASS (build 3).** With the app killed (HOME first — `am kill`
   is a no-op on a foregrounded process, item 10), one adb tap on the ritual body at 08:53:32:
   `NotificationForwarderActivity` 08:53:34.138 → MainActivity displayed **+843 ms** (cold) → JS up
   08:53:34.633 → **exactly one** `notification_response` (client 08:53:34.974, server 08:53:36.468;
   `action: open`, `variant: daily`, `latency_ms 46 414 974` — measured from `scheduled_for`
   17:00Z, not from the 20:26 post), **no plan request** (still one plan for the 4th), the
   notification cleared (AUTO_CANCEL), Today with the plan. The cold-start dedup (last-response
   hook + listener → one fact) holds. (`ritual-body-tap-killed-after-10s.png`,
   `server-reads-after-body-tap.json`.)

8. **FR-50 — inexact alarms: `SCHEDULE_EXACT_ALARM` neither declared nor granted (build 3).**
   `appops get com.hourwell.app SCHEDULE_EXACT_ALARM` = default; no `uses-permission` in either
   manifest; expo-notifications' `ExpoSchedulingDelegate` then uses `setAndAllowWhileIdle` →
   `dumpsys alarm` windows of **+31 min (09:35) to +1 h** (10:20, 11:05, 20:00). Consequences seen:
   the ritual posted 26 min late; the 08:50 reminder for the 9:00 block (scheduled at the 08:41
   pass) had not been delivered by 08:52:45 and the 08:53 foreground pass cancelled it as past —
   **never shown**. **Fix 24808ad** declares the permission; on Android 13+ the grant is a user
   action ("Alarms & reminders"), set over adb for the device test (`appops set … allow`); the
   in-app prompt is a revisit item.

9. **Fixes on `fix/mobile-hardware-pass-day4`** (gates green: typecheck, lint, format, 519 jest —
   was 461): c2995be (item 6), **68ca0eb** — `readSession()` maps a retryable refresh error to
   `offline` for the plan request and the sync engine, the session store bumps `refreshedAt` on
   INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED and `usePlanTrigger` re-checks on it (items 3–4),
   24808ad (item 8). Build 4 = this branch, `expo prebuild --clean` + `assembleRelease`
   (`build4.log`).

10. **Tooling gotchas today.** `am kill` does nothing while the app is foregrounded — send HOME
    first, then kill (verify `pidof`). `uiautomator dump` fails with "could not get idle state"
    whenever the shade is open (something in it animates) and re-serves a stale file unless the
    old `/sdcard/ui.xml` is removed; a fast or long swipe on a short shade COLLAPSES it — the
    working recipe is `cmd statusbar expand-notifications` → one slow swipe (`540 2100 → 540 1100`,
    400 ms) → screenshot → locate the Hourwell row by template-matching its icon
    (`find-ritual.py`, mean diff 7.5 on a 100×100 crop; verified by eye before the tap). The logcat
    ring buffer rotated within minutes (accessibility dumps flood it) — the 08:32 auth lines
    survive only in this note; from 08:35 a persistent writer runs (kept outside the repo; the
    Hourwell-only extract is `logcat-hourwell-day4.txt`).

11. **Build 4 installed (09:11:21) — exact alarms confirmed.** APK `e6c9ea1ef9f0…`
    (121 299 734 B) from 24808ad; gate: the project host and the anon-key prefix each occur once
    in `assets/index.android.bundle`; `aapt dump permissions` lists
    `android.permission.SCHEDULE_EXACT_ALARM`. `adb install -r` over build 3 kept the data (same
    debug keystore); Android started the process for expo-notifications' package-replaced
    receiver before the first open (hence LaunchState WARM, 807 ms). `appops set …
SCHEDULE_EXACT_ALARM allow` → after the first foreground's scheduler pass every alarm reads
    **`window=0 exactAllowReason=permission`** (09:35, 10:20, 11:05, 20:00 today, 20:00 tomorrow).
    Today unchanged (1 plan for the 4th, budget 22/30). Observation, not investigated:
    `ReactNativeJS: Running "main"` appears twice within a second on this first start after the
    install (09:11:37.365 and 09:11:38.290, same pid) — no functional effect seen. App sent HOME
    and `am kill`ed at 09:13:31 so the token expires (09:33:50) with the app dead.

12. **F1 re-check on build 4 (09:39–09:42) — auth path as predicted; the Settings line still to
    read.** The 09:35 alarm had revived the process natively (pid 19360, no JS), so `am start` with
    the radios off reported WARM 779 ms while the JS started cold ("Running main" 09:39:35). The
    `hourwell://settings` VIEW intent landed on **Today** (expo-router did not route the scheme
    link from a cold VIEW start — use the gear icon), which now showed the third-skip card for
    "Offline note" (the 9:00 block lapsed at this foreground). Auth exactly as modelled:
    `AuthRetryableFetchError` at 09:40:01 (+26 s), radios on 09:40:17, `auth.refresh_tokens` gained
    a row at **09:41:01** (60 s after the failure = the cache), no plan request (today is planned),
    facts synced. The build-4 observable — Settings reading "Offline — changes are queued" instead
    of "Sign in to sync across devices" — needs the token expired again: app sent HOME and killed
    09:44:21, the window opens **10:42**. (`f1-build4-offline-settings-40s.png`,
    `auth-rows-after-f1-build4.json`.)

13. **FR-50 exactness on build 4 + grant:** `block:b746deee…` ("slides outline", the 9:45 block)
    posted **09:35:00.345** for the 09:35:00 alarm — +345 ms (build 3: +31–60 min windows; the
    ritual +26 min). 10:20 / 11:05 to be read after the fact.

14. **Owner question — regression or original defect? By the code history: original. By the owner's eyewitness: contested — the root cause is probable, not established.** The empty block
    category is registered BEFORE the ritual's at lines 48–49 of `setup.ts` in the P10 feature
    commit 5a4be6f (2026-08-30), and at lines 50–51 of dd48052 (P10 adversarial fix), 56935e0 (the
    build-3 source, 2 Sep) and 3f1159d (main after PR #38); the P10/P12 fix batches never touched
    `registerCategories`; build 1 (installed 1 Sep 20:21) postdates P10 and predates every fix
    batch → every Android build of the pass ran this code. No day-1/2 evidence shows a
    notification button: no `dumpsys notification` capture exists for those days, the only
    notification-related screenshot is the Today screen after the ritual, and day-2 note 29 (label
    confirmed by the owner) records the body tap followed by the **"Plan tomorrow" button on the
    Today card** and lists the notification's own button as untested. Where the memory can come
    from: that in-app card, or the iOS simulator — `CategoriesModule.swift` passes an empty action
    list straight to `UNNotificationCategory`, so on iOS both categories register and the ritual
    does carry "Plan tomorrow" / "Adjust". The three owed owner screenshots of the 2 Sep
    deliveries can only add evidence if the row was expanded (a collapsed row never shows actions).
    **Owner correction (later that morning): a button WAS seen in the notification itself on 2 Sep**
    (the owner chose the body and the in-app card). Checked against that: the empty-actions rejection
    exists on the library's sdk-57 branch and both build sources pinned expo-notifications 57.0.16
    (build 1's 57.0.15 sits on the same branch); the category store is app data, and the device's
    auth session has run unbroken since 1 Sep 17:37Z (no data clear could have emptied a stored
    category between 2 and 3 Sep); nothing in the app calls `deleteNotificationCategoryAsync`. So no
    mechanism found renders our action button on 2 Sep and not on 3 Sep on the same build — and no
    other element of that notification is known to look like one. The two accounts cannot both be
    right; the write-up therefore records the cause as **probable**, not established. What settles
    it: tonight's ritual record on build 4 must carry `actions=2` (fix effective); the pre-fix store
    contents cannot be read back on a release build, so the 2 Sep question stays open on evidence.

15. **PostHog 3 Sep exports (owner, 06:35Z / 06:36Z on the 4th) — complete, no re-export needed.**
    `plan_requested`: 21 rows 07:37:06Z–08:41:50Z = the 21 `plans` rows of 3 Sep, **21/21 paired**
    (`plans.generated_at` inside the client interval; `plans-2026-09-03.json`,
    `nfr-p1-2026-09-03-client-decomposition.json`, `nfr-p1-2026-09-03-pairing.txt`).
    `sync_completed`: 224 rows 07:33:50Z–10:38:12Z. Labels: every `plan_requested` and every
    `pre_plan` sync is pre-L1 (last `pre_plan` 08:41:48Z, deploy 10:16Z); the 21 sync rows after
    the deploy are `foreground` / `poll` only, which L1 does not touch.

    | series (3 Sep, warm, manual)    | n   | client p50 / p95 / max ms | function p50 / p95 | client − function p50 / p95 | fallbacks |
    | ------------------------------- | --- | ------------------------- | ------------------ | --------------------------- | --------- |
    | before ADR-0018 (v11, 07:37Z)   | 10  | 3534 / **4581** / 4844    | 1679 / 1839        | 1874 / 2755                 | 1/10      |
    | first after-point (v12, 08:06Z) | 1   | 2898                      | 1142               | 1756                        | 0/1       |
    | after ADR-0018 (v12, 08:40Z)    | 10  | 3043 / **3683** / 3922    | 1100 / 1302        | 1984 / 2381                 | 0/10      |

    Against the decided NFR-P1 (≤ 4.5 s p95 device end-to-end warm, ≤ 1.5 s server): **before —
    not met (4.58 s); after — met (3.68 s / 1.30 s)**. The pre-plan sync: 17 of the 21 requests
    carried one (the other four fell inside the 30 s freshness window with nothing pending),
    **p50 1158 / p95 1540 ms** — the pre-L1 baseline; by reason over the day: `foreground` 822 /
    1904 (n 61), `poll` 891 / 1676 (n 143), `pre_plan` 1158 / 1540 (n 17). The post-L1 client
    figure needs a build-4 series (after 10:37, when the before-series rows leave the 24-h budget)
    and the owner's 4 Sep export.

## Results by build

| Build | Source / APK                                                                                                                                     | Checks attributed to it                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3     | main 3f1159d source, `ee920100ba66…` (unchanged since 2 Sep 17:00)                                                                               | items 1–8: `new_day` once ✓ (second foreground), F1 offline first open ✗ (defect, item 3–4), ritual buttons ✗ (defect, item 6), killed-app body tap ✓ (item 7), inexact alarms ✗ (item 8) |
| 4     | `fix/mobile-hardware-pass-day4` at 24808ad, clean prebuild + `assembleRelease` (09:07–09:09), `e6c9ea1ef9f0…`, 121 299 734 B, installed 09:11:21 | bundle gate ✓ (host ×1, anon-key prefix ×1), manifest `SCHEDULE_EXACT_ALARM` ✓, exact alarms ✓ (item 11); owed: ritual buttons (tonight), F1 re-check (item 12)                           |

## Evidence files

`server-reads-*.json` (q-0904 reads: plans for the 4th with `telemetry->request->>trigger`,
budget, `notification_response`, today's events), `auth-rows-0836.json` (auth.sessions /
refresh_tokens), `shade` record `ritual-record-0827.txt`, screenshots listed per item,
`logcat-rn-0831.txt` (what survived of the offline start), `logcat-hourwell-day4.txt` (the
Hourwell / ReactNativeJS / expo lines of the persistent logcat writer running from 08:35 — the raw
device log stays out of the public repo), `build4.log`.
