# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-02 evening — **hardware pass, Android day 2 closing** (branch
> `post-p12/hardware-pass`, Pixel 7a). Read first: `docs/verification/device-pass/
android-20260902-1030/notes.md` (items 1–29 + "Results by build" + owner observations) and
> `android-20260901-2030/notes.md`; then the "Hardware pass — live state" block below.
> Merged to main today: **PR #37** (legacy timezone id → the learned engine was unreachable from
> Android; tzdata wheel + build-time assertion) and **PR #38** (client fix batch F1–F8: cold-start
> re-plan, Settings scroll, stale reminders, 200 % layout, a11y, e2e quoting). The phone runs
> **build 3** (`ee920100ba66…`, main 3f1159d source), gated on the bundle host + a backend proof.

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

## Hardware pass — live state (2026-09-02 evening, read before touching the phone)

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
- **Tonight (owner):** tap the ritual's "Plan tomorrow" action before midnight → verify: one
  `plans` row for 2026-09-03 with trigger `evening_ritual`, one `notification_response` event, no
  new row for today, Today shows the tomorrow line. Then the export share-sheet screenshot on
  build 3 (session; the first flow's wait regex matched hint text).
- **Tomorrow (day 3):** first open must add NO request (tomorrow's plan exists — ADR-0014 §3);
  the `new_day` case needs an evening without the ritual (skip tapping it on the 3rd → check on
  the 4th); offline first open → retries on the next foreground (F1); a delivered reminder for a
  started/moved block leaves the shade (F7); cold start ×20 post-reboot on build 3; gutter /
  heatmap / quick-add at 2.0 on build 3 (`a11y-max.sh` pattern); TalkBack tab label; the killed-app
  ritual variant at 20:00; FR-42 erasure LAST (ends the device account).
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
   **5a ✅** lockout cleared (owner ran `hw-unblock.mjs --apply`, 30 rows). **5b (open):** PostHog
   read for the NFR-P1 client durations (`plan_requested.duration_ms`, 2026-09-02, 10 manual
   re-plans 11:38–11:40 + the first-open ones) — read the EU project UI or put a read-only
   personal API key + project id into `.env` as `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID`.
   **5c (tonight):** tap the 20:00 ritual's "Plan tomorrow" action before midnight (backgrounded
   variant); drop the 14:18 / 14:28 / 20:1x screenshots into
   `docs/verification/device-pass/android-20260902-1030/` with an `owner-` prefix (delivery
   times for the FR-50 drift).
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
