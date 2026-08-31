# ADR-0015 — P11: nightly training on the EU VM, OPE harness, study mode

- **Date:** 2026-08-31
- **Status:** accepted (autonomous, CLAUDE.md decision rule; no thesis-claim change — the
  claim-level decisions were made in ADR-0011)
- **Phase:** P11
- **Spec anchors:** File 04 §2 (OPE), §3.4–§3.5 (ALS, k-means, fold-in, EB refresh); File 06
  §1.2 (ABAB/BABA), §1.4 (PAR), §5 (artifact statement as amended by H5/ADR-0011); specs/07
  §3.2.2–§3.2.3, §4.1 (`prior_cells`, `model_registry`, `cluster_assignments`,
  `study_assignments`), §7 (NFR-S3 export whitelist), Appendix A rows "IPS clip M", "MC
  propensity K", "ESS floor", "ALS hyperparams", "k-means k"; NFR-O1; PLAN §3 P11 (amended by
  ADR-0011 option A); spec-conflicts M2, L3, L4, H2, H5; privacy README §7, G3, G6;
  ADR-0005 §6, ADR-0009, ADR-0011.

## Context

P11 builds the offline side: the nightly training pipeline, the OPE harness (RQ4), and study
mode. ADR-0011 option A fixes the constraints: participant data never leaves the EU and never
reaches CI — training and analysis run on the ADR-0009 VM; `train.yml` exercises the same
pipeline in CI on synthetic data only; artifacts live in Supabase Storage (EU). Everything
below decides _how_, inside those constraints. Thesis-critical slices (full adversarial pass +
measured evidence): the OPE estimator family + ESS gate, the slice discipline, and the NFR-S3
export whitelist. The rest is routine under the standard Definition of Done.

## Decisions

