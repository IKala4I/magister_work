# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-30, **P10 — Notifications, privacy, a11y, performance: complete; PR #19
> merged (all six CI checks green; adversarial pass done — see "P10 status"); ⛔ the P10
> migration push is the owner's step, then the live erasure smoke in a small follow-up PR
> (P9 precedent), then P11.** Standing rules live in CLAUDE.md: "Working mode", "Context
> efficiency", "Simulator evidence".

## Where we are

- **P0–P10 merged** (PRs #1–#19). Functions deployed 2026-08-30 (`export-data`,
  `delete-account`, `plan-request`, `gcal-connect`; `delete-account`, `attribute-rewards`,
  `gcal-webhook` redeployed after the adversarial fixes); migration
  `20260830120000_p10_privacy.sql` **not yet applied** (⛔ below) — until then `delete-account`
  answers 500 and no retention tick runs.
- **What P10 built** (ADR-0014; CHANGELOG "P10"): local notifications only — a pure planner
  (`src/notifications/plan.ts`) over a conservative delivered-ledger (`ledger.ts`, MMKV) keeps
  FR-50's ≤ 5/day a ceiling under any re-plan sequence (storm tests); the scheduler runs on
  mount/foreground/table change (invariant 7); block reminders at slot − 10 min, per-category
  mute + ritual time in `profiles.settings` (the replay RPC now merges `settings`); the FR-26
  ritual (Accept plans tomorrow via `plan-request` +1 d with trigger `evening_ritual`; Adjust →
  Inbox; Sunday → Insights); every tap/action a `notification_response` fact (FR-32); the UC-03
  trigger asks "is today planned". FR-42: `export-data` (RLS-filtered whitelist, titles
  stripped, share sheet) and `delete-account` (self / operator / retention → Google teardown →
  `deletion_audit` → `auth.admin.deleteUser` cascade → in-app confirmation with the reference);
  retention fixed (anonymous 30 d inactive, daily tick); SDK opt-outs; a11y source audit with
  three real AA fixes; Maestro sweep + `scripts/device-pass.sh`; perf probe from Node.
- **Gates at the close:** typecheck/lint/Prettier clean · jest **461** (56 suites) · Deno
  **187** · pytest **149** (8 skipped) · pgTAP **36/36** (linked, rolled back) · expo-doctor
  21/21 · CI on PR #19 all green · live smoke pre-migration: export **13/13**, erasure blocked
  (expected) — `p10-manual-verification.md` §2.2.
- **Perf (Node → eu-west-1):** REST read/write 88/82 ms p95 ✅ NFR-P3; `sync-resolve` 477 ms,
  `insights` 714 ms, `export-data` 736 ms p95 ❌ (composite; revisit); `plan-request` 965 ms
  p95 ✅ NFR-P1. No device numbers claimed.
- **Docs current:** ADR-0014, `p10-manual-verification.md` (§1–§3; §4 adversarial), `p10-a11y-audit.md`,
  traceability (10 P10 rows), CHANGELOG, PLAN board + P10 status line, device checklist
  "Notifications, privacy, performance (added P10)", revisit (P10-tagged lines closed/re-dated +
  6 new), spec-conflicts L34–L39, thesis-corrections #43–#47, versions (P10), privacy README
  G8/G9 + §5/§6/§7, consent clause §3 (export live; in-app confirmation), explainer (P10
  section, decisions 20–23, status row).

## P10 status

- **Adversarial pass done** (`p10-manual-verification.md` §4): 2 MAJOR + 12 MINOR; both
  MAJORs and 10 MINORs fixed the same day (settings survive the profile-conflict merge; the
  analytics opt-out really opts out and lifecycle capture is off; sign-out/switch/erasure
  cancel notifications; ritual plans the day after its own plan day; Today follows the 06:00
  anchor; cancel-before-settle; no ritual without a profile; tolerant audit stamp; constant-time
  key compare; permission re-read on foreground; radio `checked`; brace-aware audit scanner).
  Two MINORs documented (cap per install; non-preset ritual time shows no chip).

