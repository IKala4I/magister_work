# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-26, **P6 closed** (PR #7). Next: **P7 — Feedback loop.**
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence"
> (also applied to service timing and to the edge function: Node-on-a-Mac → hosted function is
> not a handset), and invariant 16 (never run expo / package-manager commands from the root).

## Where we are

- **P0–P6 merged** (PRs #1–#7). Working tree clean on `main`.
- **P6 — Plan E2E: COMPLETE.** `supabase/functions/plan-request` (Deno 2.9, deployed to the
  hosted project): in-function JWT verification (`auth.getClaims`; `verify_jwt = false`),
  user-scoped reads / service-role writes, rate limit 30 per rolling 24 h, `empty_inbox` without
  a plan row, arm A never calls the service, arm B / no assignment calls `/plan` under the 1.9 s
  budget and falls back to the SAME heuristic with `telemetry.ef.reason = fallback:<kind>` +
  a `/healthz` wake probe; persists every assignment field (M-01 `propensity` now **double
  precision**), `A_m(x)`/drops/degradation/tick/seed in `plans.telemetry`, supersedes earlier
  `shown` rows (`expired`). **Arm A = "heuristic + matched randomization"**
  (`_shared/heuristic.ts`): TypeScript mirrors of grid/φ/features/energy/ε-draw pinned to the
  service by a generated parity fixture (both suites) and a params pin; EDF for critical tasks,
  priority tiers for the rest, greedy chunking; NULL `q_hat`/`confidence`;
  `model_version = heuristic-p6.0`. **Eligibility (owner decision):** ≥ 2 reachable buckets,
  p = ε/|A_m(x)| per row, both sides; measured rate recorded (thesis-corrections #21).
  **Client:** local `plans` mirror, one-transaction `applyPlanResponse` (rows, expirations, task
  status mirror through the outbox, `recommendation_shown` per block), task-push bridge before
  each request, lazy UC-03 triggers (06:00 boundary), Today screen (row-list timeline, glass
  blocks, FR-21 sentences, experiment tag, fallback notice ONLY for fallback plans, deferred
  line, manual re-plan). Verified: 53 Deno + 265 jest + 126 pytest; live smoke 18/18 on the
  hosted project, p50 747 ms / p95 867 ms on the fallback path (`docs/verification/p6-manual-verification.md`).
  Adversarial pass: see the same file, §6.

## ⛔ ACTION REQUIRED (owner)

1. **Hugging Face Space** (unchanged from P5, now blocking the learned path live): create a Docker
   Space (free CPU), set repo secret `HF_TOKEN` + repo variable `HF_SPACE`, and Space secrets
   `DATABASE_URL` (Supabase **pooler** DSN), `SUPABASE_URL`, `HOURWELL_SERVICE_KEY`. Generate the
   key locally (`openssl rand -hex 32`) and give the SAME value to the edge function:
   `supabase secrets set HOURWELL_SERVICE_KEY=<value> RECSYS_URL=https://<user>-<space>.hf.space`
   (from the repo root; the CLI is linked to `uapiuehjcntilwdmpojk`). Then: rerun
   `node docs/verification/p6-live-smoke.mjs 10` from `apps/mobile` (expect `reason = learned`),
   record warm p50/p95 in `p6-manual-verification.md` §3, and run the P5 container timing
   measurement (device-checklist "Service environment").
2. **Google OAuth consent screen + credentials** (FR-01 Google path, code ready and inert) — as
   in the P4 handoff.
3. **Magic-link + anonymous-conversion E2E with a real mailbox** — `p4-manual-verification.md` §3.
4. **Sentry org/project slugs + auth token** — P12/EAS only.
5. **OSF freeze items** (not blocking P7): thesis-corrections #21 (MRT-slice power from the
   measured experiment rate), #8/#22 (arm A definition), #17 (presolve finding as an empirical
   result), #23–#25.

## What P7 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P7 — Feedback loop" (scope + acceptance).
- `specs/07_engine_internals_and_schema.md` §3.4.1 outcome table (rows 1–10; row 10 has NO
  reward), §3.4.2 attribution windows and the 23:55 authority, §3.5 two-phase pipeline (client
  logs facts; `sync-resolve`/`attribute-rewards` compute rewards and call `/feedback`), §5
  `POST /feedback` (already implemented and pinned by `packages/shared/src/api.ts`), Appendix A
  rows marked P7 (partial/off-slot/override rewards, correction window, EWMA duration, blend
  init/lr, attribution cron, rung-2 thresholds, slot start grace).
- `specs/02` FR-23, FR-25, FR-30–FR-32, UC-04, UC-06, UC-07; File 05 §1 (sequence for
  feedback; lapse scan on foreground).
- `docs/thesis/spec-conflicts.md` **H2** (PAR from facts only), **H3** (excluded ≠ lapse ≠
  displacement), L11 (client-writable statuses), and P6's L19 (task-push bridge — P7 may need a
  recommendation-status bridge the same way until P8).
- `docs/decisions/ADR-0007-recsys-service.md` §6 (Beta evidence), §12–§14 (feedback auth,
  idempotency, state_version) and `ADR-0008-p6-plan-e2e.md` §5 (client transaction shape,
  `recommendation_shown`, task status mirror) — P7's focus/skip/complete facts extend the same
  DAO discipline (`apps/mobile/src/db/writes.ts`, `plans.ts`).
- `apps/mobile/src/db/schema.ts` (`recommendations` statuses, `events`), `src/state/plan.ts`,
  `app/(tabs)/index.tsx` (where block actions attach), `src/ui/plan/RecommendationCard.tsx`.
- `services/recsys/src/hourwell_recsys/feedback.py` (what `/feedback` accepts; H3 paths).

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
- `docs/decisions/revisit.md` has 8 open entries (2 from P4, 2 from P5, 4 from P6) — surface them
  in the phases named (P7: λ_f retune; P8: task-push bridge removal, cursor wipe confirm).

## Open questions (owner)

- None blocking P7. OSF-freeze text items are listed under ⛔ 5.
