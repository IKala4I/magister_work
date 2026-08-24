"""ESS tests against hand-computed cases (specs/04 §2.3)."""

import pytest

from hourwell_training.ess import ESS_FLOOR, effective_sample_size, is_evidence


def test_uniform_weights_give_ess_equal_to_n() -> None:
    assert effective_sample_size([1.0] * 250) == pytest.approx(250.0)
    assert effective_sample_size([0.5] * 40) == pytest.approx(40.0)


def test_hand_computed_case() -> None:
    # w = [1, 2, 3]: (6²) / (1 + 4 + 9) = 36/14
    assert effective_sample_size([1.0, 2.0, 3.0]) == pytest.approx(36.0 / 14.0)


def test_single_dominant_weight_collapses_ess_toward_one() -> None:
    # w = [100] + [0.01]*1000: (110²) / (10000 + 1000·0.0001) = 12100 / 10000.1 ≈ 1.21
    ess = effective_sample_size([100.0] + [0.01] * 1000)
    assert ess == pytest.approx(12100.0 / 10000.1)
    assert ess < 2.0  # 1001 samples, but almost all evidential mass sits in one


def test_degenerate_inputs() -> None:
    assert effective_sample_size([]) == 0.0
    assert effective_sample_size([0.0, 0.0]) == 0.0
    with pytest.raises(ValueError, match="non-negative"):
        effective_sample_size([1.0, -0.1])


def test_evidence_gate_uses_spec_floor() -> None:
    assert ESS_FLOOR == 100.0
    assert is_evidence([1.0] * 100)
    assert not is_evidence([1.0] * 99)
