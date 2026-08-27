# CLAUDE.md — Hourwell project memory

## Identity

- **Public name: Hourwell** ("The planner that learns your best hours"). Internal codename in
  `specs/`: **Kairos**. Mapping: `docs/naming.md`. Use Hourwell in app config, bundle ids
  (`com.hourwell.app`), UI strings, store metadata, service names. `specs/` is **read-only**.
- Source of truth for scope/math/schema/UX: `specs/01–06`. `PLAN.md` maps phases → requirement
  IDs. Requirement IDs (FR-xx, NFR-xx, UC-xx, M-01/M-02) appear in commits (`Refs:`),
  `docs/traceability.md`, and test names.

## Stack (pin exact versions in docs/versions.md with verification dates)

- **Mobile** `apps/mobile/`: Expo SDK 54+ (New Arch, Hermes), TypeScript strict, Expo Router,
  Expo SQLite + Drizzle (single reactive source of truth, `useLiveQuery`), op outbox in SQLite,
  MMKV (sync cursor, flags), Zustand (ephemeral UI only), Reanimated 4 + Gesture Handler,
  FlashList v2, react-native-skia, chrono-node, expo-notifications, supabase-js v2
  (session in expo-secure-store).
- **Backend** `supabase/`: Postgres 16 + RLS everywhere, Auth (magic link, Google OAuth,
  anonymous), Edge Functions (Deno/TS): `plan-request`, `attribute-rewards`, `sync-resolve`,
  `gcal-webhook`; pg_cron. EU region.
- **RecSys** `services/recsys/`: FastAPI + Pydantic v2, Python 3.12, uv; OR-Tools CP-SAT,
  NumPy-owned LinUCB/TS (MABWiser = CI test oracle only), River, decayed Beta cells. Deployed on
  HF Spaces free CPU (Docker).
- **Training** `training/`: GitHub Actions nightly; `implicit` ALS, k-means clusters, empirical-
  Bayes prior refresh, eval gate, HF Hub model registry; OPE harness (replay/IPS/SNIPS/DR + ESS).
- **Shared types** `packages/shared/`: generated `database.ts` (supabase gen types) + `api.ts`
  (openapi-typescript). CI fails if regenerated ≠ committed. Generated artifacts commit
  separately as `chore(db):` / `chore(repo):`.

## Commands (canonical as of P0)

- TS (repo root): `pnpm typecheck` · `pnpm lint` · `pnpm format:check` (fix: `pnpm format`) ·
  `pnpm test` · `npx expo-doctor` in `apps/mobile`.
- Python (in `services/recsys/` and `training/`): `uv sync` once, then `uv run ruff check .` ·
  `uv run mypy src tests` · `uv run pytest`.
- Node 24.13.1 (`.nvmrc`), pnpm 10 (`packageManager`), Python 3.12 via uv (`.python-version`).
- All gates must be green **before every commit**, not just at phase end.

## Invariants (violating any of these is a bug, not a style choice)

1. **The client never computes rewards or touches model state.** It is a fact logger and renderer.
2. **Facts beat plans.** A logged completion outranks any displacement/plan-side state.
3. **Ambiguous rewards are flagged and EXCLUDED from bandit updates — never guessed.**
4. **External calendar displacement emits NO reward.**
5. **Priors never overwrite evidence.** Cluster switches refresh unvisited cells only.
6. **Corrections trigger a full state rebuild from stored reward tuples — never a rank-one
   downdate.**
7. **Lapse detection is lazy** (foreground scan + 23:55 attribution authority). No correctness
   may depend on background execution.
8. `events` are append-only. Op outbox: client-monotonic `op_id`, idempotent replay,
   `base_version` checks. Sync is push-then-pull; cursor lives in MMKV.
9. **Exploration propensity is exact** on the randomized slice (p = ε/m), logged on the
   recommendation row (M-01); experiment blocks are labeled in the UI (FR-22).
10. **RLS on every table; no service-role key ever in the client bundle or OTA update** (NFR-S1).
11. **Free tier only.** Any cost-incurring choice needs explicit approval first.
12. **Cross-user training sees only pseudonymized categorical features — never raw task text**
    (NFR-S3).
13. Rejected-with-reasons libraries stay out: **WatermelonDB, TanStack Query** (File 03 §2.1).
14. UI semantics: **confidence = solidity**; skip is never red; no guilt UI; destructive actions
    undoable 6 s; reduced motion + 200% font scale must not break layout.
15. `.env` is read-only context: never print, log, or commit its contents.

## Working mode (owner directive, 2026-08-24)

