# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-27 (evening), **P7 closed** (PR #8) + **P7.1 RecSys hosting on the Oracle
> VM** (PR #9 — `phase/P7-hosting`; ADR-0009 accepted; box hardened + verified; **ADR-0011**
> cross-border transfers proposed for the owner). Next: the owner steps **one at a time** (below),
> the three measurements + the live `/feedback` check, then **P8 — Sync.**
> Standing rules live in CLAUDE.md: "Working mode", "Context efficiency", "Simulator evidence"
> (also applied to service timing and to the edge functions: Node-on-a-Mac → hosted function is
> not a handset), and invariant 16 (never run expo / package-manager commands from the root).

## Where we are

- **P0–P7 merged** (PRs #1–#8). **P7.1 = PR #9** (CI green; merged by the session once the
  gates passed — if you read this on `main`, it is in).
- **P7 — Feedback loop: COMPLETE, minus anything that needs a live RecSys service.** Server:
  migration `20260827150000_p7_feedback` (pg_net, `duration_estimates`,
  `feedback_rewards.delivered_at/source`, `attribution_due(p_now)` — the 23:55-local boundary in
  SQL, pgTAP-tested across DST —, `attribution_sweep_tick()` on pg_cron every 15 min, Vault-held
  URL/key, no-op until set). Edge function **`attribute-rewards`**: pure facts→tuples mapping
  (`_shared/rewards.ts`, rows 1–9, M-02 exclusion, 7-day corrections), **instant** mode (user JWT
  after the client pushes facts; backend key + `user_id` for P8's sync-resolve) and **daily** mode
  (rows 4–5 over `attribution_due` + re-delivery of undelivered tuples); override target context
  from the shared grid/φ/features; UC-06 A2 duration estimator applied by `plan-request` to both
  engines (n ≥ 3). Service: blend weights learn by projected SGD (River = CI oracle), rebuild
  replays them, `blend_state` persisted; rung-2 helpers. Client: Focus tab (FR-30/31), block
  actions (Start/Done/Skip/Move…/"I did it"), lazy lapse scan on foreground, third-skip diagnostic,
  facts bridge (`src/sync/factsPush.ts`), local migration `0003_p7_feedback`. Verified: 290 jest +
  98 Deno + 135 pytest (92 %) + 32 pgTAP (CI) — `docs/verification/p7-manual-verification.md`.
  Decisions: **ADR-0010**. Adversarial pass: same file §4 — 7 MAJOR + 14 MINOR, all MAJORs fixed.
- **Hosting (ADR-0009 option A, accepted 2026-08-27):** `recsys-oracle` (Oracle Always Free A1,
  2 OCPU / 12 GB, Ubuntu 24.04 arm64, `eu-marseille-1`, public IP 84.235.238.25). **P7.1 built
  and partly deployed:** arm64 Dockerfile + `/healthz` build/arch; `services/recsys/deploy/`
  (compose `cpus: 2`, Caddyfile, `.env.example`, `hourwell-rollout` + systemd timers, `harden.sh`
  / `install.sh` / `verify.sh`); `deploy-recsys.yml` = build on `ubuntu-24.04-arm` → CP-SAT solve
  inside the image → push GHCR → confirm the VM's pull-based rollout (skipped until
  `vars.RECSYS_HOST`); `docs/runbooks/oracle-vm.md`; privacy README (processors, VM section, gaps
  G1–G6). **Done on the box (2026-08-27 evening, from the owner IP 193.0.218.70):** deploy bundle
  copied; `harden.sh apply` → fresh-connection SSH re-check → `persist`; sshd effective
  `PermitRootLogin no` / `PasswordAuthentication no` / `AllowUsers ubuntu` / `MaxAuthTries 3`;
  iptables 22 only from 193.0.218.70/32, persisted to `rules.v4`; security updates applied (no
  reboot required); `install.sh` first run created `~/hourwell/.env` with `HOURWELL_SERVICE_KEY`
  filled (never printed). `verify.sh 193.0.218.70` → every check OK except the four app checks
  that need DuckDNS + `DATABASE_URL` + the second `install.sh` run.
