# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-24, mid-P3 (tasks CRUD + quick-add landed and verified on device).

## Where we are

- **P2 — Mobile shell: COMPLETE**, and its two carry-over measurements are now **done**
  (numbers below). Nothing is outstanding from P2.
- **P3 — Tasks: in progress** on `phase/P3-tasks` (local branch, never pushed). FR-10 CRUD,
  FR-11 quick-add, the offline write path and the Inbox/task-sheet UI are built, tested,
  and walked on device. Remaining before the P3 gate: PR + merge, CHANGELOG, and the
  adversarial fresh-subagent pass.
- Working mode is **autonomous** — CLAUDE.md "Working mode" has the stop conditions and the
  decision rule. Owner does not referee technical choices.

## Measurements (both carry-overs closed)

Executed on a Release build, iPhone 17 Pro simulator (iOS 26.5 / Xcode 26.6), clean install.
Full protocol and results: `docs/verification/p2-manual-verification.md`.

- **NFR-P2 cold start — PASS.** p90 = **1075 ms** on committed HEAD, against a ≤2000 ms
  target. Three 10-launch runs (1079 ms before the keys existed, 1073 ms with them, 1075 ms
  on HEAD) land within 6 ms of each other, so neither SDK costs anything measurable at
  startup. Driver: `docs/verification/measure-cold-start.py` (10 launches, kill between,
  first-frame marker ping — the build must set `EXPO_PUBLIC_STARTUP_MARKER_URL`).
- **NFR-A2 200% font + reduced motion + reduce transparency — PASS**, 27/27 steps, run twice.
  Flow: `apps/mobile/e2e/p2-a11y-sweep.yaml` (Maestro 2.8.0). One real bug fixed to get here:
  the tab-shell header title scaled unbounded and clipped; header chrome is now pinned at 1×.

Traceability rows for both are flipped to ✅.

## ⛔ ACTION REQUIRED (owner)

1. **Sentry org/project slugs + auth token** — only needed at **P12/EAS** for source-map
   upload. The DSN is in `.env` and works; crash reporting initializes **enabled** and was
   confirmed running on device. Until slugs exist, local Release builds must set
   `SENTRY_DISABLE_AUTO_UPLOAD=true` (see Gotchas) — `sentry-cli` otherwise fails the build.
2. Nothing else. Sentry EU org, PostHog EU account, and the on-device measurements are all
   **done**.

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

## Exact next actions (finish P3)

Done already: FR-10 CRUD on the local mirror (`src/db/tasks.ts` + `src/db/writes.ts` — the
only write surface, one transaction per mutation carrying row + outbox op + event), FR-11
chrono-node quick-add (`src/domain/quickAdd.ts`, 21-case mapping suite), PostHog plumbing,
FlashList v2 Inbox, task sheet, and the on-device UC-02 walk (22/22, evidence in
`docs/verification/p3-manual-verification.md`). 174 tests green; domain coverage ~94% vs the
70% NFR-M1 bar.

1. Fresh-context **adversarial subagent pass** (offline / DST / dup-op / 200% font — the
   DoD list in CLAUDE.md). Not yet run for P3.
2. `docs/thesis/pojasnennia.uk.md` — add the P3 section (same-commit rule; it currently
   stops at P2).
3. CHANGELOG P3 entry + requirement-checklist table (ID → file:line → test → PASS).
4. Open **and merge** the PR `P3 — Tasks` once CI is green (autonomous mode). The branch has
   never been pushed, so the first push needs `-u origin phase/P3-tasks`.

## Gotchas

- **Local Release builds need `SENTRY_DISABLE_AUTO_UPLOAD=true`** — otherwise `sentry-cli`
  fails the Xcode source-map phase with "An organization ID or slug is required" (exit 65).
  This is build-time only; the runtime SDK is fine.
- **Maestro flows live in `apps/mobile/e2e/`** (Maestro 2.8.0, `~/.maestro/bin`). Two
  gotchas: tab bar items match as `'Inbox, tab.*'` (composed a11y text, full-regex match),
  and a task row is ONE a11y element labelled `"<title>, <category>, <minutes> minutes"` —
  its inner Text nodes are not separately matchable. Screenshot paths must be relative
  (Maestro sandboxes them into the run folder). `tapOn` costs seconds because it dumps the
  hierarchy, so anything racing the 6 s undo window needs a `point:` tap.
- **The Inbox reads through `src/db/useLiveRows.ts`, not drizzle's `useLiveQuery`** — see
  that module's docstring and commit 8dd6e88 for the reasoning and the limits of the
  evidence.
- **RNTL v14 is async everywhere**: `render`, `fireEvent`, `renderHook`, AND `unmount`.
  State updates flush only inside `await act(async () => …)` — a synchronous `act` silently
  does nothing, which reads as "the component ignored my event".
- jest mock factories may only close over variables whose names start with `mock`
  (case-insensitive) — `const listeners = []` in a factory throws at transform time.

- `.env` holds EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_POSTHOG_API_KEY, EXPO_PUBLIC_POSTHOG_HOST — never print/commit. Expo reads env
  from the app dir, so `apps/mobile/.env` is a symlink to the root file (git-ignored).
- RNTL v14 queries live on `screen`; the renderer is the `test-renderer` package (not
  react-test-renderer).
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
- `session-backup*.txt` and `*.build.log` are git-ignored — never commit a transcript.

## Open questions (owner)

- None blocking beyond the ⛔ items above. H1 text changes to File 06 land at OSF freeze
  (P11 stop condition).
