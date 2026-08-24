# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-24, end of P1.

## Where we are

- **P1 — Data layer: COMPLETE** (PR #2 merged; if the PR still shows open, merging it is the
  only leftover step — merge once CI is green, nothing else is pending).
- **Next: P2 — Mobile shell** on a new branch `phase/P2-mobile-shell`.
- Working mode is **autonomous** — CLAUDE.md "Working mode" has the stop conditions and the
  decision rule. Owner does not referee technical choices.

## What P1 delivered

- 5 migrations on the linked **eu-west-1** project: base (16 tables, RLS everywhere, trimmed
  grants, sync_seq cursor, version/updated_at triggers, status guard), M-01 propensity, M-02
  displacement, prior_cells v0 seed (computed in SQL, 240 cells, hand-verified), and a
  **hardening migration** from the adversarial review (NO ACTION audit FKs, fail-closed status
  guard {accepted,pinned,moved,rejected} with old-state+attributed freeze, column-gated
  events.server_ts, FK/job indexes, sequence privileges, size caps, model_registry priors row,
  model-state CHECKs).
- pgTAP suites (rls_test, schema_test, hardening_test) run in the CI `db` job on the local
  stack; contract-sync step regenerates types and diffs (normalize via
  `scripts/normalize-db-types.sh` — applies to BOTH sides; --linked and --local outputs differ
  by an __InternalSupabase header).
- `packages/shared/src/database.ts` generated + committed (normalized form).
- Privacy evidence: `docs/privacy/README.md` (Supabase eu-west-1 verified; **PostHog must be
  EU cloud** when wired in P2/P3 — this is an owner decision already made, do not default US).

## Exact next actions (P2 — Mobile shell, per PLAN.md)

1. Branch `phase/P2-mobile-shell`.
2. Expo Router file-based navigation: tabs Today · Inbox · Focus · Insights + Settings route.
3. Design tokens from File 02 §3 EXACTLY (palette light/dark incl. hex table, Inter Variable +
   JetBrains Mono type scale, radii 16–20, springs ≤250 ms, reduced-motion honored,
   confidence-= -solidity styling primitives). Install: expo-router, drizzle-orm + expo-sqlite,
   react-native-mmkv, zustand, reanimated, gesture-handler, expo-font (+ fonts), sentry.
   drizzle-orm 0.45.2 verified TS-5.9-compatible (ADR-0004). Pin all in docs/versions.md.
4. Local SQLite Drizzle schema mirroring server tables (tasks, recommendations, events outbox)
   - MMKV sync cursor scaffold. Client never computes rewards (invariant 1).
5. i18n scaffolding (expo-localization + typed catalog) — English strings only, no hardcoded
   user-facing strings in components (decision 6).
6. Sentry crash reporting (EU org — ACTION REQUIRED gate for account creation).
7. NFR-P2 cold-start measurement on device; NFR-A2 200%/reduced-motion pass on the shell.
8. DoD: requirement table, fresh-subagent adversarial pass, gates, traceability, CHANGELOG,
   pojasnennia.uk.md (update Крок 1 status when offline shell lands), HANDOFF, PR, merge.

## Gotchas

- `.env` = EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY; never print/commit.
- `docs/thesis/draft.docx` is a **local-only** consistency target (git-ignored; absent from
  fresh clones by design — never "restore" or commit it).
- specs/ byte-frozen incl. 07; normative corrections live in docs/thesis/spec-conflicts.md
  (H1 approved: ε-randomization in BOTH study arms, arm A = "heuristic + matched
  randomization"; L10/L11: client hard-delete FK-restricted, client statuses =
  plan-review set only).
- pojasnennia.uk.md updates go **in the same commit** as the work they describe.
- Prettier reformats md tables — run `pnpm format` before committing docs; it must NOT touch
  packages/shared/src/database.ts (ignored) or specs/.
- No Docker on this machine: local `supabase test db`/`gen types --local` unavailable — CI
  covers them; remote work via linked CLI (`supabase db push`, `supabase db query --linked`).
- Commit trailers: `Refs:` + `Phase:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- jest 29.7 (not 30) and TS 5.9.3 (not 6) are deliberate pins — ADR-0003/0004.

## Open questions (owner)

- None blocking. H1 text changes to File 06 land at OSF pre-registration freeze (stop
  condition, P11 timeframe). PostHog/Sentry account creation gates arrive in P2/P3.