- **ADR-0011 (proposed, owner decision, claim-level):** cross-border data flows path by path —
  who the participants are decides the regime (EDPB 05/2021 Example 10 vs 6), what actually
  moves on each of ten paths (today: nothing — only the researcher's test accounts exist; CI has
  no hosted-project secret), lawful bases (no adequacy for Ukraine; no Art. 46 instrument yet for
  an Art. 3(2) importer; Art. 49(1)(a) consent; anonymous aggregates), options A–D + public-release
  options. Recommended default **A**: analysis + training on the EU VM, participant data never on
  CI, aggregates only to the researcher, consent-form clause. Owner questions: population, Art.
  27 representative, consent clause, rMEQ note. Privacy README G2–G6; thesis-corrections
  #34–36; spec-conflicts H5.
- **Owner decisions recorded 2026-08-27:** PAYG deferred until before enrollment (keep-busy
  stays on — ADR-0009 §7); the transfer analysis is not deferred to P11 (this ADR).
- **2026-08-28 — SSH access model reworked (PR #10, `phase/P7-hosting-ssh`) + ADR-0011
  accepted.** Runbook §0 (what is address-bound: only port 22; two browser-editable locks —
  Security List + instance tag `ssh-allow` synced by `hourwell-ssh-allow.timer` into the
  `HOURWELL-SSH` chain), §4 (`harden.sh apply <IP list>`, console-only password, optional OCI
  CLI one-liners `deploy/ssh-allow.sh`), §5 (lockout recovery ladder A–D). On the box:
  applied from 193.0.218.70, fresh-connection re-check OK, console password set
  (`~/.hourwell/console-password` — owner copies it to the password manager), `rules.v4` now
  host-only, GRUB menu 3 s on serial, `verify.sh` green except the app checks that wait for
  `DATABASE_URL` + install and the INFO that the tag is not yet set. ADR-0011 decisions and
  their doc trail: CHANGELOG "P7.1b".

## ⛔ ACTION REQUIRED (owner) — one step at a time; the session verifies each before the next

Owner IP as seen from the Mac on 2026-08-28: `193.0.218.70` (`curl -s https://api.ipify.org`).
Both SSH locks (runbook §0) must contain it; the host lock already does (applied by the session).

1. ~~DuckDNS~~ — **done 2026-08-28**, `hourwell-recsys.duckdns.org → 84.235.238.25` verified.
2. **Lock 1 + lock 2 in the OCI Console** (runbook §4.1–4.2):
   (a) Networking → Virtual cloud networks → `recsys-vcn` → Security Lists → Default Security
   List → Ingress Rules → edit the port-22 rule whose source is `0.0.0.0/0` → Source CIDR
   `193.0.218.70/32` → Save (no other rule for 22; 80/443 stay `0.0.0.0/0`).
   (b) Compute → Instances → `recsys-oracle` → **Tags** → Add tags → freeform key `ssh-allow`,
   value `193.0.218.70/32` → Add.
   _Session check:_ `ssh oracle-recsys true`; `sudo hourwell-ssh-allow status` shows
   `tag ssh-allow = 193.0.218.70/32` and `source=tag` in the state file within a minute;
   `journalctl -u hourwell-ssh-allow` shows the sync.
3. **Serial console test + password manager** (runbook §4.3, §5 B): copy
   `~/.hourwell/console-password` into the password manager; Console → the instance → Console
   connection → **Launch Cloud Shell connection** → Enter until `recsys-oracle login:` → `ubuntu`
   - that password → `exit` → close the connection. _Session check:_
     `journalctl _COMM=login` shows a `ttyAMA0` login; the console password check in `verify.sh`.
4. **`DATABASE_URL` on the box** — Supabase dashboard → Connect → Transaction pooler (6543) →
   copy the DSN with the DB password (URL-encode special characters) → `ssh oracle-recsys 'nano
~/hourwell/.env'` → replace the `DATABASE_URL=` line. Never paste it into chat. _Session then
   runs:_ `install.sh` (second run: timers + pull + up), `verify.sh` → `ALL OK`, `curl
https://hourwell-recsys.duckdns.org/healthz` → `storage: postgres`, `arch: aarch64`, `build:

<main sha>`; then `gh variable set RECSYS_HOST` (the GHCR package is already public — anonymous
   manifest pull verified).
5. **`supabase login`** — type `! supabase login` in the prompt (browser flow). _Session then
   runs:_ `supabase secrets set HOURWELL_SERVICE_KEY=<from ~/.hourwell> RECSYS_URL=https://hourwell-recsys.duckdns.org`
   (values piped, not printed) and checks `supabase secrets list`.
6. **Vault SQL** — Supabase SQL editor → paste `~/.hourwell/vault-secrets.sql` (all three secrets
   filled) → run. _Session check:_ `select public.attribution_sweep_tick();` → `posted`, and
   `net._http_response` shows a 2xx.
7. **Then the session does the measurements** (runbook §9): live learned-path smoke (`reason =
learned`), warm NFR-P1 p95, `bench_solve.py` inside the pinned container, live `/feedback`
   delivery (`delivered_at` null count → 0) → recorded in `p6-manual-verification.md` §3,
   `p5-manual-verification.md` §2, device-checklist "Service environment". Then P8.

**Optional, any time:** OCI CLI for one-line lock edits (runbook §4.4: `brew install oci-cli`,
`oci setup config`, API key upload; then `deploy/ssh-allow.sh init`).

**Owner decisions recorded 2026-08-28:** ADR-0011 accepted (option A; population Ukraine with
EU residents possible; Art. 27 conditional; synthetic + restricted release; path-4 rule = privacy
README §7); PAYG deferred to before enrollment. Later gates unchanged: Google OAuth consent
screen (FR-01), magic-link E2E with a real mailbox, Sentry slugs (P12), OSF-freeze text items
(thesis-corrections #21, #8/#22, #17, #23–36).

## Resume point for the next session

1. `git status` clean on `main` after PR #10 (P7.1b) — or on `phase/P7-hosting-ssh` if the merge
   did not happen (`gh pr checks 10`, merge with a merge commit like the earlier PRs).
2. Ask the owner for the next unchecked ⛔ step, verify it as listed, continue down the list;
   `verify.sh 193.0.218.70` after step 4 must print `ALL OK`.
3. After ⛔ 6: the measurements (⛔ 7), then a docs commit on a small branch (measurements are
   docs-only), then P8 (its reading list is below; add ADR-0011 §Decision + privacy README §7
   for the consent clause, the region pin and the "EU/EEA resident?" enrollment field).

## What P8 needs to read (exact sections — read nothing else to orient)

- `PLAN.md` §3 "P8 — Sync" (scope + acceptance) and decision row 5 (GCal in P8).
- `specs/05_sequence_diagrams.md` §2 (push-then-pull, three conflict classes, `sync-resolve`
  domain rule "facts beat plans", `displaced_pending` → `completed` + `conflict_flag`, the 409
  field-level merge) and File 03 §1.2 / File 05 §1 for the outbox contract.
- `specs/07_engine_internals_and_schema.md` §4.1 `events`/`recommendations`/`calendar_events`/
  `gcal_sync_state`, §4.3 M-02, §5 (sync endpoints if listed), §7 (webhook secrets).
- `docs/thesis/spec-conflicts.md` **L11** (client-writable statuses), **L19** (task-push bridge —
  P8 deletes it), **L24** (skip = `rejected` + event), **L26** (`lapse_observed` ≠ skip); H3.
- `docs/decisions/ADR-0010-p7-feedback-loop.md` §2 (facts vocabulary), §3 (instant mode is
  callable with the backend key + `user_id` — `sync-resolve` calls `processUser(deps, userId,
'instant', null)` from `supabase/functions/attribute-rewards/handler.ts` after replaying ops),
  §8 (delivery marker), §12 (which local statuses are fact-derived and never pushed as status ops;
  `accepted` IS pushed as a `recommendation_status` op).
- `docs/decisions/revisit.md` — P8 lines: task-push bridge removal, facts-bridge removal
  (`src/sync/factsPush.ts`, `src/sync/taskPush.ts`), cursor-wipe confirm, transactional persist
  RPC for plans (ADR-0008 §4 → one `security definer` RPC).
- `apps/mobile/src/db/writes.ts` (`OP_TYPES`, `enqueueOp`, `appendEvent`; op payloads are
  server-shaped), `src/db/schema.ts` (`opOutbox`, local-only tables `focus_sessions` and
  `tasks.skip_streak` — never in payloads), `src/sync/cursor.ts` (MMKV cursor),
  `src/sync/planTypes.ts` (to be replaced by generated sync types).
- `supabase/functions/plan-request/context.ts` (reads that a pull must keep consistent),
  `supabase/functions/_shared/types.ts`.

## New in P7 that later phases build on

- **`supabase/functions/attribute-rewards/`** — `handler.ts` exports `processUser` (P8 calls it
  from sync-resolve), `db.ts` (`makeDbDeps(admin)` — reuse the adapters), `feedback.ts`
  (`postFeedback`), `override.ts` (`targetContext`). `_shared/rewards.ts` is the mapping and the
  payload contract (documented at the top). Add new fact types there AND in
  `apps/mobile/src/db/writes.ts` `CLIENT_EVENT_TYPES`.
- **Migration helpers:** `public.attribution_due(p_now, p_limit)` (service-only),
  `public.attribution_sweep_tick()`; the cron job name is `attribute-rewards-sweep`.
- **Client:** `src/db/feedback.ts` (all fact writes; `applyServerRecommendations` for mirrored
  server rows), `src/domain/blockActions.ts` (UI layer → DAO + analytics + facts push),
  `src/sync/factsPush.ts` + `src/sync/useLapseScan.ts` (both replaced/absorbed by P8's sync
  engine — the lapse scan itself stays), `src/ui/plan/{BlockActions,MovePicker,SkipDiagnosticCard}.tsx`.
- **Params:** `PAR_GRACE_MINUTES`, `PAR_MIN_FRACTION`, `REWARD_*`, `CORRECTION_WINDOW_DAYS`,
  `DURATION_*` exist on both TS sides and are pinned by `params_test.ts`; `params.py` has
  `DURATION_EWMA_ALPHA`, `RUNG2_*`.

## New in P6 that later phases build on

- **Edge-function toolchain:** `supabase/functions/deno.json` (imports, tasks), `deno.lock`;
  root ESLint/Prettier ignore `supabase/functions/**` — `deno fmt` / `deno lint` own it (CI job
  `edge`). Deploy: `supabase functions deploy <name>` from the repo root (API bundling, no
  Docker). Secrets: `supabase secrets set KEY=value`. Config per function in `config.toml`
  (`import_map = "./functions/deno.json"`).
- **Shared Deno modules** (`_shared/`): `grid.ts`, `contexts.ts`, `features.ts`, `energy.ts`,
  `exploration.ts`, `heuristic.ts`, `rng.ts`, `params.ts`, `types.ts` — P7's `attribute-rewards`
  and P8's `sync-resolve` reuse `types.ts`/`params.ts`; **regenerate the parity fixture**
  (`cd services/recsys && uv run python scripts/gen_grid_parity.py`) after ANY change to
  grid/φ/eligibility on either side, and add new Appendix A constants to `params.ts` +
  `params_test.ts`.
- **Client plan flow:** `src/sync/planRequest.ts` (`requestPlan`, single-flight),
  `src/sync/usePlanTrigger.ts`, `src/db/plans.ts` (`applyPlanResponse`, `latestPlanQuery`,
  `planRecommendationsQuery`, `unplacedOf`, `isFallbackPlan`), `src/sync/taskPush.ts` (bridge —
  P8 deletes it), `src/sync/planTypes.ts` (hand-written EF wire types — P8's generated sync
  types replace it). `CLIENT_EVENT_TYPES` now includes `recommendation_shown`.
- **DB:** `plans_user_generated_idx`; `plans.telemetry` key contract in the migration comment;
  `recommendations.propensity double precision`.
- **Measurement scripts:** `services/recsys/scripts/experiment_rate.py` (eligibility rate),
  `docs/verification/p6-live-smoke.mjs` (E2E + timings; plans TOMORROW so late-day runs still
  place blocks).

## Gotchas (carry forward; earlier lists still apply)

- The shell `cd` persists between tool calls — use absolute paths; never run expo / pnpm add /
  npx installers from the root.
- **Prettier reformats `.mjs` and `.md`** — apply text patches AFTER `pnpm format`, or edits
  silently miss (bit P6 twice).
- `supabase db push` needs `--yes` non-interactively; the base schema already has
  `plans_user_date_idx` and `recommendations_*` indexes — check before adding.
- PostgREST bulk inserts null-fill missing keys across rows — send every column.
- `recommendations_status_guard` fires only when `status` changes (`WHEN new IS DISTINCT FROM
old`): setting the same status is a silent no-op, not an error.
- The smoke plans TOMORROW: a plan for today late in the evening legitimately places nothing.
- Before 06:00 the app never auto-requests (yesterday's plan stays); manual requests always plan
  the current calendar day (`requestPlanDayOf`), the display uses `planDayOf` as a fallback.
- The EF's rate-limit count and supersede snapshot are read-then-act: only the client's
  single-flight guard keeps concurrent requests apart (ADR-0008 §4; RPC persist is a P8 item).
- The arm-A feature snapshot is evaluated at the bucket's representative tick k\* (as the
  service does) — never "at the placed tick"; the parity fixture pins it, regenerate on change.
- No Docker on the dev Mac: pgTAP and the PostgresRepo tests run in CI's db job only.
- Deno tests need `--allow-read --allow-env --allow-net` (`deno task test` adds read/env; the
  service tests bind a local port → `--allow-net`).
- **`deno lint` prints its errors BEFORE the final "Checked N files" line** — never judge it by
  `tail -1` (P6 shipped unused imports to CI that way). Read the full output, or grep `error\[`.
- Text patches must be applied AFTER formatting (Prettier for md/mjs/ts, `deno fmt` for the Deno
  tree) — a patch whose anchor no longer matches silently does nothing; verify with grep.
- **RNTL 14 / universal renderer:** `render` and post-press re-renders are async — assert after
  `await act(async () => { fireEvent.press(…) })` (Inbox pattern). `findBy*`/`waitFor` HUNG the
  suite in P7 (jest never returned; had to be killed). jest-expo 57.0.5 also enforces that a
  `jest.mock` factory may only reference `mock`-prefixed variables — and the factory runs when
  the module is first required, so return lazy wrappers (`(...a) => mockX.fn(...a)`), never the
  object itself.
- The Expo SDK line drifts in patch versions between phases (`expo-doctor` fails the version
  check): run `npx expo install --fix` **from apps/mobile**, then check the "overridden
  dependencies" check — a transitive `@expo/metro-runtime` had to be pinned directly.
- **Session process context can lose the Mach bootstrap** (2026-08-27, after a `/login` in the
  running session): `launchctl managername` → "Could not get manager name", `getpwuid(501)`
  fails, `scutil --dns` empty, keychain unreachable, system resolver dead — while `dig` (reads
  `/etc/resolv.conf` itself) and `ping 1.1.1.1` work. So the Mac is fine; the session is not.
  `ssh`, `git push`/`gh`, `supabase`, `curl` are all unusable from it; jest/deno/pytest/uv (with
  `--no-sync`) work. It does NOT come back on its own — **restart the CLI session from a
  terminal** and resume ("Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue"). A
  restarted session runs every scp/ssh/push/PR step itself; console/browser steps stay the owner's.
- **Remote deploy is pull-based**: CI never touches the box; if `/healthz.build` lags `main`,
  look at `journalctl -u hourwell-rollout` on the VM (image pull denied = package not public).
- **Cron health:** pg_net never surfaces HTTP failures — check
  `select id, status_code, left(content, 120), created from net._http_response order by created desc limit 5;`
  in the SQL editor when the sweep seems silent; a 401 there means the Vault secrets are wrong.
- `attribution_sweep_tick()` reads Vault inside an exception block — if it ever returns
  `skipped: vault unavailable` on the hosted project, the `supabase_vault` extension or the
  function owner's privileges changed.
- The `feedback_rewards` unique key is `(recommendation_id, kind)` — a second `block_moved` for
  the same row is intentionally NOT a second pair (ADR-0010 §6); do not "fix" that in P8.
- `docs/decisions/revisit.md` has 13 open entries (2 from P4, 2 from P5, 4 from P6) — surface them
  in the phases named (P8: task-push + facts bridge removal, cursor wipe confirm, transactional persist RPC; P9: second-move semantics, drag; P11: λ_f retune with real q̂ scales, duration-scaling report; P12: key rotation).

## Open questions (owner)

- **P7.1 owner steps ⛔ 1–7** gate the live learned path, the warm NFR-P1 p95, the container
  timing, the live `/feedback` delivery and the cron tick end-to-end. Not blocking P8's code.
- **DPIA G2/G3** (transfers to Ukraine / US runners) — decision before P11.
- OSF-freeze text items are listed under ⛔ 13.
