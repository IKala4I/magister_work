# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-24, start of P1.

## Where we are

- **Phase: P1 — Data layer**, branch `phase/P1-data-layer` (open, unpushed work may exist —
  check `git log origin/phase/P1-data-layer..HEAD`).
- P0 merged as PR #1. Repo is **public** (github.com/IKala4I/magister_work), MIT-licensed.
- Working mode is **autonomous** — read CLAUDE.md "Working mode" for stop conditions and the
  decision rule before doing anything.

## Completed so far (beyond P0)

- `specs/07_engine_internals_and_schema.md` **approved** → read-only truth (schema §4, rewards
  §3.4, API §5, Appendix A parameters).
- Spec-integrity audit: `docs/thesis/spec-conflicts.md` (errata layer — H1 ε-symmetric-arms is
  the one OPEN owner decision, due at OSF pre-registration; H2 PAR≠rewards and H3
  ambiguous≠0.0 are normative rules with tests due in P7).
- `docs/thesis/thesis-corrections.md` — 10 entries from the full draft.docx read.
- `docs/thesis/pojasnennia.uk.md` — Ukrainian explainer v1; **update in the same commit as any
  work it describes** (owner reads this, not ADRs).
- Appendix A params modules landed: `services/recsys/.../params.py`,
  `training/.../params.py`, `packages/shared/src/params.ts` (+ spec-value tests).
- TypeScript pinned **5.9.3** (ADR-0004: openapi-typescript peer `^5.x`); jest 29.7
  (ADR-0003); Node 24 (ADR-0001); pnpm hoisted (ADR-0002).

## Exact next actions (P1)

1. ⛔ PENDING ACTION REQUIRED: owner must run `supabase login` (and possibly
   `supabase link --project-ref <ref>`; the ref is derivable from EXPO_PUBLIC_SUPABASE_URL in
   `.env` — never print it). Verify with `supabase projects list` / `supabase db push --dry-run`.
2. Write migrations from specs/07 §4: `0001_base` (all tables + RLS + triggers for
   server_seq/updated_at), `0002_m01_propensity`, `0003_m02_displacement` — three separate
   `feat(db)` commits per the convention (M-01/M-02 greppable in summaries).
3. `supabase db push` to the linked EU (Ireland) project; paste output as evidence.
4. RLS bypass test: two users via anon-key sign-in, assert cross-user reads return zero rows
   (deno test or SQL-level; runnable in CI later against local supabase).
5. Type generation: `supabase gen types typescript` → `packages/shared/src/database.ts`
   (own `chore(db)` commit); wire the CI contract-sync diff job.
6. Confirm + document PostHog EU instance (decision 7) in docs/versions.md or privacy docs.
7. DoD: requirement table (NFR-S1, NFR-S2, M-01, M-02, FR-42-groundwork), adversarial pass in
   fresh subagent, gates, traceability, CHANGELOG, explainer status table, this file.

## Gotchas

- `.env` = EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY only; never print/commit.
- `docs/thesis/draft.docx` is a **local-only consistency target**: it exists only in the
  owner's working tree, git-ignored on purpose (public repo). A fresh clone will NOT have it —
  that is expected, not a missing file; never commit it, never conclude it must be restored.
- Prettier reformats markdown tables on `pnpm format` — run it before committing docs.
- specs/ is byte-frozen incl. 07; corrections go to spec-conflicts.md, never into specs files.
- Statuses in schema are text+CHECK (not enums) so M-02 can extend them — keep it that way.
- supabase CLI not yet installed at last update (`brew install supabase/tap/supabase`).
- Commit trailers: `Refs:` (requirement IDs; optional for chore/ci/docs), `Phase: P1`,
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Open questions (owner)

- spec-conflicts **H1**: ε-randomized slot in BOTH study arms (restores blinding, gives
  baseline propensities) — needs owner sign-off at OSF pre-registration freeze, not before P11.
