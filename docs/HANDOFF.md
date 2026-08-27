# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-27, **P7 closed** (PR #8) + **P7.1 RecSys hosting on the Oracle VM**
> (branch `phase/P7-hosting`; ADR-0009 accepted). Next: finish the P7.1 owner steps + the three
> blocked measurements, then **P8 — Sync.**
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence"
> (also applied to service timing and to the edge functions: Node-on-a-Mac → hosted function is
> not a handset), and invariant 16 (never run expo / package-manager commands from the root).

## Where we are

- **P0–P7 merged** (PRs #1–#8). Working tree clean on `main`.
- **P7 — Feedback loop: COMPLETE, minus anything that needs a live RecSys service.** Server:
  migration `20260827150000_p7_feedback` (pg_net, `duration_estimates`,
  `feedback_rewards.delivered_at/source`, `attribution_due(p_now)` — the 23:55-local boundary in
  SQL, pgTAP-tested across DST —, `attribution_sweep_tick()` on pg_cron every 15 min, Vault-held
  URL/key, no-op until set). Edge function **`attribute-rewards`**: pure facts→tuples mapping
  (`_shared/rewards.ts`, rows 1–9, M-02 exclusion, 7-day corrections), **instant** mode (user JWT
  after the client pushes facts; backend key + `user_id` for P8's sync-resolve) and **daily** mode
  (rows 4–5 over `attribution_due` + re-delivery of undelivered tuples); override target context
  from the shared grid/φ/features; UC-06 A2 duration estimator applied by `plan-request` to both
  engines (n ≥ 3). Service: blend weights learn by projected SGD (River = CI oracle), rebuild
  replays them, `blend_state` persisted; rung-2 helpers. Client: Focus tab (FR-30/31), block
  actions (Start/Done/Skip/Move…/"I did it"), lazy lapse scan on foreground, third-skip diagnostic,
  facts bridge (`src/sync/factsPush.ts`), local migration `0003_p7_feedback`. Verified: 290 jest +
  98 Deno + 135 pytest (92 %) + 32 pgTAP (CI) — `docs/verification/p7-manual-verification.md`.
  Decisions: **ADR-0010**. Adversarial pass: same file §4 — 7 MAJOR (late facts after the daily
  job, partial freezing the block, move+session batches, bucket-less moves, second moves, the
  daily/instant race, re-plan expiring an in-progress block) + 14 MINOR, all MAJORs fixed.
- **Hosting decided (2026-08-27): ADR-0009 option A.** Hugging Face withdrew free Docker Spaces
  (spec-conflicts H4); the owner provisioned `recsys-oracle` (Oracle Always Free A1, 2 OCPU /
  12 GB, Ubuntu 24.04 arm64, `eu-marseille-1`, public IP 84.235.238.25). **P7.1 built:**
  arm64-ready Dockerfile + `/healthz` build/arch; `services/recsys/deploy/` (compose with the
  service pinned to `cpus: 2`, Caddyfile, `.env.example`, `hourwell-rollout` + systemd timers,
  `harden.sh` / `install.sh` / `verify.sh`); `deploy-recsys.yml` = build on `ubuntu-24.04-arm` →
  verify a CP-SAT solve inside the image → push GHCR → confirm the VM's pull-based rollout (no
  SSH from CI, no GitHub secrets); `docs/runbooks/oracle-vm.md`; privacy README rewritten
  (processors table, self-hosted VM section, DPIA gaps G1–G4). **Not yet done:** the remote
  steps (this session had no DNS/directory services — see ⛔ 1–3) and the three measurements.

## ⛔ ACTION REQUIRED (owner) — P7.1 hosting, in this order

1. **DuckDNS hostname** — runbook §2: sign in at duckdns.org, add `hourwell-recsys`, point it at
   `84.235.238.25`. If the name is taken, pick another and use it in every step below.
2. **Security List** — runbook §3.1: ingress rule for port 22 → source `<YOUR_IP>/32` only
   (`curl -s https://api.ipify.org` on the Mac); 80/443 stay `0.0.0.0/0`.
3. **Box: harden → .env → install → verify** (needs a shell with DNS; from the repo root):
   ```
   scp -r services/recsys/deploy oracle-recsys:~/hourwell/deploy
   ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh apply <YOUR_IP>'
   ssh oracle-recsys true && ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh persist'   # NEW terminal first
   ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'      # creates ~/hourwell/.env, exits 3
   ssh oracle-recsys 'nano ~/hourwell/.env'                   # RECSYS_HOST, DATABASE_URL (pooler 6543), HOURWELL_SERVICE_KEY
   ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'      # timers + first pull/up
   ssh oracle-recsys 'bash ~/hourwell/deploy/verify.sh <YOUR_IP>'
   ```
   The backend key is in `~/.hourwell/HOURWELL_SERVICE_KEY` (one 64-hex line; same
   value everywhere). A restarted session runs the scp/ssh lines itself (see gotcha below); the
   `.env` values are yours to fill (the DB password never goes through chat).
4. **GitHub** — merge PR "P7.1"; after the first `RecSys image → GHCR` run: Packages →
   `hourwell-recsys` → visibility **Public**; Settings → Variables → `RECSYS_HOST` =
   `hourwell-recsys.duckdns.org` (no secrets needed).
5. **Supabase function secrets** (repo root, `supabase login` once):
   `supabase secrets set HOURWELL_SERVICE_KEY=<key> RECSYS_URL=https://hourwell-recsys.duckdns.org`
   — set `RECSYS_URL` only after `curl https://hourwell-recsys.duckdns.org/healthz` answers.
6. **Vault** — run `~/.hourwell/vault-secrets.sql` in the SQL editor (all three secrets
   filled in; expect `attribution_sweep_tick()` → `posted`).
7. **Oracle: Pay As You Go upgrade — recommended for support access only** (privacy G1: the
   sub-processor list is My-Oracle-Support-only; Always Free stays free; the 1 EUR alert guards).
   It does NOT replace the keep-busy timer — Oracle's docs state no reclamation exemption for
   PAYG (ADR-0009 Q2 corrected); leave `hourwell-keepbusy.timer` enabled.
8. **DPIA decisions before P11** (privacy README G2/G3, thesis-corrections #34): where analysis
   and training run (in-region on the VM vs anonymised exports vs Art. 46/49 grounds).
9. **Then the measurements** (next session; runbook §7): live learned-path smoke, warm NFR-P1
   p95, `bench_solve.py` inside the pinned container, live `/feedback` delivery.
10. **Google OAuth consent screen + credentials** (FR-01 Google path, code ready and inert) — as
    in the P4 handoff.
11. **Magic-link + anonymous-conversion E2E with a real mailbox** — `p4-manual-verification.md` §3.
12. **Sentry org/project slugs + auth token** — P12/EAS only.
13. **OSF freeze items** (not blocking P8): thesis-corrections #21 (MRT-slice power from the
    measured experiment rate), #8/#22 (arm A definition), #17 (presolve finding as an empirical
    result), #23–#34 (P6–P7 text changes: arm A, off-slot/partial/override values, blend SGD,
    duration estimator, hosting, processors, transfer analysis).

