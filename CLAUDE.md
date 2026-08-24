# CLAUDE.md — Hourwell project memory

## Identity

- **Public name: Hourwell** ("The planner that learns your best hours"). Internal codename in
  `specs/`: **Kairos**. Mapping: `docs/naming.md`. Use Hourwell in app config, bundle ids
  (`com.hourwell.app`), UI strings, store metadata, service names. `specs/` is **read-only**.
- Source of truth for scope/math/schema/UX: `specs/01–06`. `PLAN.md` maps phases → requirement
  IDs. Requirement IDs (FR-xx, NFR-xx, UC-xx, M-01/M-02) appear in commits (`Refs:`),
  `docs/traceability.md`, and test names.

## Stack (pin exact versions in docs/versions.md with verification dates)

- **Mobile** `apps/mobile/`: Expo SDK 54+ (New Arch, Hermes), TypeScript strict, Expo Router,
  Expo SQLite + Drizzle (single reactive source of truth, `useLiveQuery`), op outbox in SQLite,
  MMKV (sync cursor, flags), Zustand (ephemeral UI only), Reanimated 4 + Gesture Handler,
  FlashList v2, react-native-skia, chrono-node, expo-notifications, supabase-js v2
  (session in expo-secure-store).
- **Backend** `supabase/`: Postgres 16 + RLS everywhere, Auth (magic link, Google OAuth,
  anonymous), Edge Functions (Deno/TS): `plan-request`, `attribute-rewards`, `sync-resolve`,
  `gcal-webhook`; pg_cron. EU region.
- **RecSys** `services/recsys/`: FastAPI + Pydantic v2, Python 3.12, uv; OR-Tools CP-SAT,
  NumPy-owned LinUCB/TS (MABWiser = CI test oracle only), River, decayed Beta cells. Deployed on
  HF Spaces free CPU (Docker).
- **Training** `training/`: GitHub Actions nightly; `implicit` ALS, k-means clusters, empirical-
  Bayes prior refresh, eval gate, HF Hub model registry; OPE harness (replay/IPS/SNIPS/DR + ESS).
- **Shared types** `packages/shared/`: generated `database.ts` (supabase gen types) + `api.ts`
  (openapi-typescript). CI fails if regenerated ≠ committed. Generated artifacts commit
  separately as `chore(db):` / `chore(repo):`.

## Commands (canonical once P0 lands; update here as they materialize)

- TS: `npm run typecheck` (`tsc --noEmit`) · `npm run lint` (ESLint 9 flat) · `npm run format:check`
  (Prettier) · `npm run test` (Jest 30) · `npx expo-doctor` in `apps/mobile`.
- Python (per package, via uv): `uv run ruff check .` · `uv run mypy .` · `uv run pytest`.
- All gates must be green **before every commit**, not just at phase end.

## Invariants (violating any of these is a bug, not a style choice)

1. **The client never computes rewards or touches model state.** It is a fact logger and renderer.
2. **Facts beat plans.** A logged completion outranks any displacement/plan-side state.
3. **Ambiguous rewards are flagged and EXCLUDED from bandit updates — never guessed.**
4. **External calendar displacement emits NO reward.**
5. **Priors never overwrite evidence.** Cluster switches refresh unvisited cells only.
6. **Corrections trigger a full state rebuild from stored reward tuples — never a rank-one
   downdate.**
7. **Lapse detection is lazy** (foreground scan + 23:55 attribution authority). No correctness
   may depend on background execution.
8. `events` are append-only. Op outbox: client-monotonic `op_id`, idempotent replay,
   `base_version` checks. Sync is push-then-pull; cursor lives in MMKV.
9. **Exploration propensity is exact** on the randomized slice (p = ε/m), logged on the
   recommendation row (M-01); experiment blocks are labeled in the UI (FR-22).
10. **RLS on every table; no service-role key ever in the client bundle or OTA update** (NFR-S1).
11. **Free tier only.** Any cost-incurring choice needs explicit approval first.
12. **Cross-user training sees only pseudonymized categorical features — never raw task text**
    (NFR-S3).
13. Rejected-with-reasons libraries stay out: **WatermelonDB, TanStack Query** (File 03 §2.1).
14. UI semantics: **confidence = solidity**; skip is never red; no guilt UI; destructive actions
    undoable 6 s; reduced motion + 200% font scale must not break layout.
15. `.env` is read-only context: never print, log, or commit its contents.

## Conventions

- **Commits:** Conventional Commits with `Refs:` (requirement IDs) + `Phase:` trailers;
  `Broke-in:` on fixes when known. Types: feat|fix|refactor|perf|test|docs|chore|build|ci|revert.
  Scopes: mobile, ui, db, edge, recsys, solver, bandit, priors, sync, calendar, notifications,
  training, ope, ci, docs, repo. One logical change per commit; every commit green
  (bisect-friendly); migrations and generated types get their own commits. `Refs:` may be omitted
  only on chore/ci/docs.
- **Branches:** `phase/Pn-<name>`; PR title `Pn — <phase name>`; PR body lists requirement IDs +
  pasted gate output. CHANGELOG.md updated at each phase gate.
- **Definition of Done** (per feature): spec re-read → requirement checklist table (ID → file:line
  → test → PASS) → tests (≥70% domain coverage, NFR-M1; dedicated math tests) → adversarial pass
  (offline/DST/cold-backend/dup-op/RLS-bypass/200%-font/reduced-motion…) → gates green with pasted
  output → traceability rows → manual verification script.
- **Ambiguity:** spec silent/contradictory on an architecture-level decision → STOP, ask (batched,
  ≤5 questions, each with a recommended default), then record `docs/decisions/` ADR.
- **Human actions** (logins, dashboards, OAuth screens, paid anything): stop and print the
  ⛔ ACTION REQUIRED block; never fake or work around credentials.
- **APIs:** never invent. Verify against real docs (ctx7 CLI per user rules) and pin in
  `docs/versions.md` with the verification date.
