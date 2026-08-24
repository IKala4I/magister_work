# Changelog

Updated at each phase gate. Lines end with the requirement IDs they serve.

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