## Resume point for the next session (P7.1 → measurements → P8)

1. `git status` clean on `phase/P7-hosting` (8 commits ahead of `main`, unpushed) → `git push -u
origin phase/P7-hosting`, open PR "P7.1 — RecSys hosting (Oracle)", CI green (the `RecSys image →
GHCR` workflow runs after the merge; its rollout job is skipped until `vars.RECSYS_HOST` exists).
2. Owner ⛔ 1–2 done? → run ⛔ 3 (scp/ssh; `verify.sh` must print ALL OK) — with the owner's IP.
3. Owner ⛔ 4–6 done? → `curl https://hourwell-recsys.duckdns.org/healthz` shows `storage:
postgres`, `arch: aarch64`, `build: <main sha>`; then the runbook §7 measurements → record in
   `p6-manual-verification.md` §3 (learned path + warm p95), `p5-manual-verification.md` §2
   (container bench next to the Mac numbers; a different presolve threshold = empirical result,
   ADR-0007 §11 treatment), device-checklist "Service environment" flips, `feedback_rewards`
   delivery check, `attribution_sweep_tick()` → `posted`. Then P8.

## What P8 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P8 — Sync" (scope + acceptance) and decision row 5 (GCal in P8).
- `specs/05_sequence_diagrams.md` §2 (push-then-pull, three conflict classes, `sync-resolve`
  domain rule "facts beat plans", `displaced_pending` → `completed` + `conflict_flag`, the 409
  field-level merge) and File 03 §1.2 / File 05 §1 for the outbox contract.
- `specs/07_engine_internals_and_schema.md` §4.1 `events`/`recommendations`/`calendar_events`/
  `gcal_sync_state`, §4.3 M-02, §5 (sync endpoints if listed), §7 (webhook secrets).
- `docs/thesis/spec-conflicts.md` **L11** (client-writable statuses), **L19** (task-push bridge —
  P8 deletes it), **L24** (skip = `rejected` + event), **L26** (`lapse_observed` ≠ skip); H3.
- `docs/decisions/ADR-0010-p7-feedback-loop.md` §2 (facts vocabulary), §3 (instant mode is
  callable with the backend key + `user_id` — `sync-resolve` calls `processUser(deps, userId,
'instant', null)` from `supabase/functions/attribute-rewards/handler.ts` after replaying ops),
  §8 (delivery marker), §12 (which local statuses are fact-derived and never pushed as status ops;
  `accepted` IS pushed as a `recommendation_status` op).
