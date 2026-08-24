# Traceability — requirement → module → test

Updated at every feature's Definition-of-Done step. Requirement IDs from `specs/02` (FR/NFR),
use cases UC-xx, migrations M-xx, math from `specs/04` and `specs/07`.

| Requirement                                         | Module (file)                                     | Test                                             | Status                                 |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| specs/04 §1.2 tick grid (Δ=15 min, 96/672)          | `apps/mobile/src/domain/ticks.ts`                 | `apps/mobile/src/domain/__tests__/ticks.test.ts` | ✅ P0 seed                             |
| specs/04 §3.2 daypart table                         | `services/recsys/src/hourwell_recsys/dayparts.py` | `services/recsys/tests/test_dayparts.py`         | ✅ P0 seed                             |
| specs/04 §2.3 ESS + non-evidence floor              | `training/src/hourwell_training/ess.py`           | `training/tests/test_ess.py`                     | ✅ P0 seed                             |
| NFR-M1 CI gates (lint + tests)                      | `.github/workflows/ci.yml`                        | CI run on PR                                     | ✅ P0                                  |
| NFR-S1 secret hygiene (no keys in repo)             | `.gitignore`, P0 secret audit                     | audit output in PR P0                            | ✅ P0                                  |
| NFR-S1 RLS on every table + bypass denial           | `supabase/migrations/20260824120000_base.sql`     | `supabase/tests/rls_test.sql` (CI db job)        | ✅ P1                                  |
| NFR-S2 EU hosting (Supabase eu-west-1)              | linked project                                    | `docs/privacy/README.md` evidence table          | ✅ P1                                  |
| NFR-R1 duplicate op_id replay is a no-op            | `events` UNIQUE(user_id, op_id)                   | `rls_test.sql` "duplicate op_id"                 | ✅ P1 (constraint level; sync path P8) |
| M-01 `recommendations.propensity`                   | `20260824120100_m01_propensity.sql`               | `schema_test.sql` has_column/col_type_is         | ✅ P1                                  |
| M-02 displaced statuses + conflict_flag             | `20260824120200_m02_displacement.sql`             | `schema_test.sql` displaced_pending insert       | ✅ P1                                  |
| File 04 §3.2–3.3 prior tables → Beta params         | `20260824120300_seed_prior_cells_v0.sql`          | `schema_test.sql` hand-computed spot values      | ✅ P1                                  |
| FR-42 groundwork (cascade erasure paths)            | base migration FKs `on delete cascade`            | reviewed; end-to-end deletion test in P10        | ✅ P1                                  |
| File 03 §6 contract sync (types drift = CI failure) | `.github/workflows/ci.yml` db job                 | gen-types diff step                              | ✅ P1                                  |
