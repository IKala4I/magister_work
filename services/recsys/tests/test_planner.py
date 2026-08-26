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
from hourwell_recsys.schemas import PlanRequest
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
            assert a.propensity == EPSILON / TOP_M == 0.25  # exact, pure function of settings
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
    timing = {"telemetry": {"solve_ms", "build_ms", "total_ms"}}
    a = plan(req, repo).model_dump(exclude=timing)
    b = plan(req, repo).model_dump(exclude=timing)
    assert a == b


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
    body = plan_body([task("a", est_minutes=30)])
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