- `docs/decisions/revisit.md` — P8 lines: task-push bridge removal, facts-bridge removal
  (`src/sync/factsPush.ts`, `src/sync/taskPush.ts`), cursor-wipe confirm, transactional persist
  RPC for plans (ADR-0008 §4 → one `security definer` RPC).
- `apps/mobile/src/db/writes.ts` (`OP_TYPES`, `enqueueOp`, `appendEvent`; op payloads are
  server-shaped), `src/db/schema.ts` (`opOutbox`, local-only tables `focus_sessions` and
  `tasks.skip_streak` — never in payloads), `src/sync/cursor.ts` (MMKV cursor),
  `src/sync/planTypes.ts` (to be replaced by generated sync types).
- `supabase/functions/plan-request/context.ts` (reads that a pull must keep consistent),
  `supabase/functions/_shared/types.ts`.

## New in P7 that later phases build on

- **`supabase/functions/attribute-rewards/`** — `handler.ts` exports `processUser` (P8 calls it
  from sync-resolve), `db.ts` (`makeDbDeps(admin)` — reuse the adapters), `feedback.ts`
  (`postFeedback`), `override.ts` (`targetContext`). `_shared/rewards.ts` is the mapping and the
  payload contract (documented at the top). Add new fact types there AND in
  `apps/mobile/src/db/writes.ts` `CLIENT_EVENT_TYPES`.
- **Migration helpers:** `public.attribution_due(p_now, p_limit)` (service-only),
  `public.attribution_sweep_tick()`; the cron job name is `attribute-rewards-sweep`.
- **Client:** `src/db/feedback.ts` (all fact writes; `applyServerRecommendations` for mirrored
  server rows), `src/domain/blockActions.ts` (UI layer → DAO + analytics + facts push),
  `src/sync/factsPush.ts` + `src/sync/useLapseScan.ts` (both replaced/absorbed by P8's sync
  engine — the lapse scan itself stays), `src/ui/plan/{BlockActions,MovePicker,SkipDiagnosticCard}.tsx`.
- **Params:** `PAR_GRACE_MINUTES`, `PAR_MIN_FRACTION`, `REWARD_*`, `CORRECTION_WINDOW_DAYS`,
  `DURATION_*` exist on both TS sides and are pinned by `params_test.ts`; `params.py` has
  `DURATION_EWMA_ALPHA`, `RUNG2_*`.

## New in P6 that later phases build on

- **Edge-function toolchain:** `supabase/functions/deno.json` (imports, tasks), `deno.lock`;
  root ESLint/Prettier ignore `supabase/functions/**` — `deno fmt` / `deno lint` own it (CI job
  `edge`). Deploy: `supabase functions deploy <name>` from the repo root (API bundling, no
  Docker). Secrets: `supabase secrets set KEY=value`. Config per function in `config.toml`
  (`import_map = "./functions/deno.json"`).
- **Shared Deno modules** (`_shared/`): `grid.ts`, `contexts.ts`, `features.ts`, `energy.ts`,
  `exploration.ts`, `heuristic.ts`, `rng.ts`, `params.ts`, `types.ts` — P7's `attribute-rewards`
  and P8's `sync-resolve` reuse `types.ts`/`params.ts`; **regenerate the parity fixture**
  (`cd services/recsys && uv run python scripts/gen_grid_parity.py`) after ANY change to
  grid/φ/eligibility on either side, and add new Appendix A constants to `params.ts` +
  `params_test.ts`.
- **Client plan flow:** `src/sync/planRequest.ts` (`requestPlan`, single-flight),
  `src/sync/usePlanTrigger.ts`, `src/db/plans.ts` (`applyPlanResponse`, `latestPlanQuery`,
  `planRecommendationsQuery`, `unplacedOf`, `isFallbackPlan`), `src/sync/taskPush.ts` (bridge —
  P8 deletes it), `src/sync/planTypes.ts` (hand-written EF wire types — P8's generated sync
  types replace it). `CLIENT_EVENT_TYPES` now includes `recommendation_shown`.
- **DB:** `plans_user_generated_idx`; `plans.telemetry` key contract in the migration comment;
  `recommendations.propensity double precision`.
- **Measurement scripts:** `services/recsys/scripts/experiment_rate.py` (eligibility rate),
  `docs/verification/p6-live-smoke.mjs` (E2E + timings; plans TOMORROW so late-day runs still
  place blocks).

## Gotchas (carry forward; earlier lists still apply)

- The shell `cd` persists between tool calls — use absolute paths; never run expo / pnpm add /
  npx installers from the root.
- **Prettier reformats `.mjs` and `.md`** — apply text patches AFTER `pnpm format`, or edits
  silently miss (bit P6 twice).
