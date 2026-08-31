# Hourwell

**The planner that learns your best hours.** Hourwell is a mobile daily planner that treats
scheduling as a constrained recommendation problem: it ranks (task, time-slot) assignments by
_learned personal completion probability_, solves the day under hard calendar constraints,
explains every placement in one sentence, and learns from every outcome — a skip is a data
point, not a failure.

This repository is also the engineering artifact of a Master's thesis: an 8-week
within-subject field study (ABAB/BABA) of a contextual-bandit day planner, with exact logged
propensities on a randomized slice and an off-policy-evaluation harness (replay, IPS/clipped,
SNIPS, DR with ESS gating). The specification set in `specs/` uses the internal codename
**Kairos**; the public product name is **Hourwell** (`docs/naming.md`).

## Architecture (four tiers, one loop)

| Tier           | Stack                                                                                                                                                                      | Where                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Mobile client  | Expo SDK 57 (New Architecture, TypeScript strict), Expo Router, SQLite + Drizzle as the reactive source of truth, op-outbox offline-first sync, Reanimated, FlashList      | `apps/mobile/`                                         |
| Backend        | Supabase: Postgres 17 + RLS on every table, Auth (magic link / Google / anonymous), Edge Functions (Deno), pg_cron                                                         | `supabase/` (EU, eu-west-1)                            |
| RecSys service | FastAPI + Pydantic v2 (Python 3.12), OR-Tools CP-SAT solver, NumPy-owned LinUCB/TS bandit, decayed Beta energy cells                                                       | `services/recsys/` (self-hosted EU VM, eu-marseille-1) |
| Training + OPE | Nightly in-region container: ALS (`implicit`) + k-means clusters, empirical-Bayes prior refresh behind an eval gate, MC propensity backfill, OPE harness, aggregate report | `training/`                                            |

Shared generated types (`database.ts`, `api.ts`) live in `packages/shared/` and are CI-diffed
against the schema and the OpenAPI document.

The client is a **fact logger and renderer** — it never computes rewards and never touches
model state. Facts beat plans; ambiguous rewards are excluded, never guessed; corrections
rebuild model state from stored reward tuples. The full invariant list is in `CLAUDE.md`.

## Getting started

Prerequisites: Node 24 (`.nvmrc`), pnpm 10, Python 3.12 via [uv](https://docs.astral.sh/uv/),
Supabase CLI, Deno 2.

```sh
pnpm install                     # repo root
pnpm typecheck && pnpm lint && pnpm test

cd services/recsys && uv sync    # same for training/
uv run ruff check . && uv run mypy src tests && uv run pytest

cd apps/mobile && npx expo start # local development (Expo dev client)
```

`supabase start` brings up the local stack; migrations live in `supabase/migrations/`,
pgTAP tests in `supabase/tests/`. Copy `.env.example` to `.env` for the local keys — the
`.env` file is never committed.

## Repository map

| Path                   | What                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `specs/01–07`          | Frozen specification set (read-only; errata in `docs/thesis/spec-conflicts.md`) |
| `PLAN.md`              | Phase plan P0–P12 with requirement mapping and the status board                 |
| `docs/decisions/`      | ADRs 0001–0017 (+ `revisit.md`, the non-blocking findings ledger)               |
| `docs/privacy/`        | DPIA, processor table, consent clauses, privacy policy draft                    |
| `docs/runbooks/`       | Oracle VM operations, Google Calendar integration                               |
| `docs/verification/`   | Per-phase manual-verification protocols, live smokes, the device checklist      |
| `docs/store/`          | Store metadata, name search, distribution notes                                 |
| `docs/traceability.md` | Requirement → module → test → status                                            |
| `CHANGELOG.md`         | Per-phase changelog (v0.1.0 rollup at the top)                                  |

## Privacy

GDPR-by-design for a research app: all participant data is stored and processed in EU
regions; cross-user training sees only pseudonymized categorical features (never task text);
export and erasure are first-class in-app flows (proven by pgTAP + live smoke); the nightly
training pipeline runs on the EU VM, CI sees synthetic data only. The full assessment is
`docs/privacy/dpia.md`.

## Status

P0–P11 built and merged (bootstrap → data layer → app shell → tasks → onboarding → RecSys
service → plan E2E → feedback loop → sync + Google Calendar → trust surfaces →
notifications/privacy → training + OPE + study mode). P12 (release prep) in progress.
Device-conditioned requirements await the owner-run hardware pass
(`docs/verification/device-checklist.md`).