- **Autonomous phases.** Phases run back-to-back without owner approval. Post the phase
  report, open AND merge the phase PR yourself once gates are green, continue. **Stop only
  for:** (1) ⛔ ACTION REQUIRED (logins, OAuth screens, HF Space, EAS, dev accounts);
  (2) anything published or irreversible (dataset archive, store submission, public release);
  (3) findings that change what the thesis _claims_ (not how it's built); (4) contradictions
  of an explicit owner decision.
- **The owner does NOT referee technical matters** (versions, libraries, algorithm details,
  parameter values, reward shaping, estimators) — decide and proceed. Decision rule, in
  priority order: (1) thesis defensibility — prefer the standard citable method from the
  literature the specs cite; if inventing, say so and justify; (2) internal consistency with
  specs/01–07; (3) measurability under the File 06 protocol (exact propensities, PAR
  interpretability, reportable parameters); (4) engineering pragmatics last.
- **Definition of Done does not relax under autonomy.** Adversarial review runs in a
  **fresh-context subagent** where tooling allows.
- **`docs/thesis/pojasnennia.uk.md`** (Ukrainian explainer for the owner) is updated **in the
  same commit** as the work it describes; a phase is not done if it no longer matches the
  code — this check is part of the adversarial pass.
- **`docs/thesis/draft.docx`** is a consistency target, NOT a spec, and is git-ignored (never
  publish the owner's thesis draft from this public repo). When a decision contradicts the
  draft, keep the better choice and append one line to `docs/thesis/thesis-corrections.md`
  ("draft §X says A, system does B, change text because …").
- **`docs/thesis/spec-conflicts.md`** is the errata layer over frozen specs/ — check it before
  implementing anything a spec file describes.
- **Handoffs.** Keep PLAN statuses, CHANGELOG, traceability, ADRs, and the explainer current
  as you go. At every phase boundary refresh `docs/HANDOFF.md` (phase+status, completed, exact
  next actions, open questions, gotchas, pending ACTION-REQUIRED items) for a zero-context
  session, and end the turn with `HANDOFF WRITTEN — safe to /clear`. On mid-phase context
  pressure: stop at the nearest clean commit, write the handoff, say so. Resume line is:
  "Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."

## Context efficiency (owner directive, 2026-08-26)

Quality stays where it is; what changes is how much we re-read.

1. **Read narrowly.** Before a phase, consult only the spec sections that phase actually needs —
   never re-read all of `specs/` to orient. At the end of every phase, HANDOFF.md must list the
   exact files and sections the next phase requires, so a fresh session reads addressably.
2. **Adversarial review runs in a real subagent** with its own context window; its transcript
   never lands in the main session — only the findings come back.
3. **Verbose output stays out of the conversation.** Pipe build logs, full test output, and CI
   dumps to files; paste only the summary line plus counts. Evidence stays linkable, not inlined.
4. **Split `docs/traceability.md` per phase** once reading it is a cost.
5. **Findings vs. second-guessing.** Concrete evidence that a settled decision is wrong (a bug, a
   spec contradiction, a measurement that doesn't hold) → raise it: if it blocks further work,
   stop and tell the owner; otherwise log one line in `docs/decisions/revisit.md` and surface it
   in the phase report. Never re-litigate a decided question on argument alone — the reasoning
   was already weighed in the ADR.
6. **One session per phase.** After each merged phase PR: refresh HANDOFF.md, end the turn with
   `HANDOFF WRITTEN — safe to /clear`, and let the owner clear before the next phase starts.
7. **Flag verification depth, not model choice** (owner directive, 2026-08-27). Every remaining
   phase runs on the same model, one phase per session — never recommend a cheaper model. Still
   say in the report whether a phase (or slice) is thesis-critical or routine: thesis-critical work
   gets the full adversarial pass and measured evidence; routine work still meets the Definition
   of Done but needs no extra depth beyond it.

## Simulator evidence (owner directive, 2026-08-26)

- **Simulator runs are a smoke check, not evidence about real devices.** Two distinct
  distortions: performance is systematically flattered (an M-series Mac is nothing like a
  mid-range 2022 handset — thesis-corrections item 11), and behaviour is under-tested
  (gestures, haptics, VoiceOver/TalkBack, real keyboards, genuine network loss, iOS
  background restrictions). Android has never run on hardware at all.
- **Never report a simulator measurement as satisfying a device-conditioned requirement.**
  Say what ran, on what, and what it does and doesn't establish (the NFR-P2 write-up is the
  model).
- Maintain **`docs/verification/device-checklist.md`** — the running list of everything that
  must be re-verified on real hardware (one iPhone, one Android) before release. Add entries
  **during every phase, not retroactively**: each names the requirement, what to do, and why
  the simulator can't settle it.
- A dedicated **owner-run hardware verification pass before P12** is where device-conditioned
  requirements flip to ✅. Until then they are at best "verified on simulator; device pending".
  P10's performance/a11y work is scoped as "prepare for device verification", not "done".

## Conventions

- **Commits:** Conventional Commits with `Refs:` (requirement IDs) + `Phase:` trailers;
  `Broke-in:` on fixes when known. Types: feat|fix|refactor|perf|test|docs|chore|build|ci|revert.
  Scopes: mobile, ui, db, edge, recsys, solver, bandit, priors, sync, calendar, notifications,
  training, ope, ci, docs, repo, shared. One logical change per commit; every commit green
  (bisect-friendly); migrations and generated types get their own commits. `Refs:` may be omitted
  only on chore/ci/docs.
- **Branches:** `phase/Pn-<name>`; PR title `Pn — <phase name>`; PR body lists requirement IDs +
  pasted gate output. CHANGELOG.md updated at each phase gate.
- **Definition of Done** (per feature): spec re-read → requirement checklist table (ID → file:line
  → test → PASS) → tests (≥70% domain coverage, NFR-M1; dedicated math tests) → adversarial pass
  (offline/DST/cold-backend/dup-op/RLS-bypass/200%-font/reduced-motion…) → gates green with pasted
  output → traceability rows → manual verification script.
- **Ambiguity:** spec silent/contradictory on an architecture-level decision → STOP, ask (batched,
  ≤5 questions, each with a recommended default), then record `docs/decisions/` ADR.
- **Human actions** (logins, dashboards, OAuth screens, paid anything): stop and print the
  ⛔ ACTION REQUIRED block; never fake or work around credentials.
- **APIs:** never invent. Verify against real docs (ctx7 CLI per user rules) and pin in
  `docs/versions.md` with the verification date.
