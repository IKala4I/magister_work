"""/plan end to end: hard constraints hold, the propensity logging path is exact, the
degradation ladder flags, infeasibility yields ranked options, empty busy set is valid."""

from __future__ import annotations

from datetime import timedelta

import pytest

from hourwell_recsys import planner
from hourwell_recsys.contexts import BUCKET_IDS
from hourwell_recsys.params import EPSILON, TOP_M
from hourwell_recsys.planner import PlanSettingsMismatch, plan
from hourwell_recsys.rationale import RATIONALE_KEYS
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.schemas import PlanRequest, Unplaced
from tests.conftest import PLAN_DATE, kyiv, plan_body, task


def _day_tasks() -> list[dict]:  # type: ignore[type-arg]
    return [
        task("deep1", category="deep", est_minutes=90, value=3, deadline=kyiv(17)),
        task("admin1", category="admin", est_minutes=30, value=1),
        task("learn1", category="learning", est_minutes=120, value=2, splittable=True),
        task("phys1", category="physical", est_minutes=45, value=2, pinned_start=kyiv(14)),
        task("deep2", category="deep", est_minutes=60, value=2, postpone_count=2),
        task("admin2", category="admin", est_minutes=45, value=1),
    ]


def _busy() -> list[dict[str, str]]:
    return [{"start": kyiv(10), "end": kyiv(11, 30)}]


def _check_hard_constraints(resp, req: PlanRequest) -> None:  # type: ignore[no-untyped-def]
    spans = sorted(
        (a.slot_start, a.slot_end + timedelta(minutes=15), a.task_id) for a in resp.assignments
    )
    for (_, e1, _), (s2, _, _) in zip(spans, spans[1:], strict=False):
        assert e1 <= s2, "overlap incl. buffer"
    for a in resp.assignments:
        local_s = (
            a.slot_start.astimezone(planner.ZoneInfo(req.timezone))
            if hasattr(planner, "ZoneInfo")
            else None
        )
        assert a.context_bucket in BUCKET_IDS
        assert a.rationale_key in RATIONALE_KEYS
        assert len(a.features) == 17
        assert 0.0 <= a.q_hat <= 1.0 and 0.0 <= a.confidence <= 1.0
        for b in req.busy:
            assert a.slot_end <= b.start or a.slot_start >= b.end
        t = next(t for t in req.tasks if t.id == a.task_id)
        if t.deadline is not None:
            assert a.slot_end <= t.deadline
        if t.pinned_start is not None:
            assert a.slot_start == t.pinned_start
        del local_s


def test_representative_day_respects_hard_constraints(repo: InMemoryRepo) -> None:
    req = PlanRequest.model_validate(plan_body(_day_tasks(), busy=_busy()))
    resp = plan(req, repo)
    assert resp.engine == "learned" and resp.model_version
    assert resp.solver_status in ("OPTIMAL", "FEASIBLE")
    assert resp.assignments
    _check_hard_constraints(resp, req)
    placed = {a.task_id for a in resp.assignments}
    assert "phys1" in placed and "deep1" in placed  # pinned + deadline-critical
    assert {u.task_id for u in resp.unplaced}.isdisjoint(placed)
    assert resp.telemetry.n_ticks == 96 and resp.telemetry.tick_minutes == 15
    assert resp.telemetry.solve_ms < 1500


def test_empty_busy_set_is_valid_input(repo: InMemoryRepo) -> None:
    req = PlanRequest.model_validate(plan_body(_day_tasks()[:3], busy=[]))
    resp = plan(req, repo)
    assert resp.assignments and resp.solver_status in ("OPTIMAL", "FEASIBLE")


