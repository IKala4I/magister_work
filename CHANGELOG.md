# Changelog

## P5 — RecSys service (2026-08-26, phase/P5-recsys)

**Service (File 04 §1, specs/07 §5).** FastAPI 0.141 on Python 3.12: `POST /plan`, `POST /feedback`,
`GET /insights`, `POST /parse-preview`, `GET /healthz`; user JWTs verified against the project JWKS
(ES256, `aud = authenticated`, `sub` must equal `user_id`), `X-Service-Key` for the edge functions;
strict Pydantic schemas (`extra = forbid`) whose OpenAPI document generates
`packages/shared/src/api.ts` (openapi-typescript 7.13, new CI `api-contract` job). Per-user state
lives only in Postgres through the pooler (`PostgresRepo`, psycopg 3 pool); an in-memory repo backs
tests and local runs. Dockerfile + HF Spaces README + `deploy-recsys.yml` ready for the Space (⛔).

**Planning pipeline.** DST-safe tick grid (92/100-tick days handled; empty busy set valid —
decision 5); F_τ exactly as File 04 §1.2 writes it (buffer inside W, may pass the deadline, L2);
φ with |C| = 14 and the 90-min/15-min fatigue rule; x_{τ,c} d = 17 in the §3.2.4 order; Beta cells
with 28-day decay on evidence only; LinUCB/TS linear-Gaussian state (Sherman–Morrison, one TS draw
per category per plan, LinUCB arm deterministic); convex blend (w_B = 1 recovers File 04). CP-SAT:
optional intervals + `AddNoOverlap`, pinned tasks, splittable chunk chains with duration-proportional
weights (ADR-0007 §3), criticality-only deferral, urgency g(u), soft run-length (deep) and
fragmentation penalties, `AddHint` warm start with a 1e-4 stability unit (CP-SAT hints do not keep
ties — spec-conflicts M7), 1.5 s anytime cap as a plan-level budget, degradation ladder
30-min → day-by-day with telemetry. FR-24 trade-off options (drop/shrink/move/unpin) ranked by
utility loss when a critical task cannot be honoured.

**Propensity exactness (M-01, M2).** One Bernoulli(ε) experiment per plan: eligible task drawn
uniformly (non-critical, unpinned, ≤ 2 h, ≥ m feasible buckets), bucket drawn uniformly from its
top-m, pinned into the solve unsplit; `propensity = ε/m` is a pure function of settings, tested for
value (0.25), uniformity (χ²), eligibility, and that no non-slice row ever carries a propensity;
requests whose ε/m differ from the constants are rejected (422).

**Reward paths (H3).** `/feedback`: `excluded = true` → counted, never touches state (spy-tested);
lapse → r = 0.0 applied; external displacement → not representable (`reason` has no such value,
422); `(recommendation_id, kind)` id-set makes re-delivery a no-op (`recsys_applied_tuples`,
migration + pgTAP); `correction = true` → full rebuild A = I + Σxxᵀ, b = Σrx and Beta recount with
decay as of each tuple (never a downdate), tested ≡ from-scratch.

**Measured, honestly.** Week instances (50 tasks) were presolve-bound UNKNOWN 20/20 under the
spec's literal-count trigger; after probing/symmetry presolve off, a practical 8·10³ threshold and
UNKNOWN escalation: day OPTIMAL 20/20 (solve p50 70 ms), week FEASIBLE 20/20 (solve p50 1.0 s,
end-to-end p90 1.95 s) — on an M-series Mac, not the 2 vCPU Space (spec-conflicts M8; checklist).
MABWiser 2.7.4 is the CI oracle: LinUCB expectations match to 1e-6, LinTS moments match.

**Tracking.** ADR-0007; spec-conflicts M7, M8, L14–L16; thesis-corrections 4 items; revisit 3
entries; device-checklist "Service environment" section; CLAUDE.md invariant 16 (never run
package-manager commands from the root).

## P4 — Onboarding (2026-08-26, phase/P4-onboarding)

**Cold start (File 04 §3, the first thesis-reported numbers).** `instantiate_user_priors`
copies prior_cells v0 (the day-zero bootstrap — version 0 of an empirical-Bayes-refreshed
object, File 04 §3.5) into per-user `beta_cells` with the per-user n₀ multipliers: ×0.5
outside declared working hours (spec-conflicts M5, fixed as ≥50%-overlap + strict-majority in
ADR-0005) and ×0.5 on survey skip (= the UC-01 A1 wider-exploration mechanism, L8). Seed
cluster = rMEQ class (DM..DE → 0..4). Fires by trigger when `onboarding_completed_at` first
lands; EXECUTE revoked from clients (invariant 1); `ON CONFLICT DO NOTHING` (invariant 5).
rMEQ→class cutoffs are enforced twice: `classFromScore` on the client and a `profiles` CHECK
in the schema. Tests assert spec values, not implementation output: pgTAP checks all 240
prior cells against an independently generated fixture (`scripts/gen-prior-cells-expected.mjs`)
plus hand-computed α₀/β₀ for in/out/skip/weekend/majority/50%-boundary cases; jest checks all
10 class boundaries. A live smoke (`docs/verification/p4-live-smoke.mjs`) verified the whole
path 9/9 on the hosted EU project.

