"""OPE estimators vs hand-computed cases (specs/04 §2; the P11 acceptance list names these:
estimator unit tests, the ESS gate, and the slice-restriction test)."""

from __future__ import annotations

import math

import pytest

from hourwell_training import ope
from hourwell_training.params import ESS_FLOOR


def row(
    rid: str = "r1",
    bucket: str = "MO.wd.fresh",
    top_m: tuple[str, ...] = ("MO.wd.fresh", "AF.wd.fresh", "EV.wd", "NT.wd"),
    p: float = 0.25,
    reward: float = 1.0,
) -> ope.SliceRow:
    return ope.SliceRow(
        recommendation_id=rid, bucket_id=bucket, top_m=top_m, propensity=p, reward=reward,
        context={},
    )


def logged(r: ope.SliceRow) -> str:
    return r.bucket_id


def uniform(r: ope.SliceRow, b: str) -> float:
    return 1.0 / len(r.top_m)


def always_mo(r: ope.SliceRow, b: str) -> float:
    return 1.0 if b == "MO.wd.fresh" else 0.0


# ---------------------------------------------------------------------------
# slice discipline (replay refuses non-randomized rows — File 04 §2.2)
# ---------------------------------------------------------------------------
def test_row_without_logged_candidate_set_raises() -> None:
    with pytest.raises(ValueError, match="not a slice row"):
        ope.replay([row(top_m=())], logged)


def test_chosen_bucket_outside_candidate_set_raises() -> None:
    with pytest.raises(ValueError, match="outside A_m"):
        ope.replay([row(bucket="EM.wd")], logged)


def test_slice_propensity_must_equal_one_over_m_exactly() -> None:
    # ε = 1 is pinned (M2): both 0.5 and 0.125 over a 4-set are corrupt slice rows
    with pytest.raises(ValueError, match="!= 1/4"):
        ope.replay([row(p=0.5)], logged)
    with pytest.raises(ValueError, match="!= 1/4"):
        ope.replay([row(p=0.125)], logged)


def test_mixed_rows_feed_ips_but_never_replay() -> None:
    mc = ope.SliceRow(
        recommendation_id="ts1", bucket_id="MO.wd.fresh",
        top_m=("EM.wd", "MO.wd.fresh", "MD.wd", "EV.wd"), propensity=0.4, reward=1.0,
        context={}, exact=False,
    )
    est = ope.ips([mc], lambda r, b: 1.0 / len(r.top_m))
    assert est.value == pytest.approx(0.25 / 0.4)
    with pytest.raises(ValueError, match="slice-only"):
        ope.replay([mc], lambda r: r.bucket_id)


def test_zero_or_negative_propensity_raises() -> None:
    with pytest.raises(ValueError, match="not in"):
        ope.replay([row(p=0.0)], logged)


def test_empty_input_raises() -> None:
    with pytest.raises(ValueError, match="no rows"):
        ope.replay([], logged)


def test_policy_leaving_the_slice_raises() -> None:
    with pytest.raises(ValueError, match="outside A_m"):
        ope.replay([row()], lambda r: "EM.wd")


def test_stochastic_policy_mass_must_sum_to_one() -> None:
    with pytest.raises(ValueError, match="mass"):
        ope.ips([row()], lambda r, b: 0.3)


# ---------------------------------------------------------------------------
# replay (Li et al. 2011) — hand-computed
# ---------------------------------------------------------------------------
def test_replay_means_the_matched_rewards() -> None:
    rows = [
        row("r1", bucket="MO.wd.fresh", reward=1.0),
        row("r2", bucket="AF.wd.fresh", reward=0.0),   # policy picks MO -> no match
        row("r3", bucket="MO.wd.fresh", reward=0.0),
    ]
    est = ope.replay(rows, lambda r: "MO.wd.fresh")
    # matches r1, r3: mean(1, 0) = 0.5; ESS = 2 matched rows
    assert est.value == pytest.approx(0.5)
    assert est.ess == 2.0 and est.n == 2
    assert not est.is_evidence  # 2 < 100