@pytest.mark.parametrize("policy", ["ts", "linucb"])
def test_propensity_logging_path_is_exact_and_only_on_the_slice(
    repo: InMemoryRepo, policy: str
) -> None:
    seen_experiments = 0
    for seed in range(12):
        body = plan_body(_day_tasks(), busy=_busy())
        body["settings"] = {"epsilon": 1.0, "top_m": 4, "policy": policy, "seed": seed}
        resp = plan(PlanRequest.model_validate(body), repo)
        exp = [a for a in resp.assignments if a.is_experiment]
        rest = [a for a in resp.assignments if not a.is_experiment]
        assert all(a.propensity is None for a in rest)  # never mislabelled
        assert len(exp) <= 1
        if resp.telemetry.experiment_drawn:
            assert len(exp) == 1
            (a,) = exp
            assert a.experiment_top_m is not None and 2 <= len(a.experiment_top_m) <= TOP_M
            # exact per row: ε/|A_m(x)| — 0.25 when four buckets are reachable (ADR-0008 §1)
            assert a.propensity == EPSILON / len(a.experiment_top_m)
            assert a.rationale_key == "experiment"
            assert a.chunk_index == 0
            t = next(t for t in _day_tasks() if t["id"] == a.task_id)
            assert t["pinned_start"] is None and t["deadline"] is None and t["est_minutes"] <= 120
            seen_experiments += 1
        else:
            assert resp.telemetry.experiment_dropped or not exp
    assert seen_experiments >= 10


def test_epsilon_zero_never_experiments(repo: InMemoryRepo) -> None:
    body = plan_body(_day_tasks())
    body["settings"] = {"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": 3}
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(planner, "EPSILON", 0.0)
        body["settings"]["epsilon"] = 0.0
        resp = plan(PlanRequest.model_validate(body), repo)
    assert not resp.telemetry.experiment_drawn
    assert all(not a.is_experiment and a.propensity is None for a in resp.assignments)


def test_settings_mismatch_is_rejected(repo: InMemoryRepo) -> None:
    body = plan_body(_day_tasks())
    body["settings"] = {"epsilon": 0.5, "top_m": 4, "policy": "ts"}
    with pytest.raises(PlanSettingsMismatch):
        plan(PlanRequest.model_validate(body), repo)
    body["settings"] = {"epsilon": 1.0, "top_m": 3, "policy": "ts"}
    with pytest.raises(PlanSettingsMismatch):
        plan(PlanRequest.model_validate(body), repo)


def test_same_seed_same_plan(repo: InMemoryRepo) -> None:
    req = PlanRequest.model_validate(plan_body(_day_tasks(), busy=_busy()))
    timing = {
        "telemetry": {
            "solve_ms",
            "build_ms",
            "total_ms",
            # ADR-0018 trajectory fields are wall-clock facts, not plan content
            "n_solutions",
            "last_improvement_ms",
            "max_improvement_gap_ms",
            "early_stop",
        }
    }
    a = plan(req, repo).model_dump(exclude=timing)
    b = plan(req, repo).model_dump(exclude=timing)
    assert a == b


def test_telemetry_carries_the_search_trajectory(repo: InMemoryRepo) -> None:
    """ADR-0018: every plan reports why its search ended (bound, gap, improvements)."""
    resp = plan(PlanRequest.model_validate(plan_body(_day_tasks(), busy=_busy())), repo)
    t = resp.telemetry
    assert t.n_solutions >= 1
    assert t.last_improvement_ms is not None and t.last_improvement_ms <= t.solve_ms + 20
    assert t.objective_bound is not None and t.gap is not None and t.gap >= 0.0
    if resp.solver_status == "OPTIMAL":
        assert t.gap <= 0.01 and not t.early_stop


def test_infeasible_critical_task_yields_ranked_options(repo: InMemoryRepo) -> None:
    tasks = [
        task(
            "big", category="deep", est_minutes=8 * 60, value=3, deadline=kyiv(12)
        ),  # cannot fit before 12:00
        task("small", category="admin", est_minutes=30, value=1),
    ]
    resp = plan(PlanRequest.model_validate(plan_body(tasks)), repo)
    assert resp.infeasible is not None
    kinds = [o.kind for o in resp.infeasible.options]
    assert "drop" in kinds and "shrink" in kinds and "move_past_deadline" in kinds
    values = [float(o.consequence["value"]) for o in resp.infeasible.options]
    assert values == sorted(values)
    assert any(u.task_id == "big" for u in resp.unplaced)


