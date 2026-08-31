# P11 — manual verification (training pipeline + OPE + study mode)

> Phase decisions: ADR-0015. Thesis-critical slices (full adversarial + measured evidence):
> the OPE estimator family + ESS gate + slice discipline, and the NFR-S3 export whitelist.
> The rest is routine under the standard Definition of Done.

## §1 Requirement checklist

| ID / anchor                                                    | Where                                                            | Test                                                   | Status                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| NFR-S3 — explicit column whitelist, no raw text, CI-tested     | `training/src/hourwell_training/whitelist.py` + `export.py`      | `test_whitelist.py` (7) + pgTAP §2 (CHECK rule)        | ✅                                   |
| File 04 §2.2 replay = randomized slice only                    | `ope.py::replay` + `SliceRow.validate_slice`                     | `test_ope.py` refusals (6 cases)                       | ✅                                   |
| File 04 §2.3 IPS/clip/SNIPS/DR; ESS < 100 non-evidence         | `ope.py`; `report.py::ope_table` labels                          | `test_ope.py` hand-computed (7); `test_report.py`      | ✅                                   |
| File 04 §2.3 MC propensities K = 32, nightly, TS only          | `propensity.py`; `pipeline.py::_stage_mc_backfill`               | `test_propensity.py` (5); train.yml coverage assertion | ✅ code · live ⬜ (device-checklist) |
| File 04 §3.4 ALS + fold-in ≥ 30 + k-means (silhouette)         | `als.py`, `clusters.py`                                          | `test_als.py` (8: k=1 exact, parity 2 %)               | ✅                                   |
| File 04 §3.5 EB refresh → versioned priors + registry gate     | `priors.py`; migration §4                                        | `test_priors.py` (7); pgTAP §4 (inert/takes-over)      | ✅                                   |
| File 06 §1.2 ABAB/BABA blocked randomization + 4×2-week phases | migration `enroll_participant`; `scripts/randomize_sequences.py` | pgTAP §5 (BABA table, refusals); §2.3 below            | ✅                                   |
| File 06 §1.4 PAR from facts only (H2)                          | `par.py`                                                         | `test_par.py` (11, incl. AST source lock)              | ✅                                   |
| NFR-O1 registry: no promotion without an artifact              | `registry.py::record`; `pipeline.py`                             | train.yml "nothing promotes without credentials"       | ✅                                   |
| Privacy §7 aggregates only; `diagnose_user`                    | `report.py` (min cell 5); migration §6                           | `test_report.py`; pgTAP §6                             | ✅                                   |
| G3 — no participant data in CI                                 | `train.yml` (no hosted secret) + `seed.py`                       | workflow review + synthetic e2e                        | ✅                                   |
| Invariant 5 — cluster switch refreshes unvisited cells only    | `pipeline.py::_stage_als` (SQL `succ = 0 and fail = 0`)          | reviewed; exercised in train.yml e2e                   | ✅                                   |

## §2 Evidence

### 2.1 Local gates (2026-08-31)

- training: ruff clean · mypy strict clean (28 files) · **pytest 73** (whitelist 7, OPE 17,
  synthetic recovery 5, PAR 11, ALS/clusters 8, priors 7, propensity 5, report 5, params/ESS 13)
- services/recsys: ruff/mypy clean · **pytest 149 (8 skipped)** — unchanged by the `py.typed` add
- pgTAP **26/26** against the LINKED project (pending migration applied inside one
  transaction, rolled back — `scripts/pgtap-linked.sh supabase/tests/p11_training_test.sql
supabase/migrations/20260831120000_p11_training.sql`)
- TS: typecheck/lint/format:check clean (database.ts hand-authored to the generator's shape;
  CI's db job regenerates from the local stack and diffs — the binding check)

### 2.2 Estimator recovery on known ground truth (`test_synthetic.py`)

4 000 slice rows from `q_true` with exact within-slice propensities: replay lands on the
closed-form deterministic value; IPS and SNIPS land on the stochastic value; DR stays
unbiased under a deliberately wrong reward model (r̂ ≡ 0.5) and is at least as tight as IPS
under the true model. Tolerance ±0.05 > 3σ at that n. This is the substance behind
"one-command replay harness reproduces tables": `uv run pytest tests/test_synthetic.py`.

### 2.3 Blocked randomization audit trail

`uv run python scripts/randomize_sequences.py --n 8 --seed 1` →
`ABAB ABAB BABA BABA | BABA ABAB BABA ABAB` — each block of 4 carries exactly two of each
sequence; the seed is the wave's audit record (enrollment-checklist §3).

### 2.4 CI end-to-end on the synthetic cohort (train.yml)

Round 1 surfaced three real defects (fixed same day): out-of-vocabulary bucket ids in P1/P7
pgTAP fixtures (the new CHECK caught them), seed cohort outside the rMEQ CHECK bands, and
`| tee` masking the seed crash (pipefail added). Round 2 (0aac1d1): **all 7
checks green** — including the db contract sync accepting the hand-authored types and the
full seed → pipeline → assertions chain. Round 3 (49d6c5b, lint fix): green. Round 4 (the
adversarial-fix round): recorded in the PR checks at merge.

## §3 Live verification after the migration push — DONE 2026-08-31 (owner + session)

1. ✅ **Owner pushed the migration** (`supabase db push`, 2026-08-31).
2. ✅ **Live smoke `p11-live-smoke.mjs`: 21/21 ALL PASS** — first run was 19/21: the two
   "must raise" checks failed because `dbQuery` discarded stderr and `execFileSync`'s
   nonzero-exit throw hid the CLI's stdout error JSON behind a bare "Command failed" (the
   functions DID raise — the nonzero exit was on exactly those two calls, and pgTAP had
   proven the messages). Fixed in the SHARED parser (`lib/db-query.mjs`: capture
   err.stdout/err.stderr, `unwrapErrorText` descends the nested error/message layers —
   the same rule as `pgtap-linked.sh`), then 21/21. Fifth output-shape incident of this
   CLI; the lib now owns both the success and the error path.
