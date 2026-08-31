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
`| tee` masking the seed crash (pipefail added). Round 2: ⬜ recorded here when green.

## §3 Live verification after the migration push (owner + session)

1. ⛔ **Owner:** `supabase db push` (applies `20260831120000_p11_training`).
2. Session: `node docs/verification/p11-live-smoke.mjs` — objects present, v0 promoted,
   enroll/diagnose round trip on a disposable test user, gate behaviour live (§3.1).
3. ⛔ **Owner (VM):** add `SUPABASE_SERVICE_ROLE_KEY` + `ARCHIVE_SALT` to
   `~/hourwell/.env`; `git pull` the deploy dir → `bash ~/hourwell/deploy/install.sh`;
   then `journalctl -u hourwell-train -n 20` after 03:00 UTC or run the container once
   (runbook §10). Flip the three device-checklist "Service environment" items.
4. Types: `supabase gen types typescript --linked` → byte-identical to committed
   `database.ts` (after normalization).

## §4 Adversarial pass

⬜ Fresh-context subagent review — findings and dispositions recorded here.