def test_pinned_collision_reports_infeasible_with_unpin_options(repo: InMemoryRepo) -> None:
    tasks = [
        task("p1", est_minutes=60, pinned_start=kyiv(9)),
        task("p2", est_minutes=60, pinned_start=kyiv(9, 30)),
    ]
    resp = plan(PlanRequest.model_validate(plan_body(tasks)), repo)
    assert resp.solver_status == "INFEASIBLE"
    assert resp.infeasible is not None and {o.kind for o in resp.infeasible.options} == {"unpin"}
    assert {u.reason for u in resp.unplaced} == {"infeasible"}


def test_previous_assignments_are_hinted(repo: InMemoryRepo) -> None:
    # a deadline makes the task critical ⇒ never the ε-experiment ⇒ its starts stay unrestricted
    body = plan_body([task("a", est_minutes=30, deadline=kyiv(18))])
    body["previous_assignments"] = [{"task_id": "a", "slot_start": kyiv(15), "chunk_index": 0}]
    body["settings"]["epsilon"] = 1.0
    resp = plan(PlanRequest.model_validate(body), repo)
    assert resp.telemetry.hints == 1


def test_degradation_ladder_flags(repo: InMemoryRepo) -> None:
    body = plan_body(_day_tasks(), busy=_busy())
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(planner, "DEGRADATION_LITERAL_THRESHOLD", 50)
        resp = plan(PlanRequest.model_validate(body), repo)
        assert resp.telemetry.degradation == "coarse_30min"
        assert resp.telemetry.tick_minutes == 30 and resp.telemetry.n_ticks == 48
        week = plan_body(_day_tasks(), busy=_busy(), horizon="week")
        resp_w = plan(PlanRequest.model_validate(week), repo)
        assert resp_w.telemetry.degradation == "day_by_day"
        assert resp_w.telemetry.solves >= 2
    resp_ok = plan(PlanRequest.model_validate(body), repo)
    assert resp_ok.telemetry.degradation is None


def test_week_horizon_places_tasks_across_days(repo: InMemoryRepo) -> None:
    tasks = [task(f"t{i}", est_minutes=120, value=2, category="deep") for i in range(8)]
    resp = plan(PlanRequest.model_validate(plan_body(tasks, horizon="week")), repo)
    assert resp.telemetry.n_ticks == 672
    days = {a.slot_start.date() for a in resp.assignments}
    assert len(days) >= 2
    assert all(a.slot_start.date() >= PLAN_DATE for a in resp.assignments)


def test_now_excludes_past_ticks(repo: InMemoryRepo) -> None:
    body = plan_body([task("a", est_minutes=30)], now=kyiv(16))
    req = PlanRequest.model_validate(body)
    resp = plan(req, repo)
    assert req.now is not None
    for a in resp.assignments:
        assert a.slot_start >= req.now


# --- adversarial-pass regressions (P5 review) -------------------------------------------------


def test_experiment_ranking_uses_only_full_duration_buckets(repo: InMemoryRepo) -> None:
    """M1: a splittable ≤ 2 h task can *start* chunks in EV but cannot be placed unsplit there —
    EV must never enter its top-m, so the draw is never dropped and p = 0.25 is the real slice."""
    hours = {"wed": [420, 1140]}  # 07:00–19:00: EM, MO, MD, AF, EV
    full_buckets = {"EM.wd", "MO.wd.fresh", "MD.wd", "AF.wd.fresh"}
    logged = 0
    for seed in range(40):
        body = plan_body(
            [task("learn", category="learning", est_minutes=120, value=2, splittable=True)],
            working_hours=hours,
        )
        body["settings"]["seed"] = seed
        resp = plan(PlanRequest.model_validate(body), repo)
        assert resp.telemetry.experiment_drawn and not resp.telemetry.experiment_dropped
        exp = [a for a in resp.assignments if a.is_experiment]
        assert len(exp) == 1
        (a,) = exp
        assert a.propensity == 0.25 and a.context_bucket in full_buckets
        assert a.experiment_top_m is not None and len(a.experiment_top_m) == 4
        assert set(a.experiment_top_m) == full_buckets
        assert all(x.experiment_top_m is None for x in resp.assignments if not x.is_experiment)
        logged += 1
    assert logged == 40


