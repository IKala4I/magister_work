# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-26, **P3 closed** (PR #4). Next: **P4 — Onboarding.**
> New standing rules in CLAUDE.md "Context efficiency" (owner directive 2026-08-26):
> read narrowly, adversarial review in a real subagent, verbose output to files,
> one session per phase, findings-vs-second-guessing (`docs/decisions/revisit.md`).

## Where we are

- **P0–P3 merged** (PRs #1–#4). Working tree clean on `main` after the P3 merge.
- **P3 — Tasks: COMPLETE.** FR-10 CRUD, FR-11 quick-add with chips for every recognized
  ambiguity, offline-first write path, PostHog plumbing. Adversarial pass (fresh-context
  subagent) found 3 MAJORs — meridiem silently guessed, undo windows truncated on
  consecutive deletes, reachable crash on invalid date range — all fixed with tests and
  re-verified on a Release rebuild (Maestro 22/22, jest 189/24, coverage 98.5%/92.9% on
  domain+db+sync). Full record: `docs/verification/p3-manual-verification.md`.
- Working mode is **autonomous** — CLAUDE.md "Working mode" + "Context efficiency".

## ⛔ ACTION REQUIRED (owner)

1. **Google OAuth consent screen + client IDs** — needed mid-P4 for the Google sign-in
   path (FR-01). Magic link + anonymous work without it; build those first, stop at the
   OAuth gate with exact console steps.
2. **Sentry org/project slugs + auth token** — still only needed at P12/EAS (source-map
   upload). Local Release builds keep `SENTRY_DISABLE_AUTO_UPLOAD=true`.

## What P4 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P4 — Onboarding" (scope + acceptance).
- `specs/02_product_requirements.md`: FR-01, FR-02, UC-01 (incl. A2 self-declared hours).
- `specs/04_algorithms.md` §3 (cold start: rMEQ→class mapping, Deep anchor matrix,
  logit-affine transform σ(γ·logit(μ)+δ+δ_{g,p}), α₀/β₀ with n₀=8/4, skip-halving,
  weekend blend, seed cluster = rMEQ class).
- `specs/07_engine_internals_and_schema.md` §3.6 (cold-start rungs), §4 (users/profiles/
  prior_cells tables), §7 (auth specifics) — plus `docs/thesis/spec-conflicts.md` errata
  for any of those sections BEFORE implementing.
- `supabase/migrations/20260824120300_seed_prior_cells_v0.sql` — P1 already seeds
  prior_cells v0 computationally; P4's math tests must agree with those values.
- `apps/mobile/src/sync/localUser.ts` — **binding contract**: on first sign-in rewrite
  every row AND every op_outbox payload whose user_id `isLocalUserId()` BEFORE any push.
- `apps/mobile/src/sync/cursor.ts` — account-change contract (resetSyncCursor + mirror wipe).
- supabase-js v2 session storage goes in expo-secure-store (CLAUDE.md stack pin).

## What P3 delivered (bare list; details in verification doc + CHANGELOG)

- `src/db/writes.ts` + `src/db/tasks.ts`: single write surface — one transaction = row +
  outbox op (snake_case server payload, base_version) + `task_created` event; tombstone
  delete/restore as idempotent first-class ops. Atomicity proven by forced-failure test.
- `src/domain/quickAdd.ts`: duration grammar before chrono; ambiguities surfaced as data
  (`weekday_today_or_next`, `am_or_pm`, `multiple_dates`, `multiple_durations`), all
  rendered as chips in `src/ui/task/QuickAddBar.tsx`; deadline preview shows clock time.
- Inbox (FlashList v2 + `useLiveRows`), task sheet (`TaskForm` with cross-field
  validation), undo bar with **one timer per deleted row** (`app/(tabs)/inbox.tsx`).
- Env-gated PostHog (EU host or off; typed event catalog, `engine: 'learned'|'heuristic'`
  matching the schema vocabulary).

## Gotchas (carry forward)

- **Local Release builds need `SENTRY_DISABLE_AUTO_UPLOAD=true`** or sentry-cli fails the
  Xcode build (exit 65). Runtime SDK is fine.
- **Cold start is measured on Release builds only** (`EXPO_PUBLIC_STARTUP_MARKER_URL` +
  `docs/verification/measure-cold-start.py`); dev-bundle numbers are meaningless.
- **Maestro** (2.8.0, `~/.maestro/bin`): tab items match `'Inbox, tab.*'` (full-regex);
  a task row is ONE a11y element — label now ends with `, due <date>` when a deadline
  exists; anything racing the 6 s undo window needs a `point:` tap.
- **jest coverage writes `apps/mobile/coverage/`** — git-ignored now; never commit it.
- RNTL v14: async `render`/`fireEvent`/`renderHook`/`unmount`; sync `act` silently no-ops.
- jest mock factories may only close over `mock*`-prefixed variables; never import
  `src/db/client.ts` in tests (opens the native DB) — import `schema.ts`.
- Schema changes: edit `src/db/schema.ts` → `pnpm exec drizzle-kit generate --name <slug>`
  in apps/mobile → commit `drizzle/` output.
- expo-doctor pins: @sentry/react-native 7.11.0 (not 8.x), react-native-mmkv 3.3.3,
  jest 29.7, TS 5.9.3 — ADR-0003/0004, `docs/versions.md`.
- Decision-6 lint bans raw/literal/template JSX text in `apps/mobile/{app,src}`; string
  props go through `docs/checklists/ui-review.md`.
- Prettier reformats md tables (`pnpm format` before committing docs) and MUST NOT touch
  `packages/shared/src/database.ts`, `apps/mobile/drizzle/`, or `specs/`. Watch for it
  turning a line-initial `+ ` into a list `- ` inside wrapped prose.
- No Docker locally: `supabase test db`/`gen types --local` run in CI only.
- `.env` holds EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY, _SENTRY_DSN, _POSTHOG_API_KEY,
  _POSTHOG_HOST; `apps/mobile/.env` is a symlink to it. Never print/commit.
- `docs/thesis/draft.docx` is local-only, git-ignored, and must be read from disk before
  relying on it; divergences go to `docs/thesis/thesis-corrections.md`.
- Commit trailers: `Refs:` + `Phase:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Open questions (owner)

- None blocking beyond the ⛔ items above. H1 text changes to File 06 land at OSF freeze
  (P11 stop condition). `docs/decisions/revisit.md` is empty (nothing to batch yet).
