"""Registered configuration (docs/study/preregistration.md §1.3, §2.1, §3, §4.1).

Every number here is a pre-registered parameter or a specs/07 Appendix A constant — never a
tuning knob. `quick()` exists ONLY for smoke tests and never writes the registered filenames.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

__all__ = ["REGISTERED", "StudyConfig"]


@dataclass(frozen=True)
class StudyConfig:
    # --- seeds (§1.3) ---
    e1_seed_base: int = 1000
    e2_seed_base: int = 2000
    e3_seed_base: int = 3000
    e3_cell_seed_stride: int = 100
    # --- E1 (§2.1) ---
    e1_replicates: int = 200
    e1_rows: int = 1000
    # --- E2 (§3) ---
    e2_replicates: int = 5000
    e2_sweep_replicates: int = 2000
    e2_n_users: int = 30
    e2_blocks_per_condition: int = 80
    e2_iccs: tuple[float, ...] = (0.10, 0.20)
    e2_odds_ratio: float = 1.38
    e2_baseline: float = 0.45
    e2_slope_sd_logit: float = 0.48
    e2_n_sweep: tuple[int, ...] = (20, 24, 28, 30, 34, 40)
    e2_phase1_blocks: int = 40
    # --- E3 (§4.1) ---
    e3_replicates: int = 100
    e3_n_users: int = 30
    e3_tasks_per_day: int = 4
    e3_runin_days: int = 5
    e3_phase_days: int = 10
    e3_phases: int = 4
    e3_worlds: tuple[tuple[str, float], ...] = (("base", 0.5), ("amplified", 1.0))
    e3_prior_settings: tuple[str, ...] = ("informative", "flat")
    e3_start_iso: str = "2026-09-07"  # a Monday
    # --- sensitivity grid (docs/study/sensitivity-grid.md §2) ---
    sens_replicates: int = 40
    sens_n_users: int = 120
    sens_seed_base: int = 5000
    sens_cell_seed_stride: int = 100
    sens_ns: tuple[int, ...] = (30, 60, 120)

    def quick(self) -> StudyConfig:
        """Smoke-test sizes — NOT the registered configuration (the CLI labels the output)."""
        return replace(
            self,
            e1_replicates=4,
            e1_rows=200,
            e2_replicates=60,
            e2_sweep_replicates=30,
            e3_replicates=2,
            e3_n_users=10,
            sens_replicates=2,
            sens_n_users=20,
            sens_ns=(10, 20),
        )


REGISTERED = StudyConfig()