## Exact next actions (next session, in order)

1. **⛔ Owner first (5 minutes):** from the repo root, `supabase db push --linked` (answer yes).
   It applies `20260830120000_p10_privacy.sql` (`deletion_audit.reason`,
   `anonymous_purge_candidates`, `retention_sweep_tick` + the daily cron job, the
   `sync_apply_profile` settings merge; pgTAP-verified 36/36 against the linked project in a
   rolled-back transaction). Then, from `apps/mobile`: `node ../../docs/verification/p10-live-smoke.mjs`
   — expect **25/25**: the export document and the full self-erasure round trip observed
   service-side. Paste the output into `p10-manual-verification.md` §2.2.1 and flip the two
   FR-42 traceability rows to ✅ fully. Also regenerate `packages/shared/src/database.ts`
   (`supabase gen types typescript --linked > packages/shared/src/database.ts &&
./scripts/normalize-db-types.sh packages/shared/src/database.ts`) and commit if it differs
   (CI's db job already agrees with the hand-written block). Do this on a small branch
   `phase/P10-smoke-close` → PR "P10 — live smoke close" → merge (P9 precedent, PR #18).
2. `git checkout main && git pull`; `gh run list --branch main -L 1` green.
3. **Hardware verification pass (owner-run, before P12)** is now fully scripted:
   `scripts/device-pass.sh ios|android` (Maestro sweeps incl. `p10-a11y-sweep.yaml`, cold start,
   fps, the manual notification/export/erasure protocol). Needs a development build with the
   `hourwell` scheme (Expo Go has no notification categories/channels) — an EAS or local build
   is a ⛔ owner step when the pass is scheduled.
4. `git checkout -b phase/P11-training` and open the P11 PR early.
5. **P11 reading list** (read nothing else to orient): PLAN §3 P11 (as amended by ADR-0011 option
   A); specs/04 §2.3 (OPE: IPS/SNIPS/DR, ESS, MC propensities K = 32), §3.2–§3.5 (ALS, k-means,
   fold-in, empirical-Bayes prior refresh, `model_registry`); specs/06 §1.2 (ABAB/BABA
   assignment), §5 (archive); specs/07 §3.2.2–§3.2.3, §4.1 `model_registry` / `cluster_assignments`
   / `study_assignments`, Appendix A rows P11; ADR-0011 (training on the EU VM, `train.yml` on
   synthetic data, registry in Supabase Storage, `eu_eea_resident` in enrollment); ADR-0009 +
   `docs/runbooks/oracle-vm.md` (the box, compose, keep-busy slot); `docs/privacy/README.md` §7
   (aggregates only to the researcher) + G6 (Art. 27 trigger); `training/` (P0 scaffold);
   `services/recsys/src/hourwell_recsys/{repo,energy,bandit}.py` (state the export/refresh
   reads/writes); revisit.md lines tagged P11 (drop rate report, personal-by-label share,
   `diagnose_user`, week-horizon budget).
6. **P11 scope** (PLAN §3): nightly training container on the VM (pseudonymized categorical
   export — CI-tested whitelist, NFR-S3; ALS fit; k-means with silhouette; fold-in ≥ 30
   outcomes; EB prior refresh as `kind='priors'` registry rows; eval gate; artefacts to Supabase
   Storage EU); `train.yml` on synthetic data only; OPE harness (replay on the randomized slice,
   IPS/clipped/SNIPS/DR, ESS < 100 = non-evidence, MC propensities K = 32); study mode
   (ABAB/BABA assignment, enrollment checklist with the EU/EEA question, arm labels in the UI —
   FR-22 already). Thesis-critical: OPE estimators + ESS gate + the export whitelist (NFR-S3).
7. Keep `docs/thesis/pojasnennia.uk.md` in the same commits; add device-checklist entries during
   the phase; refresh this file at the end and close with `HANDOFF WRITTEN — safe to /clear`.

## ⛔ ACTION REQUIRED (owner)

- **P10 migration push** (step 1 above) — until then the erasure path returns 500 (the audit
  insert needs `deletion_audit.reason`) and no retention tick runs.
- **Erasure confirmation by e-mail?** (ADR-0014 §9; privacy README G8): keep the in-app
  reference (current), or approve an EU mail processor (cost + Art. 28 entry) — decide before
  enrollment; the consent clause currently says "no e-mail is sent".
- **Consent clause review** — `docs/privacy/consent-clause.md` (§3 reworded in P10; contact block
  to fill).
- **Google OAuth _sign-in_ (FR-01, P4 leftover):** second Web OAuth client with redirect
  `https://uapiuehjcntilwdmpojk.supabase.co/auth/v1/callback`, id + secret into Supabase
  Dashboard → Authentication → Providers → Google; the session then runs the P4 smoke.
- Earlier gates unchanged: magic-link E2E with a real mailbox, OSF-freeze text items.
- **Pre-enrollment list** (`docs/decisions/revisit.md`): Oracle PAYG (deferred); Google consent
  screen **Testing → In production**; the device verification pass before P12 (now scripted:
  `scripts/device-pass.sh`; needs a development build).

## Gotchas (P10 additions; earlier lists still apply)

- **A fact for another account after sign-out**: reminders are now cancelled on sign-out /
  account switch / erasure (`clearAllNotifications` lives in `notifications/setup.ts` — no DB
  import, safe to call from `auth/`); any new "identity changes" path must call it too.
- **Migration before smoke, again.** `delete-account` inserts `deletion_audit.reason`; without
  the P10 migration the self-erasure is a 500 and the test user stays (the retention tick
  purges it after 30 d once the migration is in). `export-data` works pre-migration.
- **`@testing-library/react-native` 14: one render per test.** A second `render` after
  `cleanup()`/`unmount()` in the same test leaves the NEXT test's render empty (tree `null`,
  zero hook calls). Split into separate `it`s (done for the trade-off test and the P10 cases).
- **jest mock factories must not reference out-of-scope consts** — build the in-memory SQLite
  inside the `jest.mock('../../db/client', () => {...})` factory with `jest.requireActual`
  (`scheduler.test.ts`); read the handle back via the mocked import.
- **CI lint ≠ local `pnpm -s lint | tail -1`** — the silent flag hid the error count once;
  check the exit code (`pnpm lint; echo $?`) or grep `problem`. Typed jest mocks
  (`jest.fn<Promise<T>, [unknown]>`) avoid `_arg` unused-var errors.
- **`.expo/types/router.d.ts` is a local cache, not CI's truth**: a new route (`account-deleted`)
  fails local `tsc` until `expo start` regenerates it (or patch the union by hand); CI types
  routes loosely without the file.
- **`supabase db query` now wraps a raised TAP text as `{"message": …}`** — `pgtap-linked.sh`
  handles it; the TAP lines are still complete inside the "400" body.
- **A plan for tomorrow ≠ latest plan is today's.** `decidePlanTrigger` needs
  `hasPlanForToday`; any new caller that only passes `latestPlanDate` will re-plan today after
  an evening ritual.
- **Day-0 users have no `blend_state` row** (the service writes it at the first feedback) —
  the export shows `blend_state: null`; the cluster row exists from onboarding.
- **The perf probe's REST series needs `prefer: return=minimal`** for PATCH to avoid a body;
  `x-region` is only honoured by functions.
- Run jest from `apps/mobile`; the shell cwd persists across tool calls (bit twice this phase —
  use absolute paths after any `cd`).

## Open questions (owner)

- E-mail confirmation of erasure (above). Two-device ritual (each device fires its own
  "Plan tomorrow?") — fine for the study unless two-device use matters (revisit).
