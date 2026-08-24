# Traceability — requirement → module → test

Updated at every feature's Definition-of-Done step. Requirement IDs from `specs/02` (FR/NFR),
use cases UC-xx, migrations M-xx, math from `specs/04` and `specs/07`.

| Requirement                                | Module (file)                                     | Test                                             | Status     |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ | ---------- |
| specs/04 §1.2 tick grid (Δ=15 min, 96/672) | `apps/mobile/src/domain/ticks.ts`                 | `apps/mobile/src/domain/__tests__/ticks.test.ts` | ✅ P0 seed |
| specs/04 §3.2 daypart table                | `services/recsys/src/hourwell_recsys/dayparts.py` | `services/recsys/tests/test_dayparts.py`         | ✅ P0 seed |
| specs/04 §2.3 ESS + non-evidence floor     | `training/src/hourwell_training/ess.py`           | `training/tests/test_ess.py`                     | ✅ P0 seed |
| NFR-M1 CI gates (lint + tests)             | `.github/workflows/ci.yml`                        | CI run on PR                                     | ✅ P0      |
| NFR-S1 secret hygiene (no keys in repo)    | `.gitignore`, P0 secret audit                     | audit output in PR P0                            | ✅ P0      |