3. ✅ **pgTAP live**: `scripts/pgtap-linked.sh supabase/tests/p11_training_test.sql`
   (no migration arg — the applied schema) → **26/26**, rolled back.
4. ✅ **Types**: `supabase gen types typescript --linked` byte-identical to the committed
   `database.ts` after `normalize-db-types.sh` on both sides.
5. ⛔ **Owner (VM), still open:** add `SUPABASE_SERVICE_ROLE_KEY` + `ARCHIVE_SALT` to
   `~/hourwell/.env`; pull the deploy dir → `bash ~/hourwell/deploy/install.sh`; then
   `journalctl -u hourwell-train -n 20` after 00:30 UTC or run the container once
   (runbook §10). Flips the three device-checklist "Service environment" items.

## §4 Adversarial pass (fresh-context subagent, 2026-08-31)

**6 MAJOR + 13 MINOR; all 19 addressed the same day** (fix commits on the PR). Verified
SOLID by the reviewer (explicit probes, no findings): PAR mirror parity branch-by-branch,
the invariant-5 SQL guard incl. labeled cells, exact-propensity untouchability + the M-01
telemetry cross-check, slice-join provenance (one experiment per plan, never chunked,
supersede semantics), NFR-S3 gates + G3 CI hygiene, EB/fold-in/OPE math, the database.ts
hand-edit.

| #       | Finding                                                                                             | Disposition                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 MAJOR | systemd passes `--nightly`, CLI rejects it — nightly deploy dead on arrival                         | fixed: CLI accepts `--nightly`; `train.yml` now exercises the flag                                                                                                            |
| 2 MAJOR | report missing PAR (the primary outcome) + 2 promised policies + DM sensitivity; `par.py` dead code | fixed: `_par_by_arm_phase` (facts+placements only, phase from assignment dates — no timezone needed), `dm_greedy` + `posterior_mean_greedy` policies, `_dm_sensitivity` block |
| 3 MAJOR | archive hashed only `user_id` — every other UUID joined the deposit back to the live DB             | fixed: every `id`/`*_id` column hashed with the same salt (cross-table joins survive)                                                                                         |
| 4 MAJOR | MC propensities had no consumer — IPS-on-all-traffic (File 04 §2.3) structurally impossible         | fixed: `SliceRow.exact` flag + `mixed_ts_rows` loader; IPS family runs on TS traffic (labeled as the acknowledged approximation), replay refuses non-exact rows               |
| 5 MAJOR | `cluster_cells` fit on immature + label-polluted cells                                              | fixed: same maturity rule as the class refresh (decayed evidence > the cell's own prior strength; a pure-label cell never clears it)                                          |
| 6 MAJOR | interference probe fit multiclass on partial-credit floats; `penalty=None` dies in sklearn 1.10     | fixed: rewards binarized at 0.5; `C=1e6` L2                                                                                                                                   |
| 7       | fold-in double-gated with contradictory semantics                                                   | fixed: one gate, the spec's (attributed outcomes, caller-supplied)                                                                                                            |
| 8       | ALS input not decayed as of now                                                                     | fixed: `cell_obs_by_user(…, now)` decays via the service's own `energy`                                                                                                       |
| 9       | unguarded DERIVED casts on client-writable payloads could brick the export forever                  | fixed: `pg_input_is_valid` guards                                                                                                                                             |
| 10      | silhouette promotion ratchet freezes clustering                                                     | fixed: 0.05 tolerance band, rationale in code                                                                                                                                 |
| 11      | raw k-means label ids compared across runs — "switch" counts meaningless                            | fixed: nightly reassignment semantics; report counts fold-ins/first-fold-ins/refreshed cells, not "switches"                                                                  |
| 12      | any p ≤ 1/m accepted; ε<1 acceptance mixed M2's two meanings                                        | fixed: strict equality p = 1/\|A_m(x)\| for exact rows (ε = 1 is pinned)                                                                                                      |
| 13      | feature snapshots not pinned to d = 17                                                              | fixed in `validate_features`                                                                                                                                                  |
| 14      | 03:00 UTC training = 06:00 Kyiv plan burst under EEST                                               | fixed: 00:30 UTC (ADR-0015 §1 amended)                                                                                                                                        |
| 15      | "whitelist is the only SQL producer" overstated                                                     | fixed: scope stated precisely (cross-user export/archive SQL); per-user backfill reads + §7 aggregates enumerated                                                             |
| 16      | cluster refresh overwrote `beta_cells.prior_version` (namespace collision)                          | fixed: prior_version untouched; provenance = cluster_assignments + cluster_cells                                                                                              |
| 17      | unpromoted registry rows overwritten nightly; NaN leaked into report.json                           | fixed: fresh registry version per attempt; NaN → null                                                                                                                         |
| 18      | repo-root build context without `.dockerignore`                                                     | fixed: allowlist-style `.dockerignore` (no `.git`, no env files, no deploy dir)                                                                                               |
| 19      | nothing guarded promoted-version completeness; ADR said "480"                                       | fixed: 240-row completeness refusal in `_stage_priors`; ADR corrected; pgTAP fixture annotated                                                                                |

**Documented residuals (not code):** the MC candidate-set sensitivity beyond the reported
propensity distribution is a study-analysis item (the File 06 §4 script varies the
candidate set against the archived logs); posterior-mean/DM policies score with
evaluation-time state — File 04 §2.3's own stated caveat, restated in the report.
