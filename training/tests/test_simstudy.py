"""The simulation study's machinery on hand-computed toy cases (docs/study/preregistration.md).

None of these run the registered configuration — that happens exactly once, by the CLI, and
its outputs are the results document's evidence.
"""

from __future__ import annotations

import math
from dataclasses import replace

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
    cfg = replace(REGISTERED, e3_n_users=2, e3_runin_days=1, e3_phase_days=1)
    rep = e3_closedloop.run_replicate(cfg, scale=0.5, prior="informative", seed=7)
    assert rep["n_slice_rows"] == 2 * 4  # one experiment per user per analysed day
    assert len(rep["mae_at_boundaries"]) == 5
    assert 0.0 <= rep["mean_A"] <= 1.0 and 0.0 <= rep["mean_B"] <= 1.0
    assert all(o["ess"] <= o["n"] for o in rep["ope"])
    # exact slice propensity: |A_m(x)| = 4 reachable buckets → every replay ESS is n/4-ish
    again = e3_closedloop.run_replicate(cfg, scale=0.5, prior="informative", seed=7)
    assert again["effect"] == rep["effect"]  # deterministic per seed


# ---------------------------------------------------------------------------
# the reuse claim, pinned (adversarial finding 10): E3's incremental learning must equal the
# service's full rebuild from the same tuples; the slice invariants; the registered arithmetic
# ---------------------------------------------------------------------------
def test_e3_learn_equals_the_service_rebuild_from_stored_tuples() -> None:
    from datetime import UTC, datetime

    from hourwell_recsys import bandit, feedback
    from hourwell_recsys.repo import CATEGORIES, InMemoryRepo, StoredTuple, fallback_cells

    cfg = replace(REGISTERED, e3_n_users=1, e3_runin_days=1, e3_phase_days=1)
    user = e3_closedloop._User(
        uid=0, klass="DE", sequence="BABA", cells=e3_closedloop.make_cells("DE", "informative"),
        state=bandit.init_state("deep"),
    )
    rng = np.random.default_rng(11)
    at = datetime(2026, 9, 7, 23, 55, tzinfo=UTC)
    rows = e3_closedloop._plan_day(
        user, "B", 0, 0, datetime(2026, 9, 7, 6, tzinfo=UTC), rng, 0.5, cfg
    )
    e3_closedloop._learn(user, rows, at)

    repo = InMemoryRepo()
    repo.tuples["u"] = [
        StoredTuple(recommendation_id=f"r{i:02d}", kind="outcome", reward=r.reward,
                    category="deep", features=r.x, attributed_at=at)
        for i, r in enumerate(rows)
    ]
    cells = {c.key: c for c in fallback_cells()}
    for dp, c in e3_closedloop.make_cells("DE", "informative").items():
        cells[("deep", dp, "weekday")] = c
    states, fresh, blend, _ = feedback.rebuild_all(repo, "u", cells, state_version=1)
    # same-timestamp tuples: the service orders them by recommendation id — r00.. is placement
    # order, so the blend trajectories coincide here (the docstring states the assumption)
    assert np.allclose(states["deep"].A, user.state.A)
    assert np.allclose(states["deep"].b, user.state.b)
    assert blend.w_energy == pytest.approx(user.blend.w_energy)
    for dp, c in user.cells.items():
        assert fresh[("deep", dp, "weekday")].succ == pytest.approx(c.succ)
        assert fresh[("deep", dp, "weekday")].fail == pytest.approx(c.fail)
    assert set(CATEGORIES) >= {"deep"}


def test_e3_every_plan_day_has_one_exact_slice_row() -> None:
    from datetime import UTC, datetime

    from hourwell_recsys import bandit

    cfg = replace(REGISTERED, e3_n_users=1)
    for arm in ("A", "B"):
        user = e3_closedloop._User(
            uid=0, klass="DM", sequence="ABAB", cells=e3_closedloop.make_cells("DM", "flat"),
            state=bandit.init_state("deep"),
        )
        rows = e3_closedloop._plan_day(
            user, arm, 3, 1, datetime(2026, 9, 10, 6, tzinfo=UTC),
            np.random.default_rng(5), 1.0, cfg,
        )
        assert len(rows) == cfg.e3_tasks_per_day
        exp = [r for r in rows if r.is_experiment]
        assert len(exp) == 1 and exp[0] is rows[0]
        assert len(exp[0].top_m) == 4 and exp[0].propensity == 0.25  # ε/|A_m(x)|, |A_m| = 4
        assert all(r.top_m == () and r.propensity == 0.0 for r in rows[1:])
        # capacity respected: at most 3 MO, 2 MD, 3 AF, 1 EV
        used = [e3_closedloop.DAYPART_OF[r.bucket_id] for r in rows]
        assert all(used.count(dp) <= cap for dp, cap in e3_closedloop.DAYPART_CAPACITY.items())
        if arm == "A":
            assert used == ["MO", "MO", "MO", "MD"] or exp[0].bucket_id != "MO.wd.fresh"


def test_e3_cell_seed_map_and_aggregation_shape() -> None:
    cfg = replace(REGISTERED.quick(), e3_replicates=2, e3_n_users=4)
    doc = e3_closedloop.run_e3(cfg, workers=1)
    assert list(doc["cells"]) == [
        "base/informative", "base/flat", "amplified/informative", "amplified/flat"
    ]
    assert [c["seed_base"] for c in doc["cells"].values()] == [3000, 3100, 3200, 3300]
    cell = doc["cells"]["base/informative"]
    assert cell["replicates"] == 2
    assert cell["ceiling"]["population"]["gap"] == pytest.approx(0.0412, abs=1e-4)
    assert len(cell["ope"]) == 8 and set(cell["ope_policy_gap"]) == {"ips", "snips", "dr", "replay"}


def test_e1_registered_ess_arithmetic() -> None:
    r = e1_estimators.expected_ess_ratios()
    assert r["replay"] == pytest.approx((1 / 2 + 1 / 3 + 1 / 4) / 3)  # 0.3611 → 361 of 1,000
    assert r["deterministic"] == pytest.approx(1 / 3)  # 333
    assert r["tilted"] == pytest.approx(1 / 1.615, abs=1e-3)  # 619
    assert r["uniform"] == 1.0


def test_e2_null_rate_matches_the_one_directional_rule() -> None:
    """The registered rule counts one direction of a two-sided α = .05 test: 0.025, not 0.05."""
    cell = e2_power.simulate_cell(REGISTERED, icc=0.2, log_or=0.0, n_users=30,
                                  replicates=400, seed=2)
    assert 0.005 <= cell["power_paired_t"] <= 0.05  # 0.025 ± 3 binomial SE at R = 400
