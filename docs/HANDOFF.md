# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-29 (late morning), **P8 — Sync: complete; PR #16 merged; P9 — Trust
> surfaces opens next.** Standing rules live in CLAUDE.md: "Working mode", "Context efficiency",
> "Simulator evidence".

## Where we are

- **P0–P8 merged** (PRs #1–#16). `main` = hosted project (both P8 migrations applied; all six
  functions deployed; the three `GCAL_*` secrets set 2026-08-29; `p8-live-smoke.mjs` **27/27**
  on 2026-08-29 with the secrets in place — its `start` check now expects 200 + `auth_url`).
- **What P8 built** (ADR-0012; CHANGELOG "P8"): `sync-resolve` push-then-pull under a per-user
  lease (replay ledger `sync_ops` → duplicate op = no-op; class 1 append-only events with
  ownership checks; class 2 `base_version` → `conflict` + server row → client field-level merge
  → collapse → replay; class 3 state-checked statuses; RLS-invoker `sync_pull`; `persist_plan`
  RPC), `displaced_pending` resolved by the reward mapping (completed + `conflict_flag` with an
  EXCLUDED tuple, or `displaced` with no tuple), Google Calendar (server-held OAuth with a
  device-bound confirm step, push channels + 5-min sweep, opt-in write-back with cleanup)
  **verified live against the owner's Google Calendar on 2026-08-29** (consent → callback →
  confirm → initial sync; push within seconds; the 20-day event; a meeting over a planned block
  → `displaced_pending` with no reward row; sweep `users: 1`; all-day rule both ways;
  disconnect — `p8-manual-verification.md` §2.3), client engine replacing the three bridges
  (+ the adversarial hardening #5–#8/#13: one debounced retry on `busy`, backlog drain, error
  boundary, dead-letter refetch, `ack.version` adoption), calendar mirror + busy rows, Today
  notices, deferred wipe with a confirm, Settings sync/calendar sections.
- **Gates at the merge:** typecheck/lint/Prettier clean · jest **344** (42 suites) · Deno
  **155** · pgTAP **85/85** (linked, rolled back) · expo-doctor 21/21 · smoke 27/27.
- **Adversarial pass** (`p8-manual-verification.md` §4): 3 MAJOR + 12 MINOR + 5 notes; all
  MAJORs and eleven MINORs fixed and re-verified; one residual documented (revisit.md: a
  cancelled meeting does not un-displace a block — ADR-0012 §9 [INFERRED]).
- **What FR-03 still lacks** (device checklist + pre-enrollment list): the `hourwell://`
  redirect opening the app and the confirm firing from the device; the busy row + "meeting"
  caption at foreground; write-back against live Google; push-channel renewal at day 7 and the
  Testing-status refresh-token expiry (a week on a real account); consent screen **Testing → In
  production** before any participant connects a calendar.
- **Docs current:** ADR-0012, `p8-manual-verification.md` (§2.3 live Google, §4 all rows
  closed), traceability (FR-03 live ✅), CHANGELOG (P8: live Google + adversarial fixes), PLAN
  status board (P8 ✅ merged), spec-conflicts L19 closed + L28–L33, thesis-corrections #38–39,
  revisit (engine hardening DONE; Testing→production pre-enrollment line), device checklist,
  versions, privacy README G4 closed + G7, `consent-clause.md` (owner review),
  `runbooks/google-calendar.md` (§3 done 2026-08-29, corrected wording), explainer (P8 section
  rewritten for the live verification, counts 344/155/85/27).

## Exact next actions (next session, in order)

1. `git checkout main && git pull`; `gh run list --branch main -L 1` green; then
   `git checkout -b phase/P9-trust` and open PR #17 "P9 — Trust surfaces" early (draft body:
   requirement IDs; gate output added at the close).
2. **P9 — Trust surfaces** reading list (read nothing else to orient): PLAN §3 P9; specs/02
   FR-24, FR-33, FR-40, FR-41, UC-05, UC-08; specs/07 §5 `GET /insights` (lines ~400–414) and
   §3.6 rungs; File 04 §3.2 (dayparts) for the heatmap grid; ADR-0010 §11 (rung-2 helpers);
   revisit lines tagged P9 (proportional timeline, second-move semantics, NULL_CONFIDENCE_RENDER,
   chunk-level displacement, week-horizon capacity); `services/recsys` `/insights` handler +
   `apps/mobile/app/(tabs)/insights.tsx` (P2 shell) + `src/ui/plan/Timeline.tsx` (busy rows
   landed in P8); `docs/thesis/spec-conflicts.md` before implementing anything File 02/07 says.
3. Scope (PLAN §3): energy heatmap hour×weekday with OKLCH interpolation + screen-reader
   alternative (FR-40); weekly review with adherence trend + 2–3 learnings + correction toggles
   as high-weight labels (FR-33, UC-08); "What Hourwell believes about you" (FR-41); conflict
   trade-off sheet with ranked consequences, decision logged (FR-24, UC-05). _Accept:_ heatmap
   renders from `/insights`; corrections round-trip to model state; infeasible day produces the
   sheet, choice logged.
4. **Verification depth:** corrections (FR-33) are thesis-critical — invariant 6 (a correction
   triggers a full rebuild from stored tuples, never a rank-one downdate) and the "high-weight
   label" semantics must be measured (recsys tests + a live round trip); the FR-24 decision log
   is the UC-05 evidence. Heatmap/belief rendering is routine (Definition of Done, no extra
   depth) but needs device-checklist entries (200 % font, reduced motion, VoiceOver table).
5. Keep `docs/thesis/pojasnennia.uk.md` in the same commits; add device-checklist entries
   during the phase; refresh this file at the end and close with `HANDOFF WRITTEN — safe to
/clear`.

## ⛔ ACTION REQUIRED (owner) — none blocks P9

- **Consent clause review** — `docs/privacy/consent-clause.md` (draft; contact block to fill).
- **Google OAuth _sign-in_ (FR-01, P4 leftover) is now cheap:** the Google Cloud project and
  consent screen exist. Create a second Web OAuth client with redirect
  `https://uapiuehjcntilwdmpojk.supabase.co/auth/v1/callback`, paste its id + secret into
  Supabase Dashboard → Authentication → Providers → Google; the session then runs the P4 smoke.
- Earlier gates unchanged: magic-link E2E with a real mailbox, OSF-freeze text items.
- **Pre-enrollment list** (revisit together; `docs/decisions/revisit.md`): (1) Oracle **PAYG**
  (owner 2026-08-27: deferred); (2) Google consent screen **Testing → In production** — in
  Testing, refresh tokens expire after 7 days, which was fine for the 2026-08-29 verification
  but would silently disconnect every participant in week 2 (runbook §4); (3) the device
  verification pass before P12 (device checklist).

## Gotchas (P8 additions; earlier lists still apply)

- **Run jest from `apps/mobile`** (`cd apps/mobile && npx jest`) or `pnpm test` at the root — a
  bare `npx jest` at the repo root fails all 42 suites with a Babel "Unexpected token" (no
  config there). The shell cwd persists across tool calls, so check it first.

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
