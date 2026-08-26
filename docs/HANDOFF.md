# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-26, **P4 closed** (PR #5). Next: **P5 — RecSys service.**
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", and (new since P4)
> **"Simulator evidence"** — simulator runs are smoke checks; device-conditioned requirements
> flip ✅ only at the owner-run hardware pass before P12 (`docs/verification/device-checklist.md`
> is the running list — add entries DURING each phase).

## Where we are

- **P0–P4 merged** (PRs #1–#5). Working tree clean on `main`.
- **P4 — Onboarding: COMPLETE.** FR-01 (magic link + anonymous trial convertible; Google
  OAuth code-complete but ⛔-gated), FR-02 (rMEQ + hours + categories + seed tasks, <3 min,
  every answer skippable), cold-start priors instantiated **server-side by trigger** exactly
  per File 04 §3 (M5 rule per ADR-0005). Verified three ways: CI pgTAP (240-cell spec fixture
  - boundary/permission suites), **live smoke on the hosted EU project 9/9**
    (`docs/verification/p4-live-smoke.mjs`), Maestro UC-01 walk 36/36 (simulator, Release).
    Adversarial pass: 1 MAJOR (deep-link session fixation — fixed, PKCE-only) + 10 MINOR, all
    fixed; reviewer independently recomputed all 240 prior cells with 0 mismatches. Full
    record: `docs/verification/p4-manual-verification.md`.

## ⛔ ACTION REQUIRED (owner)

1. **Google OAuth consent screen + credentials** (FR-01 Google path, code is ready and inert):
   Google Cloud console → OAuth consent screen (External) → create an **OAuth client ID, type
   "Web application"**, authorized redirect URI
   `https://uapiuehjcntilwdmpojk.supabase.co/auth/v1/callback` → paste the client ID + secret
   into Supabase Dashboard → Authentication → Providers → Google (enable). Nothing else changes;
   the in-app button starts working.
2. **Magic-link + anonymous-conversion E2E needs a real mailbox** (only the mailbox hop is
   untested): steps in `docs/verification/p4-manual-verification.md` §3.
3. **Sentry org/project slugs + auth token** — still only needed at P12/EAS.
4. **HF Space creation** — will be raised mid-P5 when the service is ready to deploy (build +
   local tests need nothing).

## What P5 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P5 — RecSys service" (scope + acceptance; note UC-01 A2: empty busy set is a
  VALID input — MVP runs on self-declared hours, decision 5).
- `specs/04_algorithmic_formalization_and_cold_start.md` §1 (all of it: sets/precompute F_τ,
  ILP form, TS-in-the-weights §1.4, CP-SAT §1.5) and §2.3 (MC propensities note).
- `specs/07_engine_internals_and_schema.md` §3.2 (engine stages: Beta cells, LinUCB/TS state,
  feature vector x_τc, bucketing φ |C|=14, blend §3.2.6), §5 (exact /plan /feedback /insights
  /parse-preview /healthz schemas incl. X-Service-Key), Appendix A (every row marked P5:
  ε encoding, λ_s/λ_f, M_τ, γ_u/η, b, d_min, L/H_g, σ², α_ucb, d=17, /plan rate limit).
- `docs/thesis/spec-conflicts.md`: **M2** (propensity exact only within-slice — eligible task
  drawn uniformly; log the within-slice value), **M3** (fresh/fatigued split only on weekday
  MO/AF ⇒ |C|=14), **M4** (blend: TS sample flows through the linear term; w_B=1 recovers the
  File 04 formula = pre-registered ablation), **L2** (buffer may extend past deadline — solver
  tests assert the exact boundary), **L3** (LinUCB propensities degenerate), **H1 conditions**
  (ε-symmetric arms engineering lands P5/P6: same ε, same top-m, arm A's heuristic ranking
  defines its top-m set).
- `packages/shared/src/params.ts` (EPSILON/TOP_M and friends — service constants must match;
  api.ts is generated FROM the FastAPI spec via openapi-typescript, CI-diffed).
