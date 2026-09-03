"""Spec-fixed Appendix A values must match the frozen specs byte-for-byte."""

from hourwell_recsys import params


def test_spec_fixed_grid() -> None:
    assert params.TICK_MINUTES == 15  # File 04 §1.2
    assert params.DAY_MAX_TICKS == 96
    assert params.WEEK_MAX_TICKS == 672


def test_spec_fixed_solver_and_exploration() -> None:
    assert params.SOLVER_TIME_CAP_S == 1.5  # File 04 §1.5
    assert params.DEGRADATION_LITERAL_THRESHOLD == 40_000  # File 04 §1.5
    assert params.TOP_M == 4  # File 04 §1.4
    assert params.BETA_HALF_LIFE_DAYS == 28.0  # File 05 §1


def test_spec_fixed_priors() -> None:
    assert params.N0_IN_HOURS == 8.0  # File 04 §3.3
    assert params.N0_OUT_HOURS == 4.0
    assert params.WEEKEND_BLEND_TARGET == 0.55


def test_adr_0018_stopping_criteria_are_pinned() -> None:
    assert params.CPSAT_RELATIVE_GAP_LIMIT == 0.01  # ADR-0018 §Decision 1
    assert params.SOLVER_STALL_WINDOW_S == 0.3  # ADR-0018 §Decision 2 (≥ p95 box-scaled gap)
    # the window must leave room inside the first rung's slice (cap − ladder reserve)
    assert params.SOLVER_STALL_WINDOW_S < params.SOLVER_TIME_CAP_S - params.SOLVER_LADDER_RESERVE_S


def test_blend_init_is_a_convex_combination() -> None:
    assert params.BLEND_INIT_W_ENERGY + params.BLEND_INIT_W_BANDIT == 1.0
