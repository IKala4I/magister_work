# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-26, **P5 closed** (PR #6). Next: **P6 — Plan E2E.**
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence"
> (now also applied to **service timing**: Mac numbers ≠ 2 vCPU container — see
> `docs/verification/device-checklist.md` "Service environment"), and the new invariant 16
> (never run expo / package-manager commands from the repo root).

## Where we are

- **P0–P5 merged** (PRs #1–#6). Working tree clean on `main`.
- **P5 — RecSys service: COMPLETE.** `services/recsys` (FastAPI 0.141, Python 3.12, uv):
  `/plan`, `/feedback`, `/insights`, `/parse-preview`, `/healthz` per specs/07 §5; JWKS ES256 user
  JWT (sub = user_id) or `X-Service-Key`. Planner per File 04 §1: DST-safe grid, F_τ verbatim
  (L2), φ |C| = 14, x d = 17, Beta cells (28-d decay), LinUCB/TS (one draw per category per
  plan), convex blend, CP-SAT (optional intervals, pinned, chunks ≤ 4 with duration-proportional
  weights, criticality-only deferral, urgency, soft run-length/fragmentation, AddHint + 1e-4
  stability unit, 1.5 s **plan-level** budget, ladder 30-min → day-by-day with UNKNOWN
  escalation). **Exact ε-slice**: Bernoulli(ε) per plan, uniform task, uniform top-m bucket over
  the buckets an unsplit placement can reach, `propensity = ε/m = 0.25` as a pure function of
  settings, `experiment_top_m` on the row; mismatched ε/m → 422. **H3 paths**: excluded → skipped,
  lapse → r = 0 applied, displacement → unrepresentable; id-set idempotency
  (`recsys_applied_tuples`); any `correction` → full rebuild. Verified: ruff/mypy clean,
  **124 tests + 6 Postgres integration tests (CI db job)**, coverage 92 %, MABWiser oracle;
  adversarial pass 2 MAJOR + 11 MINOR all fixed (`docs/verification/p5-manual-verification.md`).
  Timing: day OPTIMAL p50 70 ms, week FEASIBLE p50 1.0 s / e2e p90 1.95 s — **on a Mac only**.

## ⛔ ACTION REQUIRED (owner)

1. **Hugging Face Space** (P5 deploy): create a Docker Space (free CPU, EU-irrelevant for HF),
   set repo secret `HF_TOKEN` + repo variable `HF_SPACE` (`<user>/<space>`), and Space secrets
   `DATABASE_URL` (Supabase **pooler** DSN — session or transaction mode; the direct host is
   IPv6-only), `SUPABASE_URL`, `HOURWELL_SERVICE_KEY` (high-entropy; the same value goes into the
   edge-function env in P6). Then `deploy-recsys.yml` pushes `services/recsys` on merge to main.
   After it is up: run the container timing measurement (device-checklist "Service environment").
2. **Google OAuth consent screen + credentials** (FR-01 Google path, code ready and inert) — as
   in the P4 handoff (Web client, redirect
   `https://uapiuehjcntilwdmpojk.supabase.co/auth/v1/callback`, paste into Supabase → Google).
3. **Magic-link + anonymous-conversion E2E with a real mailbox** — `p4-manual-verification.md` §3.
4. **Sentry org/project slugs + auth token** — P12/EAS only.
5. **Owner decision before OSF freeze (not blocking P6):** revisit.md P5 entry on experiment
   eligibility — on a plain 09–18 day only tasks ≤ 45 min have four reachable buckets, so the
   "1 slot/day" default often yields no experiment (RQ4 data rate). Options: keep the strict
   p = ε/m rule, or allow |A_m(x)| ∈ {2, 3} with exact per-row p = ε/|A_m(x)|.

## What P6 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P6 — Plan E2E" (scope + acceptance: e2e ≤ 2.5 s p95 warm, cold-backend
  fallback, `recommendation_shown` with model version, UC-03 main + A1 + A2 on device).