- `services/recsys/` skeleton from P0 (`dayparts.py` + tests, pyproject/uv; gates:
  `uv sync`, `uv run ruff check .`, `uv run mypy src tests`, `uv run pytest`).
- MABWiser is a CI test oracle ONLY (dev-dep; File 03 §2.2) — never a runtime dependency.

## New in P4 that later phases build on

- **Auth/identity:** `src/auth/` — env-gated supabase client (PKCE; **createSessionFromUrl is
  PKCE-?code=-only — NEVER re-add a token-fragment branch, that's session fixation, finding
  M1**); `currentUserId()` resolves session → lastUserId (MMKV) → local placeholder; the P3
  contracts are implemented in `accountTransition.ts` (adopt/wipe) and orchestrated in
  `session.ts` (INITIAL_SESSION/SIGNED_IN → adopt | noop | wipe+rehydrate; anonymous
  bootstrap on true first launch).
- **Profile:** server `profiles` row is pushed by the **P4-only bridge**
  (`src/sync/profilePush.ts` — drains ONLY profile_update ops by upserting current state;
  P8 MUST replace it with sync-resolve op replay and delete it). Pulls go through
  `upsertProfileFromServer` (never enqueues). Local mirror table `profiles` in drizzle.
- **Server:** `instantiate_user_priors(uuid)` + onboarding triggers + chronotype CHECKs
  (migrations `20260826090000_p4_onboarding.sql`, `20260826150000_p4_hardening.sql`) — P5's
  service READS beta_cells/bandit_state but never instantiates (trigger owns that).
- **UI:** `Screen` primitive takes `topInset` for headerless screens; `Button` primitive
  exists; onboarding gate = `useOnboardingComplete()` in `(tabs)/_layout` + symmetric
  reverse gate on `onboarding/index`.

## Gotchas (carry forward; P3 list still applies — see git history of this file if needed)

- **Local Release builds need `SENTRY_DISABLE_AUTO_UPLOAD=true`**; cold start only on Release.
- jest 29.7/TS 5.9.3/@sentry 7.11/mmkv 3.3.3 pins (ADR-0003/0004); RNTL v14 async render;
  never import `src/db/client.ts` in tests; mock factories only close over `mock*` vars.
- Schema changes: `src/db/schema.ts` → `pnpm exec drizzle-kit generate --name <slug>` →
  commit `drizzle/`.
- **New route files** ⇒ regenerate typed routes: `npx expo customize tsconfig.json` in
  apps/mobile (does not touch tsconfig if unchanged).
- **`supabase config push` overwrites REMOTE auth config from config.toml** — config.toml is
  now the source of truth (magic-link email rate deliberately 1m0s; anonymous sign-ins on).
- `supabase gen types typescript --linked > …` then `./scripts/normalize-db-types.sh` on BOTH
  sides — CI (CLI 2.115.0 pinned) diffs the normalized output.
- pgTAP/`supabase test db` run ONLY in CI (no local Docker) — SQL must be right by
  construction; the linked project accepts `supabase db push` directly.
- Maestro at accessibility type sizes needs `scrollUntilVisible` with `timeout: 90000`;
  `takeScreenshot` paths must be relative (land in `~/.maestro/tests/<run>/`).
- Anonymous test users accumulate on the hosted project (live smoke + walks) — purged by the
  P10 retention cron; harmless meanwhile.
- Quick-add default category is **Admin** (categories are form-edited, never NL-guessed).
- `docs/decisions/revisit.md` has 2 open entries (wipe-confirm on deep-link path → P8;
  promoted-priors-version → P11) — surface them in those phases.
- Prettier reformats md tables and long lines (`pnpm format` before committing docs); never
  let it touch `packages/shared/src/database.ts`, `apps/mobile/drizzle/`, `specs/`.

## Open questions (owner)

- None blocking beyond the ⛔ items above. H1 text changes land at OSF freeze (P11 stop
  condition).
