# Changelog

Updated at each phase gate. Lines end with the requirement IDs they serve.

## P2 — Mobile shell (2026-08-24, phase/P2-mobile-shell)

### Added

- Expo Router tab shell (Today · Inbox · Focus · Insights + Settings modal) on the
  expo-router/entry entry point; typed routes; scheme `hourwell`; smoke tests include a real
  router mount. — File 02 §3.5, NFR-A1
- File 02 §3 design tokens, byte-exact: light/dark palette (WCAG AA proven by test for the
  text/surface/glass/primary-container pairings, incl. the composited confidence floor), Inter + JetBrains Mono type scale, 16–20 px radii, ≤250 ms springs with
  reduced-motion collapse, 8–12 px glass band. — NFR-A1, NFR-A2
- Confidence-as-solidity primitives: ConfidenceBlock (panel-background solidity ∝
  confidence, dashed "Experiment" treatment, composed screen-reader label), GlassPanel (iOS
  blur, opaque Android/Reduce-Transparency fallback, recommendation-layer only). — FR-22
  groundwork, NFR-A1
- Local Drizzle/SQLite schema mirroring specs/07 §4 for tasks, recommendations (incl. M-01
  propensity + M-02 conflict_flag/displacement statuses), append-only events; op outbox with
  unique client-monotonic op ids and base_version; startup migrations with a visible failure
  state. — NFR-R1, M-01, M-02, invariants 1/8
- MMKV scaffold: never-rewind pull cursor (max server_seq seen), install-scoped device id,
  monotonic op counter, appearance flag. — NFR-R1
- i18n scaffolding: typed English catalog + expo-localization resolution + ESLint ban on raw
  JSX text in components (decision 6). — NFR-A1
- Sentry crash reporting, env-gated (disabled without EXPO_PUBLIC_SENTRY_DSN — tested),
  sendDefaultPii off, tracing off; EU org creation is the open ACTION-REQUIRED item. —
  NFR-O1, NFR-S2
- Startup instrumentation (js-start → first-frame) + on-device cold-start measurement
  protocol. — NFR-P2

### Fixed

- (fresh-context adversarial pass) Confidence-as-solidity faded block copy below WCAG AA at
  the exploration floor — solidity now scales only the panel chrome; composited-floor
  contrast test added; iOS Reduce Transparency honored; a11y label composes block content. —
  NFR-A1, FR-22
- Splash screen could never hide on a font-load failure; the shell now opens on the system
  fallback stack and the whole splash/migration flow is under test. — NFR-P2, File 02 §3.3
- i18n lint guard missed string/template-literal JSX children (probe-verified fixed);
  standing UI review checklist added for what linting cannot see. — decision 6

### Changed

- @sentry/react-native pinned to the SDK-57-validated 7.11.0 line (expo-doctor rejects 8.x);
  react-native-mmkv held at 3.3.3 (4.x needs the Nitro runtime). — NFR-M1
- Inter Variable → static Inter instances (RN has no variable-axis text API); recorded as
  spec-conflicts L12. — File 02 §3.3

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