1. **Scheduling on the VM.** The training/analysis container is a **one-shot compose service**
   (`training`, `profiles: ["training"]`, `cpus: 2`, own image from GHCR) run by
   `hourwell-train.timer` **daily at 03:00 UTC** (RandomizedDelaySec 10 min). The
   **keep-busy timer stays hourly**: ADR-0009 Q2's reclamation math needs sustained CPU duty
   that a single nightly run cannot provide, so the runbook §7 forecast ("training will replace
   the synthetic load on the same timer slot") is corrected, not followed — the nightly job
   _adds_ real work; the hourly bench remains the reclaim guard. Rollout reuses the existing
   5-min `hourwell-rollout.timer` (`docker compose pull` picks up the new image; a one-shot
   profile service is never auto-started).
2. **NFR-S3 export whitelist as data + machine check.** One module
   (`hourwell_training.whitelist`) declares, per table, the exact exportable columns. Rule,
   CI-enforced against the real schema (pgTAP in the `db` job): every whitelisted column is
   numeric/boolean/date/timestamp/uuid, **or** a text column whose values are pinned by a
   named CHECK constraint in the schema (closed vocabulary), **or** one of two explicitly
   argued exceptions: `recommendations.features` / `feedback_rewards.features` (jsonb, numeric
   array by construction — specs/07 §7 — asserted element-wise by the export code) and
   `events.type` (closed in practice; free-text payload/context are NOT whitelisted). Task
   titles, calendar titles, `rationale_params`, `payload`, `context`, `telemetry` free-form
   blobs never appear. The pipeline's SQL is generated from the module — there is no second
   place to drift. Cross-user training reads only this surface (NFR-S3).
3. **ALS input = decayed cell aggregates.** The user × item matrix has items = the 48 cells
   (category × daypart × day-type). Preference `p_u,i` = 1 if the cell's decayed success rate
   ≥ 0.5 (else 0); confidence `c_u,i` = 1 + α_conf · (S+F) (Hu et al. 2008, α_conf = 40,
   Appendix A). Library: **`implicit`** (AlternatingLeastSquares, factors 32, λ = 0.1,
   Appendix A row fixed here); the arm64 wheel is verified by an in-image import + fit in the
   training-image build on the native arm runner. Rationale: `beta_cells` _are_ the
   pseudonymized behavioural aggregates — no event-level rows enter cross-user training at all,
   which is stronger than NFR-S3 requires and matches File 04 §3.5's "mature-user cell rates".
4. **Clusters.** k-means (scikit-learn) over ALS user factors; k ∈ [3, 8] by silhouette
   (Appendix A). Assignments written to `cluster_assignments` with `method = 'als_foldin'`
   only for users past the fold-in gate; rMEQ seeds stay untouched below it.
5. **Fold-in + cluster-switch refresh.** Users with **≥ 30 attributed outcomes** (File 04
   §3.4; count = non-excluded `feedback_rewards` rows of kind `outcome`) are folded in with
   the closed-form update x_u = (YᵀC_uY + λI)⁻¹ YᵀC_u p_u and reassigned to the nearest
   centroid. Per-cluster cell aggregates (EB fit over member cells, decision 6's math) are
   published to a new service-only table **`cluster_cells`** (versioned like `prior_cells`,
   keyed by cluster id). On a **cluster switch** the pipeline rewrites `alpha0/beta0` from
   `cluster_cells` **only where the user's cell is unvisited** (`succ = 0 and fail = 0` —
   labels are evidence, so a labeled cell is visited; invariant 5). No posterior is ever
   touched.
6. **Empirical-Bayes prior refresh.** Per (chronotype class, cell): method of moments over
   mature cell rates θ̂_u = (decayed S)/(S+F) of users with S+F ≥ n₀ for that cell. Guards:
   ≥ 5 contributing users per (class, cell) else the previous version's values carry over
   unchanged; s² clamped to [1e-4, 0.9·m(1−m)] so α̂₀, β̂₀ stay positive and finite; fitted n₀'
   = α̂₀+β̂₀ clamped to [2, 16] (the spec's day-zero band around 4–8) to keep "priors a
   bootstrap, not a straitjacket". Output: a **new `prior_cells` version** (full 480-row set,
   carry-over where unfitted) + a `model_registry` row `kind='priors'` with the fit metrics.
7. **Eval gate + promotion (closes the ADR-0005 §6 note).** A refreshed prior version is
   **promoted** only if its held-out mean log-loss (prior mean vs. realized cell rates on a
   20 % user hold-out) is ≤ the currently promoted version's on the same hold-out; ALS/k-means
   artifacts promote on silhouette ≥ previous. `instantiate_user_priors` now reads the
   **highest _promoted_ priors version** (join on `model_registry`, fallback to the highest
   seeded version so a fresh DB with only v0 keeps working — v0 gets a promoted registry row
   in the migration). An unpromoted refresh is inert everywhere by construction.
8. **OPE estimators** (`hourwell_training.ope`): replay (Li et al. 2011) **hard-restricted to
   the randomized slice** (`is_experiment AND propensity IS NOT NULL` and, per row,
   `A_m(x)` from `plans.telemetry.ef.experiment.top_m`; any non-slice row raises), IPS,
   clipped IPS (M = 10, Appendix A fixed here), SNIPS, DR; **ESS reported with every
   estimate**, `< 100` labeled non-evidence (never suppressed, never presented as a result).
   Policy interface: a policy maps a logged decision context to one bucket of `A_m(x)`
   (replay) or a probability over buckets (IPS family). Reference policies ship with the
   harness: logged, uniform, greedy-by-DM, posterior-mean-greedy.
9. **DR's direct method** is a logistic regression (scikit-learn, L2) on the
   **bucket-swappable feature subset**: indices 0–13 of the stored 17-dim snapshot (intercept,
   daypart one-hots, is_weekend, rel_fatigued, task value/duration/splittable/urgency/
   postpone). `cell_mean`, `cell_sd`, `preceding_load` are excluded — they depend on the
   counterfactual bucket and are not reconstructible from logs; the exclusion is a **stated
   limitation with a sensitivity check** (DM fit with and without them on the factual rows,
   coefficient shift reported). Counterfactual r̂(x, a′) swaps the bucket-derived components
   (indices 1–8) and keeps the task components — exact for 1–8 by construction of
   `feature_vector`.
10. **MC propensities for TS traffic** (File 04 §2.3, K = 32 — spec-fixed): nightly, for
    learned non-experiment rows with `propensity IS NULL`: draw K posterior samples from the
    **current** stored bandit state (acknowledged approximation, File 04 §2.3), score each
    candidate bucket with the service's own blend math (the training package depends on
    `hourwell-recsys` as a path dependency — one scoring implementation, no drift), and log
    p̂ = (wins + 1)/(K + |A|) (Laplace — a 0 propensity would make 1/p undefined). Candidate
    set = all buckets of the plan's day-type (8 weekday / 6 weekend) — the feasible set is not
    logged for non-experiment rows; approximation documented and carried into the sensitivity
    analysis. LinUCB traffic is skipped (degenerate propensities — spec-conflicts L3);
    heuristic/arm-A non-experiment rows get none (they are not TS traffic).
