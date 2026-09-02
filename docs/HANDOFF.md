# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-02 — **hardware pass in progress** (branch `post-p12/hardware-pass`,
> Pixel 7a, day 2). Day-1 and day-2 running notes: `docs/verification/device-pass/
android-20260901-2030/notes.md` and `android-20260902-1030/notes.md` — read those two files
> first; everything below them is the post-P12 ladder context (unchanged). **Thesis-critical
> finding 2026-09-02:** the learned engine was unreachable from the Android device (legacy
> timezone id → service 422 → heuristic fallback) — fixed in **PR #37** (`fix/recsys-legacy-tz`,
>
> - the Expo patch-drift chore); after the merge the images rebuild and the VM rolls out within
>   5 min; re-verify with `node docs/verification/hw-tz-repro.mjs` (expects Kiev → learned).
>   Gates on that PR: recsys 156 pytest · training 79 · jest 461 · expo-doctor 21/21.

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

## Hardware pass — live state (2026-09-02, read before touching the phone)

- **The phone is the session's while a step runs** (day-2 finding 11: a Telegram foreground
  mid-flow sent two Maestro flows into the wrong app). Ask for it back explicitly.
- **Blocked on the owner:** the device account hit the 30-per-24 h plan limit (day-2 item 3)
  from day 1's 30 zero-block fallback rows — delete them (see ⛔ 5a) or wait until 20:40 local.
- **Done on hardware (day 2):** undo bar 6 s ✓ · Ukrainian quick-add no chips ✓ · offline
  task reached the server once after reconnect ✓ (Settings status texts still to capture).
- **Next on the device, in order:** first learned plan on hardware (after PR #37 rolls out
  and the limit is cleared) → NFR-P1 series (10 re-plans; client durations are in PostHog)
  → gfxinfo scroll (≥ 10 blocks) → NFR-A2 sweeps at max font/display over adb → TalkBack
  tree dumps → FR-30 focus across lock/kill + lazy lapse after > 30 min → FR-50 delivery and
  the 20:00 ritual drift → UC-07 Move picker → FR-42 export sheet → overnight `new_day`.
- **Fix batch after the Android pass** (binary stays constant until then): quick-add
  placeholder clip (day-1 #7), `(?i)` e2e selectors (day-2 #7), tab glyph in the a11y label
  (day-2 #8), zero-block rows counting toward the plan limit + cold-start re-request loop
  (day-2 #3), then rebuild the APK on the bumped Expo patches and re-run cold start ×20.

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
5. **Hardware pass — account-free scope** (owner decision 2026-08-31) — **in progress on
   the Pixel 7a** (days 1–2 done: onboarding E2E, cold start p90 1582 ms, reboot session,
   quick-add, undo, offline; iOS not started). Protocol unchanged: iOS = free-provisioned
   Release build (`npx expo run:ios --device --configuration Release`), Android = sideloaded
   release APK. **5a (now):** clear the plan-limit lockout on the device account — run in this
   session (the `!` prefix), it deletes only the 30 zero-recommendation rows of 2026-09-01:
   `! node docs/verification/hw-unblock.mjs --apply` (dry run without the flag) — or wait until
   20:40 local. **5b:** PostHog read for the NFR-P1 client durations (`plan_requested`
   `duration_ms`, 2026-09-02) — either read the EU project UI or drop a read-only personal API
   key + project id into `.env` as `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID`.
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
