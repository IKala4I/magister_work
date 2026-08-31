# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-31 (late night), **P12 — Release prep — BUILT (PR #30).**
> Adversarial pass: 5 MAJOR + 11 MINOR, all 16 fixed in-branch. Gates: typecheck/lint/
> format clean · jest 461 · expo-doctor 21/21 · recsys 149 (8 skipped) · training 78 ·
> pgTAP `p12_role_test.sql` proves on the PR's db job (no Docker on the dev Mac).
> **P0–P12 = the whole build plan. What remains is owner-run: the ⛔ ladder below, the
> hardware pass, enrollment prerequisites, and first-real-data reviews.** Standing rules
> live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence".

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
- **Store economics (owner decision, re-raised per PLAN §5 row 4):** Play **$25 one-time**
  now (clean participant installs + listing); Apple **$99/yr only when iOS participants
  are actually recruited** — TestFlight is the only viable 8-week iOS channel (free tier:
  3 devices / 7-day builds). Facts: `docs/store/metadata.md` §7.
- **Docs current:** PLAN board + tail (P0–P12), traceability (5 P12 rows), CHANGELOG,
  versions.md P12 pins (eas-cli 23.1.0; expo 57.0.18 drift), device-checklist (+2 P12
  entries), explainer P12 section + decisions 29–31, revisit dispositions.

## Exact next actions (next session, in order)

1. **If PR #30 is not yet merged:** `gh pr checks 30` → all green → merge (squash off,
   normal merge like prior phases), `git checkout main && git pull`.
2. **First scheduled nightly check** (1 min, after 2026-09-01 00:36 UTC):
   `ssh oracle-recsys 'journalctl -u hourwell-train -n 15'` → JSON summary (expected on
   this cohort: priors carry-over, ALS skip, backfill 0/7-skipped) and
   `reports/2026-09-01/report.json` exists in the `models` bucket (names-only query).
3. Walk the ⛔ ladder below **one step per turn** (owner directive 2026-08-27), verifying
   each from the session side before offering the next.
4. No further build phases exist in PLAN. Session work from here: verification support,
   first-real-data reviews (revisit.md re-dated items), OSF-freeze bundle support,
   enrollment support (`docs/study/enrollment-checklist.md`).

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1. **Migration push:** `supabase db push` (adds `20260831150000_p12_recsys_role`; the
   sweep-header migration is already live). Session then runs the linked pgTAP re-check.
2. **Role activation** (runbook **§18** — step 0 FIRST: ship the P12 compose.yml via the
   §6 tar-sync; then password → `RECSYS_DATABASE_URL` → `docker compose config recsys`
   check → restart → live smoke). Rollback = remove the env var.
3. **DPIA sign-off** (`docs/privacy/dpia.md` §10) + the consent contact block
   (`consent-clause.md` §5) — same sitting.
4. **Store economics decision** ($25 / $99 — metadata §7); then accounts, `eas login` +
   `eas init` + credentials + EAS env vars (metadata §8), privacy-policy URL hosting,
   name-search register screenshots (name-search §3).
5. **Hardware pass** (`scripts/device-pass.sh`; needs a dev build — EAS, so after 4):
   the whole `docs/verification/device-checklist.md`; device-conditioned requirements
   flip ✅ only here.
6. Earlier gates unchanged: Google OAuth second Web client (FR-01, P4) + P4 smoke;
   magic-link E2E with a real mailbox; PostHog EU + Sentry EU accounts (keys env-gated).
7. **Pre-enrollment list:** G6 Art. 27 representative if any EU/EEA participant (STOP
   rule in the enrollment checklist); Oracle PAYG revisit (G1); Google consent screen
   Testing → In production; OSF-freeze bundle (H1 conditions, M9 power recompute,
   corrections #34–36 wording, G5 dataset decision) — one sitting.

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

## Open questions (owner)

- Two-device ritual (unchanged from P10; several revisit lines wait on it).
- Store economics (ladder step 4) — decision, not question: recorded here so it isn't lost.
- OSF freeze bundle: H1 text conditions, M9 power recompute, corrections #34–36 wording,
  G5 dataset decision — one sitting, before enrollment.