**Auth (FR-01).** Env-gated supabase-js v2 (PKCE, processLock, AppState auto-refresh);
sessions in the official LargeSecureStore pattern (AES key in expo-secure-store, ciphertext
in MMKV — ADR-0006). Anonymous trial auto-created on first launch, convertible via
`updateUser` (uid retained); magic-link sign-in with a deep-link callback route handling both
?code= and #token forms; Google OAuth code-complete but inert behind the ⛔ consent-screen
gate. The P3 binding contracts are implemented and tested: first sign-in rewrites every local
row and outbox payload (adopt); a different uid wipes the mirror and resets the pull cursor.
`enable_anonymous_sign_ins` + deep-link redirect allow-list pushed via `supabase config push`;
magic-link email rate set deliberately to 1/min.

**Onboarding (FR-02, UC-01).** Welcome → 5-item rMEQ survey (published instrument structure,
per-item skip by deselect; any blank item = unscored survey → INT at half prior strength — no
prorating exists for the instrument, ADR-0005) → working hours + sleep window steppers
(defaults Mon–Fri 09:00–18:00, 23:00–07:00; screen-reader operable) → top categories → seed
tasks via the P3 quick-add. Completion persists the profile locally through the outbox, then
a P4-only bridge push upserts it so the server trigger instantiates priors (P8 replaces the
bridge with sync-resolve replay). Tab shell gates on a completed profile (no onboarding flash:
synchronous first-render read). Funnel analytics carry steps and enums only — never answers,
scores as text, or emails.

**Docs/process.** Simulator-evidence rule (owner directive 2026-08-26): simulator runs are
smoke checks; device-conditioned requirements flip ✅ only at the owner-run hardware pass
before P12 — running list seeded in `docs/verification/device-checklist.md`; PLAN row 11.


Updated at each phase gate. Lines end with the requirement IDs they serve.

## P3 — Tasks (2026-08-26, phase/P3-tasks)

### Added

- Single write surface for the local mirror (`src/db/writes.ts` + `src/db/tasks.ts`): every
  mutation is ONE SQLite transaction carrying the row change, its outbox op (server-shaped
  snake_case payload, client-monotonic op_id, base_version), and — on create — the append-only
  `task_created` event; soft-delete tombstones with idempotent first-class restore. — FR-10,
  NFR-R1 (local half), invariants 2/8
- Task CRUD with all FR-10 fields: full task sheet (`app/task/new.tsx`, `app/task/[id].tsx`)
  over a validated draft layer. — FR-10, UC-02
- chrono-node NL quick-add with preview and disambiguation chips: chrono owns dates, a local
  duration grammar runs first (chrono reads a bare "2h" as a relative clock time, which would
  turn every estimate into a deadline); every recognized ambiguity — bare weekday, am/pm-less
  clock time, multiple dates, multiple durations — renders as chips, never a silent guess. —
  FR-11, UC-02
- FlashList v2 Inbox reading the mirror through a direct change-listener hook
  (`src/db/useLiveRows.ts`); deletes undoable for 6 s via a snackbar restore. — FR-10,
  invariant 14
- Env-gated PostHog analytics beside Sentry: EU host read from env and never hardcoded — a key
  without a host stays OFF rather than falling back to the US cloud; GeoIP, autocapture and
  session replay disabled; typed event catalog makes the model-version tag structurally
  required on recommendation events. — NFR-O1, NFR-S2
- Pre-auth local identity (`src/sync/localUser.ts`): device-derived placeholder owner for
  offline rows, with a binding rewrite contract for P4 sign-in; nothing pushes before P8. —
  FR-01 groundwork, NFR-R1

### Fixed

- Three Inbox interaction bugs from the on-device UC-02 walk: first tap after quick-add only
  dismissed the keyboard (keyboardShouldPersistTaps), the undo bar rendered under the open
  keyboard leaving a destructive action with no reachable undo, and restore ran inside a
  setState updater (React may re-run updaters → replayed op). — FR-10, FR-11, invariant 14
- Tab-shell header title scaled unbounded at accessibility-XXXL and clipped; header chrome is
  now pinned at 1× while content scales to the 200% cap. Closed both P2 carry-overs: NFR-P2
  cold start p90 = 1075 ms on HEAD (≤2000 ms target) and the NFR-A2 sweep 27/27 ×2 (Maestro
  flow committed). — NFR-A2, NFR-P2
- (fresh-context adversarial pass — 3 MAJOR) "at 2" was silently guessed as 2 AM tomorrow with
  the clock time hidden by the day-only preview — meridiem-less hours 1–11 now surface am/pm
  chips and the preview shows the time; consecutive deletes truncated each other's 6 s undo
  window (single snackbar timer) — now one timer per deleted row, Undo restores all still
  undoable; earliestStart > deadline passed form validation and the DAO throw was uncaught in
  onPress (reachable release crash) — the cross-field rule is enforced in the form. — FR-11,
  UC-02 A1, FR-10, invariant 14
- (adversarial pass, minor) Inbox row a11y label now carries the deadline; undo bar announced
  to iOS VoiceOver; radio chips use accessibilityState.checked; analytics engine tag aligned
  to the schema vocabulary ('learned', not 'bandit'); "0m" no longer becomes a deadline of
  now; dangling connectors stripped from titles; write-path atomicity proven by a forced
  mid-transaction failure test; P4 account-binding contract names the outbox payload rewrite.
  — NFR-A1, NFR-O1, NFR-R1, FR-11

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