- `specs/07_engine_internals_and_schema.md` §5 (request/response — now pinned by
  `packages/shared/src/api.ts`: types `ApiPaths/ApiComponents/ApiOperations`), §4.1
  `plans`/`recommendations` columns (persist **every** assignment field: `context_bucket`,
  `features`, `q_hat`, `confidence`, `rationale_key/params`, `is_experiment`, `propensity`
  (M-01), `model_version`; put `experiment_top_m`, `experiment_dropped`, `degradation`,
  `tick_minutes`, `rng_seed` into `plans.telemetry` — P11 replay needs them), Appendix A rows
  "/plan EF fallback budget 1.9 s", "plan triggers 06:00 local + first open".
- `specs/02` FR-20/21/22 (+ §3.1 confidence = solidity, "experiment" label), UC-03; NFR-R2.
- `docs/thesis/spec-conflicts.md` **H1 conditions** (arm A = "heuristic + matched
  randomization": the EF's heuristic must run the SAME ε-draw — uniform eligible task, uniform
  top-m bucket by the heuristic's ranking, same ε and m, same badge, propensity logged
  identically; mirror `services/recsys/src/hourwell_recsys/exploration.py` in TS), **M8** (the
  week plan can take ~1.5–2 s in the service — calibrate the 1.9 s fallback budget against it),
  L16 (EF passes `settings.epsilon/top_m` equal to `packages/shared/src/params.ts`).
- `docs/decisions/ADR-0007-recsys-service.md` §5 (eligibility), §11 (timing), §12 (auth: the EF
  calls with `X-Service-Key` and explicit `user_id`; JWT path exists too), §15 (l)–(m).
- `apps/mobile/src/domain/workingHours.ts` (the `working_hours`/`sleep_window` shapes the EF
  forwards unchanged) and `src/db/schema.ts` `recommendations` mirror.

## New in P5 that later phases build on

- **Contract:** `packages/shared/scripts/gen-api-types.sh` regenerates `api.ts` from the FastAPI
  OpenAPI document; CI job `api-contract` diffs it — **regenerate after ANY schema change** (the
  first CI run caught exactly that drift). `Telemetry` has `build_ms`, `total_ms`, `solves`,
  `degradation`, `rng_seed`, `experiment_drawn/dropped`.
- **Service auth:** both credentials on every endpoint; `/insights` with a service key needs
  `?user_id=`; `/feedback` returns **409** for users whose cells were never instantiated.
- **Reproducibility:** `settings.seed` makes a plan deterministic (TS draws in category order);
  the response echoes `rng_seed`.
- **Local dev:** `uv run python -m hourwell_recsys.main` runs with in-memory state (no DB);
  `scripts/bench_solve.py` is the timing smoke check (label its numbers as Mac numbers).
- **DB:** `recsys_applied_tuples` (service-only, RLS on, no policies, no FK to recommendations);
  `beta_cells` are UPDATEd only (trigger owns instantiation); `bandit_state` upserted lazily.

## Gotchas (carry forward; earlier lists still apply)

- **Never run expo / pnpm add / npx installers from the root** (CLAUDE.md invariant 16); shell
  `cd` persists between tool calls — use absolute paths.
- CI lints the whole recsys tree (`ruff check .`) — lint `scripts/` too; mypy covers `src tests`.
- CP-SAT: hints do not keep ties (M7); presolve probing dominates the cap at ~10⁴ literals (M8) —
  keep `cp_model_probing_level = 0`; the ladder is time-budgeted per plan.
- The experiment task is solved unsplit; its top-m is over full-duration buckets only (M1).
- `Blend` convexity tolerance is 1e-6 (float32 columns); River step lands P7.
- Prettier reformats md tables (`pnpm format` before committing docs); `api.ts`, `database.ts`,
  `drizzle/`, `specs/` are ignored.
- `docs/decisions/revisit.md` has 5 open entries (2 from P4, 3 from P5 incl. the λ_f and the
  eligibility data-rate question) — surface them in the phases named.

## Open questions (owner)

- The eligibility/data-rate question above (⛔ item 5) — decide before the OSF freeze; nothing in
  P6 depends on it.
