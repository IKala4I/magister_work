# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-24, end of P2.

## Where we are

- **P2 — Mobile shell: COMPLETE** (PR #3; if it still shows open, merge once CI is green —
  nothing else is pending in it).
- **Next: P3 — Tasks** on a new branch `phase/P3-tasks`.
- Working mode is **autonomous** — CLAUDE.md "Working mode" has the stop conditions and the
  decision rule. Owner does not referee technical choices.

## ⛔ ACTION REQUIRED (owner) — carried over from P2

1. **Sentry EU org**: create a Sentry account/org with **EU data residency**, add a project
   (React Native), put the DSN in `.env` as `EXPO_PUBLIC_SENTRY_DSN`. Until then crash
   reporting is initialized **disabled** (tested) — nothing ships. Also needed later for
   source-map upload: org/project slugs + auth token at EAS build time (P12).
2. **On-device NFR-P2/NFR-A2 measurements**: cold start ≤2 s p90 (10-launch protocol) and
   the 200% font / reduced-motion / reduce-transparency sweep — script in
   `docs/verification/p2-manual-verification.md`. Blocked on this machine: **disk is
   429/460 GB full**, Xcode build died with ENOSPC (I freed ~3 GB of build artifacts; a
   real build needs much more). Free disk space, then `cd apps/mobile && pnpm ios`, or run
   on a physical iPhone. P10's formal a11y/perf pass re-checks both anyway.
3. **PostHog EU** account — needed in P3 for event plumbing (decision 7 / NFR-S2: EU
   instance only, never the US default).

## What P2 delivered

- Expo Router shell: `app/_layout.tsx` (fonts behind splash, Sentry.wrap, useMigrations
  with visible failure state), `(tabs)/` Today·Inbox·Focus·Insights, `settings.tsx` modal
  with a working persisted appearance control. Entry = `expo-router/entry`; typed routes on.
- Design system: `src/ui/tokens/` byte-exact to File 02 §3 (palette, type scale 32/38…13/18,
  radii 16–20, springs ≤250 ms, glass 8–12 px); WCAG AA proven by tests incl. the composited
  confidence floor; `useTheme` (OS scheme + MMKV-persisted override), `useReducedMotion`,
  `useReduceTransparency`.
- Primitives: ThemedText (scaling capped at exactly 200%), Screen, GlassPanel (**solidity
  scales panel chrome only — never text**; opaque pre-composited fallback on Android/Reduce
  Transparency), ConfidenceBlock (dashed experiment border + tag, composed a11y label with
  `contentLabel` prop for P6), EmptyState.
- Local data layer: `src/db/schema.ts` mirrors server tasks/recommendations(+M-01/M-02)/
  events + `op_outbox`; drizzle-kit bundle in `apps/mobile/drizzle/` applied via
  useMigrations; `src/db/client.ts` opens `hourwell.db` with change listeners (useLiveQuery-
  ready). Mirror tests pin columns, value sets, and the exact nullability relaxations.
- Sync scaffold: `src/sync/cursor.ts` (max-server_seq pull cursor, never rewinds),
  `src/sync/opId.ts` (`<install-uuid>-<12-digit counter>` from MMKV). **Binding contract
  for P4/P8 (in cursor.ts):** cursor/device-id/counter are install-scoped; any auth account
  change MUST resetSyncCursor() + wipe the mirror, else the new account misses rows below
  the old cursor (global sync_seq).
- i18n: typed catalog `src/i18n/en.ts` + `t()`; ESLint bans raw/literal/template JSX text
  (probe-verified); what lint can't catch → `docs/checklists/ui-review.md` (standing).
- Observability: env-gated Sentry (7.11.0 — the SDK-57-validated line, do NOT bump to 8.x
  until Expo does), `src/observability/startup.ts` js-start→first-frame timing.

## Exact next actions (P3 — Tasks, per PLAN.md)

1. Branch `phase/P3-tasks`.
2. Task CRUD with all FR-10 fields on the local mirror (writes → SQLite first, rows into
   `op_outbox` via `nextOpId()`; events appended to local `events`). Client may only write
   plan-review statuses (schema exports `CLIENT_WRITABLE_RECOMMENDATION_STATUSES`).
3. chrono-node NL quick-add with preview chip + disambiguation (FR-11, UC-02) — install +
   pin chrono-node 2.x; parse mapping test suite (durations, deadlines, "by Fri",
   ambiguity).
4. `task_created` events; PostHog event plumbing (**EU instance host, gate on account** —
   same env-gated pattern as Sentry).
5. FlashList v2 for the Inbox list (first real list — pin in versions.md).
6. Offline-first verified: create/edit/delete fully offline then sync-queue inspection;
   domain coverage ≥70% (NFR-M1).
7. DoD: requirement table, fresh-subagent adversarial pass, gates, traceability, CHANGELOG,
   pojasnennia.uk.md (same-commit rule), HANDOFF, PR, merge.

## Gotchas

- `.env` = EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY (+ later
  EXPO_PUBLIC_SENTRY_DSN); never print/commit.
- RNTL is v14: `render`/`fireEvent` are **async** (`await render(...)`), queries live on
  `screen`, renderer is the `test-renderer` package (not react-test-renderer).
- jest mocks: `react-native-mmkv` → in-memory double via moduleNameMapper
  (`src/test/mmkv.mock.ts`); `expo-localization` mocked in `src/test/setup.ts`; when
  mocking `expo-font`, spread `jest.requireActual` (vector-icons needs `Font.isLoaded`).
- Never import `src/db/client.ts` in tests (opens the native DB); import `schema.ts`.
- Schema changes: edit `src/db/schema.ts` → `pnpm exec drizzle-kit generate --name <slug>`
  in apps/mobile → commit the `drizzle/` output (eslint/prettier-ignored).
- expo-doctor validates dependency versions — `npx expo install <pkg>` for Expo-managed
  packages; it rejected @sentry/react-native 8.x (7.11.0 is correct for SDK 57).
- `pnpm ios` now runs `expo run:ios` (native build, needs disk); use `pnpm start` + dev
  client only after a build exists. `ios/` stays gitignored (CNG) — it's regenerated.
- Decision-6 lint: raw JSX text AND `{'literal'}` AND template children error in
  `apps/mobile/{app,src}` (tests exempt); string props go through
  `docs/checklists/ui-review.md` at review time.
- Prettier reformats md tables — run `pnpm format` before committing docs; it must NOT
  touch `packages/shared/src/database.ts`, `apps/mobile/drizzle/`, or `specs/`.
- No Docker on this machine: local `supabase test db`/`gen types --local` unavailable — CI
  covers them; remote work via linked CLI.
- Commit trailers: `Refs:` + `Phase:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- jest 29.7 / TS 5.9.3 / Sentry RN 7.11 are deliberate pins — ADR-0003/0004, versions.md.
- Machine disk is nearly full (see ACTION REQUIRED 2) — avoid large local builds until the
  owner frees space.

## Open questions (owner)

- None blocking beyond the ⛔ items above. H1 text changes to File 06 land at OSF freeze
  (P11 stop condition).
