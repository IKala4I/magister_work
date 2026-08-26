"""Reward semantics are three different code paths (spec-conflicts H3): excluded → skipped and
state untouched; displacement → not representable; lapse → r = 0.0 applied. Plus id-set
idempotency and correction → full rebuild ≡ from-scratch (never a downdate)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from pydantic import ValidationError

from hourwell_recsys import bandit, feedback
from hourwell_recsys.contexts import Bucket
from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.features import feature_vector
from hourwell_recsys.repo import InMemoryRepo, StoredTuple
from hourwell_recsys.schemas import FeedbackRequest, FeedbackTuple
from tests.conftest import USER

T0 = datetime(2026, 9, 2, 12, tzinfo=UTC)


def _x(daypart: Daypart = Daypart.AF, weekend: bool = False) -> list[float]:
    b = Bucket(daypart, "weekend" if weekend else "weekday", None if weekend else "fresh")
    if daypart not in (Daypart.MO, Daypart.AF) or weekend:
        b = Bucket(daypart, b.day_type)
    x = feature_vector(
        bucket=b,
        value=2,
        est_minutes=60,
        splittable=False,
        u_ticks=None,
        postpone_count=0,
        cell_mean=0.5,
        cell_sd=0.15,
        preceding_load_minutes=0,
    )
    return [float(v) for v in x]


def _tuple(rec: str, reward: float, reason: str, **kw) -> dict:  # type: ignore[no-untyped-def,type-arg]
    base = dict(
        recommendation_id=rec,
        kind="outcome",
        reward=reward,
        reason=reason,
        category="deep",
        features=_x(),
        excluded=False,
        attributed_at=T0.isoformat(),
        correction=False,
    )
    base.update(kw)
    return base


def _req(*tuples: dict) -> FeedbackRequest:  # type: ignore[type-arg]
    return FeedbackRequest.model_validate({"user_id": USER, "tuples": list(tuples)})


def _snapshot(repo: InMemoryRepo) -> tuple[dict, dict]:  # type: ignore[type-arg]
    states = {g: (s.A.tolist(), s.b.tolist()) for g, s in repo.load_bandit(USER).items()}
    cells = {c.key: (c.succ, c.fail, c.last_event_at) for c in repo.load_cells(USER)}
    return states, cells


def test_excluded_tuple_is_skipped_and_touches_no_state(
    repo: InMemoryRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[float] = []
    real = bandit.update

    def spy(state: bandit.LinearState, x: np.ndarray, r: float) -> bandit.LinearState:
        calls.append(r)
        return real(state, x, r)

    monkeypatch.setattr(bandit, "update", spy)
    before = _snapshot(repo)
    resp = feedback.apply_feedback(
        _req(
            _tuple("r1", 1.0, "completed", excluded=True, excluded_reason="displacement_concurrent")
        ),
        repo,
    )
    assert resp.updated == 0 and resp.skipped_excluded == 1 and not resp.rebuilt
    assert _snapshot(repo) == before
    assert calls == []  # the update path was never entered
    assert repo.applied_keys(USER) == set()


def test_lapse_is_a_real_zero_reward_update(repo: InMemoryRepo) -> None:
    before_states, before_cells = _snapshot(repo)
    resp = feedback.apply_feedback(_req(_tuple("r2", 0.0, "lapsed")), repo)
    assert resp.updated == 1 and resp.skipped_excluded == 0
    after = repo.load_bandit(USER)["deep"]
    x = np.asarray(_x())
    assert np.allclose(after.A, np.asarray(before_states["deep"][0]) + np.outer(x, x))
    assert np.allclose(after.b, np.asarray(before_states["deep"][1]))  # r = 0 ⇒ b unchanged
    cell = {c.key: c for c in repo.load_cells(USER)}[("deep", "AF", "weekday")]
    assert cell.fail == pytest.approx(before_cells[("deep", "AF", "weekday")][1] + 1.0)
    assert cell.succ == pytest.approx(before_cells[("deep", "AF", "weekday")][0])
    assert ("r2", "outcome") in repo.applied_keys(USER)


def test_displacement_cannot_be_represented_as_a_tuple() -> None:
    with pytest.raises(ValidationError):
        FeedbackTuple.model_validate(_tuple("r3", 0.0, "displaced"))
    with pytest.raises(ValidationError):
        FeedbackTuple.model_validate(_tuple("r3", 0.0, "displaced_pending"))


def test_three_paths_are_distinct() -> None:
    assert (
        feedback.classify(FeedbackTuple.model_validate(_tuple("a", 0.0, "lapsed")))
        is feedback.TupleDisposition.APPLY
    )
    assert (
        feedback.classify(FeedbackTuple.model_validate(_tuple("a", 0.0, "lapsed", excluded=True)))
        is feedback.TupleDisposition.EXCLUDE
    )
    assert set(feedback.TupleDisposition) == {"apply", "exclude"}  # no third disposition exists


def test_redelivery_is_idempotent(repo: InMemoryRepo) -> None:
    t = _tuple("r4", 1.0, "completed")
    r1 = feedback.apply_feedback(_req(t), repo)
    snap = _snapshot(repo)
    r2 = feedback.apply_feedback(_req(t, t), repo)
    assert r1.updated == 1 and r2.updated == 0
    assert _snapshot(repo) == snap
    assert r2.state_version == r1.state_version


def test_partial_reward_is_fractional_evidence(repo: InMemoryRepo) -> None:
    feedback.apply_feedback(_req(_tuple("r5", 0.4, "partial")), repo)
    cell = {c.key: c for c in repo.load_cells(USER)}[("deep", "AF", "weekday")]
    assert cell.succ == pytest.approx(0.4) and cell.fail == pytest.approx(0.6)


def test_correction_rebuilds_from_stored_tuples_never_downdates(repo: InMemoryRepo) -> None:
    x_af, x_mo = np.asarray(_x(Daypart.AF)), np.asarray(_x(Daypart.MO))
    # day 1: lapse applied incrementally
    feedback.apply_feedback(_req(_tuple("r6", 0.0, "lapsed")), repo)
    feedback.apply_feedback(
        _req(
            _tuple(
                "r7",
                1.0,
                "completed",
                features=x_mo.tolist(),
                attributed_at=(T0 + timedelta(days=1)).isoformat(),
            )
        ),
        repo,
    )
    # the EF replaced r6's stored reward with 1.0 (UC-04 A1 "actually did it")
    repo.tuples[USER] = [
        StoredTuple("r6", "outcome", 1.0, "deep", x_af, T0),
        StoredTuple("r7", "outcome", 1.0, "deep", x_mo, T0 + timedelta(days=1)),
    ]
    resp = feedback.apply_feedback(_req(_tuple("r6", 1.0, "completed", correction=True)), repo)
    assert resp.rebuilt and resp.updated == 0
    state = repo.load_bandit(USER)["deep"]
    expected = bandit.rebuild("deep", [(x_af, 1.0), (x_mo, 1.0)])
    assert np.allclose(state.A, expected.A) and np.allclose(state.b, expected.b)
    cells = {c.key: c for c in repo.load_cells(USER)}
    af, mo = cells[("deep", "AF", "weekday")], cells[("deep", "MO", "weekday")]
    assert af.succ == pytest.approx(1.0) and af.fail == pytest.approx(0.0)  # the 0.0 is gone
    assert mo.succ == pytest.approx(1.0)
    assert state.state_version == resp.state_version
    assert {("r6", "outcome"), ("r7", "outcome")} <= repo.applied_keys(USER)


def test_rebuild_applies_decay_as_of_each_tuple_timestamp(repo: InMemoryRepo) -> None:
    x = np.asarray(_x())
    repo.tuples[USER] = [
        StoredTuple("a", "outcome", 1.0, "deep", x, T0),
        StoredTuple("b", "outcome", 1.0, "deep", x, T0 + timedelta(days=28)),
    ]
    feedback.apply_feedback(_req(_tuple("a", 1.0, "completed", correction=True)), repo)
    cell = {c.key: c for c in repo.load_cells(USER)}[("deep", "AF", "weekday")]
    assert cell.succ == pytest.approx(0.5 + 1.0)  # first success halved by the time of the second
    assert cell.last_event_at == T0 + timedelta(days=28)


def test_state_version_increments_only_when_state_changes(repo: InMemoryRepo) -> None:
    v0 = max(s.state_version for s in repo.load_bandit(USER).values())
    r1 = feedback.apply_feedback(_req(_tuple("z", 1.0, "completed")), repo)
    r2 = feedback.apply_feedback(_req(_tuple("z", 1.0, "completed")), repo)
    r3 = feedback.apply_feedback(_req(_tuple("y", 1.0, "completed", excluded=True)), repo)
    assert r1.state_version == v0 + 1 and r2.state_version == v0 + 1 and r3.state_version == v0 + 1


# --- adversarial-pass regressions (P5 review) -------------------------------------------------


def test_excluded_correction_triggers_the_rebuild(repo: InMemoryRepo) -> None:
    """M2: a reward later marked ambiguous must be purged — 'correction: true on ANY tuple
    triggers the rebuild' (specs/07 §5), and the rebuild reads non-excluded tuples only."""
    feedback.apply_feedback(_req(_tuple("r9", 1.0, "completed")), repo)
    repo.tuples[USER] = []  # the EF flipped r9 to excluded = true; nothing non-excluded remains
    resp = feedback.apply_feedback(
        _req(_tuple("r9", 1.0, "completed", excluded=True, correction=True)), repo
    )
    assert resp.rebuilt and resp.updated == 0 and resp.skipped_excluded == 1
    assert np.array_equal(repo.load_bandit(USER)["deep"].A, np.eye(17))
    cell = {c.key: c for c in repo.load_cells(USER)}[("deep", "AF", "weekday")]
    assert cell.succ == 0.0 and cell.fail == 0.0


def test_feedback_refuses_users_without_instantiated_cells() -> None:
    fresh = InMemoryRepo()  # no seeded cells → fallback prior (prior_version −1)
    with pytest.raises(feedback.StateNotInstantiated):
        feedback.apply_feedback(_req(_tuple("r1", 1.0, "completed")), fresh)
    assert fresh.applied_keys(USER) == set()
