"""The simulation study's machinery on hand-computed toy cases (docs/study/preregistration.md).

None of these run the registered configuration — that happens exactly once, by the CLI, and
its outputs are the results document's evidence.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from hourwell_training import synthetic
from hourwell_training.simstudy import REGISTERED, e1_estimators, e2_power, e3_closedloop
from hourwell_training.simstudy.stats import mc_summary, paired_tests


# ---------------------------------------------------------------------------
# the generator keeps its committed behaviour; the scale argument is the only addition
# ---------------------------------------------------------------------------
def test_q_true_default_scale_unchanged() -> None:
    assert synthetic.q_true("EM.wd", "DM") == pytest.approx(0.5 + 0.35 * math.tanh(0.5))
    assert synthetic.q_true("EM.wd", "DM", 1.0) == pytest.approx(0.5 + 0.35 * math.tanh(1.0))
    assert synthetic.q_true("MD.wd", "DE", 1.0) == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# E1 policies restricted to A_m(x)
# ---------------------------------------------------------------------------
def test_e1_oracle_and_anti_oracle_pick_extremes_within_top_m() -> None:
    from hourwell_training.ope import SliceRow

    r = SliceRow("r", "MO.wd.fresh", ("EV.wd", "MO.wd.fresh", "NT.wd"), 1 / 3, 1.0,
                 {"chronotype": "DE"})
    det_oracle, _ = e1_estimators.POLICIES["P4_oracle"]
    det_anti, _ = e1_estimators.POLICIES["P5_anti_oracle"]
    assert det_oracle is not None and det_anti is not None
    assert det_oracle(r) == "NT.wd"  # a definite evening type: NT > EV > MO
    assert det_anti(r) == "MO.wd.fresh"
    _, tilted = e1_estimators.POLICIES["P3_tilted"]
    assert sum(tilted(r, b) for b in r.top_m) == pytest.approx(1.0)
    assert tilted(r, "EV.wd") == pytest.approx(0.7)  # alphabetically first


# ---------------------------------------------------------------------------
# E2 data-generating model
# ---------------------------------------------------------------------------
def test_icc_to_intercept_sd_hand_case() -> None:
    # ICC 0.2: σ² = 0.2 · 3.2899 / 0.8 = 0.8225 → σ = 0.9069
    assert e2_power.intercept_sd_from_icc(0.20) == pytest.approx(0.9069, abs=1e-3)
    assert e2_power.intercept_sd_from_icc(0.0) == 0.0
    with pytest.raises(ValueError):
        e2_power.intercept_sd_from_icc(1.0)


def test_e2_null_cell_is_calibrated_on_a_small_run() -> None:
    cell = e2_power.simulate_cell(REGISTERED, icc=0.1, log_or=0.0, n_users=30,
                                  replicates=300, seed=1)
    # α = .05 two-sided, direction counted one way → ≈ 0.025 rejections; a loose bound
    assert cell["power_paired_t"] <= 0.08
    assert abs(cell["mean_diff"]["mean"]) < 0.01


def test_paired_tests_hand_case() -> None:
    res = paired_tests([0.6, 0.7, 0.8, 0.9], [0.5, 0.5, 0.5, 0.5])
    assert res.mean_diff == pytest.approx(0.25)
    assert res.t_p < 0.05 and res.rejects()
    zero = paired_tests([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
    assert zero.wilcoxon_p == 1.0 and not zero.rejects()


def test_mc_summary_hand_case() -> None:
    s = mc_summary([1.0, 3.0])
    assert s["mean"] == 2.0 and s["sd"] == pytest.approx(math.sqrt(2)) and s["n"] == 2
    assert s["mc_se"] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# E3 closed-form material equals the pre-registered table (§4.2)
# ---------------------------------------------------------------------------
def test_e3_ceilings_match_preregistration_table() -> None:
    base = e3_closedloop.ceilings(0.5)
    assert base["population"]["A"] == pytest.approx(0.5000, abs=1e-4)
    assert base["population"]["gap"] == pytest.approx(0.0412, abs=1e-4)
    assert base["per_class"]["DE"]["gap"] == pytest.approx(0.1281, abs=1e-4)
    assert base["per_class"]["DM"]["gap"] == 0.0
    amp = e3_closedloop.ceilings(1.0)
    assert amp["population"]["gap"] == pytest.approx(0.0784, abs=1e-4)
    assert amp["population"]["oracle_in_Am_minus_earliest"] == pytest.approx(0.1235, abs=1e-4)


def test_e3_priors_follow_file04_table() -> None:
    cells = e3_closedloop.make_cells("DE", "informative")
    ev = cells["EV"]
    assert ev.alpha0 == pytest.approx(0.72 * 8) and ev.beta0 == pytest.approx(0.28 * 8)
    nt = cells["NT"]  # outside 09–18: n₀ = 4
    assert nt.alpha0 + nt.beta0 == pytest.approx(4.0)
    flat = e3_closedloop.make_cells("DE", "flat")
    assert all(c.alpha0 == 4.0 and c.beta0 == 4.0 for c in flat.values())
    with pytest.raises(ValueError):
        e3_closedloop.make_cells("DE", "other")


def test_e3_sequences_are_balanced_and_blocked() -> None:
    rng = np.random.default_rng(0)
    seqs = e3_closedloop.sequences_balanced(30, rng)
    assert len(seqs) == 30 and seqs.count("ABAB") == 15 and seqs.count("BABA") == 15
    for k in range(0, 28, 4):  # every full block is 2:2
        assert seqs[k:k + 4].count("ABAB") == 2
    assert e3_closedloop.sequences_balanced(8, rng).count("ABAB") == 4


def test_e3_heuristic_ranking_is_earliest_first_with_capacity() -> None:
    free = {"MO": 0, "MD": 2, "AF": 3, "EV": 1}
    ranked = sorted(e3_closedloop.heuristic_ranking(free), key=lambda p: -p[1])
    assert [b for b, _ in ranked] == ["MD.wd", "AF.wd.fresh", "EV.wd"]


def test_e3_one_tiny_replicate_has_the_registered_shape() -> None:
    """Two users, two days of run-in, one-day phases: shape and invariants only."""
    from dataclasses import replace

    cfg = replace(REGISTERED, e3_n_users=2, e3_runin_days=1, e3_phase_days=1)
    rep = e3_closedloop.run_replicate(cfg, scale=0.5, prior="informative", seed=7)
    assert rep["n_slice_rows"] == 2 * 4  # one experiment per user per analysed day
    assert len(rep["mae_at_boundaries"]) == 5
    assert 0.0 <= rep["mean_A"] <= 1.0 and 0.0 <= rep["mean_B"] <= 1.0
    assert all(o["ess"] <= o["n"] for o in rep["ope"])
    # exact slice propensity: |A_m(x)| = 4 reachable buckets → every replay ESS is n/4-ish
    again = e3_closedloop.run_replicate(cfg, scale=0.5, prior="informative", seed=7)
    assert again["effect"] == rep["effect"]  # deterministic per seed
