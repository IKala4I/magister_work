"""Spec-fixed Appendix A values must match the frozen specs byte-for-byte."""

from hourwell_training import params
from hourwell_training.ess import ESS_FLOOR


def test_spec_fixed_ope_constants() -> None:
    assert params.ESS_FLOOR == 100.0  # File 04 §2.3
    assert params.MC_PROPENSITY_K == 32  # File 04 §2.3
    assert params.FOLD_IN_MIN_OUTCOMES == 30  # File 04 §3.4


def test_ess_module_sources_floor_from_params() -> None:
    assert ESS_FLOOR is params.ESS_FLOOR
