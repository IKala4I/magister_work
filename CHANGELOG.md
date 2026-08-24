# Changelog

Updated at each phase gate. Lines end with the requirement IDs they serve.

## P1 — Data layer (2026-08-24, phase/P1-data-layer)

### Added

- Base Postgres schema (16 tables) with RLS on every table, grants trimmed to the specs/07
  §4.4 catalog, append-only events, sync cursor sequence, version/updated_at triggers, and a
  client status-whitelist guard on recommendations — applied to the linked EU (Ireland)
  project. — NFR-S1, NFR-S2, NFR-R1, FR-42
- Migrations M-01 (`recommendations.propensity`) and M-02 (displaced statuses +
  `conflict_flag`), layered on the base as the specs require. — M-01, M-02
- `prior_cells` v0 seeded computationally from the File 04 §3.2–3.3 tables (logit-affine
  transform, AF bonus, weekend blend); remote spot-checks match hand-computed values. — FR-02
- Generated `Database` types committed to `packages/shared`; CI regenerates from a local
  stack and fails on drift (contract sync). — File 03 §6
- pgTAP suite: RLS bypass denial, append-only enforcement, duplicate op_id rejection,
  status-guard, M-01/M-02 shape, prior seed values; new CI `db` job. — NFR-S1, NFR-R1, NFR-M1
- MIT LICENSE; privacy evidence file (Supabase eu-west-1 verified; PostHog EU requirement
  pinned before any SDK wiring). — NFR-S2
- Appendix A parameter constants in all three services with spec-value tests. — NFR-M1
- Spec-integrity audit (spec-conflicts.md), thesis-corrections worklist, Ukrainian explainer
  (pojasnennia.uk.md). — process

### Fixed

- TypeScript 6.0 → 5.9.3: openapi-typescript peers `^5.x`; restores File 03's stated TS 5.x
  line (ADR-0004). — NFR-M1

### Changed

- Study arm A redefined as **"heuristic + matched randomization"** (owner-approved H1 fix):
  the ε-randomized slot runs in both arms with identical rendering, preserving the blind and
  giving baseline traffic exact propensities. — FR-22, File 06 §1.1

## P0 — Bootstrap (2026-08-24, phase/P0-bootstrap)

### Added

- pnpm + Node 24 LTS monorepo: `apps/mobile` (Expo SDK 57, RN 0.86 New Arch, TS 6 strict),
  `packages/shared` (reserved for generated types), `services/recsys` + `training`
  (Python 3.12, uv, ruff, mypy, pytest). — NFR-M1
- Expo app shell carrying the Hourwell identity (`com.hourwell.app`). — naming decision
- CI pipeline running typecheck, lint, format, tests, expo-doctor, ruff, mypy, pytest on
  every PR. — NFR-M1
- Seed domain modules with math tests: tick grid (specs/04 §1.2), daypart table (specs/04
  §3.2), ESS with the <100 non-evidence floor (specs/04 §2.3).
- Project docs: PLAN, CLAUDE.md invariants, naming map, pinned versions, traceability
  skeleton, ADRs 0001–0003.
- `specs/07_engine_internals_and_schema.md` — reconstruction of the superseded v1.0 content
  (base schema, engine stages, reward shaping, feedback, cold-start rungs, API schemas,
  security specifics); awaiting owner approval before P1.

### Fixed

- (none — first phase)

### Changed

- (none — first phase)