11. **PAR in Python mirrors `_shared/par.ts`** (H2): same per-block rule from `events` +
    `recommendations` only; `PAR_GRACE_MINUTES = 15` / `PAR_MIN_FRACTION = 0.5` restated in
    `hourwell_training.params` and pinned by a test; a source test asserts the PAR module
    never touches a reward column (the P7 Deno test's Python twin).
12. **Study mode.** `enroll_participant(p_user_id, p_sequence, p_eu_eea, p_phase1_start)` —
    SECURITY DEFINER, EXECUTE revoked from anon/authenticated (service/operator only):
    validates the sequence (ABAB/BABA), stamps `profiles.research_cohort = true` and
    `eu_eea_resident`, writes the four `study_assignments` phases (2 weeks each, File 06
    §1.2; phase 1 starts after the run-in week — the operator passes the date). Sequences come
    from `training/scripts/randomize_sequences.py` — deterministic blocked randomization
    (block size 4, seeded, 1:1) producing an audit list; the enrollment protocol (incl. the
    G6 EU/EEA question and File 06 §1.3 inclusion/exclusion) is
    `docs/study/enrollment-checklist.md`. Arm labels (FR-22) and arm-A template rationales
    exist since P6 — no client work.
13. **`diagnose_user(p_email)`** (privacy README §7 item 1): SECURITY DEFINER, service-only;
    returns counts/timestamps per table for one user — no content columns — so a support case
    never needs row browsing.
14. **Artifacts + registry.** Private Storage bucket **`models`** (created in the migration;
    no client policies — service-role only). Artifact = one `.npz`/`.json` bundle per run
    (`als/<version>/…`, `priors/<version>/…`, `clusters/<version>/…`);
    `model_registry.artifact_uri = storage://models/<path>` (EU by project region). Upload
    via the Storage REST API with the **service-role key from the VM's `.env`**
    (`SUPABASE_SERVICE_ROLE_KEY` — ⛔ owner adds it; the box already holds `DATABASE_URL`, so
    no new blast radius). Without the key the pipeline completes, records
    `artifact_uri = null` + a loud warning, and refuses to promote (a promoted version must be
    reproducible).
15. **Aggregate report** (`report/latest.json` + `.md`, uploaded next to the artifacts; the
    only thing the researcher reads — privacy §7): per-arm PAR by phase, OPE table
    (estimator × policy with ESS), MC-backfill coverage, `experiment_dropped` rate **per arm**
    (revisit P6), share of personal-by-label cells (revisit P9), duration-scaling-active share
    per arm (revisit P7), interference probe (L4: logistic reward ~ morning bucket ×
    afternoon load on the slice), all with **minimum cell size 5** (smaller groups suppressed).
16. **Synthetic mode is the CI pipeline.** `hourwell-train --synthetic` seeds a disposable
    Postgres (the CI `supabase db start` stack) with generated users/plans/recommendations/
    rewards from a known ground-truth model (exact ε/|A_m| propensities on the slice), runs
    the full pipeline against it, and asserts registry rows + gate behaviour; `train.yml` runs
    exactly this — **no hosted-project secret exists in CI** (G3 stays closed). The same
    generator (fixed seed) is the public "synthetic dataset + replay harness" artifact
    (ADR-0011 §3); the estimator tests also use it to show replay/IPS/DR recover a known
    policy value within tolerance.
17. **Parquet archive** (`hourwell-train --archive`, run at study end, not nightly): the
    whitelist surface to Parquet with **hashed user ids** (SHA-256 over uid + `ARCHIVE_SALT`
    from the VM env — the deposit cannot be joined back to the live DB), uploaded to
    `models/archive/<date>/`; the restricted-access OSF deposit stays an owner action at the
    freeze (H5/ADR-0011 §3).

## Consequences

- New: `training/` grows the pipeline + OPE package, Dockerfile, compose service, systemd
  units, `train.yml`, `deploy-training.yml`; migration `20260831120000_p11_training.sql`
  (bucket, `cluster_cells`, RPCs, promoted-version gate) + pgTAP; enrollment checklist;
  runbook §7 correction + §10 (training container); privacy README G3 note (implemented).
- ⛔ owner (end of phase): push the migration; add `SUPABASE_SERVICE_ROLE_KEY` (+
  `ARCHIVE_SALT`) to the VM `.env`; re-run `install.sh` on the box (new timer + compose).
- Appendix A rows fixed by this ADR: IPS clip M = 10; ALS factors 32 / λ 0.1 / α_conf 40;
  k-means k by silhouette over [3, 8]. (`training/src/hourwell_training/params.py` already
  carries them; they become normative here.)
- Revisit closures: registry gate (ADR-0005 §6 note) → decision 7; drop-rate / label-share /
  scaling-share reporting → decision 15. The "P11 first data review" items (λ_f retune,
  second-move semantics, solidity comparison) **cannot run — no participant data exists**;
  they move to "first real data" (pre-freeze) with the report of this phase.