- `supabase db push` needs `--yes` non-interactively; the base schema already has
  `plans_user_date_idx` and `recommendations_*` indexes — check before adding.
- PostgREST bulk inserts null-fill missing keys across rows — send every column.
- `recommendations_status_guard` fires only when `status` changes (`WHEN new IS DISTINCT FROM
old`): setting the same status is a silent no-op, not an error.
- The smoke plans TOMORROW: a plan for today late in the evening legitimately places nothing.
- Before 06:00 the app never auto-requests (yesterday's plan stays); manual requests always plan
  the current calendar day (`requestPlanDayOf`), the display uses `planDayOf` as a fallback.
- The EF's rate-limit count and supersede snapshot are read-then-act: only the client's
  single-flight guard keeps concurrent requests apart (ADR-0008 §4; RPC persist is a P8 item).
- The arm-A feature snapshot is evaluated at the bucket's representative tick k\* (as the
  service does) — never "at the placed tick"; the parity fixture pins it, regenerate on change.
- No Docker on the dev Mac: pgTAP and the PostgresRepo tests run in CI's db job only.
- Deno tests need `--allow-read --allow-env --allow-net` (`deno task test` adds read/env; the
  service tests bind a local port → `--allow-net`).
- **`deno lint` prints its errors BEFORE the final "Checked N files" line** — never judge it by
  `tail -1` (P6 shipped unused imports to CI that way). Read the full output, or grep `error\[`.
- Text patches must be applied AFTER formatting (Prettier for md/mjs/ts, `deno fmt` for the Deno
  tree) — a patch whose anchor no longer matches silently does nothing; verify with grep.
- **RNTL 14 / universal renderer:** `render` and post-press re-renders are async — assert after
  `await act(async () => { fireEvent.press(…) })` (Inbox pattern). `findBy*`/`waitFor` HUNG the
  suite in P7 (jest never returned; had to be killed). jest-expo 57.0.5 also enforces that a
  `jest.mock` factory may only reference `mock`-prefixed variables — and the factory runs when
  the module is first required, so return lazy wrappers (`(...a) => mockX.fn(...a)`), never the
  object itself.
- The Expo SDK line drifts in patch versions between phases (`expo-doctor` fails the version
  check): run `npx expo install --fix` **from apps/mobile**, then check the "overridden
  dependencies" check — a transitive `@expo/metro-runtime` had to be pinned directly.
- **Session process context can lose the Mach bootstrap** (2026-08-27, after a `/login` in the
  running session): `launchctl managername` → "Could not get manager name", `getpwuid(501)`
  fails, `scutil --dns` empty, keychain unreachable, system resolver dead — while `dig` (reads
  `/etc/resolv.conf` itself) and `ping 1.1.1.1` work. So the Mac is fine; the session is not.
  `ssh`, `git push`/`gh`, `supabase`, `curl` are all unusable from it; jest/deno/pytest/uv (with
  `--no-sync`) work. It does NOT come back on its own — **restart the CLI session from a
  terminal** and resume ("Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue"). A
  restarted session can run ⛔ 3–4 itself (scp/ssh/push/PR); ⛔ 1, 2, 5–8 stay owner steps.
- **Remote deploy is pull-based**: CI never touches the box; if `/healthz.build` lags `main`,
  look at `journalctl -u hourwell-rollout` on the VM (image pull denied = package not public).
- **Cron health:** pg_net never surfaces HTTP failures — check
  `select id, status_code, left(content, 120), created from net._http_response order by created desc limit 5;`
  in the SQL editor when the sweep seems silent; a 401 there means the Vault secrets are wrong.
- `attribution_sweep_tick()` reads Vault inside an exception block — if it ever returns
  `skipped: vault unavailable` on the hosted project, the `supabase_vault` extension or the
  function owner's privileges changed.
- The `feedback_rewards` unique key is `(recommendation_id, kind)` — a second `block_moved` for
  the same row is intentionally NOT a second pair (ADR-0010 §6); do not "fix" that in P8.
- `docs/decisions/revisit.md` has 13 open entries (2 from P4, 2 from P5, 4 from P6) — surface them
  in the phases named (P8: task-push + facts bridge removal, cursor wipe confirm, transactional persist RPC; P9: second-move semantics, drag; P11: λ_f retune with real q̂ scales, duration-scaling report; P12: key rotation).

## Open questions (owner)

- **P7.1 owner steps ⛔ 1–7** gate the live learned path, the warm NFR-P1 p95, the container
  timing, the live `/feedback` delivery and the cron tick end-to-end. Not blocking P8's code.
- **DPIA G2/G3** (transfers to Ukraine / US runners) — decision before P11.
- OSF-freeze text items are listed under ⛔ 13.