def test_pinned_off_grid_keeps_its_instant(repo: InMemoryRepo) -> None:
    body = plan_body(
        [task("p", est_minutes=30, pinned_start=kyiv(9, 10)), task("q", est_minutes=30)]
    )
    req = PlanRequest.model_validate(body)
    resp = plan(req, repo)
    p = next(a for a in resp.assignments if a.task_id == "p")
    assert p.slot_start == req.tasks[0].pinned_start
    assert p.slot_end == req.tasks[0].pinned_start + timedelta(minutes=30)
    q = next(a for a in resp.assignments if a.task_id == "q")
    assert q.slot_end <= p.slot_start or q.slot_start >= p.slot_end


def test_pinned_in_no_daypart_hour_is_unplaceable_not_a_crash(repo: InMemoryRepo) -> None:
    resp = plan(PlanRequest.model_validate(plan_body([task("p", pinned_start=kyiv(5, 30))])), repo)
    assert resp.unplaced == [Unplaced(task_id="p", reason="no_feasible_start")]


def test_day_by_day_reports_unknown_when_no_day_solves(
    repo: InMemoryRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    from hourwell_recsys import solver as cpsat

    monkeypatch.setattr(planner, "PRACTICAL_LITERAL_THRESHOLD", 1)
    monkeypatch.setattr(cpsat, "solve", lambda **kw: cpsat.SolveResult("UNKNOWN", [], 0.0, 0, 1))
    resp = plan(PlanRequest.model_validate(plan_body(_day_tasks(), horizon="week")), repo)
    assert resp.telemetry.degradation == "day_by_day"
    assert resp.solver_status == "UNKNOWN" and resp.assignments == []


def test_coarse_rung_uses_a_30_minute_d_min(repo: InMemoryRepo) -> None:
    from datetime import UTC, datetime

    import numpy as np

    from hourwell_recsys.energy import posterior
    from hourwell_recsys.estimates import sample_thetas

    req = PlanRequest.model_validate(
        plan_body([task("s", category="learning", est_minutes=90, splittable=True)])
    )
    cells = {c.key: posterior(c, datetime.now(UTC)) for c in repo.load_cells(str(req.user_id))}
    states = repo.load_bandit(str(req.user_id))
    thetas = sample_thetas(states, np.random.default_rng(0), policy="ts")
    prep = planner._prepare(
        req,
        tick_minutes=30,
        cells=cells,
        states=states,
        thetas=thetas,
        blend=repo.load_blend(str(req.user_id)),
    )
    (t,) = prep.solver_tasks
    assert t.duration == 3 and t.d_min == 1 and t.n_chunks == 3


def test_task_deferred_past_the_horizon_is_not_critical_and_raises_no_options(
    repo: InMemoryRepo,
) -> None:
    """FR-24 'drop' sets earliest_start = tomorrow; re-sending that task must not reopen the
    trade-off sheet (P9 adversarial #3): it is an explicit deferral, not a failed constraint."""
    from datetime import datetime

    tomorrow = (datetime.fromisoformat(kyiv(9)) + timedelta(days=1)).isoformat()
    tasks = [
        task(
            "dropped",
            category="deep",
            est_minutes=60,
            value=3,
            deadline=kyiv(18),
            earliest_start=tomorrow,
        ),
        task("small", category="admin", est_minutes=30, value=1),
    ]
    resp = plan(PlanRequest.model_validate(plan_body(tasks)), repo)
    assert resp.infeasible is None
    assert any(u.task_id == "dropped" for u in resp.unplaced)
    assert {a.task_id for a in resp.assignments} == {"small"}
