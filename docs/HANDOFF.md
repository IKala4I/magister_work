# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-27, **P7 closed** (PR #8). Next: **P8 — Sync.**
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
- **External change recorded (2026-08-27):** Hugging Face withdrew free Docker Spaces (July 2026)
  — spec-conflicts **H4**, thesis-corrections #26–#27, **ADR-0009 (proposed — owner decision)**.
  `deploy-recsys.yml` suspended. No Space, no secrets, no host created.

## ⛔ ACTION REQUIRED (owner)

1. **RecSys host — DECISION REQUIRED (replaces the P5/P6 "create a Hugging Face Space" item).**
   Hugging Face withdrew free Docker Spaces in July 2026 (verified 2026-08-27; spec-conflicts H4,
   thesis-corrections #26–#27). Read **`docs/decisions/ADR-0009-recsys-hosting.md`** and answer its
   four questions (recommended: Oracle Cloud Always Free in an EU region, Cloud Run Tier-1 EU as the
   bounded fallback). Nothing was created (no Space, no GitHub secrets). Once decided, the next
   session rewrites `deploy-recsys.yml`, writes the runbook, and only THEN the blocked items run:
   `node docs/verification/p6-live-smoke.mjs 10` from `apps/mobile` (expect `reason = learned`),
   warm p50/p95 into `p6-manual-verification.md` §3, the P5 container timing (device-checklist
   "Service environment"), and the P7 live `/feedback` delivery check. Secrets contract is
   unchanged whatever the host: service gets `DATABASE_URL` (pooler DSN), `SUPABASE_URL`,
   `HOURWELL_SERVICE_KEY`; edge functions get `RECSYS_URL` + the same `HOURWELL_SERVICE_KEY`
   (`supabase secrets set …` from the repo root; CLI linked to `uapiuehjcntilwdmpojk`).
2. **Vault secrets for the attribution cron (P7)** — once the host exists: in the SQL editor of
   project `uapiuehjcntilwdmpojk` run
   `select vault.create_secret('https://uapiuehjcntilwdmpojk.supabase.co/functions/v1', 'hourwell_functions_url');`
   , `select vault.create_secret('<HOURWELL_SERVICE_KEY value>', 'hourwell_service_key');` and
   `select vault.create_secret('<EXPO_PUBLIC_SUPABASE_ANON_KEY value>', 'hourwell_anon_key');`
   — all three are REQUIRED: the functions gateway rejects calls without an
   `Authorization: Bearer <publishable key>` header even with `verify_jwt = false` (measured
   live 2026-08-27; migration `20260827160000_p7_sweep_bearer`). Until then `attribution_sweep_tick()` returns `skipped: …` every 15 min by design; the
   client's instant path still runs and stores tuples. Verify with
   `select public.attribution_sweep_tick();` → `posted`, then check the function logs.
3. **Google OAuth consent screen + credentials** (FR-01 Google path, code ready and inert) — as
   in the P4 handoff.
4. **Magic-link + anonymous-conversion E2E with a real mailbox** — `p4-manual-verification.md` §3.
5. **Sentry org/project slugs + auth token** — P12/EAS only.
6. **OSF freeze items** (not blocking P8): thesis-corrections #21 (MRT-slice power from the
   measured experiment rate), #8/#22 (arm A definition), #17 (presolve finding as an empirical
   result), #23–#32 (P6–P7 text changes: arm A, off-slot/partial/override values, blend SGD,
   duration estimator, hosting).

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

- **ADR-0009 (RecSys host)** — blocks the live learned path, the warm NFR-P1 p95, the container
  timing, the live `/feedback` delivery and the cron tick end-to-end. Not blocking P8's code.
- OSF-freeze text items are listed under ⛔ 6.
