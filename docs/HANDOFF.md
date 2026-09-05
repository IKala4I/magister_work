# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-05 10:45 — **hardware pass, Android day 5 (branch `post-p12/hardware-pass-day5`, PR pending):**
> build-5 ritual actions verified on an on-demand 10:00 ritual ("Adjust tasks" first response from a
> killed app → Inbox, one `adjust` fact, notification dismissed); 4 Sep PostHog export paired 12/12
> (build-4 series client p95 4.13 s → corrections #51 now says 3.7–4.1 s); the 2 Sep button question
> settled by the owner's own screenshots (no buttons on build 3; root cause established); CI drift
> fixed by PR #48 and #45/#46/#47 merged; **MAJOR data-integrity defect: blank Today cards whose
> buttons still fire** (notes item 9, corrections #53, revisit) — fix batch item, build 6. **The owner
> left with the phone (unplugged) at 10:3x:** UC-07 off-grid move, TalkBack listening pass and FR-42
> erasure resume when it is back; nothing time-bound is pending.
> Read first: `docs/verification/device-pass/android-20260905-0942/notes.md` (items 1–11), then the
> "Day 5 — state and queue" block below. Server unchanged (`plan-request` v12, `sync-resolve` v6,
> recsys `813cdbade0e9`). Phone: build 5 (`d7fc4280bf56…`, 7c8f67c, older Expo patches than main).

## Day 5 — state and queue (2026-09-05)

**Done (details = day-5 notes items 1–11):** ritual re-check on build 5 ✅ (item 7–8); 4 Sep export complete,
12/12 paired, post-L1 pre-plan sync p50 936 / p95 2367 ms, build-4 series client p50 2627 / p95 4127 ms —
NFR-P1 reference restated as 3.7–4.1 s (item 4; corrections #51, spec-conflicts L40, explainer); the three
owed `owner-*` screenshots pulled from the phone and cropped into `android-20260902-1030/` — they settle
the 2 Sep question (item 3); expo-doctor drift → PR #48 merged, #45/#46/#47 merged after it (item 5);
shared helpers `hw-shade-tap.py`, `hw-posthog-pair.mjs`, `hw-set-working-hours.mjs`, `hw-blank-cards.py`
(item 6); Saturday got a server-side working window and a 10-block plan for the owner-attended checks
(item 10); **blank-card defect** found by the owner, reproduced 5/5, traced to the Android `GlassPanel`
`overflow: hidden` clip, and classified as data integrity — the owner's two taps on blank cards became
facts 567/568 (item 9).

**When the phone is back (owner-attended, in this order):**

1. Read tonight's ritual record (`dumpsys notification`, `when=` for the 20:00 alarm on an unplugged phone —
   the FR-50 unplugged/Doze case) and the day's block-reminder posts (11:05 / 11:50 / 12:35 / 13:20 were
   pending when the phone left); no facts expected (the owner does not tap).
2. **UC-07 off-grid move:** "email replies" 3:45 PM → Move… → keyboard → 5:37 PM → Move here → expect
   5:30/5:45 (a refusal over the completed 5:15 slot also counts); verify `recommendations.status = moved`
   - `slot_start` on the server; screenshot. Only tap visible controls.
3. **TalkBack listening pass** (owner enables it in Android Settings → Accessibility): tab names (F6),
   block cards ("title, start to end, Experiment, Confidence N percent"), the heatmap summary, Settings
   switches, rating chips; the owner reports what is announced; the session records per checklist row.
4. Restore the profile: `node docs/verification/hw-set-working-hours.mjs --remove sat`.
5. **FR-42 erasure LAST** (Settings → Delete, two confirmations → reference screen → relaunch → onboarding;
   session: `deletion_audit` aggregate count, no Hourwell alarms in `dumpsys alarm`, no notifications).
   Say before doing it that it ends the device account (facts 567/568 die with it).
6. Close the day: notes, checklist rows, HANDOFF, PR.

**Post-pass fix batch (build 6), in order:** ADR-0019 (no plan / no ritual for days without a window);
**blank cards** (drop `overflow: 'hidden'` on the Android `GlassPanel`; then FlashList 2.3.1 + `getItemType`
if it still reproduces; verify with `hw-blank-cards.py` on hardware — release-blocking); the exact-alarm
in-app prompt; stale-ritual re-plans; the diagnostic card persistence (revisit). Build 6 carries the PR #48
Expo patches.

**Gotchas learnt today:** `am kill` only works on a backgrounded process (HOME first); the shade row arrives
collapsed — tap its chevron before locating buttons; `uiautomator dump` works on Today when nothing animates
but fails while the shade is open; the `Plan my day` button replaces `Re-plan` when the day's plan has 0
blocks; `feedback_rewards` has `attributed_at`, not `created_at`; `tasks` has no `completed_at`; a 20-s wait
for a known alarm is `adb shell 'sleep 20'` (the local `sleep` is blocked in this harness).

## Day 4 — state and remaining queue (2026-09-04)

**Done this morning (build 3 unless noted; details = day-4 notes items 1–12):** the order question
answered (new_day first, button second — the accept plans the ritual's own next day = today);
morning reads (ritual posted 20:26:28, untouched; the "killed" process revived natively for the
delivery, no JS); **F1 offline first open = DEFECT** (expired token + no radio → "Sign in to plan
your day"; the first online foreground inside auth-js's 60 s refresh-failure cache planned nothing);
**UC-03 `new_day` = PASS** on the second foreground (one row 08:41:01, learned, 11 blocks); **FR-26 ritual has NO action buttons on Android = DEFECT** (probable cause: the empty block category registered first → Android rejects it → the ritual category never stored; the owner recalls a button on 2 Sep — notes item 14); **FR-26 killed-app body tap = PASS** (one
`open` fact, no plan, 843 ms cold start); **FR-50 alarms inexact (+31–60 min) = DEFECT**
(`SCHEDULE_EXACT_ALARM` absent); fixes c2995be / 68ca0eb / 24808ad on PR #41, gates green (519
jest); **build 4 installed 09:11**, exact alarms confirmed (`window=0 exactAllowReason=permission`).

**Remaining today, in order:**

1. ✅ **F1 on build 4 — engine half verified 10:47 (notes item 16):** Settings read "Offline — changes
   are queued" with the token expired and no radio, and recovered by itself 70 s after the radios
   returned. The plan half needs an unplanned morning (app dead overnight, no plan for the day → the
   first open shows "Offline — showing your last plan." offline and requests by itself once online).
   Superseded plan text, kept for the recipe: the auth path ran exactly as modelled
   (failure +26 s, 60 s cache, refresh 09:41:01) but the `hourwell://settings` deep link opened
   Today, so the Settings line is still unread. **Next window: token expired again from 10:42**
   (app killed 09:44:21; the 10:20 / 11:05 alarms revive the process natively but run no JS):
   radios off → `am start` → tap the gear (top-right, ≈ (1021, 202) at default density) → the sync
   line must read **"Offline — changes are queued"** (build 3: "Sign in to sync across devices")
   → radios on → it recovers on the next poll/tick. The plan-request half is unit-tested; on the
   device it needs an unplanned morning (only if the account survives tonight).
2. ✅ **FR-50 exactness:** 09:35 → 09:35:00.345, 10:20 → 10:20:00.531. The series re-planned the
   afternoon; the next block alarm is 11:50 (exact).
3. **PostHog 3 Sep — done (notes item 15):** complete, 21/21 paired; before ADR-0018 p95 4.58 s
   (not met), after 3.68 s (met); pre-plan sync 1158 / 1540 ms pre-L1. **Series done 10:51–10:53 on build 4** (10/10 learned, function p50 1057 / p95 1282, budget
   22/30). Still owed: the owner's **4 Sep** export of `plan_requested` + `sync_completed` this
   evening (rows from 09:11 = build 4; all post-L1) → the post-L1 client figure and the `pre_plan`
   share. **NFR-P1 DECIDED (owner, 2026-09-04): ≤ 6.0 s p95 tap → plan received, warm, on a 2022 low-end Android over a weak link; Pixel 7a reference 3.7 s alongside; server ≤ 1.5 s; caveats: SQLite mirror after the timer, backlog-carrying pre-plan sync; two-thirds of the reference p95 is server-side (the L2/L3 share). Recorded in corrections #51, spec-conflicts L40, revisit, day-3 notes item 15, day-4 notes.**
4. ✅ **Evening (notes items 19–22):** ritual posted 20:00:00.335 with `actions=2`; "Plan tomorrow" from a killed app → one `accept` fact + one `evening_ritual` plan for the 5th in ≈ 2 s — **0 blocks (Saturday, no working hours; revisit)**. Defects: the notification stayed posted after the action; "Adjust tasks" on the same notification was dropped by the dedup key → **fix 7c8f67c, PR #45** (auto-merge armed); **build 5** (`d7fc4280bf56…`) **installed 22:36:49** (owner reversal: verify the fixes on hardware). Tonight's on-demand attempt hit the ≤ 5/day cap (notes item 25); **tomorrow, at the owner's ping (any time):** `node docs/verification/hw-set-ritual-time.mjs HH:MM` with HH:MM = ping + 5 min → `am start` (pull + reschedule; check `dumpsys alarm` shows the time for the 5th, `window=0`) → HOME + `am kill` → natural fire → read the record (`actions=2`) → one adb tap on **"Adjust tasks"** (first response; row located by icon template + colour guard, notes item 22) → expect Inbox, one `adjust` fact, the notification gone from the shade → restore `20:00`. Then the owner-attended items and FR-42 erasure LAST. **The Saturday zero-block plan is a product defect → ADR-0019** (rule decided: no request / no row / no daily ritual for a day without a working window; truthful Today copy) — **implementation is the first item of the post-pass fix batch** (function + client + tests, build 6), unverified on hardware by choice. **Tomorrow's F1 plan half is off:** the 5th already has a (zero-block) plan row, so no `new_day` request can fire on Saturday; next chance = Monday morning or a fresh account after erasure. Superseded plan text: the app must be dead before 20:00 (`am kill` after HOME — `am kill` is a
   no-op on a foregrounded process); the 20:00 alarm is exact now. After the ping: `dumpsys
notification` (record must carry `actions=2`), then ONE adb tap on **"Plan tomorrow"** with the
   app killed → one `notification_response` with `action: accept` + one `evening_ritual` plan for
   the 5th; "Adjust" is not tested on the same notification (it is consumed). Shade navigation
   recipe: notes item 10 (`find-ritual.py`; the button will sit under the body once expanded).
5. **Owner-attended:** off-grid move snap (5:37 in the native picker), TalkBack listening pass,
   the three `owner-*` screenshots of the 2 Sep deliveries → `android-20260902-1030/`. Then
   **FR-42 erasure LAST** (ends the device account; kills tomorrow's F1 plan-half check — say so
   before doing it).
6. **Thesis follow-ups:** the ADR-0018 window re-pin after a week of plans; revisit.md carries
   three new day-4 lines (exact-alarm prompt, stale ritual re-plans today, diagnostic card not
   persisted).

## Where we are

- **P0–P11 merged** (PRs #1–#29); **P12 on PR #30**: Art. 35 **DPIA** drafted for owner
  signature (`docs/privacy/dpia.md` — 12-risk table, none high → no Art. 36; transfers
  annex = ADR-0011 §2; cohort record for G6); `apps/mobile/eas.json` (dev/preview/
  production, remote versions); **store pack** `docs/store/` (listing copy within verified
  limits, data-safety answers from the DPIA, privacy-policy draft, name search CLEAN — no
  Hourwell app or indexed mark anywhere); real repo **README**; **runbook** duplicate
  §10–§12 renumbered → §13–§15 + new **§16** scheduled-job triage / **§17** model-registry
  rollback (demote-never-delete) / **§18** `recsys_service` activation; **least-privilege
  role** migration `20260831150000_p12_recsys_role.sql` (grants = exactly `repo.py`,
  20 pgTAP, compose `RECSYS_DATABASE_URL` fallback override — behaviour unchanged until
  rotation); v0.1.0 **CHANGELOG rollup**; `docs/thesis/corrections-rollup.md` (all 47
  worklist items grouped per draft chapter); 14 revisit dispositions (done / closed-for-v1
  / re-dated with reasons).
- **Store economics — DECIDED (owner, 2026-08-31): buy neither.** No Play Console, no
  Apple Developer Program. The store pack stays **prepared but unsubmitted** — framing:
  "ready to release; only release and marketing remain" (thesis-corrections #48). Study
  installs: Android sideload APK; **no iOS participant channel** (enrollment checklist §1
  gate). Decision block: `docs/store/metadata.md` §7; reversal condition: revisit.md.
- **Docs current:** PLAN board + tail (P0–P12), traceability (5 P12 rows), CHANGELOG,
  versions.md P12 pins (eas-cli 23.1.0; expo 57.0.18 drift), device-checklist (+2 P12
  entries), explainer P12 section + decisions 29–31, revisit dispositions.

## Exact next actions (next session, in order)

1. ✅ PR #30 merged; `main` current (2026-08-31).
2. ✅ **First scheduled nightly run — timer proven** (fired 2026-09-01, ran
   00:33:28–00:33:38 UTC, clean finish): summary matches the cohort expectations —
   priors carry-over (240 cells, 0 refit), ALS skip (1 distinct cluster), mc_backfill
   1 filled / 9 skipped-by-design (aggregate check: all 9 nulls belong to users with no
   `bandit_state` — the P11 run-3 day-0 class); `reports/2026-09-01/report.json` exists
   in the `models` bucket. All three training-container checklist items flipped.
3. Walk the ⛔ ladder below **one step per turn** (owner directive 2026-08-27), verifying
   each from the session side before offering the next.
4. No further build phases exist in PLAN. Session work from here: hardware-pass support
   (ladder 5), thesis-text support (corrections 1–49 + rollup), and OSF-freeze support (owner
   opted in, 2026-09-01 — runs strictly after the hardware pass closes). Enrollment support and
   first-real-data reviews are retired-conditional (#49).

## Hardware pass — live state (2026-09-04 morning, read before touching the phone)

- **Day 4 in one paragraph:** see the block above. Phone state now: **build 4**, app `am kill`ed
  at 09:13:31 (alarms exact and intact: 09:35 / 10:20 / 11:05 block reminders, 20:00 today,
  20:00 tomorrow), today's plan (1 row, 11 blocks) in place, the 3 Sep ritual consumed by the
  body tap, `SCHEDULE_EXACT_ALARM` appop = allow (adb), persistent logcat writer running on the Mac
  into the session scratchpad (never commit the raw file — notes item 10). Budget 22/30 at 09:12.
- **Tooling learnt today:** HOME before `am kill`; `uiautomator dump` fails while the shade is
  open — screenshots + icon template match (`find-ritual.py` in the notes) instead; a fast/long
  swipe collapses a short shade; prettier pads table cells (anchor scripted edits on cell CONTENT);
  raw logcat / whole-shade screenshots stay out of the repo.
- **Older state (day 3) below still applies where not superseded.**

## Hardware pass — live state (2026-09-03 afternoon)

- **Day 3 in one paragraph:** the PostHog export made NFR-P1 a device number — manual series
  p50 3271 / p95 3836 ms, of which the function was 1662 / 1908 and the rest a 1.0–1.5 s pre-plan
  sync push plus ≈ 0.5 s transport/mirror (notes item 1). The learned path's proof stall was
  reproduced from the device's own inbox (15 interchangeable admin tasks → 24/24 solves at the
  1.0 s slice, bound gap 0.38–1.21; a gap limit alone is inert there) and fixed by **ADR-0018**
  (gap limit 0.01 + 0.3 s no-improvement early stop + trajectory telemetry; concurrent reads in
  the function). After the rollout: device 0/10 fallbacks (before 1/10), function p50 1091 /
  p95 1342 ms, solve p50 400 / max 665 ms; sweep 0/36 (before 1/36). NFR-P1 restated as a
  measured requirement (corrections #51 — proposed ≤ 4.0 s p95 device end-to-end, owner to
  confirm). Also done: first open on the 3rd added no request (warm + cold); NFR-A2 at 2.0 on
  build 3 (F2/F3/F4/F6 hold, four cosmetic residuals); F7 and the post-reboot cold start — see
  notes items 11–12.
- **Phone state at the end of day 3 (13:0x EEST):** font/density restored to defaults, the 12:34
  focus session NOT finished (the Focus tab did not take adb taps at default density — notes item 13; the 2 h abandon rule closes it), app
  backgrounded and **`am kill`ed** (alarms intact: 13:05 block reminder, 20:00 today, 20:00
  tomorrow) so tonight's ritual is delivered to a dead process; nobody taps it. 24-h plan count
  was 29/30 at 11:42 — it frees up from 10:37 EEST on the 4th (the before-series rows) and 11:40
  (the after-series rows).
- **Server-side changes today, for attribution:** recsys `813cdbade0e9` + `plan-request` v12
  at 11:06 (ADR-0018 + concurrent reads), `sync-resolve` v6 at 13:16 (PR #40, pre-plan sync
  without the reward pass). The APK is unchanged (build 3).
- **Standing rule from today:** no Monitor / cron / sleep-loop for time-triggered checks; the
  owner pings when the moment has passed and the session reads the records. The only live-state
  step left in the queue is the action-button tap on the 4th's ritual (it needs the notification
  posted) — say so before starting it and let the owner decide.
- **Older state (day 2) below still applies.**

- **Phone ownership:** the phone is the session's while a step runs; a foreground by the owner
  mid-flow sent flows into the wrong app twice (day-2 finding 11). Never `KEYCODE_BACK` on the
  Today root (it backgrounds the app); `uiautomator dump` fails while a Focus timer or a sync
  spinner animates — use adb screenshots then.
- **Builds:** three in one day — see the "Results by build" table in the day-2 notes before
  citing any number. Build 2 is VOID (no project URL in its bundle: a worktree build whose `.env`
  copy never reached the bundle). `scripts`: `build3-checks.sh` pattern = bundle-host gate →
  install → backend proof (Settings write read back from `profiles`) → behavioural checks.
- **Done on hardware (Android):** UC-01 E2E; NFR-P2 cold start 1582 ms p90 post-reboot (build 1)
  / 551 ms warm (build 3); scroll 60 fps 0 janky; NFR-S1 reboot; first learned plan; NFR-P1 series
  server side (p95 1908 ms, 1/10 timeout fallback; client `duration_ms` in PostHog — ⛔ 5b); real
  offline round trip; undo 6 s; Ukrainian NL; FR-30 both halves; lazy lapse scan (server);
  UC-07 move (snap from an off-grid minute = owner); a11y trees (TalkBack listening = owner);
  max-scale screenshots; **UC-03 dedup on build 3 (0 requests / 20 cold starts)**; Settings
  scrolls; ritual delivered at 20:00 (+1 h window, seen by 20:14).
- **Tonight — done:** ritual tapped 20:22 (backgrounded) → `evening_ritual` plan for the 3rd
  (10 blocks, heuristic `fallback:timeout` 1909 ms), one `notification_response` (action `open` —
  button-vs-body open question, day-2 note 29), today unchanged, tomorrow line shown. Export share
  sheet on build 3 ✓ ("Export ready — 14 tables shared."; the sheet screenshot was dropped — it
  showed contact names).
- **Tomorrow (day 3):** first open must add NO request (tomorrow's plan exists — ADR-0014 §3);
  the `new_day` case needs an evening without the ritual (skip tapping it on the 3rd → check on
  the 4th); offline first open → retries on the next foreground (F1); a delivered reminder for a
  started/moved block leaves the shade (F7); cold start ×20 post-reboot on build 3; gutter /
  heatmap / quick-add at 2.0 on build 3 (`a11y-max.sh` pattern); TalkBack tab label; the killed-app
  ritual variant at 20:00; FR-42 erasure LAST (ends the device account).
- **Plan-budget sweep done (20:31–20:34, 45 requests, `hw-plan-budget-sweep.mjs`):** the
  fallback has a measured shape (day-2 notes, last section; revisit.md last entry) — 0.43 s
  round-trip floor + 0.45–0.9 s function overhead + a 1.0 s solver slice; reliable under ≈ 0.6 s
  of solve time, a coin flip once the first rung runs to its slice. **Owner decision pending:**
  which lever (gap limit / parallel context reads / budget / co-location) becomes a fix and which
  is reported as a thesis result.
- **Still open beyond Android:** everything on iOS (not started); the DST clock item; auth items
  needing the mailbox / Google client (⛔ 6); revisit entries (learned path at the fallback
  budget's edge; re-plan drops a running block; zero-block rows in the plan limit; jest open
  handle).

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1. ✅ **Migration push** — done 2026-08-31; the remote migration list shows
   `20260831150000` and the linked pgTAP re-check is green (all 20 role assertions;
   `pgtap-linked.sh` allowlist extended to capture `table_privs_are` — see Gotchas).
2. ✅ **Role activation** — done live 2026-08-31 (runbook §18): compose shipped via
   tar-sync + install.sh, role password set, `RECSYS_DATABASE_URL` on the box, container
   DSN = `recsys_service.<ref>` (count-verified), `/healthz` ok/postgres, **live plan
   `engine=learned model=recsys-p5.0`** through the new role, undelivered rewards 0. One
   live failure found+fixed: double-typed password → auth fail (set both sides from one
   variable — runbook §18). Rollback stays = remove the env var.
3. ✅ **DPIA signed + consent contact block filled** (2026-09-01): §10 = signed by the
   owner with a status note — the assessment is complete but **the processing it
   describes has not commenced; no field study will run** (owner statement at signing).
   Any future enrollment re-reads the DPIA against triggers 1–7 first. R4 cell updated
   (role rotation done 2026-08-31). Steps 6–7 below are pre-enrollment items and are now
   **conditional on that decision reversing**.
4. ✅ **Store economics — DECIDED 2026-08-31: no accounts.** Nothing left in this step:
   no `eas login`/credentials, no privacy-policy hosting, no register screenshots — the
   pack stays prepared-but-unsubmitted (metadata §7 decision block; thesis-corrections
   #48; the enrollment checklist carries the no-iOS gate; reversal condition in
   revisit.md).
5. **Hardware pass — account-free scope** — **Android days 1–2 done on the Pixel 7a** (see the
   live-state block); iOS not started (free-provisioned Release build, 7-day signature).
   **5a ✅** lockout cleared (owner ran `hw-unblock.mjs --apply`, 30 rows). **5b ✅ (2026-09-03):** the owner's PostHog CSV export carried every column; decomposition in
   the day-3 notes item 1. **5b-bis (open, no key):** re-export 3 Sep `plan_requested` +
   `sync_completed` (Day 4 item 2). **5c:** the 2 Sep ritual tap is done (backgrounded variant,
   20:22); the three `owner-*` screenshots (14:18 / 14:28 / 20:1x deliveries) are still owed to
   `android-20260902-1030/`. **3 Sep ritual left untouched → `new_day` observed on the 4th ✅.** **5d (4 Sep):** the
   ritual buttons exist only from build 4 — tonight's ritual is the first with `actions=2`; the
   owner pings after 20:00, the session taps over adb.
6. **Hardware-pass prerequisites only** (re-scoped by #49): the Google OAuth second Web
   client and a real mailbox matter only for the device-checklist auth/calendar items;
   PostHog EU / Sentry EU are optional (keys env-gated; own-use telemetry).
7. ~~Pre-enrollment list~~ — **retired-conditional** (#49, no field study): Art. 27
   representative, Oracle PAYG revisit, consent screen → production re-arm only if the
   decision reverses (after the DPIA §11 re-read). The OSF freeze is **DECIDED
   (owner, 2026-09-01): register — but only after the hardware pass (step 5) closes**;
   "pre-registration-ready" then becomes "pre-registered" in the thesis text. The H1/M9/
   #34–36/G5 material stays staged in the rollup; do not start the freeze before step 5
   is closed.

## Gotchas (P12 additions; earlier lists in git history of this file still apply)

- **Branch protection is on `main` since 2026-09-03** (six required CI jobs; the path-filtered
  synthetic-cohort job cannot be required) and the repository's auto-merge setting is on —
  `gh pr merge --auto --merge` now waits for CI. Before that, PR #39 auto-merged with three
  checks pending (they passed on `main` afterwards).
- **`hw-plan-budget-sweep.mjs` plan dates now roll from today** (tomorrow / +2 / +3). The
  hard-coded dates had turned the "9 h" row into a 6.75 h window on a re-run — compare sweeps
  only on the same horizon dates (weekday vs weekend cells differ slightly).
- **`am force-stop` cancels the app's AlarmManager alarms** (they come back on the next
  foreground, when the scheduler pass runs); **`am kill` keeps them** — use `am kill` for the
  "delivered to a dead process" variants.
- **The 30-plans-per-24 h limit counts every row** (`countPlansLast24h`): two 10-request series
  plus a day's normal traffic reach it — plan series around the expiry of yesterday's rows.
- **PostHog client timestamps are taken after the SQLite mirror**, so `timestamp − duration_ms`
  overshoots the true request start by the mirror time (0.1–0.9 s); pair rows by
  `plans.generated_at` falling inside the client interval and treat the head/tail split as
  ± that much (the sum is exact).
- **zsh `[ "$now" -ge 083200 ]` treats leading-zero numbers as octal** — compare epoch seconds.

- **Key audit lives in runbook §14, training container §13, Tailscale §15** (renumbered
  P12; §10–§12 are Operations/Rotation/Re-verify as always). Update any old note citing
  "§11 key formats".
- **Prettier pads markdown table cells** — scripted edits must anchor on cell CONTENT,
  never on `| padded | row |` substrings, and insert table rows line-based then re-run
  `pnpm format` (bit twice in P12).
- **`set -e` did not abort a multi-heredoc Bash call** in this harness — one failing
  python stage let later stages run and a "commit" landed half a batch. Verify each
  stage's output before the next; keep asserts inside the python.
- **pgTAP + custom roles:** PG16+ CREATEROLE grants the creator ADMIN but not SET on a
  created role — `p12_role_test.sql` carries a transaction-local
  `grant recsys_service to postgres;` before `set local role` (pattern to reuse).
- **compose nested default** `${RECSYS_DATABASE_URL:-${DATABASE_URL:-}}` resolves against
  the project-dir `.env`; `environment:` beats `env_file`. Both unset → empty string →
  `app.py` falls back to InMemoryRepo (same as before the change).
- **Deploy-dir changes reach the box only via install.sh/tar-sync** — never assume the
  5-min rollout ships compose.yml (it pulls images only). §18 step 0 exists because of
  exactly this.
- **SSH to the VM:** the public `ssh oracle-recsys` path is allow-list-bound (runbook §0)
  and timed out from the 2026-08-31 session network; daily admin is the tailnet — start
  Tailscale on the Mac, then `ssh ubuntu@recsys-oracle` (runbook §15).
- **`pgtap-linked.sh` captures only allowlisted pgTAP functions** — `table_privs_are` was
  missing, so 10 of the 20 P12 assertions went silently uncaptured on the first run; fixed
  2026-08-31 (`[a-z_]+_are` in the allowlist + a plan-vs-captured mismatch guard that
  exits 2). If a new test uses an exotic assertion, the guard now fails loudly.
- **§18 activation, live findings (2026-08-31):** the Minimal image ships NO editor
  (runbook §6 now says `cat >>`/sed, not nano); the documented `recsys_service@` grep can
  never match — the pooler username carries the tenant suffix (`recsys_service.<ref>@`,
  runbook §18 fixed); a double-typed password caused a live auth failure — generate once
  and fill the SQL editor + `.env` from the same shell variable (runbook §18).

## Open questions (owner)

- Two-device ritual (unchanged from P10; several revisit lines wait on it).
- ~~OSF freeze~~ — **DECIDED (owner, 2026-09-01): register**, sequenced strictly after
  the hardware pass closes; "pre-registration-ready" → "pre-registered" once the
  registration exists. Material staged in the rollup (items 8/10/21/35/36 + H1/M9/G5).