def test_replay_with_no_matches_is_nan_not_zero() -> None:
    est = ope.replay([row(bucket="AF.wd.fresh")], lambda r: "MO.wd.fresh")
    assert math.isnan(est.value) and est.ess == 0.0


# ---------------------------------------------------------------------------
# IPS family — hand-computed (p = 0.25, so w = pi/p = 4*pi)
# ---------------------------------------------------------------------------
def test_ips_hand_case() -> None:
    rows = [row("r1", reward=1.0), row("r2", bucket="AF.wd.fresh", reward=1.0)]
    est = ope.ips(rows, always_mo)
    # w1 = 1/0.25 = 4 (match), w2 = 0/0.25 = 0: (4*1 + 0*1)/2 = 2.0
    assert est.value == pytest.approx(2.0)
    # ESS = (4+0)^2 / (16+0) = 1
    assert est.ess == pytest.approx(1.0)


def test_ips_of_the_logging_policy_is_unbiased_mean() -> None:
    rows = [row("r1", reward=1.0), row("r2", bucket="AF.wd.fresh", reward=0.5)]
    est = ope.ips(rows, uniform)
    # w_i = 0.25/0.25 = 1 exactly: plain mean 0.75, ESS = n
    assert est.value == pytest.approx(0.75)
    assert est.ess == pytest.approx(2.0)


def test_clipped_ips_caps_the_weight() -> None:
    rows = [row("r1", reward=1.0)]
    est = ope.ips_clipped(rows, always_mo, clip_m=2.0)
    # w = 4 clipped to 2: value 2*1/1 = 2
    assert est.value == pytest.approx(2.0)
    est10 = ope.ips_clipped(rows, always_mo)  # default M = 10 leaves 4 alone
    assert est10.value == pytest.approx(4.0)


def test_snips_normalizes_by_the_weight_sum() -> None:
    rows = [
        row("r1", reward=1.0),
        row("r2", bucket="AF.wd.fresh", reward=0.0),
        row("r3", bucket="MO.wd.fresh", reward=0.5),
    ]
    est = ope.snips(rows, always_mo)
    # w = (4, 0, 4): (4*1 + 0 + 4*0.5)/(4+0+4) = 6/8
    assert est.value == pytest.approx(0.75)
    # ESS = 8^2/32 = 2
    assert est.ess == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# DR (Dudík et al. 2011) — hand-computed with a constant model
# ---------------------------------------------------------------------------
def test_dr_with_perfect_model_ignores_weights() -> None:
    rows = [row("r1", reward=0.6), row("r2", bucket="AF.wd.fresh", reward=0.6)]
    est = ope.doubly_robust(rows, always_mo, lambda r, b: 0.6)
    # DM term = 0.6 each; residual = 0 each -> exactly 0.6
    assert est.value == pytest.approx(0.6)


def test_dr_hand_case_with_biased_model() -> None:
    rows = [row("r1", reward=1.0)]
    est = ope.doubly_robust(rows, always_mo, lambda r, b: 0.5)
    # DM = 0.5; w = 4; residual = (1 - 0.5) -> 0.5 + 4*0.5 = 2.5
    assert est.value == pytest.approx(2.5)


def test_direct_method_is_model_only() -> None:
    rows = [row("r1", reward=0.0)]
    est = ope.direct_method(rows, uniform, lambda r, b: 0.25 if b == "MO.wd.fresh" else 0.75)
    # sum_b pi(b)*r_hat = 0.25*(0.25 + 0.75*3)/... hand: (0.25 + 0.75 + 0.75 + 0.75)/4 = 0.625
    assert est.value == pytest.approx(0.625)


# ---------------------------------------------------------------------------
# the ESS gate (specs/04 §2.3: < 100 is non-evidence)
# ---------------------------------------------------------------------------
def test_estimates_carry_the_evidence_flag() -> None:
    many = [row(f"r{i}", reward=1.0) for i in range(int(ESS_FLOOR))]
    est = ope.ips(many, uniform)
    assert est.ess == pytest.approx(ESS_FLOOR) and est.is_evidence
    est99 = ope.ips(many[:-1], uniform)
    assert not est99.is_evidence
