# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-31 (night), **P11 FULLY CLOSED AND ACTIVATED (PRs #21–#28).**
> Server surface live-verified (smoke 21/21, pgTAP 26/26 live, key audit runbook §11,
> sweep tick 200). VM activated: keys on the box, `hourwell-train.timer` armed (next fire
> 2026-09-01 00:36 UTC), the nightly proven end-to-end by manual runs — a three-run saga
> that peeled two real latent defects (pooler prepared statements → shared `db.connect()`,
> PR #27; pre-P6 float4 propensity → L22 symbolic recovery, PR #28) and finished clean
> with `reports/2026-08-31/report.json` uploaded to the `models` bucket (the sb_secret
> path proven). Tailscale installed + verified per §12 (key expiry disabled; temp IP
> removed; public path confirmed refusing the non-home network while the tailnet path
> stays live). **Nothing owner-blocking remains for P11. P12 — Release prep — opens
> FRESH, starting with the DPIA.** Standing rules live in CLAUDE.md: "Working mode",
> "Context efficiency", "Simulator evidence".

## Where we are

- **P0–P11 merged** (PRs #1–#21 + the smoke-close PR). Migration
  `20260831120000_p11_training.sql` **applied by the owner 2026-08-31**; the full P11
  server surface verified LIVE: smoke **21/21** (objects, promoted-version instantiation,
  the enroll round trip incl. both raise-paths, diagnose_user leak checks, cleanup),
  pgTAP **26/26** on the applied schema (rolled back), regenerated types byte-identical.
- **What P11 built** (ADR-0015; CHANGELOG "P11"): the nightly in-region training container
  (ADR-0011 option A) — NFR-S3 whitelist-as-data as the only producer of cross-user
  export/archive SQL (closed-vocab text columns CHECK-pinned in schema, client event
  vocabulary pinned to `CLIENT_EVENT_TYPES`, guarded `pg_input_is_valid` casts on
  client-writable payloads); EB prior refresh (moments + guards) behind a held-out
  log-loss gate, 240-row completeness refusal, fresh registry version per attempt;
  `instantiate_user_priors` follows the highest PROMOTED version; ALS (`implicit`, one
  confidence convention, decayed-as-of-now input) + silhouette k-means (0.05 promotion
  band) + closed-form fold-in gated ONLY on ≥30 attributed outcomes; nightly reassignment
  refreshes UNVISITED cells only (`succ = 0 and fail = 0`, prior_version untouched) from
  maturity-filtered cluster aggregates; K=32 MC propensity backfill scoring through
  `hourwell_recsys` itself (path dep, `py.typed`); OPE: replay slice-only with STRICT
  p = 1/|A_m(x)| (ε = 1 pinned), IPS/clip(10)/SNIPS/DR over slice + MC-labeled TS rows
  (`SliceRow.exact`), ESS on every estimate, recovery proven on synthetic ground truth;
  aggregate report (min cell 5): per-arm×phase PAR (facts only — H2), drop rate per arm,
  DM sensitivity, interference probe, label/scaling counts, dropped-row ledger; study
  mode: `enroll_participant` (ABAB/BABA, 4×14 d, G6 answer), blocked-randomization script,
  `docs/study/enrollment-checklist.md`; deploy: training image (arm64 + in-image ALS
  smoke), profile-gated compose service, `hourwell-train.timer` 00:30 UTC (keep-busy
  STAYS — runbook §7 corrected), rollout pulls both images; CI: `train.yml` synthetic-only
  (G3), `deploy-training.yml`.
- **Gates at the close:** typecheck/lint/format clean · jest **461** · Deno **187** ·
  pytest **149 (8 skipped)** recsys + **74** training · pgTAP **26/26** (linked, rolled
  back) + full local suite green in CI · expo-doctor 21/21 · PR #21 all 7 checks green
  incl. the synthetic e2e (round 1 caught 3 real defects — see gotchas).
- **Adversarial pass** (`p11-manual-verification.md` §4): **6 MAJOR + 13 MINOR, all 19
  fixed same day** (worst: the systemd unit passed `--nightly`, which the CLI rejected —
  the nightly deploy would have died on first invocation and CI was structurally blind to
  it). Verified solid: PAR mirror parity, invariant-5 guard incl. labels,
  exact-propensity untouchability, slice provenance, NFR-S3/G3 hygiene, all
  hand-checkable math.
- **Docs current:** ADR-0015 (amended same-day: 00:30 UTC timer, 240-row completeness),
  `p11-manual-verification.md` (§1–§4), `p11-live-smoke.mjs`, traceability (10 P11 rows),
  CHANGELOG, PLAN board + tail, device checklist ("Service environment — training
  container", 3 items), revisit (4 closed, 3 re-dated to first-real-data),
  `docs/study/enrollment-checklist.md`, privacy README (G3 implemented; §7 diagnose_user
  real), runbook §7/§8/§10, versions (P11 stack), explainer P11 section + decisions 24–28.

## Exact next actions (next session, in order)

1. ~~Migration push + live smoke~~ — **done 2026-08-31**: smoke 21/21 (after the shared
   db-query error-path fix), pgTAP 26/26 live, types byte-identical
   (`p11-manual-verification.md` §3).
2. ~~VM activation bundle~~ — **done 2026-08-31**: keys written (sb_secret format),
   `install.sh` run (deploy dir tar-synced — the Minimal image has NO rsync), timer
   armed, nightly proven manually (verification §3.5), Tailscale §12 installed +
   verified, temporary IP removed and its absence behaviorally confirmed.
3. **First scheduled nightly check** (1 min, any session): after 2026-09-01 00:36 UTC —
   `ssh ubuntu@recsys-oracle 'journalctl -u hourwell-train -n 15'` shows the JSON summary
   (expected on this cohort: priors carry-over, ALS skip, backfill 0/7-skipped) and
   `reports/2026-09-01/report.json` exists in the `models` bucket (names-only query).
4. `git checkout main && git pull`; `gh run list --branch main -L 2` green.
5. **P12 reading list** (read nothing else to orient): PLAN §3 P12; specs/02 store/release
   requirements it names; `docs/privacy/README.md` whole (DPIA input) + ADR-0011 §Decision
   (DPIA §transfers = its §2); ADR-0014 §9–§10 (retention/erasure text for the DPIA);
   `docs/verification/device-checklist.md` (the hardware pass gates P12 claims);
   `docs/thesis/thesis-corrections.md` (rollup into the draft); CHANGELOG (release-notes
   substrate); `docs/decisions/revisit.md` OSF-freeze-tagged lines.
6. **Before P12 proper:** the owner-run hardware verification pass
   (`scripts/device-pass.sh ios|android`; needs a development build — EAS or local, ⛔) and
   the pre-enrollment list below.
7. Keep `docs/thesis/pojasnennia.uk.md` in the same commits; refresh this file at the end;
   close with `HANDOFF WRITTEN — safe to /clear`.

## ⛔ ACTION REQUIRED (owner)

- ~~Push migration `20260831140000_p11_sweep_header`~~ — **done 2026-08-31**: owner pushed;
  verified live same day (`attribution_sweep_tick()` → `posted`, newest
  `net._http_response` = 200 under the apikey-only shape).
- ~~The home-session VM bundle~~ — **done 2026-08-31** (keys, install.sh, Tailscale §12,
  temp-IP removal verified). P11 has NO remaining activation steps.
- **Consent clause review** — `docs/privacy/consent-clause.md` (contact block to fill).
- **Google OAuth sign-in (FR-01, P4 leftover):** second Web OAuth client, id+secret into
  Dashboard → Auth → Providers → Google; then the P4 smoke.
- Earlier gates unchanged: magic-link E2E with a real mailbox; OSF-freeze text items
  (spec-conflicts H1 conditions, power recompute per ADR-0008/M9, corrections #34–36).
- **Pre-enrollment list:** G6 representative decision path if any EU/EEA participant;
  Oracle PAYG revisit (G1); Google consent screen Testing → In production; the hardware
  pass (scripted, needs a dev build); if an EU/EEA resident may enroll — designate the
  Art. 27 representative FIRST (enrollment-checklist blocks otherwise).

## Key-format audit (2026-08-31)

**Runbook §11 holds the full table** (who uses which Supabase key, which formats each path
accepts, how each cell was verified, what is configured live). Headline: repo `.env` and
Vault already carry NEW-generation publishable keys (since 2026-08-28 — every live
verification since ran on them); edge functions run on the platform-injected LEGACY pair
(fine until the end-2026 deprecation; switch = read the `SUPABASE_SECRET_KEYS` JSON vars,
one helper); the training uploader takes both; recsys uses no Supabase API key at all. One
latent mismatch found and fixed (the P7 sweep's Bearer header — migration above).

## Gotchas (P11 additions; earlier lists still apply)

- **The VM's Minimal Ubuntu has no rsync** — deploy-dir sync is tar-over-ssh
  (`tar -C services/recsys/deploy -czf - . | ssh … 'tar -C ~/hourwell/deploy -xzf -'`);
  a failed rsync does NOT abort a chained install (bit once: the old deploy dir ran).
- **Every training-package DB connection goes through `hourwell_training.db.connect()`**
  (prepare_threshold=None — the transaction pooler rejects psycopg auto-prepare; the
  raw-`psycopg.connect` grep in the PR #27 commit is the guard). CI cannot catch pooler
  issues: the local stack is a direct connection.
- **Pre-P6 M-01 rows store float4 propensities** (e.g. float32(1/3)) — the export adapter
  normalizes within 1e-6 to the exact 1/|A_m(x)| (L22 symbolic recovery) and counts them;
  the OPE harness itself stays strict. Never loosen the harness check instead.
- **Tailscale SSH terminates inside tailscaled** — the HOURWELL-SSH chain never sees it;
  plain sshd over the tailnet IP WOULD be dropped by the chain (intentional; §12).

- **`execFileSync` hides the CLI's error JSON**: on a raised exception `supabase db query`
  exits nonzero with the error JSON on STDOUT — a bare exec wrapper throws "Command
  failed …" and the server message is lost (two smoke raise-checks failed for the wrong
  reason). `dbQuery` now captures err.stdout/err.stderr and unwraps via
  `unwrapErrorText` — match on the server text, never on exec noise.
- **`supabase db query` error shapes keep mutating** — now
  `{"_tag":"Error","error":{"message":"unexpected status 400: {json}"}}` (TAP text TWO
  JSON layers deep with a plain-text prefix). `pgtap-linked.sh` now uses the db-query.mjs
  rule (first complete JSON value, quote-aware, recursive unwrap, cut at the TAP marker)
  - an env-gated raw tee (`PGTAP_DEBUG_OUT=<file>`). Fourth occurrence of this class —
    never parse a new shape ad hoc.
- **The φ CHECK bites fixtures:** `recommendations.context_bucket` only accepts the 14
  vocabulary ids (fresh/fatigued exists ONLY for weekday MO/AF). Round-1 CI caught five
  invented ids in P1/P7 pgTAP fixtures. NOT VALID = new rows only; the hosted project's
  historical rows are unvalidated (export re-checks values).
- **`| tee` in GitHub Actions steps swallows exit codes** (bash -e without pipefail) —
  the seed crash "passed" and the assert step failed on an empty JSON. Any piped step
  needs `set -o pipefail` first. Same trap locally: `uv run pytest | tail` returns tail's
  0 — one commit landed with a red test and needed amending.
- **Two propensity meanings, one flag:** `SliceRow.exact` — exact rows must have p equal
  1/|A_m(x)| to 1e-9 (ε=1 pinned; anything else raises), MC rows carry the day-type
  candidate set and feed ONLY the IPS family. Never widen replay to non-exact rows.
- **`implicit`'s user factors are half-step stale** (Y updates after users; CG solver):
  library-parity tests get a 2% band, exactness comes from the k=1 closed-form hand case.
- **`prior_version` on beta_cells means prior_cells versions only** — cluster refreshes
  must not stamp it (provenance = cluster_assignments + cluster_cells).
- **cwd persists across tool calls AND parallel calls interleave** — a doc edit ran
  against training/ and a sed hit a missing path. Absolute paths, always.
- **prettier is unstable on list-item continuation lines holding long inline code** —
  format → check flip-flopped until the SQL moved into a fenced block. If format:check
  fails right after `pnpm format`, suspect idempotency, not staleness.
- **`ruff --fix` may drop imports your NEXT edit needs** (it removed FOLD_IN_MIN_OUTCOMES
  right before a replace targeting the import line silently no-opped) — re-grep after
  fix+edit rounds; the missing-anchor assert pattern catches it.
- **Day-0/synthetic users:** profiles CHECK `profiles_chronotype_matches_score` — any
  seeded (score, class) pair must sit in the P4 bands (DM 22–25 … DE 4–7).

## Open questions (owner)

- Two-device ritual (unchanged from P10).
- OSF freeze bundle: H1 text conditions, the M9 power recompute, corrections #34–36
  wording, G5 dataset decision — one sitting, before enrollment.
