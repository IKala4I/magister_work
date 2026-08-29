# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-29 (mid-morning), **P8 — Sync: code complete, adversarial pass done,
> FR-03 verified live against Google, PR #16 open and NOT yet merged.** This handoff was written on context pressure (858 k tokens): the
> next session finishes five small engine items, re-runs the gates, updates the PR body and
> merges. P8 turned out thesis-critical, not routine (File 05 §2 is a thesis claim).
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence".

## Where we are

- **P0–P7.1 merged** (PRs #1–#15). **P8 = PR #16 (`phase/P8-sync`)** — every commit pushed
  (the head is the `docs(verification)` commit after `71caaa6`), working tree clean, hosted
  project = branch (both P8 migrations applied; all six functions deployed from the `71caaa6`
  code and fingerprinted by handler-specific responses — `p8-live-smoke.mjs` **27/27**; the
  three `GCAL_*` secrets set 2026-08-29 and the three gcal functions redeployed, same code).
- **FR-03 verified live against Google (2026-08-29)** — `p8-manual-verification.md` §2.3:
  consent → callback → device-bound confirm → initial sync, push within seconds, the 20-day
  event (adversarial #2 closed), a meeting over a planned block → `displaced_pending` with no
  reward row, sweep `users: 1`, all-day rule both ways, disconnect. The test connection is
  disconnected; nothing of the owner's calendar remains live in the project.
- **What P8 built** (ADR-0012; CHANGELOG "P8"): `sync-resolve` push-then-pull under a per-user
  lease (replay ledger `sync_ops` → duplicate op = no-op; class 1 append-only events with
  ownership checks; class 2 `base_version` → `conflict` + server row → client field-level merge
  → collapse → replay; class 3 state-checked statuses; RLS-invoker `sync_pull`; `persist_plan`
  RPC), `displaced_pending` resolved by the reward mapping (completed + `conflict_flag` with an
  EXCLUDED tuple, or `displaced` with no tuple), Google Calendar code-complete against a fake
  Google (server-held OAuth with a device-bound confirm step, push channels + 5-min sweep,
  opt-in write-back with cleanup), client engine replacing the three bridges, calendar mirror +
  busy rows, Today notices, deferred wipe with a confirm, Settings sync/calendar sections.
- **Gates at `71caaa6`:** typecheck/lint/Prettier clean · jest **337** (42 suites) · Deno
  **155** · pgTAP **85/85** (linked, rolled back) · expo-doctor 21/21 · smoke 27/27. CI on PR
  #16: the last fully green run was `f2fee51`; the four later commits are pushed — check
  `gh pr checks 16` first thing (expect green; the only earlier failures were Prettier on the
  smoke script and a `no-undef fetch` lint, both fixed).
- **Adversarial pass** (`p8-manual-verification.md` §4): 3 MAJOR + 12 MINOR + 5 notes; all
  MAJORs and 8 MINORs fixed and re-verified; **four MINORs open (engine hardening) — the next
  session's first job**; one residual documented (revisit.md).
- **Docs current:** ADR-0012 (corrected after the pass), verification doc, traceability,
  CHANGELOG (P8 entry — add one line for the adversarial fixes when merging), PLAN status board
  (already says P8 ✅ merged — true once PR #16 merges), spec-conflicts L19 closed + L28–L33,
  thesis-corrections #38–39, revisit, device checklist, versions, privacy README G4 closed + G7,
  `consent-clause.md` (owner review), `runbooks/google-calendar.md`, explainer (P8 section +
  build-state row).

## Exact next actions (next session, in order)

1. `git status` clean on `phase/P8-sync`; `gh pr checks 16` — if the TS job is
   red, read `gh run view <id> --log-failed | grep -E "error|✖"` (P8 lesson: Prettier runs on
   `.mjs`/`.md` — run `pnpm format` BEFORE committing docs/smoke edits).
2. **Engine hardening (adversarial #5–#8, #13) in `apps/mobile/src/sync/engine.ts`** — small,
   all covered by `src/sync/__tests__/engine.test.ts` (extend it; the fake DB pattern is there):
   - #5 `busy` → `scheduleSync(reason)` once (the 2 s debounce is the backoff); test: outcome
     `busy` and a second invoke after timers.
   - #6 backlog drain: continue the round loop while unacked ops **not yet sent in this sync**
     remain (track a `Set` of op ids sent), still bounded by `MAX_ROUNDS`; test: 101 tasks
     (202 ops) → 2 rounds, all acked.
   - #7 error boundary: `try/catch` around the loop in `run()` → status `error`,
     `Sentry.captureException`, outcome `{kind:'failed'}`; the test mock for Sentry gains
     `captureException`.
   - #8 dead-letter refetch: `applyAcks` returns the dead-lettered ops; for `task_*` /
     `profile_update` with no other unacked op for the entity, re-read the row through the user
     client (`supabase.from('tasks').select('*').eq('id', id).maybeSingle()`, profiles by
     `user_id`) and feed it to `applyPull` as a one-row page; test: mock `supabase.from` chain.
   - #13 on `applied` for task/profile ops with no other unacked op for the entity, set the
     local `version = ack.version` and `serverSeq = ack.server_seq`.
     Then `pnpm typecheck && pnpm lint && pnpm format:check && (cd apps/mobile && npx jest)`.
3. Update `p8-manual-verification.md` §4 rows 5/6/7/8/13 to **Fixed**, §1 jest count; ADR-0012
   §2/§6 lines that call them "scheduled"; revisit.md line "[P8, 2026-08-29] Engine hardening"
   → DONE; CHANGELOG P8 entry: one paragraph "Adversarial fixes (2026-08-29)". `pnpm format`,
   commit `fix(sync): … (adversarial #5–#8, #13)` + `docs(verification): …`, push.
4. PR #16 body: requirement IDs (FR-03, FR-23, NFR-R1, NFR-S2, UC-09, M-02, File 05 §2) + the
   pasted gate output; wait for green; merge with a merge commit like the earlier PRs; verify
   `main` CI green. Then refresh this file for P9 and end with `HANDOFF WRITTEN — safe to /clear`.
5. **P9 — Trust surfaces** reading list (read nothing else to orient): PLAN §3 P9; specs/02
   FR-24, FR-33, FR-40, FR-41, UC-05, UC-08; specs/07 §5 `GET /insights` (lines ~400–414) and
   §3.6 rungs; File 04 §3.2 (dayparts) for the heatmap grid; ADR-0010 §11 (rung-2 helpers);
   revisit lines tagged P9 (proportional timeline, second-move semantics, NULL_CONFIDENCE_RENDER,
   chunk-level displacement); `services/recsys` `/insights` handler + `apps/mobile/app/(tabs)/
insights.tsx` (P2 shell) + `src/ui/plan/Timeline.tsx` (busy rows landed in P8).

## ⛔ ACTION REQUIRED (owner) — not blocking the merge

- **Google Cloud project for FR-03 — DONE 2026-08-29.** Runbook §1 (owner: project, Calendar
  API, consent screen External/**Testing** with both scopes, owner as test user, Web OAuth
  client with the callback redirect), §2 (secrets set, functions redeployed) and §3 (verified
  live, `p8-manual-verification.md` §2.3). What remains is on the pre-enrollment list below and
  the device checklist (redirect into the app, day-7 renewal / token expiry).
- **Consent clause review** — `docs/privacy/consent-clause.md` (draft; contact block to fill).
- Earlier gates unchanged: Google OAuth _sign-in_ consent screen (FR-01, P4), magic-link E2E with
  a real mailbox, OSF-freeze text items.
- **Pre-enrollment list** (revisit together; `docs/decisions/revisit.md`): (1) Oracle **PAYG**
  (owner 2026-08-27: deferred); (2) Google consent screen **Testing → In production** — in
  Testing, refresh tokens expire after 7 days, which is fine for the owner's own verification
  but would silently disconnect every participant in week 2 (runbook §4).

## Gotchas (P8 additions; earlier lists still apply)

- **Desktop consent looks like a hang**: after the consent click Chrome spins forever (no
  handler for `hourwell://`). Success shows in `gcal_sync_state` (tokens + `confirm_token`);
  the session reads the token there and confirms within its 10-min TTL (runbook §3.2).
- **The calendar zone is not the profile zone.** Derive it from a stored event (time shown in
  Google vs `start_at`) before telling the owner which slot to cover — a UTC+2 guess put the
  first §3.5 meeting 15 min beside the block.

- **`scripts/pgtap-linked.sh <test.sql> [migrations…]`** runs a pgTAP file + not-yet-pushed
  migrations against the LINKED project inside one rolled-back transaction (Management-API SQL
  = one implicit transaction; only the last statement's rows return, so the TAP text comes back
  through a deliberate `raise exception`). Pass only migrations NOT yet applied remotely.
- **`supabase db query --linked -f <abs path>`** — the path resolves against the workdir; the
  shell cwd persists across tool calls (a `cd apps/mobile` earlier bit twice).
- **PostgREST embeds need a FK path**: `gcal_sync_state` and `profiles` both hang off
  `auth.users`, so `profiles!inner(timezone)` fails at runtime (500) while `deno check` is happy
  — the loader reads profiles separately. Fingerprint deployed functions with a handler-specific
  body, not a status code (the smoke does: `gcal-connect {action:'nope'}` must list `confirm`).
- **Google secrets read at module load** — redeploy after `supabase secrets set`.
- **`sync-resolve`/`gcal-connect` verify the user JWT before parsing** — an anon-key bearer gets
  `unauthorized` before any fingerprint; use a session (the smoke signs in anonymously).
- Prettier reformats `.mjs`/`.md`: run `pnpm format` before committing, or CI's TS job fails on
  `format:check` (bit P8 once) and ESLint needs `/* global fetch */` in Node scripts.
- jest-expo factory rule: build the real SQLite DB INSIDE the `jest.mock('../../db/client')`
  factory (requires are allowed there; wrap with `/* eslint-disable
@typescript-eslint/no-require-imports */`).
- The client's `updated_at` is the LWW edit time on both sides: `tg_touch_updated_at` only fires
  when the writer did not set it — never "fix" the trigger back.
- `attribute-rewards` instant mode now answers **409 busy** while the user's lease is held; the
  daily sweep reports `skipped_busy`. `sync-resolve` supplies a no-op lease to `processUser`
  because it already holds the user.
- Local profile `version` bumps on every edit (op `base_version` = previous); the old bridge
  semantics ("local version = server's last accepted") are gone — tests were updated.

## Open questions (owner)

- None new. ADR-0011 items for P8 are done (region pin verified live; consent clause drafted;
  `profiles.eu_eea_resident` column — the question itself is P11's enrollment).
